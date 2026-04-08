const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const electron = require('electron');
const { createUpdaterIntegration } = require('./integrations/updater.cjs');
const { createYandexAuthIntegration } = require('./integrations/yandex-auth.cjs');
const { createSystemFontsIntegration } = require('./integrations/system-fonts.cjs');

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const dialog = electron.dialog;
const ipcMain = electron.ipcMain;
const shell = electron.shell;
const safeStorage = electron.safeStorage;

const SERVER_URL = 'http://127.0.0.1:4000';
const HEALTH_URL = `${SERVER_URL}/api/health`;
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
};
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
  try {
    const sessionFile = getProjectSessionFile();
    const existing = await fsp.readFile(sessionFile, 'utf8');
    projectSession = normalizeProjectSession(JSON.parse(existing));
  } catch {
    projectSession = normalizeProjectSession();
  }
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
  const targetPath =
    payload.path ||
    projectSession.currentProjectPath ||
    (await (async () => {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Project',
        defaultPath: `${suggestedName}.${PROJECT_EXTENSION}`,
        filters: [{ name: 'Web Title Pro Project', extensions: ['json', 'wtp-project'] }],
      });
      return result.canceled ? null : result.filePath;
    })());

  if (!targetPath) {
    return { canceled: true };
  }

  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, JSON.stringify(payload.project || {}, null, 2), 'utf8');
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

const setWindowMeta = async (windowRef, { title, eyebrow } = {}) => {
  if (!windowRef || windowRef.isDestroyed()) {
    return;
  }

  try {
    await windowRef.webContents.executeJavaScript(
      `window.setShellMeta && window.setShellMeta(${JSON.stringify({ title, eyebrow })});`,
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
  backgroundColor = '#090a0d',
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
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.show();
    }
  });

  await setWindowProgress(updateWindow, 'Preparing update...', 8);
  return updateWindow;
};

const closeUpdateWindow = () => {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
  updateWindow = null;
};

const requestQuitForUpdate = async () => {
  allowMainWindowClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
  }
  closeUpdateWindow();
  await wait(400);
  app.quit();
};

const initializeUpdaterIntegration = () => {
  updaterIntegration = createUpdaterIntegration({
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
        return await mainWindow.webContents.executeJavaScript(
          'window.__webTitleConfirmUpdateInstall ? window.__webTitleConfirmUpdateInstall() : true;',
          true,
        );
      } catch (error) {
        log(`updates:confirm-install-error ${error.stack || error.message}`);
        return false;
      }
    },
    requestQuitForUpdate,
    serverUrl: SERVER_URL,
    repoUrl: BUILTIN_REPO_URL,
    stablePortableExeName: STABLE_PORTABLE_EXE_NAME,
  });
};

const runStartupUpdateCheck = async () => updaterIntegration?.runStartupUpdateCheck();

initializeUpdaterIntegration();

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
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: '#090a0d',
    autoHideMenuBar: true,
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
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    log(`window:did-fail-load ${code} ${description}`);
  });

  await mainWindow.loadURL(SERVER_URL);
  log('createMainWindow:loadURL-resolved');
  return mainWindow;
};

ipcMain.handle('updates:install-available', async (_event, payload = {}) => updaterIntegration.installAvailableUpdate(payload));

const bootstrap = async () => {
  await loadProjectSession();
  await loadIntegrationSecrets();
  await createSplashWindow();
  await ensureBackend();
  await setWindowProgress(splashWindow, 'Loading interface...', 96);
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
  if (ownsBackendRuntime && backendRuntime?.close) {
    try {
      backendRuntime.close();
    } catch {}
  }
});
