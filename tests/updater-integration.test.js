import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createUpdaterIntegration } = require('../desktop/integrations/updater.cjs');

const createIntegration = () =>
  createUpdaterIntegration({
    app: {
      isPackaged: true,
      getPath: () => os.tmpdir(),
    },
    dialog: {
      showMessageBox: async () => ({ response: 0 }),
    },
    shell: {
      openExternal: async () => {},
    },
    log: () => {},
    getMainWindow: () => null,
    createUpdateWindow: async () => null,
    closeUpdateWindow: () => {},
    setWindowProgress: async () => {},
    confirmInstall: async () => true,
    requestQuitForUpdate: async () => {},
    serverUrl: 'http://127.0.0.1:4000',
    repoUrl: 'https://github.com/perogello/Web-Title-Pro',
    stablePortableExeName: 'WebTitlePro.exe',
  });

test('validatePortableUpdatePackage: accepts matching executable package', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-updater-test-'));
  const filePath = path.join(dir, 'WebTitlePro-test.exe');

  await fs.writeFile(filePath, Buffer.from([0x4d, 0x5a, 0x90, 0x00]));

  try {
    const updater = createIntegration();
    await updater.__private.validatePortableUpdatePackage(filePath, 4);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('validatePortableUpdatePackage: rejects truncated executable package', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-updater-test-'));
  const filePath = path.join(dir, 'WebTitlePro-test.exe');

  await fs.writeFile(filePath, Buffer.from([0x4d, 0x5a, 0x90, 0x00]));

  try {
    const updater = createIntegration();
    await assert.rejects(
      () => updater.__private.validatePortableUpdatePackage(filePath, 95_150_798),
      /size mismatch/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('validatePortableUpdatePackage: rejects non-executable package', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-updater-test-'));
  const filePath = path.join(dir, 'WebTitlePro-test.exe');

  await fs.writeFile(filePath, 'not an exe');

  try {
    const updater = createIntegration();
    await assert.rejects(
      () => updater.__private.validatePortableUpdatePackage(filePath, 0),
      /not a valid Windows executable/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('downloadFileWithProgress: rejects incomplete response stream', async () => {
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-updater-test-'));
  const filePath = path.join(dir, 'WebTitlePro-test.exe.download');

  globalThis.fetch = async () => ({
    ok: true,
    headers: {
      get: (name) => (name.toLowerCase() === 'content-length' ? '8' : null),
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]));
        controller.close();
      },
    }),
  });

  try {
    const updater = createIntegration();
    await assert.rejects(
      () => updater.__private.downloadFileWithProgress('https://example.test/update.exe', filePath),
      /incomplete/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
