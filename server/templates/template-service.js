import path from 'node:path';
import fs from 'fs-extra';
import unzipper from 'unzipper';
import { nanoid } from 'nanoid';
import { JSDOM } from 'jsdom';
import { parseTemplateManifest } from './template-parser.js';

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'template';

const sortByName = (items) => [...items].sort((a, b) => a.name.localeCompare(b.name));
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 60 * 1024 * 1024;
const MAX_FILE_COUNT = 150;
const MAX_SINGLE_FILE_BYTES = 30 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.mp4',
  '.webm',
]);
const BLOCKED_TAGS = new Set(['iframe', 'object', 'embed']);
const ASSET_ATTRIBUTES = [
  ['link[href]', 'href'],
  ['script[src]', 'src'],
  ['img[src]', 'src'],
  ['video[src]', 'src'],
  ['video source[src]', 'src'],
  ['audio[src]', 'src'],
  ['audio source[src]', 'src'],
];
const isExternalResource = (value = '') => /^(?:https?:)?\/\//i.test(value.trim());

class TemplateValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'TemplateValidationError';
    this.details = details;
  }
}

const toRelativePath = (baseDir, targetPath) => path.relative(baseDir, targetPath).replace(/\\/g, '/');

const collectFiles = async (directory) => {
  const files = [];
  const visit = async (currentDirectory) => {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        files.push({
          fullPath,
          relativePath: toRelativePath(directory, fullPath),
          size: stats.size,
          extension: path.extname(entry.name).toLowerCase(),
        });
      }
    }
  };

  await visit(directory);
  return files;
};

const validateHtmlFile = async (filePath, relativePath) => {
  const errors = [];
  const htmlSource = await fs.readFile(filePath, 'utf8');
  const dom = new JSDOM(htmlSource);
  const { document } = dom.window;

  for (const tagName of BLOCKED_TAGS) {
    if (document.querySelector(tagName)) {
      errors.push({
        file: relativePath,
        message: `Tag <${tagName}> is not allowed in title templates.`,
        hint: 'Remove embedded external containers and keep the template self-contained.',
      });
    }
  }

  for (const [selector, attribute] of ASSET_ATTRIBUTES) {
    for (const node of document.querySelectorAll(selector)) {
      const value = (node.getAttribute(attribute) || '').trim();

      if (!value) {
        continue;
      }

      if (isExternalResource(value)) {
        errors.push({
          file: relativePath,
          message: `External resource "${value}" is not allowed.`,
          hint: 'Use only local files stored inside the template package.',
        });
      }
    }
  }

  return errors;
};

const validateTemplateDirectory = async (directory) => {
  const files = await collectFiles(directory);
  const errors = [];
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const htmlFiles = files.filter((file) => file.extension === '.html');

  if (!htmlFiles.length) {
    errors.push({
      file: '(package)',
      message: 'Template package does not contain an HTML file.',
      hint: 'Add at least one .html file, preferably index.html.',
    });
  }

  if (files.length > MAX_FILE_COUNT) {
    errors.push({
      file: '(package)',
      message: `Too many files: ${files.length}. Limit is ${MAX_FILE_COUNT}.`,
      hint: 'Remove unused assets and keep template packages compact.',
    });
  }

  if (totalSize > MAX_UNPACKED_BYTES) {
    errors.push({
      file: '(package)',
      message: `Unpacked template size is too large: ${Math.ceil(totalSize / (1024 * 1024))} MB. Limit is ${Math.ceil(MAX_UNPACKED_BYTES / (1024 * 1024))} MB.`,
      hint: 'Compress or reduce images, fonts, and videos.',
    });
  }

  for (const file of files) {
    if (!ALLOWED_EXTENSIONS.has(file.extension)) {
      errors.push({
        file: file.relativePath,
        message: `File type "${file.extension || 'no extension'}" is not allowed.`,
        hint: 'Allowed types: html, css, js, json, images, fonts, mp4, webm.',
      });
    }

    if (file.size > MAX_SINGLE_FILE_BYTES) {
      errors.push({
        file: file.relativePath,
        message: `File is too large: ${Math.ceil(file.size / (1024 * 1024))} MB. Limit is ${Math.ceil(MAX_SINGLE_FILE_BYTES / (1024 * 1024))} MB.`,
        hint: 'Reduce asset size before importing the template.',
      });
    }
  }

  for (const file of htmlFiles) {
    errors.push(...(await validateHtmlFile(file.fullPath, file.relativePath)));
  }

  if (errors.length) {
    throw new TemplateValidationError('Template validation failed.', errors);
  }
};

