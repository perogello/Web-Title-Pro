import path from 'node:path';
import fs from 'fs-extra';

// Plugin discovery. A plugin is a folder with a `plugin.json` manifest and an
// entry HTML file. Mirrors the template scan: builtin plugins ship with the
// app, custom plugins are dropped into the storage plugins dir. The manifest
// declares the plugin's requested capabilities and where it wants to mount —
// the host honours that; it does not hard-code placement.

const KNOWN_CAPABILITIES = ['state:read', 'command:send'];
const MOUNT_TYPES = ['panel', 'tab'];
const MOUNT_LOCATIONS = ['live', 'rundown', 'settings'];
const SETTING_TYPES = ['text', 'number', 'checkbox', 'select'];

const sortByName = (items) => [...items].sort((a, b) => a.name.localeCompare(b.name));

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
}
