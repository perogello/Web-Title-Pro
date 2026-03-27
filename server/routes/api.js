import os from 'node:os';
import { Router } from 'express';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const sendError = (response, error) => {
  response.status(400).json({
    error: error.message || 'Unexpected error',
  });
};

export const createApiRouter = ({ store, templateService, midiService, vmixService, updateService }) => {
  const router = Router();
  const getEntryForAction = (entryId, outputId) => {
    if (entryId) {
      return store.getEntry(entryId);
    }

    return store.getSelectedEntry(outputId);
  };
  const syncVmixEntryIfNeeded = async (entry, action) => {
    if (!entry || entry.entryType !== 'vmix') {
      return;
    }

    await vmixService.applyTitleEntry(entry, action);
  };

  const getSystemInfo = () => {
    const isVirtualAdapter = (name) =>
      /docker|vethernet|vmware|hyper-v|loopback|tailscale|zerotier|virtual|wsl/i.test(name);

    const networkEntries = Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
      (addresses || [])
        .filter((address) => address.family === 'IPv4' && !address.internal && !isVirtualAdapter(name))
        .map((address) => ({
          name,
          address: address.address,
        })),
    );
    const primaryNetworkUrl = networkEntries[0] ? `http://${networkEntries[0].address}:4000/render.html` : null;

    return {
      hostname: os.hostname(),
      recommendedRenderUrl: primaryNetworkUrl || 'http://127.0.0.1:4000/render.html',
      recommendedPreviewUrl: `${primaryNetworkUrl || 'http://127.0.0.1:4000/render.html'}?preview=1`,
      localUrls: [
        'http://127.0.0.1:4000/render.html',
        'http://localhost:4000/render.html',
      ],
      networkUrls: networkEntries.map((item) => `http://${item.address}:4000/render.html`),
      networkInterfaces: networkEntries,
    };
  };

  router.get('/health', (_request, response) => {
    response.json({ ok: true, time: new Date().toISOString() });
  });

  router.get('/system/info', (_request, response) => {
    response.json(getSystemInfo());
  });

  router.get('/app/meta', (_request, response) => {
    response.json({
      name: 'Web Title Pro',
      version: updateService?.getState().currentVersion || '0.0.0',
      updates: updateService?.getState() || null,
    });
  });

  router.get('/vmix/status', async (_request, response) => {
    response.json(vmixService.getState());
  });

  router.get('/updates', (_request, response) => {
    response.json(updateService.getState());
  });

  router.put('/updates/config', (request, response) => {
    try {
      response.json(updateService.updateConfig(request.body || {}));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/updates/check', async (_request, response) => {
    try {
      response.json(await updateService.checkForUpdates());
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/vmix/sync', async (_request, response) => {
    try {
      const state = await vmixService.refresh();
      response.json(state);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/vmix/connect', async (request, response) => {
    try {
      const state = await vmixService.setHost(request.body.host || '');
      response.json(state);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/vmix/select-timer-input', async (request, response) => {
    try {
      const state = await vmixService.selectTimerInput(request.body.inputKey || '');
      response.json(state);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/vmix/timer-action', async (request, response) => {
    try {
      const state = await vmixService.executeTimerAction(request.body.action, request.body.inputKey || '');
      response.json(state);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/state', (_request, response) => {
    response.json(store.getSnapshot());
  });

  router.get('/render/state', (_request, response) => {
    response.json(store.getSnapshot());
  });

  router.post('/outputs', (request, response) => {
    try {
      const output = store.createOutput(request.body);
      response.status(201).json(output);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put('/outputs/:outputId', (request, response) => {
    try {
      const output = store.updateOutput(request.params.outputId, request.body);
      response.json(output);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete('/outputs/:outputId', (request, response) => {
    try {
      store.deleteOutput(request.params.outputId);
      response.status(204).end();
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/outputs/:outputId/select', (request, response) => {
    try {
      const output = store.selectOutput(request.params.outputId);
      response.json(output);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/templates', (_request, response) => {
    response.json(templateService.getTemplates());
  });

  router.post('/templates/upload', upload.any(), async (request, response) => {
    try {
      const template = await templateService.importTemplatePackage(request.files, request.body.name || '');
      await store.refreshTemplates();
      store.reconcileEntries();
      store.touch();
      response.status(201).json(template);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/entries', (request, response) => {
    try {
      const entry = store.addEntry(request.body);
      response.status(201).json(entry);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put('/entries/:entryId', (request, response) => {
    try {
      const entry = store.updateEntry(request.params.entryId, request.body);
      response.json(entry);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete('/entries/:entryId', (request, response) => {
    try {
      store.deleteEntry(request.params.entryId);
      response.status(204).end();
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/entries/reorder', (request, response) => {
    try {
      store.reorderEntries(request.body.ids || []);
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/entries/:entryId/select', (request, response) => {
    try {
      store.selectEntry(request.params.entryId, request.body.outputId);
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/program/show', async (request, response) => {
    try {
      store.showSelected(request.body.entryId, request.body.outputId);
      await syncVmixEntryIfNeeded(getEntryForAction(request.body.entryId, request.body.outputId), 'show');
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/program/update', async (request, response) => {
    try {
      store.updateProgram(request.body.entryId, request.body.outputId);
      await syncVmixEntryIfNeeded(getEntryForAction(request.body.entryId, request.body.outputId), 'update');
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/program/hide', async (request, response) => {
    try {
      const currentEntry = store.getEntry(store.getProgram(request.body.outputId).entryId);
      store.hideProgram(request.body.outputId);
      await syncVmixEntryIfNeeded(currentEntry, 'hide');
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/program/live', async (request, response) => {
    try {
      store.updateProgram(request.body.entryId, request.body.outputId);
      await syncVmixEntryIfNeeded(getEntryForAction(request.body.entryId, request.body.outputId), 'update');
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/preview/show', (request, response) => {
    try {
      store.showPreview(request.body.entryId, request.body.outputId);
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/preview/hide', (request, response) => {
    try {
      store.hidePreview(request.body.outputId);
      response.json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/commands/:action', (request, response) => {
    try {
      const { action } = request.params;

      if (action === 'show') {
        store.showSelected(request.body.entryId, request.body.outputId);
      } else if (action === 'update' || action === 'live') {
        store.updateProgram(request.body.entryId, request.body.outputId);
      } else if (action === 'hide') {
        store.hideProgram(request.body.outputId);
      } else {
        throw new Error('Unsupported command.');
      }

      response.json({ ok: true, action });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/import/txt', (request, response) => {
    try {
      const entries = store.createEntriesFromText(request.body);
      response.status(201).json(entries);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/midi', (_request, response) => {
    response.json(midiService.getState());
  });

  router.post('/midi/refresh', async (_request, response) => {
    try {
      const state = await midiService.refresh();
      response.json(state);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/midi/learn/start', (request, response) => {
    try {
      response.json(midiService.startLearn(request.body.action));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/midi/learn/stop', (_request, response) => {
    try {
      response.json(midiService.stopLearn());
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/timers', (request, response) => {
    try {
      const timer = store.createTimer(request.body);
      response.status(201).json(timer);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put('/timers/:timerId', (request, response) => {
    try {
      const timer = store.updateTimer(request.params.timerId, request.body);
      response.json(timer);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete('/timers/:timerId', (request, response) => {
    try {
      store.deleteTimer(request.params.timerId);
      response.status(204).end();
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/timers/:timerId/start', (request, response) => {
    try {
      response.json(store.startTimer(request.params.timerId));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/timers/:timerId/stop', (request, response) => {
    try {
      response.json(store.stopTimer(request.params.timerId));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/timers/:timerId/reset', (request, response) => {
    try {
      response.json(store.resetTimer(request.params.timerId));
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
};
