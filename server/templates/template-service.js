import path from 'node:path';
import fs from 'fs-extra';
import unzipper from 'unzipper';
import { nanoid } from 'nanoid';
import { parseTemplateManifest } from './template-parser.js';

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'template';

const sortByName = (items) => [...items].sort((a, b) => a.name.localeCompare(b.name));

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

  async importTemplatePackage(files, preferredName = '') {
    if (!files?.length) {
      throw new Error('No template files were uploaded.');
    }

    const packageSlug = `${slugify(preferredName || files[0].originalname || 'uploaded-template')}-${nanoid(6)}`;
    const targetDirectory = path.join(this.customTemplatesDir, packageSlug);

    await fs.ensureDir(targetDirectory);

    if (files.length === 1 && files[0].originalname.toLowerCase().endsWith('.zip')) {
      await new Promise((resolve, reject) => {
        const stream = unzipper.Extract({ path: targetDirectory });
        stream.on('close', resolve);
        stream.on('error', reject);
        stream.end(files[0].buffer);
      });
    } else {
      await writeUploadedFiles(files, targetDirectory);
    }

    await this.scanTemplates();

    const importedTemplate = this.templates.find((template) => template.source === 'custom' && template.slug === packageSlug);

    if (!importedTemplate) {
      throw new Error('The uploaded template package could not be parsed.');
    }

    return importedTemplate;
  }
}
