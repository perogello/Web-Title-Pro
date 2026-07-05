import path from 'node:path';
import fs from 'fs-extra';
import unzipper from 'unzipper';
import { nanoid } from 'nanoid';

// Plugin discovery. A plugin is a folder with a `plugin.json` manifest and an
// entry HTML file. Mirrors the template scan: builtin plugins ship with the
// app, custom plugins are dropped into the storage plugins dir. The manifest
// declares the plugin's requested capabilities and where it wants to mount —
// the host honours that; it does not hard-code placement.

const KNOWN_CAPABILITIES = ['state:read', 'command:send'];
const MOUNT_TYPES = ['panel', 'tab', 'background'];
const MOUNT_LOCATIONS = ['live', 'rundown', 'settings'];
const SETTING_TYPES = ['text', 'number', 'checkbox', 'select'];
// Named UI slots a plugin may contribute a native button into. Curated on
// purpose: the host renders these buttons itself (no DOM injection), so it only
// allows insertion at points it controls.
const CONTRIB_SLOTS = ['live.toolbar'];
const isActionId = (value) =>
  typeof value === 'string' && /^(output:.+:.+|timer:.+:.+|global:.+)$/.test(value);

const sortByName = (items) => [...items].sort((a, b) => a.name.localeCompare(b.name));

// Install limits + allowlist. A plugin is a sandboxed web app, so (unlike a
// title template) we don't forbid iframes/external resources — the sandbox
// contains it — but we still cap size/count and restrict to web asset types.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 60 * 1024 * 1024;
const MAX_FILE_COUNT = 200;
const MAX_SINGLE_FILE_BYTES = 30 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json', '.map',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.mp3', '.wav',
]);

class PluginValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'PluginValidationError';
    this.details = details;
  }
}

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'plugin';

const safeSegments = (relativePath) =>
  String(relativePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..');

const collectFiles = async (directory) => {
  const files = [];
  const visit = async (current) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile()) {
        const stats = await fs.stat(full);
        files.push({ relativePath: path.relative(directory, full).replace(/\\/g, '/'), size: stats.size });
      }
    }
  };
  await visit(directory);
  return files;
};

// A folder is a valid plugin package if it parses as a manifest and every file
// is an allowed type within the size/count limits.
const validatePluginDirectory = async (directory) => {
  const errors = [];
  const files = await collectFiles(directory);

  if (!files.some((f) => f.relativePath === 'plugin.json')) {
    errors.push({ file: '(package)', message: 'Missing plugin.json in the package root.' });
  }
  if (files.length > MAX_FILE_COUNT) {
    errors.push({ file: '(package)', message: `Too many files: ${files.length}. Limit is ${MAX_FILE_COUNT}.` });
  }
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_UNPACKED_BYTES) {
    errors.push({ file: '(package)', message: `Unpacked size too large: ${Math.ceil(total / 1048576)} MB.` });
  }
  for (const file of files) {
    if (!ALLOWED_EXTENSIONS.has(path.extname(file.relativePath).toLowerCase())) {
      errors.push({ file: file.relativePath, message: `File type "${path.extname(file.relativePath) || 'none'}" is not allowed.` });
    }
    if (file.size > MAX_SINGLE_FILE_BYTES) {
      errors.push({ file: file.relativePath, message: `File too large: ${Math.ceil(file.size / 1048576)} MB.` });
    }
  }
  if (errors.length) {
    throw new PluginValidationError('Plugin validation failed.', errors);
  }

  // Manifest must parse (name, entry present) — reuse the same parser the scan
  // uses so an installed plugin is guaranteed loadable.
  try {
    await parsePluginManifest({ directory, slug: 'validate', source: 'custom', publicBase: '/validate' });
  } catch (error) {
    throw new PluginValidationError('Plugin validation failed.', [{ file: 'plugin.json', message: error.message }]);
  }
};

