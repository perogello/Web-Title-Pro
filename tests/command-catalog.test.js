import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { TitleStore } from '../server/state/store.js';
import {
  buildCommandCatalog,
  COMMAND_API_VERSION,
  COMMAND_VOCABULARY,
} from '../server/state/command-catalog.js';
import { parseCommandActionId } from '../server/state/command-bus.js';

const makeTemplateService = () => ({
  scanTemplates: async () => {},
  getTemplates: () => [],
  getTemplate: () => null,
});

const makeStore = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-cat-'));
  const store = new TitleStore({ stateFile: path.join(dir, 'state.json'), templateService: makeTemplateService() });
  await store.init();
  return { store, dir };
};

test('catalog publishes a semver-shaped api version', () => {
  assert.equal(typeof COMMAND_API_VERSION.major, 'number');
  assert.equal(typeof COMMAND_API_VERSION.minor, 'number');
});

test('buildCommandCatalog lists a valid, parseable action id for every live target', async () => {
  const { store, dir } = await makeStore();
  try {
    const catalog = buildCommandCatalog(store);
    const outputs = store.getSnapshot().outputs;
    const timers = store.getTimers();

    // Counts: outputs*9 + timers*3 + globals*1.
    const expected =
      outputs.length * Object.keys(COMMAND_VOCABULARY.output).length +
      timers.length * Object.keys(COMMAND_VOCABULARY.timer).length +
      Object.keys(COMMAND_VOCABULARY.global).length;
    assert.equal(catalog.actions.length, expected);

    // Every published action id parses back to its declared kind/command.
    for (const action of catalog.actions) {
      const parsed = parseCommandActionId(action.actionId);
      assert.ok(parsed, `action id should parse: ${action.actionId}`);
      assert.equal(parsed.kind, action.kind);
      assert.equal(parsed.command, action.command);
      assert.ok(action.description, `action should carry a description: ${action.actionId}`);
    }

    // Panic is always present regardless of outputs/timers.
    assert.ok(catalog.actions.some((a) => a.actionId === 'global:allOutputsOut'));
    assert.equal(catalog.apiVersion.major, COMMAND_API_VERSION.major);
  } finally {
    await fs.remove(dir);
  }
});

test('catalog includes enabled plugins commands, excludes disabled', async () => {
  const { store, dir } = await makeStore();
  try {
    const pluginService = {
      getPlugins: () => [
        { id: 'custom:demo', name: 'Demo', contributes: { commands: [{ id: 'takeNext', label: 'Take' }] } },
      ],
    };
    // Disabled -> not in catalog.
    let catalog = buildCommandCatalog(store, pluginService);
    assert.equal(catalog.actions.some((a) => a.actionId === 'plugin:custom:demo:takeNext'), false);
    assert.ok(catalog.grammar.plugin);

    store.setPluginEnabled('custom:demo', true, []);
    catalog = buildCommandCatalog(store, pluginService);
    const entry = catalog.actions.find((a) => a.actionId === 'plugin:custom:demo:takeNext');
    assert.ok(entry, 'enabled plugin command should be published');
    assert.equal(entry.kind, 'plugin');
    assert.equal(entry.targetId, 'custom:demo');
    assert.equal(entry.description, 'Take');
  } finally {
    await fs.remove(dir);
  }
});

test('catalog grows when an output is added', async () => {
  const { store, dir } = await makeStore();
  try {
    const before = buildCommandCatalog(store).actions.length;
    store.createOutput({ name: 'OUTPUT 2' });
    const after = buildCommandCatalog(store).actions.length;
    assert.equal(after - before, Object.keys(COMMAND_VOCABULARY.output).length);
  } finally {
    await fs.remove(dir);
  }
});
