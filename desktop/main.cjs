const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const electron = require('electron');

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const SERVER_URL = 'http://127.0.0.1:4000';
const HEALTH_URL = `${SERVER_URL}/api/health`;
let backendProcess = null;
let ownsBackendProcess = false;
let mainWindow = null;
let splashWindow = null;
let splashProgressTimer = null;
const logFile = path.join(os.tmpdir(), 'web-title-pro-desktop.log');

const log = (message) => {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {}
};
log('desktop:module-loaded');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const setSplashState = async (label, percent) => {
  if (!splashWindow || splashWindow.isDestroyed()) {
    return;
  }

  const safeLabel = JSON.stringify(label || 'Launching...');
  const safePercent = Number(percent || 0);

  try {
    await splashWindow.webContents.executeJavaScript(
      `window.setLoadingState && window.setLoadingState(${safeLabel}, ${safePercent});`,
      true,
    );
  } catch {}
};

const startPseudoProgress = (label = 'Starting local engine...', startAt = 12) => {
  let current = startAt;
  void setSplashState(label, current);
  clearInterval(splashProgressTimer);
  splashProgressTimer = setInterval(() => {
    current = Math.min(78, current + (current < 40 ? 6 : current < 60 ? 4 : 2));
    void setSplashState(label, current);
  }, 280);
};

const stopPseudoProgress = () => {
  clearInterval(splashProgressTimer);
  splashProgressTimer = null;
};

const createSplashWindow = async () => {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return splashWindow;
  }

  splashWindow = new BrowserWindow({
    width: 560,
    height: 280,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    frame: false,
    show: true,
    backgroundColor: '#090a0d',
    title: 'Web Title Pro Loading',
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
    },
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  await splashWindow.loadFile(path.resolve(__dirname, 'splash.html'));
  await setSplashState('Launching application...', 8);
  return splashWindow;
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
  await setSplashState('Checking local engine...', 12);

  const alreadyRunning = await waitForHealth(2);

  if (alreadyRunning) {
    log('ensureBackend:already-running');
    await setSplashState('Connecting to local engine...', 72);
    return;
  }

  startPseudoProgress('Starting local engine...', 16);

  const childEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    WEB_TITLE_PRO_DATA_DIR: path.join(app.getPath('userData'), 'data'),
    WEB_TITLE_PRO_STORAGE_DIR: path.join(app.getPath('userData'), 'storage'),
  };
  const serverEntry = path.resolve(__dirname, '..', 'server', 'index.js');

  log(`ensureBackend:spawn ${serverEntry}`);
  backendProcess = spawn(process.execPath, [serverEntry], {
    env: childEnv,
    stdio: 'ignore',
    windowsHide: true,
  });
  ownsBackendProcess = true;

  backendProcess.on('exit', (code) => {
    log(`backend:exit ${code}`);
    backendProcess = null;
  });

  const isHealthy = await waitForHealth();
  stopPseudoProgress();

  if (!isHealthy) {
    log('ensureBackend:health-failed');
    throw new Error('Backend did not start in time.');
  }

  log('ensureBackend:healthy');
  await setSplashState('Backend ready. Opening control panel...', 90);
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

const bootstrap = async () => {
  await createSplashWindow();
  await ensureBackend();
  await setSplashState('Loading interface...', 96);
  await createMainWindow();
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
  if (ownsBackendProcess && backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});
