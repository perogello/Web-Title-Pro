const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const electron = require('electron');
const { spawn } = require('node:child_process');
const { createAutoUpdaterIntegration } = require('./integrations/auto-updater.cjs');
const { createGlobalShortcutManager } = require('./integrations/global-shortcuts.cjs');
const { collectCleanupTargets, buildCleanupScript } = require('./integrations/maintenance.cjs');
const { createYandexAuthIntegration } = require('./integrations/yandex-auth.cjs');
const { createSystemFontsIntegration } = require('./integrations/system-fonts.cjs');

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const dialog = electron.dialog;
const ipcMain = electron.ipcMain;
const shell = electron.shell;
const safeStorage = electron.safeStorage;
const globalShortcut = electron.globalShortcut;

let globalShortcutManager = null;

const SERVER_URL = 'http://127.0.0.1:4000';
const HEALTH_URL = `${SERVER_URL}/api/health`;

// App version source of truth: our bundled package.json, NOT app.getVersion().
// In dev (`electron desktop/main.cjs`) app.getVersion() returns Electron's own
// version; only the packaged build resolves it to ours. Reading package.json
// directly is correct in both, and keeps the changelog/version logic testable.
const getAppVersion = () => {
  try {
    return require('../package.json').version || app.getVersion();
  } catch {
    try { return app.getVersion(); } catch { return null; }
  }
};
const BUILTIN_REPO_URL = 'https://github.com/perogello/Web-Title-Pro';
const STABLE_PORTABLE_EXE_NAME = 'WebTitlePro.exe';
const PROJECT_EXTENSION = 'wtp-project.json';

let backendRuntime = null;
let ownsBackendRuntime = false;
let mainWindow = null;
let splashWindow = null;
let updateWindow = null;
let splashProgressTimer = null;
let allowMainWindowClose = false;
let projectSession = {
  currentProjectPath: null,
  recentProjects: [],
  lastSeenVersion: null,
};
// Computed once at bootstrap: which previous version we just updated FROM
// (null on a fresh install or a normal restart), plus the changelog entry to
// surface in the post-update dialog. Read by the renderer via IPC.
let appStartupInfo = { version: null, justUpdatedFrom: null, changelog: null };
let integrationSecrets = {
  yandexAuth: {
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://127.0.0.1:43145/yandex/callback',
    scope: 'cloud_api:disk.read',
    accessToken: '',
    refreshToken: '',
    updatedAt: null,
  },
};
let yandexAuthIntegration = null;
let systemFontsIntegration = null;
let updaterIntegration = null;

const logFile = path.join(os.tmpdir(), 'web-title-pro-desktop.log');
const getProjectSessionFile = () => path.join(app.getPath('userData'), 'project-session.json');
const getIntegrationSecretsFile = () => path.join(app.getPath('userData'), 'integration-secrets.json');

const log = (message) => {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {}
};
log('desktop:module-loaded');

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  log('app:second-instance-detected exiting');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  log('app:second-instance-activated');
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

process.on('uncaughtException', (error) => {
  log(`process:uncaughtException ${error?.stack || error?.message || error}`);
});