const writeUploadedFiles = async (files, targetDirectory) => {
  for (const file of files) {
    const rawRelativePath = (file.originalname || file.fieldname || `asset-${Date.now()}`).replace(/\\/g, '/');
    const safeRelativePath = rawRelativePath
      .split('/')
      .filter((segment) => segment && segment !== '.' && segment !== '..')
      .join('/');
    const targetPath = path.join(targetDirectory, safeRelativePath);

    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, file.buffer);
  }
};

const copyTemplateDirectory = async (sourceDirectory, targetDirectory) => {
  const exists = await fs.pathExists(sourceDirectory);

  if (!exists) {
    throw new Error('Selected template folder does not exist.');
  }

  const stats = await fs.stat(sourceDirectory);
  if (!stats.isDirectory()) {
    throw new Error('Selected path is not a folder.');
  }

  await fs.copy(sourceDirectory, targetDirectory, {
    dereference: true,
    overwrite: true,
    errorOnExist: false,
    filter: (sourcePath) => {
      const relativePath = path.relative(sourceDirectory, sourcePath).replace(/\\/g, '/');
      if (!relativePath) {
        return true;
      }

      return !relativePath.split('/').some((segment) => segment === '..');
    },
  });
};

const writeZipFiles = async (zipBuffer, targetDirectory) => {
  const directory = await unzipper.Open.buffer(zipBuffer);
  const fileEntries = directory.files.filter((entry) => entry.type === 'File');
  const errors = [];
  const totalCompressed = fileEntries.reduce((sum, entry) => sum + Number(entry.compressedSize || 0), 0);
  const totalUncompressed = fileEntries.reduce((sum, entry) => sum + Number(entry.uncompressedSize || 0), 0);

  if (zipBuffer.length > MAX_UPLOAD_BYTES) {
    errors.push({
      file: '(archive)',
      message: `Archive is too large: ${Math.ceil(zipBuffer.length / (1024 * 1024))} MB. Limit is ${Math.ceil(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
      hint: 'Compress or remove large assets before import.',
    });
  }

  if (fileEntries.length > MAX_FILE_COUNT) {
    errors.push({
      file: '(archive)',
      message: `Archive contains too many files: ${fileEntries.length}. Limit is ${MAX_FILE_COUNT}.`,
      hint: 'Keep template packages compact.',
    });
  }

  if (totalUncompressed > MAX_UNPACKED_BYTES) {
    errors.push({
      file: '(archive)',
      message: `Archive expands to ${Math.ceil(totalUncompressed / (1024 * 1024))} MB. Limit is ${Math.ceil(MAX_UNPACKED_BYTES / (1024 * 1024))} MB.`,
      hint: 'This package is too heavy to import safely.',
    });
  }

  if (totalCompressed > MAX_UPLOAD_BYTES) {
    errors.push({
      file: '(archive)',
      message: `Compressed payload is too large: ${Math.ceil(totalCompressed / (1024 * 1024))} MB. Limit is ${Math.ceil(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
      hint: 'Reduce archive size before import.',
    });
  }

  for (const entry of fileEntries) {
    const safeRelativePath = entry.path
      .replace(/\\/g, '/')
      .split('/')
      .filter((segment) => segment && segment !== '.' && segment !== '..')
      .join('/');

    if (!safeRelativePath) {
      continue;
    }

    if (!ALLOWED_EXTENSIONS.has(path.extname(safeRelativePath).toLowerCase())) {
      errors.push({
        file: safeRelativePath,
        message: `File type "${path.extname(safeRelativePath) || 'no extension'}" is not allowed.`,
        hint: 'Allowed types: html, css, js, json, images, fonts, mp4, webm.',
      });
    }

    if (Number(entry.uncompressedSize || 0) > MAX_SINGLE_FILE_BYTES) {
      errors.push({
        file: safeRelativePath,
        message: `File is too large after extraction: ${Math.ceil(Number(entry.uncompressedSize || 0) / (1024 * 1024))} MB. Limit is ${Math.ceil(MAX_SINGLE_FILE_BYTES / (1024 * 1024))} MB.`,
        hint: 'Reduce large assets before importing the template.',
      });
    }
  }

  if (errors.length) {
    throw new TemplateValidationError('Template validation failed.', errors);
  }

  for (const entry of fileEntries) {
    const safeRelativePath = entry.path
      .replace(/\\/g, '/')
      .split('/')
      .filter((segment) => segment && segment !== '.' && segment !== '..')
      .join('/');

    if (!safeRelativePath) {
      continue;
    }

    const targetPath = path.join(targetDirectory, safeRelativePath);
    await fs.ensureDir(path.dirname(targetPath));
    await new Promise((resolve, reject) => {
      entry
        .stream()
        .pipe(fs.createWriteStream(targetPath))
        .on('finish', resolve)
        .on('error', reject);
    });
  }
};

export class TemplateService {
  constructor({ builtinTemplatesDir, customTemplatesDir }) {
    this.builtinTemplatesDir = builtinTemplatesDir;
    this.customTemplatesDir = customTemplatesDir;
    this.templates = [];
  }

  async init() {
    await fs.ensureDir(this.builtinTemplatesDir);
    await fs.ensureDir(this.customTemplatesDir);
    await this.scanTemplates();
  }

  async scanTemplates() {
    const templates = [];
    const sources = [
      { directory: this.builtinTemplatesDir, source: 'builtin' },
      { directory: this.customTemplatesDir, source: 'custom' },
    ];

    for (const sourceItem of sources) {
      const exists = await fs.pathExists(sourceItem.directory);

      if (!exists) {
        continue;
      }

      const entries = await fs.readdir(sourceItem.directory, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        try {
          const template = await parseTemplateManifest({
            directory: path.join(sourceItem.directory, entry.name),
            slug: entry.name,
            source: sourceItem.source,
            publicBase: `/template-assets/${sourceItem.source}/${entry.name}`,
          });

          templates.push(template);
        } catch (error) {
          console.warn(`Failed to parse template "${entry.name}":`, error.message);
        }
      }
    }

    this.templates = sortByName(templates);
    return this.templates;
  }

  getTemplates() {
    return this.templates;
  }

  getTemplate(templateId) {
    return this.templates.find((template) => template.id === templateId) || null;
  }

  async deleteTemplate(templateId) {
    const template = this.getTemplate(templateId);

    if (!template) {
      throw new Error('Template not found.');
    }

    if (template.source !== 'custom') {
      throw new Error('Built-in templates cannot be removed.');
    }

    await fs.remove(template.directory);
    await this.scanTemplates();

    return { ok: true, templateId };
  }

  async importTemplatePackage(files, preferredName = '') {
    if (!files?.length) {
      throw new Error('No template files were uploaded.');
    }

    if (files.some((file) => Number(file.size || file.buffer?.length || 0) > MAX_UPLOAD_BYTES)) {
      throw new TemplateValidationError('Template validation failed.', [
        {
          file: '(upload)',
          message: `One or more uploaded files exceed ${Math.ceil(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
          hint: 'Reduce file size before importing the template.',
        },
      ]);
    }

    const packageSlug = `${slugify(preferredName || files[0].originalname || 'uploaded-template')}-${nanoid(6)}`;
    const targetDirectory = path.join(this.customTemplatesDir, packageSlug);

    await fs.ensureDir(targetDirectory);

    try {
      if (files.length === 1 && files[0].originalname.toLowerCase().endsWith('.zip')) {
        await writeZipFiles(files[0].buffer, targetDirectory);
      } else {
        if (files.length > MAX_FILE_COUNT) {
          throw new TemplateValidationError('Template validation failed.', [
            {
              file: '(upload)',
              message: `Too many uploaded files: ${files.length}. Limit is ${MAX_FILE_COUNT}.`,
              hint: 'Keep template packages compact.',
            },
          ]);
        }
        await writeUploadedFiles(files, targetDirectory);
      }

      await validateTemplateDirectory(targetDirectory);
      await this.scanTemplates();

      const importedTemplate = this.templates.find((template) => template.source === 'custom' && template.slug === packageSlug);

      if (!importedTemplate) {
        throw new Error('The uploaded template package could not be parsed.');
      }

      return importedTemplate;
    } catch (error) {
      await fs.remove(targetDirectory).catch(() => {});
      throw error;
    }
  }

  async importTemplateDirectory(directoryPath, preferredName = '') {
    if (!directoryPath || typeof directoryPath !== 'string') {
      throw new Error('Template folder path is required.');
    }

    const packageSlug = `${slugify(preferredName || path.basename(directoryPath) || 'uploaded-template')}-${nanoid(6)}`;
    const targetDirectory = path.join(this.customTemplatesDir, packageSlug);

    await fs.ensureDir(targetDirectory);

    try {
      await copyTemplateDirectory(directoryPath, targetDirectory);
      await validateTemplateDirectory(targetDirectory);
      await this.scanTemplates();

      const importedTemplate = this.templates.find((template) => template.source === 'custom' && template.slug === packageSlug);

      if (!importedTemplate) {
        throw new Error('The selected template folder could not be parsed.');
      }

      return importedTemplate;
    } catch (error) {
      await fs.remove(targetDirectory).catch(() => {});
      throw error;
    }
  }
}
