import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { ZipArchive } from 'archiver';
import unzipper from 'unzipper';
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

const readZipJson = async (buffer, fileName) => {
  const directory = await unzipper.Open.buffer(buffer);
  const file = directory.files.find((entry) => entry.path === fileName);
  assert.ok(file, `${fileName} should exist in bundle`);
  return JSON.parse((await file.buffer()).toString('utf8'));
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
    state: {
      selectedOutputId: 'output-1',
      outputs: [{ id: 'output-1', key: 'main', name: 'OUTPUT 1', selectedEntryId: 'entry-1' }],
      integrations: {
        vmix: { host: 'http://127.0.0.1:8088', selectedTimerInputKey: 'vmix-key-1' },
        shortcuts: {
          show: 'Ctrl+Shift+S',
          nextTitle: 'ArrowDown',
          outputSelectById: { 'output-1': 'Ctrl+1' },
          entrySelectById: { 'entry-2': 'Ctrl+2' },
          timerToggleById: { main: 'Space' },
          globalActions: { show: true, 'selectEntry:entry-2': true },
        },
        midi: {
          bindings: [
            {
              action: 'selectEntry:entry-2',
              type: 'noteon',
              channel: 1,
              note: 64,
              deviceId: 'midi-device-1',
            },
          ],
        },
      },
      entries: [
        { id: 'entry-1', name: 'Local Title', templateId: 'custom:custom-one', fields: { Name: 'Alice' } },
        {
          id: 'entry-2',
          entryType: 'vmix',
          name: 'vMix Title',
          templateId: null,
          fields: { Text: 'Live' },
          vmixInputKey: 'vmix-key-1',
          vmixInputNumber: '8',
          vmixInputTitle: 'Scorebug.gtzip',
        },
      ],
      timers: [{ id: 'main', name: 'Main Timer', durationMs: 30000 }],
    },
    sources: {
      selectedSourceId: 'source-1',
      items: [{ id: 'source-1', name: 'Run of Show', columns: [{ id: 'c1', label: 'Name' }], rows: [{ id: 'r1', values: ['Alice'] }] }],
    },
    runtime: {
      vmix: {
        connected: true,
        host: 'http://127.0.0.1:8088',
        inputs: [
          {
            key: 'vmix-key-1',
            number: '8',
            type: 'GT',
            title: 'Scorebug.gtzip',
            textFields: [{ index: '0', name: 'Text', value: 'Live' }],
          },
        ],
      },
    },
  };

  const { stream, manifest } = createProjectBundleStream({ project, templateService });
  const buffer = await streamToBuffer(stream);
  const summary = await readZipJson(buffer, 'project-summary.json');
  const exportedProject = await readZipJson(buffer, 'project.json');
  const result = await importProjectBundle({ buffer, templateService });

  assert.deepEqual(manifest.includedTemplateIds, ['custom:custom-one']);
  assert.deepEqual(manifest.projectCounts, {
    outputs: 1,
    entries: 2,
    sources: 1,
    timers: 1,
    vmixDiscoveredInputs: 1,
  });
  assert.deepEqual(summary.counts, {
    outputs: 1,
    titles: 2,
    localTitles: 1,
    vmixTitles: 1,
    timers: 1,
    dataSources: 1,
    bundledCustomTemplates: 1,
    referencedBuiltinTemplates: 0,
    referencedUnknownTemplates: 0,
    vmixDiscoveredInputs: 1,
  });
  assert.equal(summary.titles.find((entry) => entry.type === 'vmix').vmixInputNumber, '8');
  assert.equal(summary.vmix.discoveredInputs[0].title, 'Scorebug.gtzip');
  assert.equal(exportedProject.state.entries.length, 2);
  assert.equal(exportedProject.sources.items.length, 1);
  assert.equal(exportedProject.runtime.vmix.inputs.length, 1);
  assert.equal(exportedProject.state.integrations.vmix.selectedTimerInputKey, 'vmix-key-1');
  assert.equal(exportedProject.state.integrations.shortcuts.show, 'Ctrl+Shift+S');
  assert.equal(exportedProject.state.integrations.shortcuts.entrySelectById['entry-2'], 'Ctrl+2');
  assert.equal(exportedProject.state.integrations.midi.bindings[0].action, 'selectEntry:entry-2');
  assert.equal(result.project.meta.name, 'Bundle Test');
  assert.equal(result.project.state.integrations.shortcuts.timerToggleById.main, 'Space');
  assert.equal(result.project.state.integrations.midi.bindings[0].note, 64);
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