process.on('unhandledRejection', (reason) => {
  log(`process:unhandledRejection ${reason?.stack || reason?.message || String(reason)}`);
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeProjectSession = (value = {}) => ({
  currentProjectPath: typeof value.currentProjectPath === 'string' ? value.currentProjectPath : null,
  recentProjects: Array.isArray(value.recentProjects)
    ? value.recentProjects
        .filter((item) => item && typeof item.path === 'string')
        .map((item) => ({
          path: item.path,
          name: item.name || path.basename(item.path),
          openedAt: item.openedAt || null,
        }))
        .slice(0, 10)
    : [],
  lastSeenVersion: typeof value.lastSeenVersion === 'string' ? value.lastSeenVersion : null,
});

const normalizeIntegrationSecrets = (value = {}) => ({
  yandexAuth: yandexAuthIntegration.normalizeSecrets(value.yandexAuth || {}),
});

const canEncryptSecrets = () => {
  try {
    return safeStorage?.isEncryptionAvailable?.() === true;
  } catch {
    return false;
  }
};

const encryptSecretValue = (value) => {
  if (!value) {
    return '';
  }

  if (!canEncryptSecrets()) {
    return value;
  }

  return safeStorage.encryptString(String(value)).toString('base64');
};

const decryptSecretValue = (value, encrypted = false) => {
  if (!value) {
    return '';
  }

  if (!encrypted) {
    return typeof value === 'string' ? value : '';
  }

  if (!canEncryptSecrets()) {
    return '';
  }

  try {
    return safeStorage.decryptString(Buffer.from(String(value), 'base64'));
  } catch {
    return '';
  }
};

const serializeIntegrationSecrets = (value = integrationSecrets) => ({
  yandexAuth: {
    redirectUri: value?.yandexAuth?.redirectUri || '',
    scope: value?.yandexAuth?.scope || 'cloud_api:disk.read',
    accountLogin: value?.yandexAuth?.accountLogin || '',
    accountName: value?.yandexAuth?.accountName || '',
    updatedAt: value?.yandexAuth?.updatedAt || null,
    encryption: {
      electronSafeStorage: canEncryptSecrets(),
    },
    clientId: encryptSecretValue(value?.yandexAuth?.clientId || ''),
    clientSecret: encryptSecretValue(value?.yandexAuth?.clientSecret || ''),
    accessToken: encryptSecretValue(value?.yandexAuth?.accessToken || ''),
    refreshToken: encryptSecretValue(value?.yandexAuth?.refreshToken || ''),
  },
});

const deserializeIntegrationSecrets = (value = {}) => {
  const normalized = normalizeIntegrationSecrets(value);
  const encrypted = Boolean(value?.yandexAuth?.encryption?.electronSafeStorage);

  return {
    yandexAuth: {
      redirectUri: normalized.yandexAuth.redirectUri,
      scope: normalized.yandexAuth.scope,
      accountLogin: normalized.yandexAuth.accountLogin,
      accountName: normalized.yandexAuth.accountName,
      updatedAt: normalized.yandexAuth.updatedAt,
      clientId: decryptSecretValue(value?.yandexAuth?.clientId, encrypted) || normalized.yandexAuth.clientId,
      clientSecret: decryptSecretValue(value?.yandexAuth?.clientSecret, encrypted) || normalized.yandexAuth.clientSecret,
      accessToken: decryptSecretValue(value?.yandexAuth?.accessToken, encrypted) || normalized.yandexAuth.accessToken,
      refreshToken: decryptSecretValue(value?.yandexAuth?.refreshToken, encrypted) || normalized.yandexAuth.refreshToken,
    },
  };
};

const loadProjectSession = async () => {
  const sessionFile = getProjectSessionFile();
  let raw = null;
  try {
    raw = await fsp.readFile(sessionFile, 'utf8');
  } catch {
    projectSession = normalizeProjectSession(); // fresh install — no file yet
    return;
  }

  try {
    projectSession = normalizeProjectSession(JSON.parse(raw));
  } catch (error) {
    // A session an older/newer version can't parse must not silently poison
    // the app (a broken session once made every project save fail until the
    // operator wiped AppData by hand). Quarantine it and start clean.
    projectSession = normalizeProjectSession();
    try {
      await fsp.rename(sessionFile, `${sessionFile}.corrupt-${Date.now()}.bak`);
      log(`project-session: corrupt file quarantined (${error.message})`);
    } catch {}
  }
};

// Compare two semver-ish version strings (leading "v" tolerated). Returns
// 1 / -1 / 0. Pre-release tags are ignored — we only key the changelog on
// MAJOR.MINOR.PATCH.
const compareVersionStrings = (a, b) => {
  const parse = (v) => String(v || '')
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
};

const readChangelogEntry = async (version) => {
  try {
    const raw = await fsp.readFile(path.join(__dirname, 'changelog.json'), 'utf8');
    const data = JSON.parse(raw);
    return data?.[version] || data?.[String(version).replace(/^v/i, '')] || null;
  } catch {
    return null;
  }
};

// Decide whether the app was just updated, then persist the current version so
// the dialog only shows once per upgrade. Must run after loadProjectSession.
const computeStartupInfo = async () => {
  const version = getAppVersion();

  const previous = projectSession.lastSeenVersion;
  // Show the changelog only on a real upgrade: a previous version was recorded
  // and the running version is strictly newer. A fresh install (previous null)
  // or a downgrade does not trigger it.
  const justUpdatedFrom =
    previous && version && compareVersionStrings(version, previous) > 0 ? previous : null;

  const changelog = justUpdatedFrom ? await readChangelogEntry(version) : null;
  appStartupInfo = { version, justUpdatedFrom, changelog };

  if (version && projectSession.lastSeenVersion !== version) {
    projectSession.lastSeenVersion = version;
    try { await persistProjectSession(); } catch {}
  }

  log(`startup-info version=${version} justUpdatedFrom=${justUpdatedFrom || 'none'} hasChangelog=${Boolean(changelog)}`);
};

const loadIntegrationSecrets = async () => {
  try {
    const secretsFile = getIntegrationSecretsFile();
    const existing = await fsp.readFile(secretsFile, 'utf8');
    integrationSecrets = deserializeIntegrationSecrets(JSON.parse(existing));
  } catch {
    integrationSecrets = normalizeIntegrationSecrets();
  }
};

const persistProjectSession = async () => {
  const sessionFile = getProjectSessionFile();
  await fsp.mkdir(path.dirname(sessionFile), { recursive: true });
  await fsp.writeFile(sessionFile, JSON.stringify(projectSession, null, 2), 'utf8');
};

const persistIntegrationSecrets = async () => {
  const secretsFile = getIntegrationSecretsFile();
  await fsp.mkdir(path.dirname(secretsFile), { recursive: true });
  await fsp.writeFile(secretsFile, JSON.stringify(serializeIntegrationSecrets(integrationSecrets), null, 2), 'utf8');
};

yandexAuthIntegration = createYandexAuthIntegration({
  shell,
  persist: persistIntegrationSecrets,
  getState: () => integrationSecrets.yandexAuth,
  setState: (nextState) => {
    integrationSecrets.yandexAuth = yandexAuthIntegration.normalizeSecrets(nextState);
  },
  canEncryptSecrets,
});
systemFontsIntegration = createSystemFontsIntegration();

const touchRecentProject = async (projectPath) => {
  if (!projectPath) {
    return;
  }

  const normalizedPath = path.normalize(projectPath);
  projectSession.currentProjectPath = normalizedPath;
  projectSession.recentProjects = [
    {
      path: normalizedPath,
      name: path.basename(normalizedPath),
      openedAt: new Date().toISOString(),
    },
    ...projectSession.recentProjects.filter((item) => path.normalize(item.path) !== normalizedPath),
  ].slice(0, 10);

  await persistProjectSession();
};

const clearCurrentProject = async () => {
  projectSession.currentProjectPath = null;
  await persistProjectSession();
};

const getProjectStatusPayload = () => ({
  supported: true,
  currentProjectPath: projectSession.currentProjectPath,
  recentProjects: projectSession.recentProjects,
});

const removeRecentProject = async (projectPath) => {
  if (!projectPath) {
    return;
  }

  const normalizedPath = path.normalize(projectPath);
  projectSession.recentProjects = projectSession.recentProjects.filter((item) => path.normalize(item.path) !== normalizedPath);
  if (projectSession.currentProjectPath && path.normalize(projectSession.currentProjectPath) === normalizedPath) {
    projectSession.currentProjectPath = null;
  }
  await persistProjectSession();
};

const readProjectFile = async (projectPath) => {
  const raw = await fsp.readFile(projectPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== 'object' || !parsed.state) {
    throw new Error('Invalid project file.');
  }

  return parsed;
};

ipcMain.handle('project:get-status', async () => getProjectStatusPayload());

ipcMain.handle('app:get-startup-info', async () => appStartupInfo);

ipcMain.handle('settings:get-yandex-auth', async () => ({
  ...yandexAuthIntegration.getPayload(),
}));

ipcMain.handle('settings:save-yandex-auth', async (_event, payload = {}) => yandexAuthIntegration.save(payload));

ipcMain.handle('settings:disconnect-yandex-auth', async () => yandexAuthIntegration.disconnect());

ipcMain.handle('settings:start-yandex-auth', async () => yandexAuthIntegration.connect());

ipcMain.handle('system:get-fonts', async (_event, payload = {}) => systemFontsIntegration.getFonts({
  force: Boolean(payload?.force),
}));

ipcMain.handle('system:open-path', async (_event, targetPath = '') => {
  const normalizedPath = typeof targetPath === 'string' ? targetPath.trim() : '';

  if (!normalizedPath) {
    return { ok: false, error: 'Path is required.' };
  }

  try {
    const stats = await fsp.stat(normalizedPath);
    const pathToOpen = stats.isDirectory() ? normalizedPath : path.dirname(normalizedPath);
    const result = await shell.openPath(pathToOpen);
    return result ? { ok: false, error: result } : { ok: true, path: pathToOpen };
  } catch (error) {
    return { ok: false, error: error?.message || 'The selected path could not be opened.' };
  }
});

ipcMain.handle('system:open-external', async (_event, url = '') => {
  const normalized = typeof url === 'string' ? url.trim() : '';

  // Only ever hand https(s) URLs to the OS browser. This is used for the
  // "open the release page manually" update fallback, so a stray file:// or
  // shell: URL from an unexpected caller must not be launched.
  if (!/^https?:\/\//i.test(normalized)) {
    return { ok: false, error: 'Only http(s) links can be opened.' };
  }

  try {
    await shell.openExternal(normalized);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'The link could not be opened.' };
  }
});

ipcMain.handle('templates:open-folders', async () => {
  const appRoot = app.getAppPath();
  const templateFolders = [
    path.join(appRoot, 'templates'),
    path.join(appRoot, 'storage', 'templates'),
  ];

  const opened = [];

  for (const folderPath of templateFolders) {
    try {
      const stats = await fsp.stat(folderPath);
      if (!stats.isDirectory()) {
        continue;
      }
      const result = await shell.openPath(folderPath);
      if (!result) {
        opened.push(folderPath);
      }
    } catch {}
  }

  if (!opened.length) {
    return { ok: false, error: 'No template folders were found.' };
  }

  return { ok: true, paths: opened };
});

ipcMain.handle('templates:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Template Folder',
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return { canceled: true };
  }

  return {
    canceled: false,
    directoryPath: result.filePaths[0],
  };
});