// When a package (zip or a picked folder) wraps everything in a single top
// folder, strip it so plugin.json lands at the package root.
const computeStrip = (relPaths) => {
  const segLists = relPaths.map(safeSegments).filter((s) => s.length);
  const hasRootManifest = segLists.some((s) => s.join('/') === 'plugin.json');
  const topDirs = new Set(segLists.map((s) => s[0]));
  return !hasRootManifest && topDirs.size === 1 ? [...topDirs][0] : null;
};

const writeUploadedFiles = async (files, targetDirectory) => {
  const names = files.map((f) => f.originalname || f.fieldname || '');
  const strip = computeStrip(names);
  for (const file of files) {
    let segments = safeSegments(file.originalname || file.fieldname || `asset-${Date.now()}`);
    if (strip && segments[0] === strip) segments = segments.slice(1);
    const rel = segments.join('/');
    if (!rel) continue;
    const target = path.join(targetDirectory, rel);
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, file.buffer);
  }
};

const writeZipFiles = async (zipBuffer, targetDirectory) => {
  if (zipBuffer.length > MAX_UPLOAD_BYTES) {
    throw new PluginValidationError('Plugin validation failed.', [
      { file: '(archive)', message: `Archive too large: ${Math.ceil(zipBuffer.length / 1048576)} MB.` },
    ]);
  }
  const directory = await unzipper.Open.buffer(zipBuffer);
  const fileEntries = directory.files.filter((entry) => entry.type === 'File');
  const strip = computeStrip(fileEntries.map((e) => e.path));

  for (const entry of fileEntries) {
    let segments = safeSegments(entry.path);
    if (strip && segments[0] === strip) segments = segments.slice(1);
    const rel = segments.join('/');
    if (!rel) continue;
    const target = path.join(targetDirectory, rel);
    await fs.ensureDir(path.dirname(target));
    await new Promise((resolve, reject) => {
      entry.stream().pipe(fs.createWriteStream(target)).on('finish', resolve).on('error', reject);
    });
  }
};

const normalizeCapabilities = (value) => {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  for (const cap of list) {
    if (KNOWN_CAPABILITIES.includes(cap) && !out.includes(cap)) {
      out.push(cap);
    }
  }
  return out;
};

// The plugin decides where it lives. Default to a Live-tab panel — the least
// intrusive surface — when the manifest is silent or invalid.
const normalizeMount = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const type = MOUNT_TYPES.includes(source.type) ? source.type : 'panel';
  const location = MOUNT_LOCATIONS.includes(source.location) ? source.location : 'live';
  const label = typeof source.label === 'string' && source.label.trim() ? source.label.trim() : null;
  return { type, location, label };
};

// A plugin's declared settings — each field the operator can configure in
// Settings › Plugins. Unknown types / malformed entries are dropped so a bad
// manifest can't break the settings form.
const normalizeSettingsSchema = (value) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const field of value) {
    if (!field || typeof field !== 'object') continue;
    const key = typeof field.key === 'string' && field.key.trim() ? field.key.trim() : '';
    if (!key) continue;
    const type = SETTING_TYPES.includes(field.type) ? field.type : 'text';
    const item = {
      key,
      label: typeof field.label === 'string' && field.label.trim() ? field.label.trim() : key,
      type,
      default: field.default,
    };
    if (type === 'select') {
      item.options = Array.isArray(field.options)
        ? field.options
            .map((opt) =>
              opt && typeof opt === 'object'
                ? { value: String(opt.value ?? ''), label: String(opt.label ?? opt.value ?? '') }
                : { value: String(opt), label: String(opt) },
            )
            .filter((opt) => opt.value !== '')
        : [];
    }
    out.push(item);
  }
  return out;
};

// Fill any settings the operator hasn't set with the schema defaults, so the
// plugin always receives a complete config.
export const applySettingsDefaults = (schema, settings = {}) => {
  const merged = { ...settings };
  for (const field of schema || []) {
    if (merged[field.key] === undefined && field.default !== undefined) {
      merged[field.key] = field.default;
    }
  }
  return merged;
};

