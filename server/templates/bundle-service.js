import path from 'node:path';
import { Readable } from 'node:stream';
import fs from 'fs-extra';
import { ZipArchive } from 'archiver';
import unzipper from 'unzipper';

/**
 * Project bundle (.wtpkg) - a self-contained ZIP that carries:
 *   - manifest.json    { version, projectName, exportedAt, includedTemplateIds }
 *   - project-summary.json human-readable counts + vMix discovered input list
 *   - project.json     the regular project document (state + sources + meta)
 *   - templates/<id>/  the on-disk custom-template directories for every
 *                      custom template referenced by entries in the project.
 *
 * Built-in templates are NOT bundled - they ship with the app and exist on
 * every install. If an entry references a built-in template that doesn't
 * exist on the importing machine, the entry just won't render until that
 * built-in is installed; we surface that as a missingTemplates report on
 * import.
 */
const BUNDLE_VERSION = 1;
const BUNDLE_TEMPLATES_DIR = 'templates';
const BUNDLE_MANIFEST_FILE = 'manifest.json';
const BUNDLE_SUMMARY_FILE = 'project-summary.json';
const BUNDLE_PROJECT_FILE = 'project.json';
const SAFE_ARCHIVE_SEGMENT_RE = /^[a-z0-9][a-z0-9._-]*$/i;

const asArray = (value) => (Array.isArray(value) ? value : []);

const readProjectBundleData = (project) => {
  const entries = asArray(project?.state?.entries);
  const outputs = asArray(project?.state?.outputs);
  const timers = asArray(project?.state?.timers);
  const sources = asArray(project?.sources?.items);
  const vmixRuntimeInputs = asArray(project?.runtime?.vmix?.inputs);
  const vmixEntries = entries.filter((entry) => entry?.entryType === 'vmix');
  const localEntries = entries.filter((entry) => entry?.entryType !== 'vmix');

  return {
    entries,
    localEntries,
    outputs,
    sources,
    timers,
    vmixEntries,
    vmixRuntimeInputs,
  };
};

const buildManifestProjectCounts = (projectData) => ({
  outputs: projectData.outputs.length,
  entries: projectData.entries.length,
  sources: projectData.sources.length,
  timers: projectData.timers.length,
  vmixDiscoveredInputs: projectData.vmixRuntimeInputs.length,
});

const collectReferencedTemplateIds = (project) => {
  const entries = asArray(project?.state?.entries);
  const ids = new Set();
  for (const entry of entries) {
    if (entry?.templateId) {
      ids.add(entry.templateId);
    }
  }
  return [...ids];
};