ipcMain.handle('project:get-startup-project', async () => {
  if (!projectSession.currentProjectPath) {
    return { project: null, status: getProjectStatusPayload() };
  }

  try {
    const project = await readProjectFile(projectSession.currentProjectPath);
    await touchRecentProject(projectSession.currentProjectPath);
    return {
      project,
      path: projectSession.currentProjectPath,
      status: getProjectStatusPayload(),
    };
  } catch (error) {
    await removeRecentProject(projectSession.currentProjectPath);
    return {
      project: null,
      status: getProjectStatusPayload(),
      error: error.message || 'Could not open the last project automatically.',
    };
  }
});

ipcMain.handle('project:confirm-unsaved', async (_event, payload = {}) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Unsaved Changes',
    message: 'The current project has unsaved changes.',
    detail: payload?.detail || 'Do you want to save the project before continuing?',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });

  return {
    action: result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel',
  };
});

ipcMain.handle('project:open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    properties: ['openFile'],
    filters: [
      { name: 'Web Title Pro Project', extensions: ['json', 'wtp-project'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return { canceled: true };
  }

  const projectPath = result.filePaths[0];
  const project = await readProjectFile(projectPath);
  await touchRecentProject(projectPath);

  return {
    canceled: false,
    path: projectPath,
    project,
    status: getProjectStatusPayload(),
  };
});

ipcMain.handle('project:open-recent', async (_event, projectPath) => {
  if (!projectPath) {
    throw new Error('Project path is required.');
  }

  const project = await readProjectFile(projectPath);
  await touchRecentProject(projectPath);

  return {
    canceled: false,
    path: projectPath,
    project,
    status: getProjectStatusPayload(),
  };
});

ipcMain.handle('project:save', async (_event, payload = {}) => {
  const suggestedName = String(payload.suggestedName || 'WebTitleProject').trim() || 'WebTitleProject';
  const askForSavePath = async (title) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title,
      defaultPath: `${suggestedName}.${PROJECT_EXTENSION}`,
      filters: [{ name: 'Web Title Pro Project', extensions: ['json', 'wtp-project'] }],
    });
    return result.canceled ? null : result.filePath;
  };

  let targetPath =
    payload.path || projectSession.currentProjectPath || (await askForSavePath('Save Project'));

  if (!targetPath) {
    return { canceled: true };
  }

  const writeProject = async (filePath) => {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, JSON.stringify(payload.project || {}, null, 2), 'utf8');
  };

  try {
    await writeProject(targetPath);
  } catch (error) {
    // The remembered project path can go stale between sessions or app
    // versions (folder removed, drive letter changed). Silently failing here
    // used to make EVERY save fail until the operator wiped AppData — fall
    // back to a Save dialog instead so the operator can re-point the project.
    if (payload.path) {
      throw error;
    }
    log(`project:save failed for stored path ${targetPath}: ${error.message}`);
    const fallbackPath = await askForSavePath('Save Project (previous location is unavailable)');
    if (!fallbackPath) {
      return { canceled: true, error: error.message };
    }
    targetPath = fallbackPath;
    await writeProject(targetPath);
  }

  await touchRecentProject(targetPath);

  return {
    canceled: false,
    path: targetPath,
    status: getProjectStatusPayload(),
  };
});

