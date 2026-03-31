import fs from 'fs-extra';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { TemplateService } from './templates/template-service.js';
import { TitleStore } from './state/store.js';
import { TimerManager } from './timers/timer-manager.js';
import { MidiService } from './midi/midi-service.js';
import { createApiRouter } from './routes/api.js';
import { WebSocketHub } from './ws/hub.js';
import { VmixService } from './vmix/vmix-service.js';
import { UpdateService } from './updates/update-service.js';

let activeRuntime = null;

export const startServer = async (options = {}) => {
  if (activeRuntime) {
    return activeRuntime;
  }

  const reportProgress = (label, percent) => {
    if (typeof options.onProgress === 'function') {
      options.onProgress({ label, percent });
    }
  };

  reportProgress('Preparing storage...', 12);
  await fs.ensureDir(path.dirname(config.stateFile));
  await fs.ensureDir(config.customTemplatesDir);

  reportProgress('Loading templates...', 28);
  const templateService = new TemplateService({
    builtinTemplatesDir: config.builtinTemplatesDir,
    customTemplatesDir: config.customTemplatesDir,
  });

  await templateService.init();

  reportProgress('Loading project state...', 44);
  const store = new TitleStore({
    stateFile: config.stateFile,
    templateService,
  });

  await store.init();

  const midiService = new MidiService();
  midiService.on('action', ({ action }) => {
    if (action === 'show') {
      store.showSelected();
    }

    if (action === 'update' || action === 'live') {
      store.updateProgram();
    }

    if (action === 'hide') {
      store.hideProgram();
    }
  });

  reportProgress('Preparing update service...', 56);
  const updateService = new UpdateService({
    store,
    rootDir: config.rootDir,
  });
  await updateService.init();

  reportProgress('Starting control engine...', 70);
  const app = express();
  const server = http.createServer(app);
  const vmixService = new VmixService(store);
  const wsServer = new WebSocketServer({ server, path: '/ws' });
  const hub = new WebSocketHub({ server: wsServer, store });
  const timerManager = new TimerManager(store);

  hub.start();
  timerManager.start();

  store.on('change', () => {
    hub.broadcast('snapshot');
    vmixService.scheduleSyncTimers(store.getTimers());
  });
  timerManager.on('tick', () => {
    hub.broadcast('timer-tick');
    vmixService.scheduleSyncTimers(store.getTimers());
  });

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', createApiRouter({ store, templateService, midiService, vmixService, updateService }));
  app.use('/template-assets/builtin', express.static(config.builtinTemplatesDir));
  app.use('/template-assets/custom', express.static(config.customTemplatesDir));
  app.use('/renderer-assets', express.static(config.rendererDir));

  app.get(['/render', '/render.html'], (_request, response) => {
    response.sendFile(path.join(config.rendererDir, 'render.html'));
  });

  if (await fs.pathExists(path.join(config.clientDistDir, 'index.html'))) {
    app.use(express.static(config.clientDistDir));
  }

  app.use((request, response, next) => {
    if (
      request.method !== 'GET' ||
      request.path.startsWith('/api') ||
      request.path.startsWith('/template-assets') ||
      request.path.startsWith('/renderer-assets') ||
      request.path === '/render' ||
      request.path === '/render.html'
    ) {
      next();
      return;
    }

    const indexPath = path.join(config.clientDistDir, 'index.html');

    if (fs.existsSync(indexPath)) {
      response.sendFile(indexPath);
      return;
    }

    response.status(404).json({ error: 'Frontend build not found. Run npm run build.' });
  });

  await new Promise((resolve) => {
    server.listen(config.port, resolve);
  });

  console.log(`Web Title Pro is running on http://localhost:${config.port}`);
  reportProgress('Launching background services...', 86);

  activeRuntime = {
    server,
    store,
    midiService,
    vmixService,
    timerManager,
    hub,
    updateService,
    async close() {
      timerManager.stop();
      vmixService.stop();
      await store.close();
      await new Promise((resolve) => wsServer.close(resolve));
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      activeRuntime = null;
    },
  };

  setTimeout(() => {
    midiService.init().catch((error) => {
      console.error('MIDI init failed:', error);
    });
    vmixService.start();
  }, 0);

  reportProgress('Opening control surface...', 100);

  return activeRuntime;
};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
