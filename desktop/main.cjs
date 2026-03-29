const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const electron = require('electron');

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const dialog = electron.dialog;
const shell = electron.shell;

const SERVER_URL = 'http://127.0.0.1:4000';
const HEALTH_URL = `${SERVER_URL}/api/health`;
const APP_META_URL = `${SERVER_URL}/api/app/meta`;
const UPDATE_CHECK_URL = `${SERVER_URL}/api/updates/check`;
const BUILTIN_REPO_URL = 'https://github.com/perogello/Web-Title-Pro';
const STABLE_PORTABLE_EXE_NAME = 'WebTitlePro.exe';

let backendRuntime = null;
let ownsBackendRuntime = false;
let mainWindow = null;
let splashWindow = null;
let updateWindow = null;
let splashProgressTimer = null;
let startupUpdateCheckStarted = false;

const logFile = path.join(os.tmpdir(), 'web-title-pro-desktop.log');

const log = (message) => {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {}
};
log('desktop:module-loaded');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    },
  });

  mainWindow.on('closed', () => {
    log('window:closed');
    mainWindow = null;
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

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json();
};

const getAppMeta = async () => fetchJson(APP_META_URL);
const checkForUpdates = async () => fetchJson(UPDATE_CHECK_URL, { method: 'POST' });

const downloadFileWithProgress = async (url, destinationPath, onProgress) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'Web-Title-Pro-Updater',
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Download failed with ${response.status}`);
  }

  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });

  const contentLength = Number(response.headers.get('content-length') || 0);
  const reader = response.body.getReader();
  const fileHandle = await fsp.open(destinationPath, 'w');
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      await fileHandle.write(chunk);
      received += chunk.length;

      if (typeof onProgress === 'function') {
        const percent = contentLength > 0 ? Math.round((received / contentLength) * 100) : null;
        onProgress({ received, total: contentLength, percent });
      }
    }
  } finally {
    await fileHandle.close();
  }
};

const escapeBatchValue = (value) => String(value).replace(/"/g, '""');

const resolveStablePortableExePath = () => {
  const currentPath = process.execPath;
  const currentDir = path.dirname(currentPath);
  const currentBase = path.basename(currentPath);

  if (/^WebTitlePro-\d+\.\d+\.\d+\.exe$/i.test(currentBase)) {
    return path.join(currentDir, STABLE_PORTABLE_EXE_NAME);
  }

  return currentPath;
};

const createUpdateScript = async ({ sourcePath, targetPath }) => {
  const scriptPath = path.join(app.getPath('temp'), `web-title-pro-apply-update-${Date.now()}.cmd`);
  const script = [
    '@echo off',
    'setlocal',
    `set "SOURCE=${escapeBatchValue(sourcePath)}"`,
    `set "TARGET=${escapeBatchValue(targetPath)}"`,
    ':retry',
    'move /Y "%SOURCE%" "%TARGET%" >nul 2>nul',
    'if errorlevel 1 (',
    '  timeout /t 1 /nobreak >nul',
    '  goto retry',
    ')',
    'start "" "%TARGET%"',
    'exit /b 0',
    '',
  ].join('\r\n');

  await fsp.writeFile(scriptPath, script, 'utf8');
  return scriptPath;
};

const applyDownloadedUpdate = async (downloadPath) => {
  const targetPath = resolveStablePortableExePath();
  const scriptPath = await createUpdateScript({
    sourcePath: downloadPath,
    targetPath,
  });

  const helper = spawn('cmd.exe', ['/d', '/c', scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  helper.unref();
  setTimeout(() => app.quit(), 250);
};

const installUpdateFromRelease = async (updateState) => {
  if (!updateState?.assetUrl || !updateState?.assetName) {
    if (updateState?.releaseUrl) {
      await shell.openExternal(updateState.releaseUrl);
    }
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Package Not Found',
      message: 'The release page was opened in the browser.',
      detail: 'No portable .exe asset was attached to the latest release, so the download could not start automatically.',
      buttons: ['OK'],
      defaultId: 0,
    });
    return;
  }

  const progressWindow = await createUpdateWindow();
  await setWindowProgress(progressWindow, 'Downloading update package...', 8);

  const updatesDir = path.join(app.getPath('userData'), 'updates');
  const tempDownloadPath = path.join(updatesDir, `${updateState.assetName}.download`);

  try {
    await downloadFileWithProgress(updateState.assetUrl, tempDownloadPath, ({ percent }) => {
      const safePercent = percent === null ? 50 : Math.max(12, Math.min(92, percent));
      void setWindowProgress(progressWindow, 'Downloading update package...', safePercent);
    });

    await setWindowProgress(progressWindow, 'Preparing update handoff...', 96);
    await applyDownloadedUpdate(tempDownloadPath);
  } catch (error) {
    closeUpdateWindow();
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Failed',
      message: 'The update could not be downloaded or prepared.',
      detail: error.message || String(error),
    });
    throw error;
  }
};

const runStartupUpdateCheck = async () => {
  if (startupUpdateCheckStarted || !app.isPackaged) {
    return;
  }

  startupUpdateCheckStarted = true;

  try {
    await wait(900);
    const meta = await getAppMeta();
    const updateState = await checkForUpdates();

    if (updateState?.status === 'error' || updateState?.status === 'unsupported' || updateState?.status === 'no-releases') {
      await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Update Check',
        message: 'Automatic update check could not complete normally.',
        detail: updateState?.notes || 'Unknown update status.',
        buttons: ['OK'],
        defaultId: 0,
      });
      return;
    }

    if (updateState?.available) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A newer version is available: ${updateState.latestVersion}`,
        detail:
          `Current version: ${meta?.version || updateState.currentVersion || '0.0.0'}\n` +
          `Release source: ${BUILTIN_REPO_URL}\n\n` +
          `Do you want to download and apply the update now?`,
        buttons: ['Update Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });

      if (result.response === 0) {
        await installUpdateFromRelease(updateState);
      }

      return;
    }

    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Updates',
      message: `You are on the latest version: ${meta?.version || updateState?.currentVersion || '0.0.0'}`,
      detail:
        `${updateState?.notes || 'Update check completed successfully.'}\n` +
        `Source: ${BUILTIN_REPO_URL}`,
      buttons: ['OK'],
      defaultId: 0,
    });
  } catch (error) {
    log(`updates:startup-check-error ${error.stack || error.message}`);
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Update Check',
      message: 'Automatic update check failed.',
      detail: error.message || String(error),
      buttons: ['OK'],
      defaultId: 0,
    });
  }
};

const bootstrap = async () => {
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