ipcMain.handle('project:save-as', async (_event, payload = {}) => {
  const suggestedName = String(payload.suggestedName || 'WebTitleProject').trim() || 'WebTitleProject';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project As',
    defaultPath: `${suggestedName}.${PROJECT_EXTENSION}`,
    filters: [{ name: 'Web Title Pro Project', extensions: ['json', 'wtp-project'] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fsp.mkdir(path.dirname(result.filePath), { recursive: true });
  await fsp.writeFile(result.filePath, JSON.stringify(payload.project || {}, null, 2), 'utf8');
  await touchRecentProject(result.filePath);

  return {
    canceled: false,
    path: result.filePath,
    status: getProjectStatusPayload(),
  };
});

ipcMain.handle('project:new', async () => {
  await clearCurrentProject();
  return getProjectStatusPayload();
});

ipcMain.handle('project:request-close', async () => {
  allowMainWindowClose = true;
  app.quit();
  return { ok: true };
});

ipcMain.handle('window:set-title', async (_event, payload = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false };
  }

  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : 'Web Title Pro';
  mainWindow.setTitle(title);
  return { ok: true };
});

const getWindowStatePayload = (windowRef = mainWindow) => {
  if (!windowRef || windowRef.isDestroyed()) {
    return {
      ok: false,
      isMaximized: false,
      isMinimized: false,
      isFullScreen: false,
    };
  }

  return {
    ok: true,
    isMaximized: windowRef.isMaximized(),
    isMinimized: windowRef.isMinimized(),
    isFullScreen: windowRef.isFullScreen(),
  };
};

