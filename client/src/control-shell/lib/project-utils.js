import { normalizeSourceLibrary } from '../../source-library.js';
import { buildPersistedEntry, buildPersistedTimer } from './entry-utils.js';

const buildTimerDirtyShape = (timer = {}) => ({
  id: timer.id,
  name: timer.name || 'New Timer',
  mode: timer.mode === 'countup' ? 'countup' : 'countdown',
  durationMs: Number(timer.durationMs ?? 0),
  sourceType: timer.sourceType === 'vmix' ? 'vmix' : 'local',
  targetOutputId: timer.targetOutputId || null,
  targetTemplateId: timer.targetTemplateId || null,
  targetTimerId: timer.targetTimerId || null,
  vmixInputKey: timer.vmixInputKey || null,
  vmixTextField: timer.vmixTextField || 'Text',
  displayFormat: timer.displayFormat || 'mm:ss',
});

const buildOutputDirtyShape = (output = {}) => ({
  id: output.id,
  key: output.key,
  name: output.name,
  selectedEntryId: output.selectedEntryId || null,
  syncGroupId: output.syncGroupId || null,
});

const buildProjectDirtyShape = (snapshot) => ({
  selectedOutputId: snapshot?.selectedOutputId || null,
  outputs: (snapshot?.outputs || []).map(buildOutputDirtyShape),
  integrations: snapshot?.integrations || {},
  entries: (snapshot?.entries || []).map((entry) => buildPersistedEntry(entry)),
  timers: (snapshot?.timers || []).map(buildTimerDirtyShape),
});

export const buildPersistedProjectStateFromSnapshot = (snapshot) => ({
  selectedOutputId: snapshot?.selectedOutputId || null,
  outputs: (snapshot?.outputs || []).map((output) => ({
    ...output,
    program: output?.program || null,
    previewProgram: output?.previewProgram || null,
  })),
  integrations: snapshot?.integrations || {},
  entries: (snapshot?.entries || []).map((entry) => buildPersistedEntry(entry)),
  timers: (snapshot?.timers || []).map((timer) => buildPersistedTimer(timer)),
});

export const buildProjectSignature = ({ snapshot, sourceLibrary, selectedSourceId }) =>
  JSON.stringify({
    state: buildProjectDirtyShape(snapshot),
    sources: {
      selectedSourceId: selectedSourceId || null,
      items: normalizeSourceLibrary(sourceLibrary || []).map((source) => ({
        id: source.id,
        name: source.name,
        delimiter: source.delimiter,
        linkedTimerId: source.linkedTimerId || null,
        linkedTimerByOutput: source.linkedTimerByOutput || {},
        columns: source.columns || [],
        rows: source.remote ? [] : source.rows || [],
        remote: source.remote
          ? {
              type: source.remote.type || 'csv-url',
              url: source.remote.url || '',
              sheetName: source.remote.sheetName || '',
              autoRefresh: Boolean(source.remote.autoRefresh),
              refreshIntervalSec: Number(source.remote.refreshIntervalSec || 30),
            }
          : null,
      })),
    },
  });

export const buildProjectDocumentPayload = ({
  exportedState,
  projectName,
  appVersion,
  selectedSourceId,
  sourceLibrary,
  vmixState,
  updatedAt = new Date().toISOString(),
}) => ({
  version: 1,
  meta: {
    name: projectName,
    updatedAt,
    appVersion: appVersion || null,
  },
  state: exportedState || {},
  sources: {
    selectedSourceId: selectedSourceId || null,
    items: sourceLibrary || [],
  },
  runtime: {
    vmix: vmixState
      ? {
          connected: Boolean(vmixState.connected),
          host: vmixState.config?.host || vmixState.host || '',
          lastUpdatedAt: vmixState.lastUpdatedAt || null,
          error: vmixState.error || '',
          inputs: Array.isArray(vmixState.inputs)
            ? vmixState.inputs.map((input) => ({
                key: input.key ?? '',
                number: input.number ?? '',
                type: input.type ?? '',
                title: input.title ?? '',
                shortTitle: input.shortTitle ?? '',
                textFields: Array.isArray(input.textFields)
                  ? input.textFields.map((field) => ({
                      index: field.index ?? '',
                      name: field.name ?? '',
                      value: field.value ?? '',
                    }))
                  : [],
              }))
            : [],
        }
      : null,
  },
});

export const getSuggestedProjectName = (projectName) =>
  (projectName || 'WebTitleProject').replace(/[<>:"/\\|?*]+/g, ' ').trim() || 'WebTitleProject';

export const buildWindowTitle = (projectName, dirty) => {
  const cleanProjectName = projectName && projectName !== 'Unsaved Project' ? projectName : null;
  const dirtyMarker = dirty ? ' *' : '';
  return cleanProjectName
    ? `${cleanProjectName}${dirtyMarker} - Web Title Pro`
    : `Web Title Pro${dirtyMarker}`;
};
