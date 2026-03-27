const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow } = require('electron');

const SERVER_URL = 'http://127.0.0.1:4000';
const HEALTH_URL = `${SERVER_URL}/api/health`;
let backendRuntime = null;
let mainWindow = null;
const logFile = path.join(os.tmpdir(), 'web-title-pro-desktop.log');

const log = (message) => {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {}
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHealth = async (retries = 40) => {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(HEALTH_URL);

      if (response.ok) {
        return true;
      }
    } catch {}

    await wait(500);
  }

  return false;
};

const ensureBackend = async () => {
  log('ensureBackend:start');
  const alreadyRunning = await waitForHealth(2);

  if (alreadyRunning) {
    log('ensureBackend:already-running');
    return;
  }

  process.env.WEB_TITLE_PRO_DATA_DIR = path.join(app.getPath('userData'), 'data');
  process.env.WEB_TITLE_PRO_STORAGE_DIR = path.join(app.getPath('userData'), 'storage');

  const serverEntry = pathToFileURL(path.resolve(__dirname, '..', 'server', 'index.js')).href;
  log(`ensureBackend:import ${serverEntry}`);
  const serverModule = await import(serverEntry);
  backendRuntime = await serverModule.startServer();
  log('ensureBackend:runtime-started');

  const isHealthy = await waitForHealth();

  if (!isHealthy) {
    log('ensureBackend:health-failed');
    throw new Error('Backend did not start in time.');
  }

  log('ensureBackend:healthy');
};

const createWindow = async () => {
  log('createWindow:start');
  await ensureBackend();

  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: '#090a0d',
    autoHideMenuBar: true,
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
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    log(`window:did-fail-load ${code} ${description}`);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    log('window:did-finish-load');
  });

  await mainWindow.loadURL(SERVER_URL);
  log('createWindow:loadURL-resolved');
};

app.whenReady().then(createWindow).catch((error) => {
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
    await createWindow();
  }
});

app.on('before-quit', async () => {
  log('app:before-quit');
  await backendRuntime?.close?.();
});