const emitWindowState = (windowRef = mainWindow) => {
  if (!windowRef || windowRef.isDestroyed()) return;
  try {
    windowRef.webContents.send('window:state-changed', getWindowStatePayload(windowRef));
  } catch {}
};

const getIpcWindow = (event) => {
  const windowRef = BrowserWindow.fromWebContents(event.sender);
  return windowRef && !windowRef.isDestroyed() ? windowRef : mainWindow;
};

ipcMain.handle('window:get-state', async (event) => getWindowStatePayload(getIpcWindow(event)));

ipcMain.handle('window:minimize', async (event) => {
  const windowRef = getIpcWindow(event);
  if (!windowRef || windowRef.isDestroyed()) return { ok: false };
  windowRef.minimize();
  return getWindowStatePayload(windowRef);
});

ipcMain.handle('window:toggle-maximize', async (event) => {
  const windowRef = getIpcWindow(event);
  if (!windowRef || windowRef.isDestroyed()) return { ok: false };

  if (windowRef.isMaximized()) {
    windowRef.unmaximize();
  } else {
    windowRef.maximize();
  }
  emitWindowState(windowRef);
  return getWindowStatePayload(windowRef);
});

ipcMain.handle('window:close', async (event) => {
  const windowRef = getIpcWindow(event);
  if (!windowRef || windowRef.isDestroyed()) return { ok: false };
  windowRef.close();
  return { ok: true };
});

const setWindowMeta = async (windowRef, { title, eyebrow, version } = {}) => {
  if (!windowRef || windowRef.isDestroyed()) {
    return;
  }

  let appVersion = version;
  if (!appVersion) {
    appVersion = getAppVersion();
  }

  try {
    await windowRef.webContents.executeJavaScript(
      `window.setShellMeta && window.setShellMeta(${JSON.stringify({ title, eyebrow, version: appVersion })});`,
      true,
    );
  } catch {}
};

const setWindowProgress = async (windowRef, label, percent) => {
  if (!windowRef || windowRef.isDestroyed()) {
    return;
  }

  const safeLabel = JSON.stringify(label || 'Launching...');
  const safePercent = Number(percent || 0);

  try {
    await windowRef.webContents.executeJavaScript(
      `window.setLoadingState && window.setLoadingState(${safeLabel}, ${safePercent});`,
      true,
    );
  } catch {}
};

const startPseudoProgress = (label = 'Starting local engine...', startAt = 12) => {
  let current = startAt;
  void setWindowProgress(splashWindow, label, current);
  clearInterval(splashProgressTimer);
  splashProgressTimer = setInterval(() => {
    current = Math.min(78, current + (current < 40 ? 6 : current < 60 ? 4 : 2));
    void setWindowProgress(splashWindow, label, current);
  }, 280);
};

const stopPseudoProgress = () => {
  clearInterval(splashProgressTimer);
  splashProgressTimer = null;
};

const createShellWindow = async ({
  width = 560,
  height = 280,
  title = 'Web Title Pro',
  eyebrow = 'Broadcast Title Control',
  backgroundColor = '#0a0a0c',
  modal = false,
  parent = null,
  show = true,
}) => {
  const windowRef = new BrowserWindow({
    width,
    height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    frame: false,
    show,
    modal,
    parent: modal ? parent : null,
    backgroundColor,
    title,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.resolve(__dirname, 'preload.cjs'),
    },
  });

  await windowRef.loadFile(path.resolve(__dirname, 'splash.html'));
  await setWindowMeta(windowRef, { title, eyebrow });
  return windowRef;
};

const showUpdateWindow = () => {
  if (!updateWindow || updateWindow.isDestroyed()) {
    return;
  }

  try { updateWindow.show(); } catch {}
  try { updateWindow.focus(); } catch {}
  try { updateWindow.moveTop(); } catch {}
};

