import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
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

const withPortableEnv = async (env, callback) => {
  const previous = {
    PORTABLE_EXECUTABLE_DIR: process.env.PORTABLE_EXECUTABLE_DIR,
    PORTABLE_EXECUTABLE_FILE: process.env.PORTABLE_EXECUTABLE_FILE,
  };

  try {
    if ('PORTABLE_EXECUTABLE_DIR' in env) {
      process.env.PORTABLE_EXECUTABLE_DIR = env.PORTABLE_EXECUTABLE_DIR;
    } else {
      delete process.env.PORTABLE_EXECUTABLE_DIR;
    }

    if ('PORTABLE_EXECUTABLE_FILE' in env) {
      process.env.PORTABLE_EXECUTABLE_FILE = env.PORTABLE_EXECUTABLE_FILE;
    } else {
      delete process.env.PORTABLE_EXECUTABLE_FILE;
    }

    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

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

test('resolvePortableUpdateTargets: updates stable and launched versioned launchers', async () => {
  const dir = path.join(os.tmpdir(), 'wtp updater dir');
  const updater = createIntegration();

  await withPortableEnv(
    {
      PORTABLE_EXECUTABLE_DIR: dir,
      PORTABLE_EXECUTABLE_FILE: path.join(dir, 'WebTitlePro-0.4.4.exe'),
    },
    async () => {
      assert.deepEqual(updater.__private.resolvePortableUpdateTargets(), {
        primaryTarget: path.join(dir, 'WebTitlePro.exe'),
        secondaryTarget: path.join(dir, 'WebTitlePro-0.4.4.exe'),
      });
    },
  );
});

test('resolvePortableUpdateTargets: does not duplicate stable launcher target', async () => {
  const dir = path.join(os.tmpdir(), 'wtp updater dir');
  const updater = createIntegration();

  await withPortableEnv(
    {
      PORTABLE_EXECUTABLE_DIR: dir,
      PORTABLE_EXECUTABLE_FILE: path.join(dir, 'WebTitlePro.exe'),
    },
    async () => {
      assert.deepEqual(updater.__private.resolvePortableUpdateTargets(), {
        primaryTarget: path.join(dir, 'WebTitlePro.exe'),
        secondaryTarget: '',
      });
    },
  );
});

test('createUpdateScript: passes secondary launcher target to PowerShell helper', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-updater-test-'));
  const sourcePath = path.join(dir, 'WebTitlePro-new.exe.download');
  const targetPath = path.join(dir, 'WebTitlePro.exe');
  const secondaryTargetPath = path.join(dir, 'WebTitlePro-0.4.4.exe');

  try {
    const updater = createIntegration();
    const { scriptPath } = await updater.__private.createUpdateScript({
      sourcePath,
      targetPath,
      secondaryTargetPath,
      taskName: 'WebTitlePro-Test-Update',
      expectedSize: 4,
    });
    const script = await fs.readFile(scriptPath, 'utf8');

    assert.match(script, /\[string\]\$SecondaryTarget/);
    assert.match(script, /Copy-UpdatePackage \$SecondaryTarget "launched launcher" \$true/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('createUpdateScript: generated PowerShell scripts parse', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('PowerShell syntax check is Windows-only');
    return;
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-updater-test-'));
  const sourcePath = path.join(dir, 'WebTitlePro-new.exe.download');
  const targetPath = path.join(dir, 'WebTitlePro.exe');
  const secondaryTargetPath = path.join(dir, 'WebTitlePro-0.4.4.exe');

  try {
    const updater = createIntegration();
    const { scriptPath, statusScriptPath } = await updater.__private.createUpdateScript({
      sourcePath,
      targetPath,
      secondaryTargetPath,
      taskName: 'WebTitlePro-Test-Update',
      expectedSize: 4,
    });

    for (const filePath of [scriptPath, statusScriptPath]) {
      const escapedPath = filePath.replace(/'/g, "''");
      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `[scriptblock]::Create((Get-Content -LiteralPath '${escapedPath}' -Raw)) | Out-Null`,
        ],
        { encoding: 'utf8' },
      );

      assert.equal(result.status, 0, result.stderr || result.stdout);
    }

    const statusScript = await fs.readFile(statusScriptPath, 'utf8');
    assert.match(statusScript, /\$script:closeAt/);
    assert.match(statusScript, /\$script:lastStateSignature/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('createUpdateScript: launcher keeps non-Latin target paths intact', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-updater-test-'));
  const unicodeDir = path.join(dir, 'тест');
  const sourcePath = path.join(dir, 'WebTitlePro-new.exe.download');
  const targetPath = path.join(unicodeDir, 'WebTitlePro.exe');
  const secondaryTargetPath = path.join(unicodeDir, 'WebTitlePro-0.4.4.exe');

  try {
    const updater = createIntegration();
    const { launcherPath } = await updater.__private.createUpdateScript({
      sourcePath,
      targetPath,
      secondaryTargetPath,
      taskName: 'WebTitlePro-Test-Update',
      expectedSize: 4,
    });
    const launcherBytes = await fs.readFile(launcherPath);
    const launcherScript = launcherBytes.subarray(2).toString('utf16le');

    assert.equal(launcherBytes[0], 0xff);
    assert.equal(launcherBytes[1], 0xfe);
    assert.match(launcherScript, /тест\\WebTitlePro\.exe/);
    assert.match(launcherScript, /WebTitlePro-0\.4\.4\.exe/);
    assert.doesNotMatch(launcherScript, /B5AB/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
