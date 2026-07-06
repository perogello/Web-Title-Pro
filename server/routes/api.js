import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import express, { Router } from 'express';
import multer from 'multer';
import { fetchRemoteSourceData } from '../remote-sources/index.js';
import { dispatchCommand } from '../state/command-bus.js';
import { buildCommandCatalog, COMMAND_API_VERSION, COMMAND_API_VERSION_STRING } from '../state/command-catalog.js';
import { ALL_CAPABILITIES, CAPABILITIES } from '../state/access.js';
import { applySettingsDefaults } from '../plugins/plugin-service.js';
import {
  createProjectBundleStream,
  getBundleFilename,
  importProjectBundle,
} from '../templates/bundle-service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 150,
  },
});

const sendError = (response, error) => {
  response.status(400).json({
    error: error.message || 'Unexpected error',
    details: Array.isArray(error.details) ? error.details : undefined,
  });
};

export const createApiRouter = ({ store, templateService, pluginService, midiService, vmixService, updateService }) => {
  const router = Router();
  const allowedFontRoots = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts')
      : path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts'),
  ].map((value) => path.resolve(value));
  const isAllowedFontPath = (targetPath = '') => {
    const resolvedPath = path.resolve(String(targetPath || '').trim());
    if (!resolvedPath || !/\.(ttf|otf|ttc|otc)$/i.test(resolvedPath)) {
      return null;
    }

    const normalizedPath = resolvedPath.toLowerCase();
    const matchingRoot = allowedFontRoots.find((root) => {
      const normalizedRoot = root.toLowerCase();
      return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${path.sep}`);
    });

    return matchingRoot ? resolvedPath : null;
  };
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

  router.get('/system-font-file', async (request, response) => {
    try {
      const requestedPath = typeof request.query.path === 'string' ? request.query.path : '';
      const safePath = isAllowedFontPath(requestedPath);

      if (!safePath) {
        response.status(400).json({ error: 'Font file path is not allowed.' });
        return;
      }

      const stats = await fs.stat(safePath);
      if (!stats.isFile()) {
        response.status(404).json({ error: 'Font file was not found.' });
        return;
      }

      response.sendFile(safePath);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/app/meta', (_request, response) => {
    response.json({
      name: 'Web Title Pro',
      version: updateService?.getState().currentVersion || '0.0.0',
      commandApiVersion: COMMAND_API_VERSION,
      commandApiVersionString: COMMAND_API_VERSION_STRING,
      updates: updateService?.getState() || null,
    });
  });

  // Published command contract for plugins / Companion: the API version, the
  // action-id grammar, and every concrete action id valid against the live
  // store right now. This is the stable surface external clients program to.
  router.get('/command/catalog', (_request, response) => {
    try {
      response.json(buildCommandCatalog(store, pluginService));
    } catch (error) {
      sendError(response, error);
    }
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

  // --- Access grants (capability model for plugins / external surfaces) -----
  // Operator-only management, served over loopback. Listing never returns raw
  // tokens; creation returns the token exactly once so it can be handed off.
  router.get('/access/capabilities', (_request, response) => {
    response.json({ capabilities: ALL_CAPABILITIES, labels: CAPABILITIES });
  });

  router.get('/access/grants', (_request, response) => {
    response.json({ grants: store.listAccessGrants() });
  });

  router.post('/access/grants', (request, response) => {
    try {
      // Full grant incl. the raw token — shown once for the operator to copy.
      response.status(201).json(store.createAccessGrant(request.body || {}));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.patch('/access/grants/:grantId', (request, response) => {
    try {
      response.json(store.updateAccessGrant(request.params.grantId, request.body || {}));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete('/access/grants/:grantId', (request, response) => {
    try {
      response.json(store.revokeAccessGrant(request.params.grantId));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/sources', (_request, response) => {
    response.json(store.getSources());
  });

  // Replace the whole data-source library. The control panel pushes the full
  // (debounced) library here; the server normalises, persists and broadcasts.
  router.put('/sources', (request, response) => {
    try {
      const items = Array.isArray(request.body?.items) ? request.body.items : request.body;
      response.json(store.replaceSources(items));
    } catch (error) {
      sendError(response, error);
    }
  });

  // The control panel reports which data-source row it applied to an output,
  // so the server (and MIDI / Companion / plugins) can resolve the output's
  // current row and current timer. Body: { sourceId, rowId } or null to clear.
  router.post('/outputs/:outputId/applied-row', (request, response) => {
    try {
      const applied = store.setOutputAppliedRow(request.params.outputId, request.body || null);
      response.json({ ok: true, appliedRow: applied });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/project/export', (_request, response) => {
    response.json({
      version: 1,
      state: store.exportProjectState(),
    });
  });

  router.post('/project/load', async (request, response) => {
    try {
      const snapshot = await store.loadProjectState(request.body?.state || {}, {
        seedExamples: Boolean(request.body?.seedExamples),
      });
      response.json(snapshot);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/sources/fetch-remote', async (request, response) => {
      const type = request.body?.type;
      const rawUrl = request.body?.url;
      const requestedSheetName = typeof request.body?.sheetName === 'string' ? request.body.sheetName.trim() : '';
      const resolvedUrlHint = typeof request.body?.resolvedUrlHint === 'string' ? request.body.resolvedUrlHint.trim() : '';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const payload = await fetchRemoteSourceData({
          type,
          url: rawUrl,
          sheetName: requestedSheetName,
          resolvedUrlHint,
          signal: controller.signal,
        });
        response.json(payload);
    } catch (error) {
      if (error?.name === 'AbortError') {
        sendError(response, new Error('Remote source request timed out.'));
        return;
      }

      sendError(response, error);
    } finally {
      clearTimeout(timeout);
    }
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

  router.post('/outputs/:outputId/sync-toggle', (request, response) => {
    try {
      const outputs = store.toggleOutputSync(request.params.outputId, request.body.targetOutputId);
      response.json(outputs);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/templates', (_request, response) => {
    response.json(templateService.getTemplates());
  });

  // --- Plugins (host management) -------------------------------------------
  // The discovered plugin (manifest) merged with its stored enabled/settings.
  const describePlugin = (plugin) => {
    const state = store.getPluginState(plugin.id) || { enabled: false, settings: {}, grantId: null };
    return {
      id: plugin.id,
      slug: plugin.slug,
      source: plugin.source,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      capabilities: plugin.capabilities,
      mount: plugin.mount,
      contributes: plugin.contributes,
      entryUrl: plugin.entryUrl,
      overlayUrl: plugin.overlayUrl,
      enabled: state.enabled,
      settingsSchema: plugin.settingsSchema,
      // Stored values backfilled with schema defaults, so the UI and the plugin
      // always see a complete config.
      settings: applySettingsDefaults(plugin.settingsSchema, state.settings),
    };
  };

  router.get('/plugins', (_request, response) => {
    if (!pluginService) {
      response.json({ plugins: [] });
      return;
    }
    response.json({ plugins: pluginService.getPlugins().map(describePlugin) });
  });

  router.post('/plugins/:pluginId/enable', (request, response) => {
    try {
      const plugin = pluginService?.getPlugin(request.params.pluginId);
      if (!plugin) {
        throw new Error('Plugin not found.');
      }
      // Mint a grant scoped to exactly what the manifest requests.
      const { token } = store.setPluginEnabled(plugin.id, true, plugin.capabilities);
      response.json({ plugin: describePlugin(plugin), token });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/plugins/:pluginId/disable', (request, response) => {
    try {
      const plugin = pluginService?.getPlugin(request.params.pluginId);
      if (!plugin) {
        throw new Error('Plugin not found.');
      }
      store.setPluginEnabled(plugin.id, false);
      response.json({ plugin: describePlugin(plugin) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put('/plugins/:pluginId/settings', (request, response) => {
    try {
      const plugin = pluginService?.getPlugin(request.params.pluginId);
      if (!plugin) {
        throw new Error('Plugin not found.');
      }
      store.updatePluginSettings(plugin.id, request.body?.settings || {});
      response.json({ plugin: describePlugin(plugin) });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Install a custom plugin from an uploaded .zip or a set of files.
  router.post('/plugins/upload', upload.any(), async (request, response) => {
    try {
      if (!pluginService) {
        throw new Error('Plugin service unavailable.');
      }
      const plugin = await pluginService.importPluginPackage(request.files, request.body?.name || '');
      response.status(201).json({ plugin: describePlugin(plugin) });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Install a custom plugin from an on-disk folder (desktop folder picker).
  router.post('/plugins/import-directory', async (request, response) => {
    try {
      if (!pluginService) {
        throw new Error('Plugin service unavailable.');
      }
      const plugin = await pluginService.importPluginDirectory(request.body?.directoryPath || '', request.body?.name || '');
      response.status(201).json({ plugin: describePlugin(plugin) });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Remove a custom plugin: forget its state/grant, then delete it from disk.
  router.delete('/plugins/:pluginId', async (request, response) => {
    try {
      const plugin = pluginService?.getPlugin(request.params.pluginId);
      if (!plugin) {
        throw new Error('Plugin not found.');
      }
      store.removePluginState(plugin.id);
      const result = await pluginService.deletePlugin(plugin.id);
      response.json(result);
    } catch (error) {
      sendError(response, error);
    }
  });

  // A plugin's own content data (bingo board, scores, …). Any surface of the
  // plugin reads it here; writing it persists and broadcasts to all surfaces
  // over WS. Trusted-plugin model: the plugin owns this blob.
  router.get('/plugins/:pluginId/data', (request, response) => {
    try {
      response.json({ data: store.getPluginData(request.params.pluginId) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put('/plugins/:pluginId/data', (request, response) => {
    try {
      const data = store.setPluginData(request.params.pluginId, request.body?.data ?? request.body ?? {});
      response.json({ data });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Host-only: the scoped token for an enabled plugin, so the bridge can
  // authorize the plugin's requests. Served over loopback to the trusted panel.
  router.get('/plugins/:pluginId/token', (request, response) => {
    try {
      const plugin = pluginService?.getPlugin(request.params.pluginId);
      if (!plugin) {
        throw new Error('Plugin not found.');
      }
      response.json({ token: store.getPluginGrantToken(plugin.id) });
    } catch (error) {
      sendError(response, error);
    }
  });

  // Project bundle (.wtpkg): full self-contained export and import. The
  // export endpoint accepts the project document built by the client (it
  // already knows the data-source library; the server doesn't). The import
  // endpoint installs any bundled custom templates and returns the project
  // document for the client to apply via the normal load flow.
  router.post('/project/bundle/export', express.json({ limit: '50mb' }), async (request, response) => {
    try {
      const project = request.body?.project;
      if (!project) {
        throw new Error('Project document missing in request body.');
      }
      const { stream, manifest } = createProjectBundleStream({ project, templateService });
      response.setHeader('Content-Type', 'application/zip');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${getBundleFilename(project)}"`,
      );
      response.setHeader('X-Bundle-Included-Templates', String(manifest.includedTemplateIds.length));
      response.setHeader('X-Bundle-Outputs', String(manifest.projectCounts?.outputs || 0));
      response.setHeader('X-Bundle-Entries', String(manifest.projectCounts?.entries || 0));
      response.setHeader('X-Bundle-Sources', String(manifest.projectCounts?.sources || 0));
      response.setHeader('X-Bundle-Vmix-Inputs', String(manifest.projectCounts?.vmixDiscoveredInputs || 0));
      stream.on('error', (error) => {
        if (response.headersSent) {
          response.destroy(error);
          return;
        }
        sendError(response, error);
      });
      stream.pipe(response);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/project/bundle/import', upload.single('bundle'), async (request, response) => {
    try {
      if (!request.file?.buffer?.length) {
        throw new Error('No bundle file uploaded.');
      }
      const result = await importProjectBundle({
        buffer: request.file.buffer,
        templateService,
      });
      await store.refreshTemplates();
      store.reconcileEntries();
      store.touch();
      response.json(result);
    } catch (error) {
      sendError(response, error);
    }
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

  router.post('/templates/import-directory', async (request, response) => {
    try {
      const template = await templateService.importTemplateDirectory(request.body?.directoryPath || '', request.body?.name || '');
      await store.refreshTemplates();
      store.reconcileEntries();
      store.touch();
      response.status(201).json(template);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete('/templates/:templateId', async (request, response) => {
    try {
      const templateId = decodeURIComponent(request.params.templateId || '');
      const snapshot = store.getSnapshot();
      const usedEntries = (snapshot.entries || []).filter((entry) => entry.templateId === templateId);
      const usageCount = usedEntries.length;
      const force = request.query.force === '1' || request.query.force === 'true';

      if (usageCount > 0 && !force) {
        throw new Error(`Template is still used by ${usageCount} title(s) in the rundown. Remove those titles first.`);
      }

      if (force) {
        usedEntries.forEach((entry) => store.deleteEntry(entry.id));
      }

      const result = await templateService.deleteTemplate(templateId);
      await store.refreshTemplates();
      store.reconcileEntries();
      store.touch();
      response.json(result);
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

  router.post('/entries/:entryId/duplicate', (request, response) => {
    try {
      const entry = store.duplicateEntry(request.params.entryId);
      response.status(201).json(entry);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/entries/:entryId/vmix-sync', async (request, response) => {
    try {
      const entry = store.getEntry(request.params.entryId);

      if (!entry) {
        throw new Error('Entry not found.');
      }

      await syncVmixEntryIfNeeded(entry, request.body?.action || 'update');
      response.json({ ok: true });
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

  router.post('/outputs/reorder', (request, response) => {
    try {
      store.reorderOutputs(request.body.ids || []);
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

  // Unified command bus: one canonical action id -> one command. Used by
  // plugins, Companion and the shortcut layer. Body: { actionId }.
  router.post('/command', async (request, response) => {
    try {
      const result = await dispatchCommand(store, request.body?.actionId, {
        vmixSync: syncVmixEntryIfNeeded,
        pluginService,
      });
      response.json(result);
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

  router.patch('/midi/bindings/:action', (request, response) => {
    try {
      response.json(midiService.updateBinding(request.params.action, request.body || {}));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete('/midi/bindings/:action', (request, response) => {
    try {
      response.json(midiService.clearBinding(request.params.action));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put('/shortcuts/navigation', (request, response) => {
    try {
      response.json(store.updateNavigationShortcuts(request.body || {}));
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