const createSplashWindow = async () => {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow;
  }

  splashWindow = await createShellWindow({
    title: 'Web Title Pro',
    eyebrow: 'Broadcast Title Control',
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  try {
    splashWindow.webContents.setBackgroundThrottling(false);
  } catch {}

  await setWindowProgress(splashWindow, 'Launching application...', 8);
  return splashWindow;
};

const createUpdateWindow = async () => {
  if (updateWindow && !updateWindow.isDestroyed()) {
    return updateWindow;
  }

  updateWindow = await createShellWindow({
    width: 540,
    height: 250,
    title: 'Updating Web Title Pro',
    eyebrow: 'Update In Progress',
    modal: true,
    parent: mainWindow,
    show: false,
  });

  updateWindow.on('closed', () => {
    updateWindow = null;
  });

  updateWindow.once('ready-to-show', () => {
    showUpdateWindow();
  });

  await setWindowProgress(updateWindow, 'Preparing update...', 8);
  showUpdateWindow();
  return updateWindow;
};

const closeUpdateWindow = () => {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
  updateWindow = null;
};

// Authorize the app to close for an update: run the renderer's pre-close hook
// and drop the unsaved-changes close guard so electron-updater's quitAndInstall
// can quit without being blocked. It must NOT quit or exit the app itself — the
// old portable flow did (an external helper applied the swap), but under
// electron-updater quitAndInstall() is what quits the app and runs the NSIS
// installer. Tearing the app down here would race and defeat that.
const authorizeCloseForUpdate = async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      await mainWindow.webContents.executeJavaScript(
        'window.__webTitleAuthorizeAppClose ? window.__webTitleAuthorizeAppClose() : true;',
        true,
      );
    } catch (error) {
      log(`updates:authorize-close-error ${error.stack || error.message}`);
    }
  }

  allowMainWindowClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
  }
};

const initializeUpdaterIntegration = () => {
  updaterIntegration = createAutoUpdaterIntegration({
    app,
    dialog,
    shell,
    log,
    getMainWindow: () => mainWindow,
    createUpdateWindow,
    closeUpdateWindow,
    setWindowProgress,
    confirmInstall: async () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return true;
      }

      try {
        const result = await mainWindow.webContents.executeJavaScript(
          'window.__webTitleConfirmUpdateInstall ? window.__webTitleConfirmUpdateInstall() : true;',
          true,
        );
        log(`updates:confirm-install result=${JSON.stringify(result)}`);
        return result;
      } catch (error) {
        // CRITICAL: previously this returned false on any executeJavaScript
        // failure (renderer not ready, function not yet defined, etc.) and
        // the whole update silently aborted. That made the operator click
        // "Update Now" and see nothing happen. We now treat a failure to
        // ask as implicit consent — the operator already explicitly asked
        // for the update; if we can't pop the second confirmation, just
        // proceed. Any genuinely-needed save was already prompted via the
        // file menu before clicking Update Now.
        log(`updates:confirm-install-error ${error.stack || error.message} — proceeding without renderer confirm`);
        return true;
      }
    },
    authorizeClose: authorizeCloseForUpdate,
    broadcastState: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updates:state', state);
      }
    },
    repoUrl: BUILTIN_REPO_URL,
  });
};

const runStartupUpdateCheck = async () => updaterIntegration?.runStartupUpdateCheck();

initializeUpdaterIntegration();

globalShortcutManager = createGlobalShortcutManager({
  globalShortcut,
  getMainWindow: () => mainWindow,
  log,
});

ipcMain.handle('shortcuts:sync-global', async (_event, shortcutBindings = {}) => {
  if (!globalShortcutManager) {
    return { registered: [], conflicts: [], available: false };
  }
  const result = globalShortcutManager.sync(shortcutBindings || {});
  log(`global-shortcut:sync registered=${result.registered.length} conflicts=${result.conflicts.length}`);
  return { ...result, available: true };
});

// Pop-out render windows (preview / live view of an output). Keyed by
// output+mode so a repeat request focuses the existing window instead of
// stacking duplicates. Only local render URLs are allowed.
const renderWindows = new Map();

ipcMain.handle('render-window:open', async (_event, payload = {}) => {
  const url = typeof payload?.url === 'string' ? payload.url : '';
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?|\d{1,3}(\.\d{1,3}){3})(:\d+)?\//i.test(url)) {
    return { ok: false, error: 'Only local render URLs can be opened.' };
  }

  const key = String(payload?.key || url);
  const existing = renderWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    try { existing.focus(); } catch {}
    return { ok: true, focused: true };
  }

  const renderWindow = new BrowserWindow({
    width: 960,
    height: 540,
    minWidth: 320,
    minHeight: 180,
    backgroundColor: '#050608',
    autoHideMenuBar: true,
    title: payload?.title || 'Web Title Pro — Render',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  try { renderWindow.setAspectRatio(16 / 9); } catch {}
  renderWindow.setMenuBarVisibility(false);
  // The render page sets document.title; keep the operator-facing name instead.
  renderWindow.on('page-title-updated', (event) => event.preventDefault());
  renderWindow.on('closed', () => {
    renderWindows.delete(key);
  });
  renderWindows.set(key, renderWindow);
  log(`render-window:open key=${key}`);

  try {
    await renderWindow.loadURL(url);
  } catch (error) {
    log(`render-window:load-failed ${error.message}`);
  }

  return { ok: true };
});

const waitForHealth = async (retries = 80) => {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(HEALTH_URL);

      if (response.ok) {
        return true;
      }
    } catch {}

    await wait(250);
  }

  return false;
};

