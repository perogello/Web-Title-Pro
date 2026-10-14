import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCompanionInstaller } = require('../desktop/integrations/companion-installer.cjs');

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, '\t'));
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// Fake machine: a built module, Companion's launcher config, WTP userData.
const setup = ({ companionConfig = {}, running = false } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wtp-companion-'));
  const appData = path.join(root, 'AppData');
  const userData = path.join(appData, 'web-title-pro');
  const dist = path.join(root, 'dist');
  const moduleDir = path.join(dist, 'web-title-pro');
  writeJson(path.join(moduleDir, 'companion', 'manifest.json'), { id: 'web-title-pro', version: '9.9.9' });
  fs.writeFileSync(path.join(moduleDir, 'companion', 'main.js'), '// v9.9.9');
  writeJson(path.join(moduleDir, 'package.json'), { name: 'companion-module-web-title-pro' });
  if (companionConfig) {
    writeJson(path.join(appData, 'companion', 'config.json'), {
      http_port: 8000,
      enable_developer: false,
      dev_modules_path: '',
      ...companionConfig,
    });
  }

  const calls = [];
  const state = { running };
  const installer = createCompanionInstaller({
    app: { getPath: (name) => (name === 'appData' ? appData : userData) },
    getModuleDistDir: () => dist,
    system: {
      isCompanionRunning: async () => state.running,
      findCompanionExe: async () => 'C:/Companion/Companion.exe',
      stopCompanion: async () => {
        calls.push('stop');
        state.running = false;
        return true;
      },
      launchCompanion: async () => {
        calls.push('launch');
        state.running = true;
        return { ok: true };
      },
    },
  });
  const cleanup = () => fs.rmSync(root, { recursive: true, force: true });
  return { root, appData, userData, dist, moduleDir, installer, calls, cleanup };
};

test('companion installer: no Companion config -> not found, nothing written', async () => {
  const env = setup({ companionConfig: null });
  try {
    const result = await env.installer.install();
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'companion-not-found');
    assert.equal(fs.existsSync(path.join(env.userData, 'companion-modules')), false);
  } finally {
    env.cleanup();
  }
});

test('companion installer: Companion closed -> module copied and developer modules enabled', async () => {
  const env = setup();
  try {
    const result = await env.installer.install();
    assert.equal(result.ok, true);
    assert.equal(result.configChanged, true);
    const target = path.join(env.userData, 'companion-modules', 'web-title-pro');
    assert.equal(fs.readFileSync(path.join(target, 'companion', 'main.js'), 'utf8'), '// v9.9.9');
    const config = readJson(path.join(env.appData, 'companion', 'config.json'));
    assert.equal(config.enable_developer, true);
    assert.equal(config.dev_modules_path, path.join(env.userData, 'companion-modules'));
    assert.equal(config.http_port, 8000, 'other launcher settings are kept');
    assert.deepEqual(env.calls, []);
    const status = await env.installer.getStatus();
    assert.equal(status.installedActive, true);
    assert.equal(status.upToDate, true);
  } finally {
    env.cleanup();
  }
});

test('companion installer: Companion running -> asks first, restarts only when allowed', async () => {
  const env = setup({ running: true });
  try {
    const first = await env.installer.install();
    assert.equal(first.ok, false);
    assert.equal(first.reason, 'companion-running');
    assert.equal(readJson(path.join(env.appData, 'companion', 'config.json')).enable_developer, false);

    const confirmed = await env.installer.install({ restartCompanion: true });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.restarted, true);
    assert.deepEqual(env.calls, ['stop', 'launch']);
  } finally {
    env.cleanup();
  }
});

test('companion installer: existing developer folder -> copy only, live reload, stale files pruned', async () => {
  const env = setup({ running: true });
  try {
    const devDir = path.join(env.root, 'my-dev-modules');
    const target = path.join(devDir, 'web-title-pro');
    fs.mkdirSync(path.join(target, 'companion'), { recursive: true });
    fs.writeFileSync(path.join(target, 'companion', 'main.js'), '// old');
    fs.writeFileSync(path.join(target, 'stale.js'), '// no longer shipped');
    writeJson(path.join(env.appData, 'companion', 'config.json'), { enable_developer: true, dev_modules_path: devDir });

    const result = await env.installer.install();
    assert.equal(result.ok, true);
    assert.equal(result.configChanged, false);
    assert.equal(result.liveReload, true);
    assert.deepEqual(env.calls, [], 'Companion is not restarted');
    assert.equal(fs.readFileSync(path.join(target, 'companion', 'main.js'), 'utf8'), '// v9.9.9');
    assert.equal(fs.existsSync(path.join(target, 'stale.js')), false);
  } finally {
    env.cleanup();
  }
});

test('companion installer: startup sync refreshes an outdated installed copy', async () => {
  const env = setup();
  try {
    await env.installer.install();
    const target = path.join(env.userData, 'companion-modules', 'web-title-pro');
    writeJson(path.join(target, 'companion', 'manifest.json'), { id: 'web-title-pro', version: '0.0.1' });
    fs.writeFileSync(path.join(target, 'companion', 'main.js'), '// old build');
    await env.installer.syncOnStartup();
    assert.equal(readJson(path.join(target, 'companion', 'manifest.json')).version, '9.9.9');
    assert.equal(fs.readFileSync(path.join(target, 'companion', 'main.js'), 'utf8'), '// v9.9.9');
  } finally {
    env.cleanup();
  }
});