// Native buttons the plugin contributes into host slots. Each declares a slot,
// a label and either a canonical `command` (actionId the host dispatches) or an
// `action` (a plugin-local id the host routes to the plugin's iframe, which runs
// its own logic). Malformed / unknown-slot / actionless entries are dropped.
const normalizeContributions = (value) => {
  const buttons = Array.isArray(value?.buttons) ? value.buttons : [];
  const out = [];
  for (const button of buttons) {
    if (!button || typeof button !== 'object') continue;
    const slot = CONTRIB_SLOTS.includes(button.slot) ? button.slot : null;
    const label = typeof button.label === 'string' && button.label.trim() ? button.label.trim() : '';
    const command = isActionId(button.command) ? button.command : '';
    const action = typeof button.action === 'string' && button.action.trim() ? button.action.trim() : '';
    if (!slot || !label || (!command && !action)) continue;
    out.push({ slot, label, ...(command ? { command } : {}), ...(action ? { action } : {}) });
  }

  // Declared plugin commands. These get a namespaced id `plugin:<pluginId>:<id>`
  // and are published in the command catalogue for discovery; invocation is
  // client-side (routed to the plugin's iframe), since the server has no iframe.
  const commandDecls = Array.isArray(value?.commands) ? value.commands : [];
  const commands = [];
  for (const decl of commandDecls) {
    if (!decl || typeof decl !== 'object') continue;
    const id = typeof decl.id === 'string' && decl.id.trim() ? decl.id.trim() : '';
    if (!id) continue;
    const label = typeof decl.label === 'string' && decl.label.trim() ? decl.label.trim() : id;
    commands.push({ id, label });
  }

  return { buttons: out, commands };
};

// Parse + validate one manifest into the shape the API/UI consume. Throws on a
// manifest that can't produce a usable plugin (missing name or entry file).
export const parsePluginManifest = async ({ directory, slug, source, publicBase }) => {
  const manifestPath = path.join(directory, 'plugin.json');
  const raw = await fs.readJson(manifestPath);

  const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : '';
  if (!name) {
    throw new Error('Manifest is missing a "name".');
  }

  const entry = typeof raw?.entry === 'string' && raw.entry.trim() ? raw.entry.trim().replace(/^\/+/, '') : 'index.html';
  // Keep the entry inside the plugin folder — no traversal.
  if (entry.split('/').some((segment) => segment === '..')) {
    throw new Error('Manifest "entry" must stay inside the plugin folder.');
  }
  const entryPath = path.join(directory, entry);
  if (!(await fs.pathExists(entryPath))) {
    throw new Error(`Entry file "${entry}" not found.`);
  }

  return {
    id: `${source}:${slug}`,
    slug,
    source,
    name,
    version: typeof raw?.version === 'string' ? raw.version : '0.0.0',
    description: typeof raw?.description === 'string' ? raw.description : '',
    author: typeof raw?.author === 'string' ? raw.author : '',
    capabilities: normalizeCapabilities(raw?.capabilities),
    mount: normalizeMount(raw?.mount),
    settingsSchema: normalizeSettingsSchema(raw?.settings),
    contributes: normalizeContributions(raw?.contributes),
    entryUrl: `${publicBase}/${entry}`,
    directory,
  };
};

export class PluginService {
  constructor({ builtinPluginsDir, customPluginsDir }) {
    this.builtinPluginsDir = builtinPluginsDir;
    this.customPluginsDir = customPluginsDir;
    this.plugins = [];
  }

  async init() {
    await fs.ensureDir(this.builtinPluginsDir);
    await fs.ensureDir(this.customPluginsDir);
    await this.scanPlugins();
  }

