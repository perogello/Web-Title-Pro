import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { TitleStore } from '../server/state/store.js';
import { ZipArchive } from 'archiver';
import { PluginService, parsePluginManifest, applySettingsDefaults } from '../server/plugins/plugin-service.js';
import { TemplateService } from '../server/templates/template-service.js';

const file = (name, content) => ({ originalname: name, buffer: Buffer.from(content) });
const manifest = (extra = {}) => JSON.stringify({ name: 'Imported', entry: 'index.html', ...extra });

const makeService = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-imp-'));
  const service = new PluginService({
    builtinPluginsDir: path.join(root, 'builtin'),
    customPluginsDir: path.join(root, 'custom'),
  });
  await service.init();
  return { service, root };
};

const makeZip = (entries) =>
  new Promise((resolve, reject) => {
    const archive = new ZipArchive();
    const chunks = [];
    archive.on('data', (c) => chunks.push(c));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    for (const [name, content] of entries) archive.append(content, { name });
    archive.finalize();
  });

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

test('parsePluginManifest parses an overlay surface and rejects a missing one', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-ov-'));
  try {
    const dir = path.join(root, 'ov');
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'plugin.json'), { name: 'Ov', entry: 'panel.html', overlay: 'overlay.html' });
    await fs.writeFile(path.join(dir, 'panel.html'), 'x');
    // Missing overlay file -> rejected.
    await assert.rejects(
      () => parsePluginManifest({ directory: dir, slug: 'ov', source: 'builtin', publicBase: '/plugin-assets/builtin/ov' }),
      /Overlay file/,
    );
    await fs.writeFile(path.join(dir, 'overlay.html'), 'y');
    const plugin = await parsePluginManifest({ directory: dir, slug: 'ov', source: 'builtin', publicBase: '/plugin-assets/builtin/ov' });
    assert.equal(plugin.overlayUrl, '/plugin-assets/builtin/ov/overlay.html');
  } finally {
    await fs.remove(root);
  }
});

test('store: plugin content data persists, clones out, and broadcasts', async () => {
  const { store, dir } = await makeStore();
  try {
    const events = [];
    store.on('plugin-data', (payload) => events.push(payload));

    assert.deepEqual(store.getPluginData('builtin:bingo'), {});
    store.setPluginData('builtin:bingo', { current: 7, called: [7] });

    assert.deepEqual(store.getPluginData('builtin:bingo'), { current: 7, called: [7] });
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { pluginId: 'builtin:bingo', data: { current: 7, called: [7] } });

    // Returned data is a clone — mutating it must not corrupt the store.
    const got = store.getPluginData('builtin:bingo');
    got.called.push(99);
    assert.deepEqual(store.getPluginData('builtin:bingo').called, [7]);
  } finally {
    await fs.remove(dir);
  }
});

