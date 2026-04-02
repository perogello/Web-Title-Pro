import path from 'node:path';
import fs from 'fs-extra';
import { JSDOM } from 'jsdom';

const normalizeAssetPath = (value = '') =>
  value.split('?')[0].split('#')[0].replace(/^\.?\//, '').replace(/\\/g, '/');

const dedupeBy = (items, keyFn) => {
  const map = new Map();

  for (const item of items) {
    const key = keyFn(item);

    if (key && !map.has(key)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
};

const prettifyFieldName = (name) =>
  name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const resolveTemplateRoot = async (directory) => {
  let currentDirectory = directory;

  while (true) {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });
    const hasHtml = entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'));
    const childDirectories = entries.filter((entry) => entry.isDirectory());

    if (hasHtml || childDirectories.length !== 1 || entries.length !== 1) {
      return currentDirectory;
    }

    currentDirectory = path.join(currentDirectory, childDirectories[0].name);
  }
};

export const parseTemplateManifest = async ({ directory, slug, source, publicBase }) => {
  const templateRoot = await resolveTemplateRoot(directory);
  const manifestPath = path.join(templateRoot, 'template.json');
  const hasManifest = await fs.pathExists(manifestPath);
  const manifestOverrides = hasManifest ? await fs.readJson(manifestPath) : {};
  const entries = await fs.readdir(templateRoot, { withFileTypes: true });
  const htmlCandidates = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map((entry) => entry.name);
  const htmlFile = manifestOverrides.htmlFile || (htmlCandidates.includes('index.html') ? 'index.html' : htmlCandidates[0]);

  if (!htmlFile) {
    throw new Error(`Template "${slug}" does not contain an HTML file.`);
  }

  const htmlPath = path.join(templateRoot, htmlFile);
  const htmlSource = await fs.readFile(htmlPath, 'utf8');
  const dom = new JSDOM(htmlSource);
  const { document } = dom.window;

  const fields = dedupeBy(
    [...document.querySelectorAll('[data-field]')].map((element) => {
      const name = element.getAttribute('data-field')?.trim();
      const textValue = element.textContent?.trim() || '';

      return {
        name,
        label: element.getAttribute('data-label')?.trim() || prettifyFieldName(name || ''),
        type: element.getAttribute('data-type')?.trim() || 'text',
        placeholder: element.getAttribute('data-placeholder')?.trim() || '',
        defaultValue: element.getAttribute('data-default')?.trim() || textValue,
      };
    }),
    (field) => field.name,
  );

  const timers = dedupeBy(
    [...document.querySelectorAll('[data-timer]')].map((element) => ({
      id: element.getAttribute('data-timer')?.trim(),
      label: element.getAttribute('data-label')?.trim() || prettifyFieldName(element.getAttribute('data-timer') || ''),
    })),
    (timer) => timer.id,
  );

  const cssFilesFromHtml = [...document.querySelectorAll('link[rel="stylesheet"][href]')].map((element) =>
    normalizeAssetPath(element.getAttribute('href') || ''),
  );
  const jsFilesFromHtml = [...document.querySelectorAll('script[src]')].map((element) =>
    normalizeAssetPath(element.getAttribute('src') || ''),
  );
  const cssFallback = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.css'))
    .map((entry) => entry.name);
  const jsFallback = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.js'))
    .map((entry) => entry.name);
  const cssFiles = dedupeBy(cssFilesFromHtml.length ? cssFilesFromHtml : cssFallback, (file) => file);
  const jsFiles = dedupeBy(jsFilesFromHtml.length ? jsFilesFromHtml : jsFallback, (file) => file);
  const relativeRoot = path.relative(directory, templateRoot).replace(/\\/g, '/');
  const scopedBase = relativeRoot ? `${publicBase}/${relativeRoot}` : publicBase;

  return {
    id: `${source}:${slug}`,
    slug,
    source,
    directory,
    rootDirectory: templateRoot,
    name: manifestOverrides.name || prettifyFieldName(slug),
    description: manifestOverrides.description || '',
    category: manifestOverrides.category || 'title',
    fieldStyleEditor: manifestOverrides.fieldStyleEditor === true,
    htmlFile,
    fields,
    timers,
    assetUrls: {
      html: `${scopedBase}/${htmlFile}`,
      css: cssFiles.map((file) => `${scopedBase}/${file}`),
      js: jsFiles.map((file) => `${scopedBase}/${file}`),
    },
  };
};
