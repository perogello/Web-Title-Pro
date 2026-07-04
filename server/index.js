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
let processHandlersInstalled = false;

const installProcessHandlers = () => {
  if (processHandlersInstalled) {
    return;
  }
  processHandlersInstalled = true;
  process.on('uncaughtException', (error) => {
    console.error('uncaughtException:', error?.stack || error?.message || error);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason?.stack || reason?.message || reason);
  });
};

// Dispatch a MIDI-triggered canonical action id (model v2) server-side.
// Row stepping and an output's "current timer" are resolved from the client's
// data-source library, so MIDI handles them best-effort: row stepping is a
// no-op here, and per-output timer commands fall back to a timer explicitly
// bound to that output (targetOutputId).
const dispatchMidiAction = (store, action = '') => {
  const parseId = (str) => {
    if (str.startsWith('output:')) {
      const rest = str.slice('output:'.length);
      const i = rest.lastIndexOf(':');
      return i === -1 ? null : { kind: 'output', id: rest.slice(0, i), command: rest.slice(i + 1) };
    }
    if (str.startsWith('timer:')) {
      const rest = str.slice('timer:'.length);
      const i = rest.lastIndexOf(':');
      return i === -1 ? null : { kind: 'timer', id: rest.slice(0, i), command: rest.slice(i + 1) };
    }
    if (str.startsWith('global:')) return { kind: 'global', command: str.slice('global:'.length) };
    return null;
  };

  const runTimer = (timerId, command) => {
    if (!timerId) return;
    if (command === 'start') store.startTimer(timerId);
    else if (command === 'stop') store.stopTimer(timerId);
    else if (command === 'reset') store.resetTimer(timerId);
  };

  const parsed = parseId(action);
  if (!parsed) return;

  if (parsed.kind === 'global') {
    if (parsed.command === 'allOutputsOut') {
      for (const output of store.getSnapshot().outputs || []) {
        if (output.program?.visible) store.hideProgram(output.id);
      }
    }
    return;
  }

  if (parsed.kind === 'timer') {
    runTimer(parsed.id, parsed.command);
    return;
  }

  // output commands
  const outputId = parsed.id;
  switch (parsed.command) {
    case 'titleIn':
      store.showSelected(null, outputId);
      break;
    case 'titleOut':
      store.hideProgram(outputId);
      break;
    case 'previewIn':
      store.showPreview(null, outputId);
      break;
    case 'previewOut':
      store.hidePreview(outputId);
      break;
    case 'timerStart':
    case 'timerStop':
    case 'timerReset': {
      const boundTimer = store.getTimers().find((t) => t.targetOutputId === outputId);
      const command =
        parsed.command === 'timerStart' ? 'start' : parsed.command === 'timerStop' ? 'stop' : 'reset';
      runTimer(boundTimer?.id, command);
      break;
    }
    default:
      // rowPrev / rowNext — client-only, no server-side equivalent.
      break;
  }
};

export const startServer = async (options = {}) => {
  if (activeRuntime) {
    return activeRuntime;
  }

  installProcessHandlers();

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

  const midiService = new MidiService({
    bindings: store.getMidiBindings(),
    onBindingsChange: (bindings) => store.updateMidiBindings(bindings),
  });
  midiService.on('action', ({ action }) => {
    try {
      dispatchMidiAction(store, action);
    } catch (error) {
      console.warn(`MIDI action skipped: ${error.message}`);
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
  timerManager.on('tick', (payload) => {
    hub.broadcast('timer-tick', payload);
    vmixService.scheduleSyncTimers(payload?.timers || store.getTimers());
  });

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/api', createApiRouter({ store, templateService, midiService, vmixService, updateService }));
  app.use('/template-assets/builtin', express.static(config.builtinTemplatesDir));
  app.use('/template-assets/custom', express.static(config.customTemplatesDir));
  // Renderer files carry no content hash in their names, so a browser cache
  // could keep serving the previous version's render.js/css after an app
  // update. Force revalidation.
  app.use(
    '/renderer-assets',
    express.static(config.rendererDir, {
      setHeaders: (response) => response.setHeader('Cache-Control', 'no-cache'),
    }),
  );

  app.get(['/render', '/render.html'], (_request, response) => {
    response.setHeader('Cache-Control', 'no-cache');
    response.sendFile(path.join(config.rendererDir, 'render.html'));
  });

  // Serve the built client. HTML must never be cached (a stale index.html
  // would reference the OLD hashed bundle after an update and show the
  // previous UI); the hashed assets themselves stay cacheable.
  if (await fs.pathExists(path.join(config.clientDistDir, 'index.html'))) {
    app.use(
      express.static(config.clientDistDir, {
        setHeaders: (response, filePath) => {
          if (filePath.endsWith('.html')) {
            response.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
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
      response.setHeader('Cache-Control', 'no-cache');
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
      await midiService.close();
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