const sanitizeProjectName = (name = '') =>
  String(name || 'WebTitleProject').replace(/[<>:"/\\|?*]+/g, ' ').trim() || 'WebTitleProject';

const buildProjectBundleSummary = ({
  project,
  projectData = readProjectBundleData(project),
  includedTemplateIds = [],
  referencedBuiltinTemplateIds = [],
  referencedUnknownTemplateIds = [],
}) => {
  const {
    entries,
    localEntries,
    outputs,
    sources,
    timers,
    vmixEntries,
    vmixRuntimeInputs,
  } = projectData;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    projectName: sanitizeProjectName(project?.meta?.name),
    appVersion: project?.meta?.appVersion || null,
    counts: {
      outputs: outputs.length,
      titles: entries.length,
      localTitles: localEntries.length,
      vmixTitles: vmixEntries.length,
      timers: timers.length,
      dataSources: sources.length,
      bundledCustomTemplates: includedTemplateIds.length,
      referencedBuiltinTemplates: referencedBuiltinTemplateIds.length,
      referencedUnknownTemplates: referencedUnknownTemplateIds.length,
      vmixDiscoveredInputs: vmixRuntimeInputs.length,
    },
    outputs: outputs.map((output) => ({
      id: output.id ?? '',
      key: output.key ?? '',
      name: output.name ?? '',
      selectedEntryId: output.selectedEntryId || null,
    })),
    titles: entries.map((entry) => ({
      id: entry.id ?? '',
      type: entry.entryType === 'vmix' ? 'vmix' : 'local',
      name: entry.name ?? '',
      templateId: entry.templateId || null,
      vmixInputKey: entry.vmixInputKey || null,
      vmixInputNumber: entry.vmixInputNumber ?? null,
      vmixInputTitle: entry.vmixInputTitle || null,
      fieldCount:
        entry.fields && typeof entry.fields === 'object' ? Object.keys(entry.fields).length : 0,
    })),
    dataSources: sources.map((source) => ({
      id: source.id ?? '',
      name: source.name ?? '',
      columns: asArray(source.columns).length,
      rows: asArray(source.rows).length,
      remoteType: source.remote?.type || null,
    })),
    vmix: {
      connected: Boolean(project?.runtime?.vmix?.connected),
      host: project?.runtime?.vmix?.host || project?.state?.integrations?.vmix?.host || '',
      lastUpdatedAt: project?.runtime?.vmix?.lastUpdatedAt || null,
      discoveredInputs: vmixRuntimeInputs.map((input) => ({
        key: input.key ?? '',
        number: input.number ?? '',
        type: input.type ?? '',
        title: input.title ?? '',
        shortTitle: input.shortTitle ?? '',
        textFields: asArray(input.textFields).map((field) => ({
          index: field.index ?? '',
          name: field.name ?? '',
        })),
      })),
    },
    templates: {
      includedCustomTemplateIds: includedTemplateIds,
      referencedBuiltinTemplateIds,
      referencedUnknownTemplateIds,
    },
  };
};

const normalizeArchivePath = (archivePath = '') => {
  const normalized = String(archivePath || '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter((segment) => segment && segment !== '.');

  if (
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    parts.some((segment) => segment === '..')
  ) {
    throw new Error(`Unsafe bundle path: ${archivePath}`);
  }

  return parts.join('/');
};

const normalizeTemplateArchiveSlug = (value = '') => {
  const slug = String(value || '').trim();
  if (!SAFE_ARCHIVE_SEGMENT_RE.test(slug) || slug === '.' || slug === '..') {
    throw new Error(`Unsafe template slug in project bundle: ${slug || '(empty)'}`);
  }
  return slug;
};

const safeJoin = (baseDirectory, relativePath) => {
  const base = path.resolve(baseDirectory);
  const target = path.resolve(base, relativePath);
  const relative = path.relative(base, target);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe bundle extraction path: ${relativePath}`);
  }

  return target;
};

/**
 * Stream a .wtpkg archive of the supplied project document.
 * The response is a Node stream so the caller can pipe it directly into
 * an Express response with the right headers.
 */
export const createProjectBundleStream = ({ project, templateService }) => {
  if (!project || typeof project !== 'object') {
    throw new Error('Project document is required for bundle export.');
  }

  const referencedIds = collectReferencedTemplateIds(project);
  const allTemplates = templateService.getTemplates();
  const customTemplatesToBundle = allTemplates.filter(
    (template) => template.source === 'custom' && referencedIds.includes(template.id),
  );
  const includedTemplateIds = customTemplatesToBundle.map((template) => template.id);
  const skippedBuiltinIds = referencedIds.filter((id) => {
    const template = allTemplates.find((item) => item.id === id);
    return template?.source === 'builtin';
  });
  const unknownTemplateIds = referencedIds.filter((id) => !allTemplates.find((item) => item.id === id));
  const projectData = readProjectBundleData(project);

  const manifest = {
    version: BUNDLE_VERSION,
    kind: 'web-title-pro:project-bundle',
    exportedAt: new Date().toISOString(),
    projectName: sanitizeProjectName(project?.meta?.name),
    projectCounts: buildManifestProjectCounts(projectData),
    includedTemplateIds,
    referencedBuiltinTemplateIds: skippedBuiltinIds,
    referencedUnknownTemplateIds: unknownTemplateIds,
  };
  const summary = buildProjectBundleSummary({
    project,
    projectData,
    includedTemplateIds,
    referencedBuiltinTemplateIds: skippedBuiltinIds,
    referencedUnknownTemplateIds: unknownTemplateIds,
  });

  // archiver v8 is pure ESM and dropped its CJS factory function; use
  // the named ZipArchive class directly.
  const archive = new ZipArchive({ zlib: { level: 6 } });

  // archiver emits 'error' on per-entry failure; propagate up to the caller.
  archive.on('warning', (error) => {
    if (error.code !== 'ENOENT') {
      archive.emit('error', error);
    }
  });

  archive.append(JSON.stringify(manifest, null, 2), { name: BUNDLE_MANIFEST_FILE });
  archive.append(JSON.stringify(summary, null, 2), { name: BUNDLE_SUMMARY_FILE });
  archive.append(JSON.stringify(project, null, 2), { name: BUNDLE_PROJECT_FILE });

  for (const template of customTemplatesToBundle) {
    if (template.directory && fs.existsSync(template.directory)) {
      const slug = normalizeTemplateArchiveSlug(template.slug || template.id);
      archive.directory(template.directory, `${BUNDLE_TEMPLATES_DIR}/${slug}`);
    }
  }

  // Finalize asynchronously; caller pipes the readable side first.
  archive.finalize();

  return {
    stream: archive,
    manifest,
  };
};

/**
 * Read a bundle ZIP buffer, install bundled custom templates into the
 * service's customTemplatesDir, and return the project document + a
 * detailed import report.
 *
 * Conflict policy (MVP): if a custom template directory with the same
 * slug already exists, skip extraction and report it. The project file
 * still references the original template id, so the existing copy is
 * used, which is the right behaviour when two operators share the same
 * library and the importer already has the templates installed.
 */
export const importProjectBundle = async ({ buffer, templateService }) => {
  if (!buffer || !buffer.length) {
    throw new Error('Empty bundle payload.');
  }

  const directory = await unzipper.Open.buffer(buffer);
  const files = directory.files
    .filter((file) => file.type === 'File')
    .map((file) => {
      file.safePath = normalizeArchivePath(file.path);
      return file;
    });

  const manifestFile = files.find((file) => file.safePath === BUNDLE_MANIFEST_FILE);
  const projectFile = files.find((file) => file.safePath === BUNDLE_PROJECT_FILE);

  if (!manifestFile || !projectFile) {
    throw new Error(
      'This .wtpkg is missing manifest.json or project.json; not a valid Web Title Pro project bundle.',
    );
  }

  const manifest = JSON.parse((await manifestFile.buffer()).toString('utf8'));
  if (manifest?.kind !== 'web-title-pro:project-bundle') {
    throw new Error('Bundle manifest does not identify a Web Title Pro project bundle.');
  }

  const projectDocument = JSON.parse((await projectFile.buffer()).toString('utf8'));

  const importedTemplates = [];
  const skippedTemplates = [];

  // Group bundle entries under templates/<slug>/... so we can extract one
  // template directory at a time and report each install/skip individually.
  const templateGroups = new Map();
  const templatePrefix = `${BUNDLE_TEMPLATES_DIR}/`;
  for (const file of files) {
    if (!file.safePath.startsWith(templatePrefix)) {
      continue;
    }
    const relative = file.safePath.slice(templatePrefix.length);
    const [slug, ...rest] = relative.split('/');
    if (!slug || !rest.length) {
      continue;
    }
    normalizeTemplateArchiveSlug(slug);
    if (!templateGroups.has(slug)) {
      templateGroups.set(slug, []);
    }
    templateGroups.get(slug).push({ file, innerPath: rest.join('/') });
  }

  for (const [slug, items] of templateGroups) {
    const targetDirectory = safeJoin(templateService.customTemplatesDir, slug);
    const alreadyExists = await fs.pathExists(targetDirectory);

    if (alreadyExists) {
      skippedTemplates.push({ slug, reason: 'already-installed' });
      continue;
    }

    try {
      await fs.ensureDir(targetDirectory);
      for (const item of items) {
        const targetFile = safeJoin(targetDirectory, item.innerPath);
        await fs.ensureDir(path.dirname(targetFile));
        await fs.writeFile(targetFile, await item.file.buffer());
      }
      importedTemplates.push({ slug, fileCount: items.length });
    } catch (error) {
      // Don't leave a half-extracted dir behind.
      await fs.remove(targetDirectory).catch(() => {});
      importedTemplates.push({ slug, error: error.message });
    }
  }

  await templateService.scanTemplates();

  return {
    manifest,
    project: projectDocument,
    importedTemplates,
    skippedTemplates,
  };
};

/**
 * Convenience helper for routes: returns a safe filename based on the
 * project name in the manifest. The browser uses this as the download
 * filename suggestion.
 */
export const getBundleFilename = (project) => {
  const base = sanitizeProjectName(project?.meta?.name);
  return `${base}.wtpkg`;
};

// Defensive re-export so callers that just want a basic Node readable stream
// can wrap without pulling in archiver themselves.
export const toReadableStream = (asyncIterable) => Readable.from(asyncIterable);