const ensureBackend = async () => {
  log('ensureBackend:start');
  await setWindowProgress(splashWindow, 'Checking local engine...', 12);

  const alreadyRunning = await waitForHealth(2);

  if (alreadyRunning) {
    log('ensureBackend:already-running');
    await setWindowProgress(splashWindow, 'Connecting to local engine...', 72);
    return;
  }

  startPseudoProgress('Starting local engine...', 16);

  process.env.WEB_TITLE_PRO_DATA_DIR = path.join(app.getPath('userData'), 'data');
  process.env.WEB_TITLE_PRO_STORAGE_DIR = path.join(app.getPath('userData'), 'storage');

  const serverEntry = path.resolve(__dirname, '..', 'server', 'index.js');
  const serverModuleUrl = pathToFileURL(serverEntry).href;
  const { startServer } = await import(serverModuleUrl);

  log(`ensureBackend:in-process ${serverEntry}`);
  backendRuntime = await startServer({
    onProgress: ({ label, percent }) => {
      void setWindowProgress(splashWindow, label || 'Starting local engine...', percent || 16);
    },
  });
  ownsBackendRuntime = true;

  stopPseudoProgress();
  log('ensureBackend:healthy');
  await setWindowProgress(splashWindow, 'Backend ready. Opening control panel...', 90);
};

const createMainWindow = async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#090a0d',
    autoHideMenuBar: true,
    frame: false,
    show: false,
    title: 'Web Title Pro',
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.resolve(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.on('closed', () => {
    log('window:closed');
    mainWindow = null;
    allowMainWindowClose = false;
  });

  mainWindow.on('maximize', () => emitWindowState(mainWindow));
  mainWindow.on('unmaximize', () => emitWindowState(mainWindow));
  mainWindow.on('enter-full-screen', () => emitWindowState(mainWindow));
  mainWindow.on('leave-full-screen', () => emitWindowState(mainWindow));

  mainWindow.on('close', async (event) => {
    if (allowMainWindowClose) {
      return;
    }

    event.preventDefault();

    try {
      const shouldClose = await mainWindow.webContents.executeJavaScript(
        'window.__webTitleHandleCloseRequest ? window.__webTitleHandleCloseRequest() : true;',
        true,
      );

      if (shouldClose) {
        allowMainWindowClose = true;
        app.quit();
      }
    } catch {
      allowMainWindowClose = true;
      app.quit();
    }
  });

  mainWindow.once('ready-to-show', () => {
    log('window:ready-to-show');
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log('window:did-finish-load');
    emitWindowState(mainWindow);
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    log(`window:did-fail-load ${code} ${description}`);
  });

  await mainWindow.loadURL(SERVER_URL);
  log('createMainWindow:loadURL-resolved');
  return mainWindow;
};

// Snapshot the operator's state before applying an update, so a broken
// update can be rolled back by restoring these files instead of losing the
// working project. Keeps the last 3 snapshots.
const backupUserDataBeforeUpdate = async (targetVersion = 'unknown') => {
  try {
    const userData = app.getPath('userData');
    const backupsRoot = path.join(userData, 'backups');
    const backupDir = path.join(
      backupsRoot,
      `pre-${String(targetVersion).replace(/[^\w.-]+/g, '_')}-${Date.now()}`,
    );
    await fsp.mkdir(backupDir, { recursive: true });

    const candidates = [
      getProjectSessionFile(),
      getIntegrationSecretsFile(),
      path.join(userData, 'data', 'state.json'),
    ];
    for (const source of candidates) {
      try {
        await fsp.copyFile(source, path.join(backupDir, path.basename(source)));
      } catch {}
    }

    const entries = (await fsp.readdir(backupsRoot)).filter((name) => name.startsWith('pre-')).sort();
    while (entries.length > 3) {
      const oldest = entries.shift();
      await fsp.rm(path.join(backupsRoot, oldest), { recursive: true, force: true });
    }
    log(`updates:pre-update-backup ${backupDir}`);
  } catch (error) {
    log(`updates:pre-update-backup-failed ${error.message}`);
  }
};

ipcMain.handle('updates:check', async () => {
  try {
    return await updaterIntegration.checkForUpdates();
  } catch (error) {
    log(`updates:ipc-check-throw ${error.stack || error.message}`);
    throw error;
  }
});

ipcMain.handle('updates:install-available', async (_event, payload = {}) => {
  log(`updates:ipc-install-available payload=${JSON.stringify({ available: payload?.available, latest: payload?.latestVersion, hasAssetUrl: Boolean(payload?.assetUrl) })}`);
  try {
    await backupUserDataBeforeUpdate(payload?.latestVersion);
    const result = await updaterIntegration.installAvailableUpdate(payload);
    log(`updates:ipc-install-result ${JSON.stringify({ ok: result?.ok, reason: result?.reason })}`);
    return result;
  } catch (error) {
    log(`updates:ipc-install-throw ${error.stack || error.message}`);
    throw error;
  }
});

