import path from 'node:path';
import { Readable } from 'node:stream';
import fs from 'fs-extra';
import { ZipArchive } from 'archiver';
import unzipper from 'unzipper';

/**
 * Project bundle (.wtpkg) — a self-contained ZIP that carries:
 *   - manifest.json    { version, projectName, exportedAt, includedTemplateIds }
 *   - project.json     the regular project document (state + sources + meta)
 *   - templates/<id>/  the on-disk custom-template directories for every
 *                      custom template referenced by entries in the project.
 *
 * Built-in templates are NOT bundled — they ship with the app and exist on
 * every install. If an entry references a built-in template that doesn't
 * exist on the importing machine, the entry just won't render until that
 * built-in is installed; we surface that as a missingTemplates report on
 * import.
 */
const BUNDLE_VERSION = 1;
const BUNDLE_TEMPLATES_DIR = 'templates';
const BUNDLE_MANIFEST_FILE = 'manifest.json';
const BUNDLE_PROJECT_FILE = 'project.json';

const collectReferencedTemplateIds = (project) => {
  const entries = project?.state?.entries || [];
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

  const manifest = {
    version: BUNDLE_VERSION,
    kind: 'web-title-pro:project-bundle',
    exportedAt: new Date().toISOString(),
    projectName: sanitizeProjectName(project?.meta?.name),
    includedTemplateIds,
    referencedBuiltinTemplateIds: skippedBuiltinIds,
    referencedUnknownTemplateIds: unknownTemplateIds,
  };

  // archiver v8 is pure ESM and dropped its CJS factory function — use
  // the named ZipArchive class directly.
  const archive = new ZipArchive({ zlib: { level: 6 } });

  // archiver emits 'error' on per-entry failure — propagate up to the caller.
  archive.on('warning', (error) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });

  archive.append(JSON.stringify(manifest, null, 2), { name: BUNDLE_MANIFEST_FILE });
  archive.append(JSON.stringify(project, null, 2), { name: BUNDLE_PROJECT_FILE });

  for (const template of customTemplatesToBundle) {
    if (template.directory && fs.existsSync(template.directory)) {
      archive.directory(template.directory, `${BUNDLE_TEMPLATES_DIR}/${template.slug || template.id}`);
    }
  }

  // Finalize asynchronously — caller pipes the readable side first.
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
 * used — which is the right behaviour when two operators share the same
 * library and the importer already has the templates installed.
 */
export const importProjectBundle = async ({ buffer, templateService }) => {
  if (!buffer || !buffer.length) {
    throw new Error('Empty bundle payload.');
  }

  const directory = await unzipper.Open.buffer(buffer);
  const files = directory.files.filter((file) => file.type === 'File');

  const manifestFile = files.find((file) => file.path === BUNDLE_MANIFEST_FILE);
  const projectFile = files.find((file) => file.path === BUNDLE_PROJECT_FILE);

  if (!manifestFile || !projectFile) {
    throw new Error(
      'This .wtpkg is missing manifest.json or project.json — not a valid Web Title Pro project bundle.',
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
    if (!file.path.startsWith(templatePrefix)) {
      continue;
    }
    const relative = file.path.slice(templatePrefix.length);
    const [slug, ...rest] = relative.split('/');
    if (!slug || !rest.length) {
      continue;
    }
    if (!templateGroups.has(slug)) {
      templateGroups.set(slug, []);
    }
    templateGroups.get(slug).push({ file, innerPath: rest.join('/') });
  }

  for (const [slug, items] of templateGroups) {
    const targetDirectory = path.join(templateService.customTemplatesDir, slug);
    const alreadyExists = await fs.pathExists(targetDirectory);

    if (alreadyExists) {
      skippedTemplates.push({ slug, reason: 'already-installed' });
      continue;
    }

    try {
      await fs.ensureDir(targetDirectory);
      for (const item of items) {
        const targetFile = path.join(targetDirectory, item.innerPath);
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