test('parsePluginManifest accepts a background mount', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-bg-'));
  try {
    const directory = await writePlugin(root, 'bg', { name: 'BG', entry: 'index.html', mount: { type: 'background' } });
    const plugin = await parsePluginManifest({ directory, slug: 'bg', source: 'builtin', publicBase: '/p' });
    assert.equal(plugin.mount.type, 'background');
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

test('parsePluginManifest normalizes contributed buttons and drops invalid ones', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-con-'));
  try {
    const directory = await writePlugin(root, 'con', {
      name: 'Con',
      entry: 'index.html',
      contributes: {
        buttons: [
          { slot: 'live.toolbar', label: 'PANIC', command: 'global:allOutputsOut' },
          { slot: 'bogus.slot', label: 'X', command: 'global:allOutputsOut' }, // unknown slot -> dropped
          { slot: 'live.toolbar', label: '', command: 'global:allOutputsOut' }, // no label -> dropped
          { slot: 'live.toolbar', label: 'Bad', command: 'not-an-action' }, // bad command, no action -> dropped
          { slot: 'live.toolbar', label: 'Custom', action: 'doThing' }, // plugin action -> kept
          { slot: 'live.toolbar', label: 'Row', command: 'output:output-main:rowNext' },
        ],
      },
    });
    const plugin = await parsePluginManifest({ directory, slug: 'con', source: 'builtin', publicBase: '/p' });
    assert.deepEqual(plugin.contributes.buttons, [
      { slot: 'live.toolbar', label: 'PANIC', command: 'global:allOutputsOut' },
      { slot: 'live.toolbar', label: 'Custom', action: 'doThing' },
      { slot: 'live.toolbar', label: 'Row', command: 'output:output-main:rowNext' },
    ]);
  } finally {
    await fs.remove(root);
  }
});

test('parsePluginManifest normalizes declared commands', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-cmd-'));
  try {
    const directory = await writePlugin(root, 'cmd', {
      name: 'Cmd',
      entry: 'index.html',
      contributes: {
        commands: [
          { id: 'takeNext', label: 'Take Next' },
          { id: 'noLabel' }, // label defaults to id
          { label: 'no id' }, // no id -> dropped
        ],
      },
    });
    const plugin = await parsePluginManifest({ directory, slug: 'cmd', source: 'builtin', publicBase: '/p' });
    assert.deepEqual(plugin.contributes.commands, [
      { id: 'takeNext', label: 'Take Next' },
      { id: 'noLabel', label: 'noLabel' },
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

test('importPluginPackage installs from loose files', async () => {
  const { service, root } = await makeService();
  try {
    const plugin = await service.importPluginPackage(
      [file('plugin.json', manifest({ name: 'Loose' })), file('index.html', '<title>x</title>')],
      'Loose',
    );
    assert.equal(plugin.source, 'custom');
    assert.equal(plugin.name, 'Loose');
    assert.ok(service.getPlugin(plugin.id));
  } finally {
    await fs.remove(root);
  }
});

test('importPluginPackage strips a single wrapping folder so plugin.json is at root', async () => {
  const { service, root } = await makeService();
  try {
    // Mirrors a browser folder pick: files carry a top-folder prefix.
    const plugin = await service.importPluginPackage([
      file('my-plugin/plugin.json', manifest({ name: 'Wrapped' })),
      file('my-plugin/index.html', '<title>x</title>'),
    ]);
    assert.equal(plugin.name, 'Wrapped');
    assert.ok(await fs.pathExists(path.join(plugin.directory, 'plugin.json')));
  } finally {
    await fs.remove(root);
  }
});

test('importPluginPackage installs from a .zip', async () => {
  const { service, root } = await makeService();
  try {
    const zip = await makeZip([
      ['plugin.json', manifest({ name: 'Zipped' })],
      ['index.html', '<title>x</title>'],
    ]);
    const plugin = await service.importPluginPackage([{ originalname: 'pack.zip', buffer: zip }], 'Zipped');
    assert.equal(plugin.name, 'Zipped');
  } finally {
    await fs.remove(root);
  }
});

test('importPluginPackage rejects a missing manifest or a bad file type, leaving nothing behind', async () => {
  const { service, root } = await makeService();
  try {
    await assert.rejects(
      () => service.importPluginPackage([file('index.html', '<title>x</title>')]),
      /validation failed|plugin.json/i,
    );
    await assert.rejects(
      () => service.importPluginPackage([file('plugin.json', manifest()), file('bad.exe', 'MZ')]),
      /validation failed|not allowed/i,
    );
    // Failed installs are cleaned up.
    assert.equal(service.getPlugins().length, 0);
    const customDir = path.join(root, 'custom');
    assert.deepEqual(await fs.readdir(customDir), []);
  } finally {
    await fs.remove(root);
  }
});

test('importPluginDirectory copies an on-disk folder in', async () => {
  const { service, root } = await makeService();
  try {
    const src = path.join(root, 'src-plugin');
    await fs.ensureDir(src);
    await fs.writeFile(path.join(src, 'plugin.json'), manifest({ name: 'FromDir' }));
    await fs.writeFile(path.join(src, 'index.html'), '<title>x</title>');
    const plugin = await service.importPluginDirectory(src, 'FromDir');
    assert.equal(plugin.name, 'FromDir');
    assert.equal(plugin.source, 'custom');
  } finally {
    await fs.remove(root);
  }
});

test('plugin-bundled templates are folded into the template scan', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-ptpl-'));
  try {
    // A plugin that bundles a title template under templates/<name>/.
    const plugin = await writePlugin(path.join(root, 'builtin'), 'graphics', { name: 'Graphics', entry: 'index.html' });
    const tplDir = path.join(plugin, 'templates', 'lower-third');
    await fs.ensureDir(tplDir);
    await fs.writeJson(path.join(tplDir, 'template.json'), { name: 'Bundled LT', category: 'demo' });
    await fs.writeFile(
      path.join(tplDir, 'index.html'),
      '<!doctype html><body><span data-field="name" data-label="Name">x</span></body>',
    );

    const plugins = new PluginService({
      builtinPluginsDir: path.join(root, 'builtin'),
      customPluginsDir: path.join(root, 'custom'),
    });
    await plugins.init();

    const templates = new TemplateService({
      builtinTemplatesDir: path.join(root, 'tpl-builtin'),
      customTemplatesDir: path.join(root, 'tpl-custom'),
    });
    templates.setPluginTemplateSources(await plugins.getBundledTemplateSources());
    await templates.init();

    const bundled = templates.getTemplates().find((t) => t.source === 'plugin');
    assert.ok(bundled, 'plugin-bundled template should be scanned');
    assert.equal(bundled.name, 'Bundled LT');
    assert.equal(bundled.id, 'plugin:graphics--lower-third');
    assert.ok(bundled.assetUrls || bundled.fields, 'template parsed into a usable shape');
    assert.deepEqual((bundled.fields || []).map((f) => f.name), ['name']);
  } finally {
    await fs.remove(root);
  }
});

test('deletePlugin removes a custom plugin and refuses built-ins', async () => {
  const { service, root } = await makeService();
  try {
    const plugin = await service.importPluginPackage([file('plugin.json', manifest()), file('index.html', 'x')]);
    await service.deletePlugin(plugin.id);
    assert.equal(service.getPlugin(plugin.id), null);
    assert.equal(await fs.pathExists(plugin.directory), false);

    // A builtin can't be deleted.
    await fs.ensureDir(path.join(root, 'builtin', 'core'));
    await fs.writeFile(path.join(root, 'builtin', 'core', 'plugin.json'), manifest({ name: 'Core' }));
    await fs.writeFile(path.join(root, 'builtin', 'core', 'index.html'), 'x');
    await service.scanPlugins();
    await assert.rejects(() => service.deletePlugin('builtin:core'), /cannot be removed/i);
  } finally {
    await fs.remove(root);
  }
});

test('store.removePluginState revokes the grant and drops the record', async () => {
  const { store, dir } = await makeStore();
  try {
    const { token } = store.setPluginEnabled('custom:x', true, ['command:send']);
    assert.equal(store.listAccessGrants().length, 1);
    store.removePluginState('custom:x');
    assert.equal(store.getPluginState('custom:x'), null);
    assert.equal(store.grantHasCapability(token, 'command:send'), false);
    assert.equal(store.listAccessGrants().length, 0);
  } finally {
    await fs.remove(dir);
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