// --- Maintenance: reset app data / full uninstall -------------------------
// Both quit the app and hand the actual file removal to a detached
// PowerShell helper (a running exe cannot delete its own files).
const launchCleanupAndQuit = async (mode) => {
  const tempDir = app.getPath('temp');
  const userDataDir = app.getPath('userData');
  // PORTABLE_EXECUTABLE_* only exist in the old portable build. Under the NSIS
  // install they are unset, so fall back to the running executable
  // (%LOCALAPPDATA%\Programs\Web Title Pro\Web Title Pro.exe) — otherwise Reset
  // has nothing to relaunch and the app just closes. (Remove completely still
  // only removes this exe best-effort; running the NSIS uninstaller to also
  // clear shortcuts/registry is a follow-up.)
  const portableFile =
    typeof process.env.PORTABLE_EXECUTABLE_FILE === 'string'
      ? process.env.PORTABLE_EXECUTABLE_FILE.trim()
      : '';
  const portableDir =
    typeof process.env.PORTABLE_EXECUTABLE_DIR === 'string'
      ? process.env.PORTABLE_EXECUTABLE_DIR.trim()
      : '';
  const stableExePath = portableDir
    ? path.join(portableDir, STABLE_PORTABLE_EXE_NAME)
    : portableFile
      ? path.join(path.dirname(portableFile), STABLE_PORTABLE_EXE_NAME)
      : process.execPath;

  const script = buildCleanupScript({
    mode,
    pid: process.pid,
    targets: collectCleanupTargets({ userDataDir, tempDir }),
    exePaths: mode === 'uninstall' ? [...new Set([portableFile, stableExePath].filter(Boolean))] : [],
    relaunchExePath: mode === 'reset' ? (stableExePath || portableFile) : '',
    // Install dir of the running exe: under NSIS it holds "Uninstall *.exe",
    // which the cleanup script runs to remove the app cleanly.
    installDir: path.dirname(process.execPath),
    tempDir,
  });

  const scriptPath = path.join(tempDir, `web-title-pro-cleanup-${Date.now()}.ps1`);
  await fsp.writeFile(scriptPath, script, 'utf8');

  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
    { detached: true, stdio: 'ignore', windowsHide: true },
  );
  child.unref();
  log(`maintenance:${mode} cleanup helper started (${scriptPath})`);

  allowMainWindowClose = true;
  app.quit();
};

ipcMain.handle('maintenance:reset', async () => {
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Reset Web Title Pro',
    message: 'Сбросить приложение и перезапустить начисто?',
    detail:
      'Будут удалены: настройки, сессия, токены интеграций и текущее рабочее состояние.\n'
      + 'Сохранённые файлы проектов (.json) не пострадают — перед сбросом сохраните проект, если нужно.',
    buttons: ['Сбросить и перезапустить', 'Отмена'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (choice.response !== 0) {
    return { ok: false, cancelled: true };
  }
  await launchCleanupAndQuit('reset');
  return { ok: true };
});

ipcMain.handle('maintenance:uninstall', async () => {
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Remove Web Title Pro',
    message: 'Полностью удалить Web Title Pro с этого компьютера?',
    detail:
      'Будут удалены: приложение (WebTitlePro.exe), все его данные, настройки и токены.\n'
      + 'Сохранённые файлы проектов (.json) останутся на месте.',
    buttons: ['Удалить всё', 'Отмена'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (choice.response !== 0) {
    return { ok: false, cancelled: true };
  }
  await launchCleanupAndQuit('uninstall');
  return { ok: true };
});

const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

const bootstrap = async () => {
  await loadProjectSession();
  await computeStartupInfo();
  await loadIntegrationSecrets();
  await createSplashWindow();
  // Let splash actually paint and become interactive before doing heavy work.
  await new Promise((resolve) => setTimeout(resolve, 80));
  await yieldToEventLoop();
  await ensureBackend();
  await setWindowProgress(splashWindow, 'Loading interface...', 96);
  await yieldToEventLoop();
  await createMainWindow();
  void runStartupUpdateCheck();
};

app.whenReady().then(bootstrap).catch((error) => {
  stopPseudoProgress();
  log(`app:ready-error ${error.stack || error.message}`);
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  log('app:window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  log('app:activate');
  if (BrowserWindow.getAllWindows().length === 0) {
    await bootstrap();
  }
});

app.on('before-quit', () => {
  stopPseudoProgress();
  log('app:before-quit');
  try { globalShortcutManager?.unregisterAll(); } catch {}
  if (ownsBackendRuntime && backendRuntime?.close) {
    try {
      backendRuntime.close();
    } catch {}
  }
});
