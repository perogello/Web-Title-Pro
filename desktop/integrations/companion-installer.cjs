// Installs the bundled Bitfocus Companion module into Companion's developer
// modules folder on this machine.
//
// The Companion launcher keeps its settings in <appData>/companion/config.json
// (electron-store; COMPANION_CONFIG_BASEDIR overrides the folder). Developer
// modules are enabled by `enable_developer: true` + `dev_modules_path: <parent
// folder>`; each subfolder of that path is one module, hot-reloaded on change.
//
// - Developer folder already configured: we only copy the module in — Companion
//   picks it up live, no restart.
// - Not configured: we create <userData>/companion-modules, point Companion at
//   it and enable developer modules. The launcher only reads config.json at
//   start (and rewrites it from memory), so this needs Companion closed: the
//   caller asks the operator first and passes restartCompanion=true to close
//   and relaunch it.
//
// The installed copy is remembered and refreshed on app start whenever a newer
// Web Title Pro (with a newer module) is installed.
const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const MODULE_ID = 'web-title-pro';
const COMPANION_EXE = 'Companion.exe';

const run = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 8000 }, (error, stdout) => {
      resolve(error ? '' : String(stdout || ''));
    });
  });

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const isDirectory = (dir) => {
  try {
    return Boolean(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `system` lets tests replace the Windows probes (tasklist / registry /
// taskkill / spawn); production uses the real ones below.
const createCompanionInstaller = ({ app, log = () => {}, getModuleDistDir, system = {} }) => {
  const companionConfigDir = () =>
    process.env.COMPANION_CONFIG_BASEDIR || path.join(app.getPath('appData'), 'companion');
  const companionConfigPath = () => path.join(companionConfigDir(), 'config.json');
  const defaultDevDir = () => path.join(app.getPath('userData'), 'companion-modules');
  const recordPath = () => path.join(app.getPath('userData'), 'companion-module-install.json');
  const moduleSourceDir = () => path.join(getModuleDistDir(), MODULE_ID);
  const moduleVersionAt = (dir) => readJson(path.join(dir, 'companion', 'manifest.json'))?.version || null;

  const isCompanionRunning = async () => {
    if (system.isCompanionRunning) return system.isCompanionRunning();
    if (process.platform !== 'win32') return false;
    const output = await run('tasklist', ['/FI', `IMAGENAME eq ${COMPANION_EXE}`, '/FO', 'CSV', '/NH']);
    return output.toLowerCase().includes(`"${COMPANION_EXE.toLowerCase()}"`);
  };

  // Companion.exe from the Windows uninstall registry (DisplayIcon), any hive.
  const findCompanionExe = async () => {
    if (system.findCompanionExe) return system.findCompanionExe();
    if (process.platform !== 'win32') return null;
    const hives = [
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ];
    for (const hive of hives) {
      const output = await run('reg', ['query', hive, '/s', '/f', 'Companion', '/d']);
      const keys = output.split(/\r?\n/).filter((line) => line.startsWith('HKEY_'));
      for (const key of keys) {
        const values = await run('reg', ['query', key]);
        if (!/DisplayName\s+REG_SZ\s+Companion\b/i.test(values)) continue;
        const icon = /DisplayIcon\s+REG_SZ\s+(.+)/i.exec(values)?.[1]?.trim();
        const exe = icon?.replace(/^"|"?(,\s*-?\d+)?$/g, '').replace(/"$/, '');
        if (exe && fs.existsSync(exe)) return exe;
      }
    }
    const fallback = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Companion', COMPANION_EXE);
    return fs.existsSync(fallback) ? fallback : null;
  };

  const getStatus = async () => {
    const sourceDir = moduleSourceDir();
    const moduleVersion = moduleVersionAt(sourceDir);
    const config = readJson(companionConfigPath());
    const devPath = config?.dev_modules_path || '';
    const developerEnabled = Boolean(config?.enable_developer);
    const record = readJson(recordPath());
    const candidates = [record?.target, devPath && path.join(devPath, MODULE_ID)].filter(Boolean);
    const installedPath = candidates.find((dir) => isDirectory(dir)) || null;
    const installedVersion = installedPath ? moduleVersionAt(installedPath) : null;
    const companionExe = await findCompanionExe();

    return {
      moduleAvailable: Boolean(moduleVersion),
      moduleVersion,
      moduleFolder: sourceDir,
      companionFound: Boolean(config) || Boolean(companionExe),
      companionConfigured: Boolean(config),
      companionExe,
      companionRunning: await isCompanionRunning(),
      developerEnabled,
      devModulesPath: devPath,
      installedPath,
      installedVersion,
      installedActive: Boolean(
        installedPath && developerEnabled && devPath && path.resolve(path.dirname(installedPath)) === path.resolve(devPath),
      ),
      upToDate: Boolean(installedVersion && installedVersion === moduleVersion),
    };
  };

  // Overwrite in place: a running Companion watches the module folder, and on
  // Windows that open handle makes deleting the folder itself fail (EPERM).
  // Files are replaced, then anything the new build no longer has is removed.
  const copyModule = (target) => {
    const source = moduleSourceDir();
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(source, target, { recursive: true, force: true });

    const prune = (dir, rel = '') => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const relPath = path.join(rel, entry.name);
        const full = path.join(dir, entry.name);
        if (!fs.existsSync(path.join(source, relPath))) {
          try {
            fs.rmSync(full, { recursive: true, force: true });
          } catch (error) {
            log(`companion: could not remove stale ${full} (${error.message})`);
          }
        } else if (entry.isDirectory()) {
          prune(full, relPath);
        }
      }
    };
    prune(target);
  };

  const writeCompanionConfig = (config) => {
    const file = companionConfigPath();
    const temp = `${file}.wtp-${process.pid}.tmp`;
    // Same shape electron-store writes (tab-indented JSON).
    fs.writeFileSync(temp, JSON.stringify(config, null, '\t'), 'utf8');
    fs.renameSync(temp, file);
  };

  const stopCompanion = async () => {
    if (system.stopCompanion) return system.stopCompanion();
    await run('taskkill', ['/IM', COMPANION_EXE, '/T', '/F']);
    for (let i = 0; i < 20; i += 1) {
      if (!(await isCompanionRunning())) return true;
      await wait(250);
    }
    return false;
  };

  const launchCompanion = async (exe = null) => {
    if (system.launchCompanion) return system.launchCompanion(exe);
    const target = exe || (await findCompanionExe());
    if (!target) return { ok: false, error: 'Companion.exe not found' };
    const child = spawn(target, [], { detached: true, stdio: 'ignore', cwd: path.dirname(target) });
    child.unref();
    log(`companion: launched ${target}`);
    return { ok: true };
  };

  const install = async (options = {}) => {
    try {
      return await installModule(options);
    } catch (error) {
      log(`companion: install failed (${error.message})`);
      return { ok: false, reason: 'error', error: `Не удалось установить модуль: ${error.message}` };
    }
  };

  const installModule = async ({ restartCompanion = false } = {}) => {
    const sourceDir = moduleSourceDir();
    const version = moduleVersionAt(sourceDir);
    if (!version) {
      return { ok: false, reason: 'module-missing', error: 'The Companion module is not part of this build.' };
    }

    const config = readJson(companionConfigPath());
    if (!config) {
      return {
        ok: false,
        reason: 'companion-not-found',
        error: 'Companion was not found on this computer (start it once after installing, then try again).',
      };
    }

    const configuredPath = isDirectory(config.dev_modules_path) ? config.dev_modules_path : '';
    const parent = configuredPath || defaultDevDir();
    const needsConfig = !(config.enable_developer && configuredPath);
    const running = await isCompanionRunning();

    if (needsConfig && running && !restartCompanion) {
      return { ok: false, reason: 'companion-running', needsRestart: true, target: path.join(parent, MODULE_ID) };
    }

    let exe = null;
    let stopped = false;
    if (needsConfig && running) {
      exe = await findCompanionExe();
      stopped = await stopCompanion();
      if (!stopped) {
        return { ok: false, reason: 'companion-still-running', error: 'Could not close Companion. Close it manually and try again.' };
      }
    }

    const target = path.join(parent, MODULE_ID);
    copyModule(target);
    if (needsConfig) {
      writeCompanionConfig({ ...config, enable_developer: true, dev_modules_path: parent });
    }
    fs.mkdirSync(path.dirname(recordPath()), { recursive: true });
    fs.writeFileSync(recordPath(), JSON.stringify({ target, version, installedAt: new Date().toISOString() }, null, 2));
    log(`companion: module ${version} installed to ${target}${needsConfig ? ' (developer modules enabled)' : ''}`);

    let relaunched = false;
    if (stopped) {
      relaunched = (await launchCompanion(exe)).ok;
    }

    return {
      ok: true,
      version,
      target,
      configChanged: needsConfig,
      restarted: stopped && relaunched,
      // Companion watches the dev folder: a running Companion with the folder
      // already configured reloads the module by itself.
      liveReload: !needsConfig && running,
      companionRunning: running && !stopped ? true : relaunched,
    };
  };

  // New app version -> refresh the copy we installed earlier (Companion
  // hot-reloads it). Never touches Companion's config.
  const syncOnStartup = async () => {
    try {
      const record = readJson(recordPath());
      const sourceVersion = moduleVersionAt(moduleSourceDir());
      if (!record?.target || !sourceVersion || !isDirectory(record.target)) return;
      if (moduleVersionAt(record.target) === sourceVersion) return;
      copyModule(record.target);
      fs.writeFileSync(recordPath(), JSON.stringify({ ...record, version: sourceVersion, updatedAt: new Date().toISOString() }, null, 2));
      log(`companion: module updated to ${sourceVersion} at ${record.target}`);
    } catch (error) {
      log(`companion: startup sync failed (${error.message})`);
    }
  };

  return { getStatus, install, launchCompanion, syncOnStartup, moduleSourceDir };
};

module.exports = { createCompanionInstaller, MODULE_ID };