  async scanPlugins() {
    const plugins = [];
    const sources = [
      { directory: this.builtinPluginsDir, source: 'builtin' },
      { directory: this.customPluginsDir, source: 'custom' },
    ];

    for (const sourceItem of sources) {
      if (!(await fs.pathExists(sourceItem.directory))) {
        continue;
      }

      const entries = await fs.readdir(sourceItem.directory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const directory = path.join(sourceItem.directory, entry.name);
        if (!(await fs.pathExists(path.join(directory, 'plugin.json')))) {
          continue;
        }
        try {
          plugins.push(
            await parsePluginManifest({
              directory,
              slug: entry.name,
              source: sourceItem.source,
              publicBase: `/plugin-assets/${sourceItem.source}/${entry.name}`,
            }),
          );
        } catch (error) {
          console.warn(`Failed to parse plugin "${entry.name}":`, error.message);
        }
      }
    }

    this.plugins = sortByName(plugins);
    return this.plugins;
  }

  getPlugins() {
    return this.plugins;
  }

  getPlugin(pluginId) {
    return this.plugins.find((plugin) => plugin.id === pluginId) || null;
  }

  // Install an uploaded package (a single .zip or a set of files) into the
  // custom plugins dir, validate it, then rescan. Returns the installed plugin.
  async importPluginPackage(files, preferredName = '') {
    if (!files?.length) {
      throw new Error('No plugin files were uploaded.');
    }
    const slug = `${slugify(preferredName || files[0].originalname || 'plugin')}-${nanoid(6)}`;
    const targetDirectory = path.join(this.customPluginsDir, slug);
    await fs.ensureDir(targetDirectory);
    try {
      if (files.length === 1 && /\.zip$/i.test(files[0].originalname || '')) {
        await writeZipFiles(files[0].buffer, targetDirectory);
      } else {
        if (files.length > MAX_FILE_COUNT) {
          throw new PluginValidationError('Plugin validation failed.', [
            { file: '(upload)', message: `Too many files: ${files.length}. Limit is ${MAX_FILE_COUNT}.` },
          ]);
        }
        await writeUploadedFiles(files, targetDirectory);
      }
      await validatePluginDirectory(targetDirectory);
      await this.scanPlugins();
      const installed = this.plugins.find((p) => p.source === 'custom' && p.slug === slug);
      if (!installed) {
        throw new Error('The uploaded plugin package could not be parsed.');
      }
      return installed;
    } catch (error) {
      await fs.remove(targetDirectory).catch(() => {});
      throw error;
    }
  }

  // Install from an on-disk folder (desktop folder picker). Copies it in, then
  // validates + rescans.
  async importPluginDirectory(directoryPath, preferredName = '') {
    if (!directoryPath || typeof directoryPath !== 'string') {
      throw new Error('Plugin folder path is required.');
    }
    const source = path.resolve(directoryPath);
    if (!(await fs.pathExists(source)) || !(await fs.stat(source)).isDirectory()) {
      throw new Error('Selected plugin folder does not exist.');
    }
    const slug = `${slugify(preferredName || path.basename(source) || 'plugin')}-${nanoid(6)}`;
    const targetDirectory = path.join(this.customPluginsDir, slug);
    await fs.ensureDir(targetDirectory);
    try {
      await fs.copy(source, targetDirectory, {
        dereference: true,
        filter: (srcPath) => !safeSegments(path.relative(source, srcPath)).includes('..'),
      });
      await validatePluginDirectory(targetDirectory);
      await this.scanPlugins();
      const installed = this.plugins.find((p) => p.source === 'custom' && p.slug === slug);
      if (!installed) {
        throw new Error('The selected plugin folder could not be parsed.');
      }
      return installed;
    } catch (error) {
      await fs.remove(targetDirectory).catch(() => {});
      throw error;
    }
  }

  // Remove a custom plugin from disk (built-ins can't be removed) and rescan.
  async deletePlugin(pluginId) {
    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found.');
    }
    if (plugin.source !== 'custom') {
      throw new Error('Built-in plugins cannot be removed.');
    }
    await fs.remove(plugin.directory);
    await this.scanPlugins();
    return { ok: true, pluginId };
  }
}
