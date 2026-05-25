import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { ZipArchive } from 'archiver';
import { createProjectBundleStream, importProjectBundle } from '../server/templates/bundle-service.js';

let testRoot;

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const makeTemplateService = () => {
  const templatesRoot = path.join(testRoot, 'templates');
  const customTemplatesDir = path.join(testRoot, 'custom');
  fs.mkdirSync(path.join(templatesRoot, 'custom-one'), { recursive: true });
  fs.writeFileSync(path.join(templatesRoot, 'custom-one', 'index.html'), '<div data-field="Name">Name</div>');
  fs.writeFileSync(path.join(templatesRoot, 'custom-one', 'template.json'), '{"name":"Custom One"}');
  fs.mkdirSync(customTemplatesDir, { recursive: true });

  return {
    customTemplatesDir,
    getTemplates: () => [
      {
        id: 'custom:custom-one',
        slug: 'custom-one',
        source: 'custom',
        directory: path.join(templatesRoot, 'custom-one'),
      },
      {
        id: 'builtin:lower-third',
        slug: 'lower-third',
        source: 'builtin',
        directory: path.join(templatesRoot, 'lower-third'),
      },
    ],
    scanTemplates: async () => {},
  };
};

const createZipBuffer = async (entries) => {
  const archive = new ZipArchive({ zlib: { level: 1 } });

  for (const entry of entries) {
    archive.append(entry.content, { name: entry.name });
  }

  archive.finalize();
  return streamToBuffer(archive);
};

beforeEach(() => {
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'web-title-pro-bundle-'));
});

afterEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

test('project bundle exports and imports referenced custom templates', async () => {
  const templateService = makeTemplateService();
  const project = {
    version: 1,
    meta: { name: 'Bundle Test' },
    state: { entries: [{ id: 'entry-1', templateId: 'custom:custom-one' }] },
    sources: { items: [] },
  };

  const { stream, manifest } = createProjectBundleStream({ project, templateService });
  const buffer = await streamToBuffer(stream);
  const result = await importProjectBundle({ buffer, templateService });

  assert.deepEqual(manifest.includedTemplateIds, ['custom:custom-one']);
  assert.equal(result.project.meta.name, 'Bundle Test');
  assert.deepEqual(result.importedTemplates, [{ slug: 'custom-one', fileCount: 2 }]);
  assert.equal(
    fs.readFileSync(path.join(templateService.customTemplatesDir, 'custom-one', 'index.html'), 'utf8'),
    '<div data-field="Name">Name</div>',
  );
});

test('project bundle import rejects zip-slip template paths', async () => {
  const templateService = makeTemplateService();
  const escapeTarget = path.join(testRoot, 'escape.txt');
  const buffer = await createZipBuffer([
    {
      name: 'manifest.json',
      content: JSON.stringify({ version: 1, kind: 'web-title-pro:project-bundle' }),
    },
    {
      name: 'project.json',
      content: JSON.stringify({ version: 1, meta: { name: 'Unsafe' }, state: { entries: [] } }),
    },
    {
      name: 'templates/custom-one/../../escape.txt',
      content: 'escaped',
    },
  ]);

  await assert.rejects(
    () => importProjectBundle({ buffer, templateService }),
    /Unsafe bundle path/,
  );
  assert.equal(fs.existsSync(escapeTarget), false);
});
