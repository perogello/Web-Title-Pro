import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { TitleStore } from '../server/state/store.js';
import { PluginService, parsePluginManifest, applySettingsDefaults } from '../server/plugins/plugin-service.js';

const makeTemplateService = () => ({
  scanTemplates: async () => {},
  getTemplates: () => [],
  getTemplate: () => null,
});

const makeStore = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-plg-'));
  const stateFile = path.join(dir, 'state.json');
  const store = new TitleStore({ stateFile, templateService: makeTemplateService() });
  await store.init();
  return { store, dir, stateFile };
};

const writePlugin = async (root, slug, manifest, { entry = 'index.html' } = {}) => {
  const dir = path.join(root, slug);
  await fs.ensureDir(dir);
  await fs.writeJson(path.join(dir, 'plugin.json'), manifest);
  if (entry) await fs.writeFile(path.join(dir, entry), '<!doctype html><title>x</title>');
  return dir;
};

test('parsePluginManifest normalizes caps + mount and builds an entry url', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-man-'));
  try {
    const directory = await writePlugin(root, 'demo', {
      name: '  Demo  ',
      entry: 'index.html',
      capabilities: ['state:read', 'bogus', 'command:send'],
      mount: { type: 'panel', location: 'live', label: 'Demo' },
    });
    const plugin = await parsePluginManifest({ directory, slug: 'demo', source: 'builtin', publicBase: '/plugin-assets/builtin/demo' });
    assert.equal(plugin.id, 'builtin:demo');
    assert.equal(plugin.name, 'Demo');
    assert.deepEqual(plugin.capabilities, ['state:read', 'command:send']);
    assert.deepEqual(plugin.mount, { type: 'panel', location: 'live', label: 'Demo' });
    assert.equal(plugin.entryUrl, '/plugin-assets/builtin/demo/index.html');
  } finally {
    await fs.remove(root);
  }
});

test('parsePluginManifest rejects a missing entry file and traversal', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-man2-'));
  try {
    const directory = await writePlugin(root, 'noentry', { name: 'X', entry: 'missing.html' }, { entry: null });
    await assert.rejects(
      () => parsePluginManifest({ directory, slug: 'noentry', source: 'builtin', publicBase: '/p' }),
      /Entry file/,
    );

    const dir2 = await writePlugin(root, 'evil', { name: 'X', entry: '../secret.html' });
    await assert.rejects(
      () => parsePluginManifest({ directory: dir2, slug: 'evil', source: 'builtin', publicBase: '/p' }),
      /inside the plugin folder/,
    );
  } finally {
    await fs.remove(root);
  }
});

test('parsePluginManifest normalizes a settings schema and drops bad fields', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-set-'));
  try {
    const directory = await writePlugin(root, 'cfg', {
      name: 'Cfg',
      entry: 'index.html',
      settings: [
        { key: 'heading', label: 'Head', type: 'text', default: 'Hi' },
        { key: 'compact', type: 'checkbox', default: true },
        { key: 'accent', type: 'select', default: 'a', options: ['a', { value: 'b', label: 'B' }] },
        { type: 'text' }, // no key -> dropped
        { key: 'weird', type: 'bogus' }, // unknown type -> falls back to text
      ],
    });
    const plugin = await parsePluginManifest({ directory, slug: 'cfg', source: 'builtin', publicBase: '/p' });
    const keys = plugin.settingsSchema.map((f) => f.key);
    assert.deepEqual(keys, ['heading', 'compact', 'accent', 'weird']);
    assert.equal(plugin.settingsSchema.find((f) => f.key === 'compact').label, 'compact'); // label defaults to key
    assert.equal(plugin.settingsSchema.find((f) => f.key === 'weird').type, 'text');
    assert.deepEqual(plugin.settingsSchema.find((f) => f.key === 'accent').options, [
      { value: 'a', label: 'a' },
      { value: 'b', label: 'B' },
    ]);
  } finally {
    await fs.remove(root);
  }
});

test('applySettingsDefaults backfills only missing keys', () => {
  const schema = [
    { key: 'a', default: 1 },
    { key: 'b', default: 2 },
    { key: 'c' },
  ];
  assert.deepEqual(applySettingsDefaults(schema, { b: 20 }), { a: 1, b: 20 });
});

test('PluginService scans builtin + custom dirs and skips non-plugin folders', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-svc-'));
  try {
    const builtin = path.join(root, 'builtin');
    const custom = path.join(root, 'custom');
    await writePlugin(builtin, 'alpha', { name: 'Alpha', entry: 'index.html' });
    await fs.ensureDir(path.join(builtin, 'not-a-plugin')); // no manifest -> skipped
    await writePlugin(custom, 'beta', { name: 'Beta', entry: 'index.html' });

    const service = new PluginService({ builtinPluginsDir: builtin, customPluginsDir: custom });
    await service.init();
    const ids = service.getPlugins().map((p) => p.id);
    assert.deepEqual(ids, ['builtin:alpha', 'custom:beta']); // sorted by name
    assert.equal(service.getPlugin('custom:beta').name, 'Beta');
  } finally {
    await fs.remove(root);
  }
});

test('store: enable mints a scoped grant, disable revokes it', async () => {
  const { store, dir } = await makeStore();
  try {
    const { state, token } = store.setPluginEnabled('builtin:demo', true, ['state:read', 'command:send']);
    assert.equal(state.enabled, true);
    assert.ok(token, 'enable returns the raw token to the host');
    assert.ok(store.grantHasCapability(token, 'command:send'));
    assert.equal(store.getPluginGrantToken('builtin:demo'), token);
    assert.equal(store.listAccessGrants().length, 1);

    store.setPluginEnabled('builtin:demo', false);
    assert.equal(store.getPluginState('builtin:demo').enabled, false);
    assert.equal(store.getPluginGrantToken('builtin:demo'), null);
    assert.equal(store.grantHasCapability(token, 'command:send'), false);
    assert.equal(store.listAccessGrants().length, 0, 'disabling revokes the grant');
  } finally {
    await fs.remove(dir);
  }
});

test('store: plugin state persists, but stays out of snapshot and project export', async () => {
  const { store, dir, stateFile } = await makeStore();
  try {
    store.setPluginEnabled('builtin:demo', true, ['state:read']);
    store.updatePluginSettings('builtin:demo', { color: 'red' });

    assert.equal(store.getSnapshot().plugins, undefined, 'plugins never broadcast');
    assert.equal(store.exportProjectState().plugins, undefined, 'plugins never exported');

    await store.persist?.();
    const reopened = new TitleStore({ stateFile, templateService: makeTemplateService() });
    await reopened.init();
    assert.equal(reopened.getPluginState('builtin:demo').enabled, true);
    assert.deepEqual(reopened.getPluginState('builtin:demo').settings, { color: 'red' });

    // A shared project cannot inject enabled plugins.
    await reopened.loadProjectState({ plugins: { installed: { 'evil:x': { enabled: true, grantId: 'g' } } } });
    assert.equal(reopened.getPluginState('evil:x'), null);
  } finally {
    await fs.remove(dir);
  }
});
