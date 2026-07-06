import { EventEmitter } from 'node:events';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';
import { applyRowToFields, buildEffectiveEntryFieldMap } from './field-mapping.js';
import { normalizeAccess, normalizeGrant, publicGrant, hasCapability } from './access.js';

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const formatTimer = (milliseconds, displayFormat = 'mm:ss') => {
  const safeMilliseconds = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(safeMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (displayFormat === 'hh:mm:ss') {
    const normalizedMinutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(normalizedMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  if (displayFormat === 'ss') {
    return String(totalSeconds).padStart(2, '0');
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const createDefaultProgram = () => ({
  entryId: null,
  templateId: null,
  entryName: 'No title loaded',
  templateName: 'No template',
  visible: false,
  lastAction: 'IDLE',
  revision: 0,
  updatedAt: new Date().toISOString(),
  fields: {},
  fieldStyles: {},
});

const normalizeFieldStyleValue = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const fontFamily = typeof value.fontFamily === 'string' ? value.fontFamily.trim() : '';
  const fontSourcePath = typeof value.fontSourcePath === 'string' ? value.fontSourcePath.trim() : '';
  const fontSize = Number.parseInt(value.fontSize ?? '', 10);
  const color = typeof value.color === 'string' ? value.color.trim() : '';

  return {
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontSourcePath ? { fontSourcePath } : {}),
    ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize } : {}),
    ...(color ? { color } : {}),
  };
};

const buildLocalFieldStyles = (template, existingStyles = {}) => {
  const safeStyles = existingStyles && typeof existingStyles === 'object' && !Array.isArray(existingStyles)
    ? existingStyles
    : {};

  return Object.fromEntries(
    (template?.fields || [])
      .map((field) => [field.name, normalizeFieldStyleValue(safeStyles[field.name])])
      .filter(([, style]) => Object.keys(style).length > 0),
  );
};

const buildVmixFieldDefinitions = (entry = {}) => {
  const fieldMap = Array.isArray(entry.vmixFieldMap) ? entry.vmixFieldMap : [];

  if (fieldMap.length) {
    return fieldMap.map((field, index) => ({
      name: field.name || `field_${index + 1}`,
      label: field.label || field.vmixFieldName || field.name || `Field ${index + 1}`,
      defaultValue: '',
    }));
  }

  return Object.keys(entry.fields || {}).map((name) => ({
    name,
    label: name,
    defaultValue: '',
  }));
};

const buildLocalFieldMap = (template, existingMap = []) => {
  const mapByName = new Map(
    Array.isArray(existingMap)
      ? existingMap
          .filter((item) => item && item.name)
          .map((item) => [
            item.name,
            {
              ...item,
              sourceColumnIndex: Number.isInteger(item.sourceColumnIndex)
                ? item.sourceColumnIndex
                : Number.parseInt(item.sourceColumnIndex ?? '', 10),
            },
          ])
      : [],
  );

  return (template?.fields || []).map((field, index) => {
    const existing = mapByName.get(field.name);
    const parsedIndex = Number.isInteger(existing?.sourceColumnIndex)
      ? existing.sourceColumnIndex
      : Number.parseInt(existing?.sourceColumnIndex ?? '', 10);

    return {
      name: field.name,
      label: field.label || field.name || `Field ${index + 1}`,
      sourceColumnIndex: Number.isFinite(parsedIndex) ? parsedIndex : index,
    };
  });
};

const VMIX_ACTIONS = new Set(['TransitionIn', 'TransitionOut', 'none']);
const LEGACY_VMIX_ACTIONS = new Map([
  ['TitleBeginAnimation', 'TransitionIn'],
  ['TitleEndAnimation', 'TransitionOut'],
]);
const normalizeVmixAction = (value, fallback) => {
  const normalizedValue = LEGACY_VMIX_ACTIONS.get(value) || value;
  const normalizedFallback = LEGACY_VMIX_ACTIONS.get(fallback) || fallback;
  return VMIX_ACTIONS.has(normalizedValue) ? normalizedValue : normalizedFallback;
};

const normalizeEntryShortcuts = (shortcuts = {}) => ({
  show: typeof shortcuts.show === 'string' ? shortcuts.show : '',
  live: typeof shortcuts.live === 'string' ? shortcuts.live : '',
  hide: typeof shortcuts.hide === 'string' ? shortcuts.hide : '',
});

const normalizeBooleanMap = (value) =>
  value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value)
          .filter(([, raw]) => raw === true || raw === 'true')
          .map(([key]) => [key, true]),
      )
    : {};

// Shortcut model (v2): one keypress = one concrete command.
//   outputs[<id>] — a full command set bound to a specific output.
//   timers[<id>]  — start/stop/reset bound to a specific timer.
//   global        — app-wide commands (panic).
//   globalActions — which canonical action ids also register as OS-global.
// The legacy flat model (show/live/hide/outputSelectById/entrySelectById/...)
// is intentionally dropped: it has no 1:1 mapping onto per-output commands, so
// old keyboard bindings reset on load (titles/timers/project data untouched).
const OUTPUT_COMMAND_KEYS = [
  'titleIn',
  'titleOut',
  'previewIn',
  'previewOut',
  'rowPrev',
  'rowNext',
  'timerStart',
  'timerStop',
  'timerReset',
];
const TIMER_COMMAND_KEYS = ['start', 'stop', 'reset'];
const GLOBAL_COMMAND_KEYS = ['allOutputsOut'];

const normalizeCommandMap = (value, keys) => {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(
    keys.map((key) => [key, typeof source[key] === 'string' ? source[key] : '']),
  );
};

const normalizeNestedCommandMap = (value, keys) =>
  value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value).map(([id, commands]) => [id, normalizeCommandMap(commands, keys)]),
      )
    : {};

// Plugin command ids are dynamic (declared by each plugin), so keep every
// string binding rather than a fixed key set.
const normalizeDynamicNestedMap = (value) =>
  value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value)
          .filter(([, commands]) => commands && typeof commands === 'object')
          .map(([id, commands]) => [
            id,
            Object.fromEntries(Object.entries(commands).filter(([, v]) => typeof v === 'string' && v)),
          ]),
      )
    : {};

const normalizeGlobalShortcuts = (shortcuts = {}) => ({
  outputs: normalizeNestedCommandMap(shortcuts.outputs, OUTPUT_COMMAND_KEYS),
  timers: normalizeNestedCommandMap(shortcuts.timers, TIMER_COMMAND_KEYS),
  plugins: normalizeDynamicNestedMap(shortcuts.plugins),
  global: normalizeCommandMap(shortcuts.global, GLOBAL_COMMAND_KEYS),
  globalActions: normalizeBooleanMap(shortcuts.globalActions),
});

// --- Data-source library (server-owned, model v2) --------------------------
// The data-source library (rows for lower thirds) used to live in one browser
// tab's localStorage, so the server could not see or drive it. It now lives
// here in state so the snapshot exposes it to every client, MIDI, Companion
// and future plugins. This mirrors the client normaliser in
// client/src/source-library.js, but uses nanoid and no browser APIs.
const normalizeSourceLinkedTimerId = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeSourceLinkedTimerMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, timerId]) => [String(key).trim(), normalizeSourceLinkedTimerId(timerId)])
      .filter(([key, timerId]) => key && timerId),
  );
};

const normalizeSourceRemoteConfig = (remote) => {
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return null;
  const refreshIntervalSec = Number.parseInt(remote.refreshIntervalSec ?? '', 10);
  return {
    type: typeof remote.type === 'string' ? remote.type : 'google-sheets',
    url: typeof remote.url === 'string' ? remote.url.trim() : '',
    sheetName: typeof remote.sheetName === 'string' ? remote.sheetName : '',
    sheetNames: Array.isArray(remote.sheetNames)
      ? remote.sheetNames.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    autoRefresh: Boolean(remote.autoRefresh),
    refreshIntervalSec:
      Number.isFinite(refreshIntervalSec) && refreshIntervalSec > 0 ? refreshIntervalSec : 30,
    lastFetchedAt: remote.lastFetchedAt || null,
    lastError: remote.lastError || null,
    lastResolvedUrl: typeof remote.lastResolvedUrl === 'string' ? remote.lastResolvedUrl.trim() : '',
  };
};

const normalizeSourceRow = (row = {}, index = 0) => ({
  id: row.id || `${nanoid(10)}-${index}`,
  index: Number(row.index) || index + 1,
  values: Array.isArray(row.values) ? row.values.map((value) => (value == null ? '' : String(value))) : [],
  label:
    row.label ||
    (Array.isArray(row.values) ? row.values : []).filter(Boolean).slice(0, 2).join(' | ') ||
    `Row ${index + 1}`,
  timer: {
    baseMs: Number(row.timer?.baseMs ?? 0),
    format: row.timer?.format || 'mm:ss',
  },
});

const normalizeSourceColumn = (column = {}, index = 0) => ({
  id: column.id || `col-${index}`,
  label: typeof column.label === 'string' ? column.label : `Column ${index + 1}`,
});

const normalizeSources = (library = []) =>
  (Array.isArray(library) ? library : []).map((source, sourceIndex) => ({
    id: source.id || nanoid(10),
    name: typeof source.name === 'string' && source.name.trim() ? source.name : `Source ${sourceIndex + 1}`,
    delimiter: typeof source.delimiter === 'string' ? source.delimiter : ',',
    createdAt: source.createdAt || new Date().toISOString(),
    linkedTimerId: normalizeSourceLinkedTimerId(source.linkedTimerId),
    linkedTimerByOutput: normalizeSourceLinkedTimerMap(source.linkedTimerByOutput),
    remote: normalizeSourceRemoteConfig(source.remote),
    columns: (source.columns || []).map((column, index) => normalizeSourceColumn(column, index)),
    rows: (source.rows || []).map((row, index) => normalizeSourceRow(row, index)),
  }));

const slugifyOutputKey = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

const buildSyncGroupId = (outputId) => `sync-${outputId}`;

const normalizeAppliedRow = (appliedRow) => {
  if (!appliedRow || typeof appliedRow !== 'object') return null;
  const sourceId = typeof appliedRow.sourceId === 'string' ? appliedRow.sourceId : '';
  const rowId = typeof appliedRow.rowId === 'string' ? appliedRow.rowId : '';
  return sourceId && rowId ? { sourceId, rowId } : null;
};

const createOutput = (
  { id, name, key, selectedEntryId = null, program, previewProgram, syncGroupId, appliedRow } = {},
  index = 1,
) => {
  const fallbackName = `OUTPUT ${index}`;
  const fallbackKey = index === 1 ? 'main' : `output-${index}`;
  const outputId = id || nanoid(10);

  return {
    id: outputId,
    name: name?.trim() || fallbackName,
    key: slugifyOutputKey(key || name || fallbackKey) || fallbackKey,
    syncGroupId: syncGroupId || buildSyncGroupId(outputId),
    selectedEntryId,
    // Which data-source row is currently applied to this output. Server-owned
    // so MIDI / Companion / plugins can resolve "current row" and, via the
    // source's linked timer, "current timer" for this output.
    appliedRow: normalizeAppliedRow(appliedRow),
    program: {
      ...createDefaultProgram(),
      ...(program || {}),
    },
    previewProgram: {
      ...createDefaultProgram(),
      ...(previewProgram || {}),
    },
  };
};

const normalizeTimer = (timer = {}) => ({
  id: timer.id,
  name: timer.name?.trim() || 'New Timer',
  mode: timer.mode === 'countup' ? 'countup' : 'countdown',
  durationMs: Number(timer.durationMs ?? 30000),
  valueMs:
    timer.valueMs !== undefined
      ? Number(timer.valueMs)
      : timer.mode === 'countup'
        ? 0
        : Number(timer.durationMs ?? 30000),
  running: Boolean(timer.running),
  startedAt: timer.startedAt || null,
  sourceType: timer.sourceType === 'vmix' ? 'vmix' : 'local',
  targetOutputId: timer.targetOutputId || null,
  targetTemplateId: timer.targetTemplateId || null,
  targetTimerId: timer.targetTimerId || timer.id || null,
  vmixInputKey: timer.vmixInputKey || null,
  vmixTextField: timer.vmixTextField?.trim() || 'Text',
  displayFormat: ['hh:mm:ss', 'mm:ss', 'ss'].includes(timer.displayFormat) ? timer.displayFormat : 'mm:ss',
  defaultColor: typeof timer.defaultColor === 'string' && timer.defaultColor.trim() ? timer.defaultColor.trim() : '',
  colorTriggers: Array.isArray(timer.colorTriggers)
    ? timer.colorTriggers
        .map((trigger, index) => ({
          id: trigger.id || `trigger-${index + 1}`,
          atMs: Math.max(0, Number(trigger.atMs || 0)),
          color: typeof trigger.color === 'string' && trigger.color.trim() ? trigger.color.trim() : '',
        }))
        .filter((trigger) => trigger.color)
    : [],
});

export const resolveTimerColor = (timer, currentMs) => {
  if (!timer) {
    return '';
  }

  const defaultColor = typeof timer.defaultColor === 'string' ? timer.defaultColor : '';
  const triggers = Array.isArray(timer.colorTriggers) ? timer.colorTriggers : [];

  if (!triggers.length) {
    return defaultColor;
  }

  const value = Number(currentMs ?? timer.valueMs ?? 0);

  if (timer.mode === 'countup') {
    const sortedAsc = [...triggers].sort((a, b) => Number(a.atMs || 0) - Number(b.atMs || 0));
    let chosen = '';
    for (const trigger of sortedAsc) {
      if (value >= Number(trigger.atMs || 0)) {
        chosen = trigger.color;
      } else {
        break;
      }
    }
    return chosen || defaultColor;
  }

  const sortedAsc = [...triggers].sort((a, b) => Number(a.atMs || 0) - Number(b.atMs || 0));
  for (const trigger of sortedAsc) {
    if (value <= Number(trigger.atMs || 0)) {
      return trigger.color;
    }
  }
  return defaultColor;
};

const createDefaultState = () => ({
  selectedEntryId: null,
  selectedOutputId: null,
  outputs: [createOutput({ id: 'output-main', name: 'OUTPUT 1', key: 'main' }, 1)],
  integrations: {
    vmix: {
      host: 'http://127.0.0.1:8088',
      selectedTimerInputKey: null,
    },
    updates: {
      repoUrl: 'https://github.com/perogello/Web-Title-Pro',
      channel: 'stable',
      fixedRepo: true,
      lastCheckAt: null,
      latestVersion: null,
      available: false,
      status: 'idle',
      notes: 'Automatic update checks use the built-in GitHub repository.',
    },
    shortcuts: normalizeGlobalShortcuts(),
    midi: {
      bindings: [],
    },
  },
  program: createDefaultProgram(),
  entries: [],
  sources: [],
  // Capability grants for external surfaces (plugins). App-level, not project
  // data: stripped from project export so tokens never travel in a bundle.
  access: { grants: [] },
  // Per-plugin enabled state + settings (keyed by plugin id). App-level too:
  // references a grant by id, so it never leaves the machine in a project.
  plugins: { installed: {} },
  // Plugin render overlays currently on air (each { pluginId, url }). Transient
  // render state, shown in the snapshot so the renderer composites them.
  overlays: [],
  timers: [
    {
      id: 'main',
      name: 'Main Timer',
      mode: 'countdown',
      durationMs: 30000,
      valueMs: 30000,
      running: false,
      startedAt: null,
      sourceType: 'local',
      targetTemplateId: null,
      targetTimerId: 'main',
      vmixInputKey: null,
      vmixTextField: 'Text',
    },
  ],
});

const buildProjectState = (incoming = {}, { preserveAccess = false } = {}) => {
  const baseState = createDefaultState();
  const outputs =
    incoming?.outputs?.length
      ? incoming.outputs.map((output, index) => createOutput(output, index + 1))
      : baseState.outputs.map((output, index) => createOutput(output, index + 1));

  return {
    ...baseState,
    ...incoming,
    selectedOutputId: incoming?.selectedOutputId || outputs[0]?.id || null,
    outputs,
    integrations: {
      ...baseState.integrations,
      ...(incoming?.integrations || {}),
      vmix: {
        ...baseState.integrations.vmix,
        ...(incoming?.integrations?.vmix || {}),
      },
      updates: {
        ...baseState.integrations.updates,
        ...(incoming?.integrations?.updates || {}),
      },
      shortcuts: {
        ...baseState.integrations.shortcuts,
        ...normalizeGlobalShortcuts(incoming?.integrations?.shortcuts || {}),
      },
      midi: {
        ...baseState.integrations.midi,
        ...(incoming?.integrations?.midi || {}),
        bindings: Array.isArray(incoming?.integrations?.midi?.bindings)
          ? incoming.integrations.midi.bindings
          : baseState.integrations.midi.bindings,
      },
    },
    program: {
      ...baseState.program,
      ...(incoming?.program || {}),
    },
    timers: incoming?.timers?.length ? incoming.timers.map((timer) => normalizeTimer(timer)) : baseState.timers,
    entries: Array.isArray(incoming?.entries) ? incoming.entries : [],
    sources: normalizeSources(incoming?.sources),
    // Grants persist across restarts (disk load) but are never adopted from an
    // imported/shared project — a project file must not inject access tokens.
    access: preserveAccess ? normalizeAccess(incoming?.access) : { grants: [] },
    plugins: preserveAccess ? normalizePlugins(incoming?.plugins) : { installed: {} },
    overlays: [],
  };
};

const normalizePlugins = (plugins) => {
  const installed = plugins?.installed && typeof plugins.installed === 'object' ? plugins.installed : {};
  const out = {};
  for (const [id, entry] of Object.entries(installed)) {
    if (!id || typeof entry !== 'object' || !entry) continue;
    out[id] = {
      enabled: Boolean(entry.enabled),
      settings: entry.settings && typeof entry.settings === 'object' ? entry.settings : {},
      grantId: typeof entry.grantId === 'string' ? entry.grantId : null,
      // The plugin's own content model (bingo board, scores, …). Owned and
      // persisted by the plugin, broadcast to all its surfaces over WS.
      data: entry.data && typeof entry.data === 'object' ? entry.data : {},
    };
  }
  return { installed: out };
};

export class TitleStore extends EventEmitter {
  constructor({ stateFile, templateService }) {
    super();
    this.stateFile = stateFile;
    this.templateService = templateService;
    this.state = createDefaultState();
    this.persistTimer = null;
    this.persistInFlight = null;
    this.persistPending = false;
    this.isClosing = false;
  }

  async init() {
    await fs.ensureFile(this.stateFile);
    await this.refreshTemplates();

    try {
      const existing = await fs.readJson(this.stateFile);
      this.state = buildProjectState(existing, { preserveAccess: true });
    } catch {
      // A state file the current version cannot parse must not be silently
      // overwritten by the default state — quarantine it first so the
      // operator's data survives a broken update and can be recovered.
      try {
        const raw = await fs.readFile(this.stateFile, 'utf8');
        if (raw.trim()) {
          await fs.copy(this.stateFile, `${this.stateFile}.corrupt-${Date.now()}.bak`);
        }
      } catch {}
      this.state = createDefaultState();
    }

    this.reconcileEntries();

    if (!this.state.entries.length) {
      this.seedExampleEntries();
    }

    this.ensureOutputsConsistent();
    await this.persist();
  }

  async refreshTemplates() {
    await this.templateService.scanTemplates();
  }

  touch() {
    this.schedulePersist();
    this.emit('change', this.getSnapshot());
  }

  schedulePersist() {
    if (this.isClosing) {
      return;
    }

    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.triggerPersist();
    }, 120);
  }

  // Persist coalescing: if a write is already in flight, just flag that
  // another one is needed when the current one finishes. Without this,
  // a burst of mutations that completes faster than fs.writeJson + fs.move
  // would launch parallel writes against the same .tmp file and could
  // truncate it mid-stream — state.json on disk stays valid (atomic move),
  // but the in-flight tmp file gets corrupted.
  triggerPersist() {
    if (this.persistInFlight) {
      this.persistPending = true;
      return;
    }

    this.persistInFlight = (async () => {
      try {
        await this.persist();
      } catch (error) {
        console.error('Persist failed:', error);
      } finally {
        this.persistInFlight = null;
        if (this.persistPending) {
          this.persistPending = false;
          this.triggerPersist();
        }
      }
    })();
  }

  async persist() {
    const tmpFile = `${this.stateFile}.tmp`;
    await fs.writeJson(tmpFile, this.state, { spaces: 2 });
    await fs.move(tmpFile, this.stateFile, { overwrite: true });
  }

  async close() {
    this.isClosing = true;

    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    // Wait for any in-flight persist to settle before doing the final one,
    // otherwise we could race the closing write against the deferred one.
    if (this.persistInFlight) {
      try { await this.persistInFlight; } catch {}
    }

    await this.persist();
  }

  exportProjectState() {
    // Access grants and plugin state are app-level (credentials / local
    // config), not project data — never let them leave the machine inside an
    // exported/shared project.
    const { access, plugins, overlays, ...rest } = this.state;
    return deepClone(rest);
  }

  async loadProjectState(nextState = {}, { seedExamples = false } = {}) {
    this.state = buildProjectState(nextState);
    this.reconcileEntries();

    if (seedExamples && !this.state.entries.length) {
      this.seedExampleEntries();
    }

    this.ensureOutputsConsistent();
    await this.persist();
    this.emit('change', this.getSnapshot());
    return this.getSnapshot();
  }

  getTemplateMap() {
    return new Map(this.templateService.getTemplates().map((template) => [template.id, template]));
  }

  getTemplate(templateId) {
    return this.templateService.getTemplate(templateId);
  }

  buildEntryFields(template, incomingFields = {}) {
    const resolvedFields = {};

    for (const field of template?.fields || []) {
      resolvedFields[field.name] = incomingFields[field.name] ?? field.defaultValue ?? '';
    }

    for (const [key, value] of Object.entries(incomingFields)) {
      if (!(key in resolvedFields)) {
        resolvedFields[key] = value;
      }
    }

    return resolvedFields;
  }

  buildEntryName(template) {
    const count = this.state.entries.filter((entry) => entry.templateId === template.id).length + 1;
    return `${template.name} ${String(count).padStart(2, '0')}`;
  }

  getEntry(entryId) {
    return this.state.entries.find((entry) => entry.id === entryId) || null;
  }

  getEntryPresentation(entry) {
    if (!entry) {
      return {
        templateId: null,
        templateName: 'No template',
        templateFields: [],
        templateTimers: [],
      };
    }

    if (entry.entryType === 'vmix') {
      return {
        templateId: null,
        templateName: entry.vmixInputTitle || 'vMix Title',
        templateFields: buildVmixFieldDefinitions(entry),
        templateTimers: [],
      };
    }

    const template = this.getTemplate(entry.templateId);
    return {
      templateId: entry.templateId,
      templateName: template?.name || 'Missing template',
      templateFields: template?.fields || [],
      templateTimers: template?.timers || [],
    };
  }

  reconcileEntries() {
    const templates = this.getTemplateMap();

    this.state.entries = this.state.entries.map(({ hidden: _hidden, ...entry }) => {
      if (entry.entryType === 'vmix') {
        return {
          ...entry,
          templateId: null,
          fields: this.buildEntryFields(null, entry.fields || {}),
          vmixInputNumber: entry.vmixInputNumber || null,
          vmixShowAction: normalizeVmixAction(entry.vmixShowAction, 'TransitionIn'),
          vmixHideAction: normalizeVmixAction(entry.vmixHideAction, 'TransitionOut'),
          shortcuts: normalizeEntryShortcuts(entry.shortcuts),
          missingTemplate: false,
        };
      }

      const template = templates.get(entry.templateId);

      if (!template) {
        return {
          ...entry,
          missingTemplate: true,
        };
      }

      return {
        ...entry,
        shortcuts: normalizeEntryShortcuts(entry.shortcuts),
        missingTemplate: false,
        fields: this.buildEntryFields(template, entry.fields),
        localFieldMap: buildLocalFieldMap(template, entry.localFieldMap),
        fieldStyles: buildLocalFieldStyles(template, entry.fieldStyles),
      };
    });
  }

  seedExampleEntries() {
    const templates = this.templateService.getTemplates();

    for (const template of templates) {
      this.state.entries.push({
        id: nanoid(10),
        templateId: template.id,
        name: this.buildEntryName(template),
        fields: this.buildEntryFields(template),
        fieldStyles: buildLocalFieldStyles(template, {}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        missingTemplate: false,
      });
    }
  }

  ensureUniqueOutputKey(candidate, excludeId = null) {
    const baseKey = slugifyOutputKey(candidate) || 'output';
    const takenKeys = new Set(this.state.outputs.filter((output) => output.id !== excludeId).map((output) => output.key));

    if (!takenKeys.has(baseKey)) {
      return baseKey;
    }

    let counter = 2;
    while (takenKeys.has(`${baseKey}-${counter}`)) {
      counter += 1;
    }

    return `${baseKey}-${counter}`;
  }

  ensureOutputsConsistent() {
    if (!this.state.outputs.length) {
      this.state.outputs = [createOutput({ id: 'output-main', name: 'OUTPUT 1', key: 'main' }, 1)];
    }

    this.state.outputs = this.state.outputs.map((output, index) => {
      const nextOutput = createOutput(output, index + 1);
      const selectedEntryExists = this.state.entries.some((entry) => entry.id === nextOutput.selectedEntryId);
      nextOutput.selectedEntryId = nextOutput.selectedEntryId && selectedEntryExists ? nextOutput.selectedEntryId : null;
      nextOutput.key = this.ensureUniqueOutputKey(nextOutput.key || nextOutput.name || `output-${index + 1}`, nextOutput.id);

      const programEntryExists = this.state.entries.some((entry) => entry.id === nextOutput.program.entryId);

      if (!programEntryExists) {
        nextOutput.program = createDefaultProgram();
      }

      // Bootstrap program from selected entry only when nothing is loaded yet
      // (no entryId on program). vMix entries legitimately have templateId === null,
      // so we cannot use templateId as the 'is program loaded' signal — that would
      // overwrite ON AIR/last-action every reconcile pass for vMix titles.
      if (!nextOutput.program.entryId && nextOutput.selectedEntryId) {
        const entry = this.state.entries.find((item) => item.id === nextOutput.selectedEntryId);
        const presentation = this.getEntryPresentation(entry);

        nextOutput.program = {
          entryId: entry?.id || null,
          templateId: presentation.templateId,
          entryName: entry?.name || 'No title loaded',
          templateName: presentation.templateName,
          visible: false,
          lastAction: 'LOAD',
          revision: (nextOutput.program.revision || 0) + 1,
          updatedAt: new Date().toISOString(),
          fields: deepClone(entry?.fields || {}),
          fieldStyles: deepClone(entry?.fieldStyles || {}),
        };
      }

      return nextOutput;
    });

    if (!this.state.outputs.some((output) => output.id === this.state.selectedOutputId)) {
      this.state.selectedOutputId = this.state.outputs[0]?.id || null;
    }

    const selectedOutput = this.getSelectedOutput();
    this.state.selectedEntryId = selectedOutput?.selectedEntryId || null;
    this.state.program = deepClone(selectedOutput?.program || createDefaultProgram());
  }

  getEntries() {
    return this.state.entries.map((entry) => {
      const presentation = this.getEntryPresentation(entry);

      return {
        ...deepClone(entry),
        templateName: presentation.templateName,
        templateFields: presentation.templateFields,
        templateTimers: presentation.templateTimers,
        hasTimer: Array.isArray(presentation.templateTimers) && presentation.templateTimers.length > 0,
      };
    });
  }

  getOutputByRef(outputRef = this.state.selectedOutputId) {
    return this.state.outputs.find((output) => output.id === outputRef || output.key === outputRef) || null;
  }

  getSelectedOutput() {
    return this.getOutputByRef(this.state.selectedOutputId);
  }

  getSelectedEntry(outputId = this.state.selectedOutputId) {
    const output = this.getOutputByRef(outputId);
    return this.state.entries.find((entry) => entry.id === output?.selectedEntryId) || null;
  }

  getProgram(outputId = this.state.selectedOutputId) {
    const output = this.getOutputByRef(outputId);
    return deepClone(output?.program || createDefaultProgram());
  }

  getPreviewProgram(outputId = this.state.selectedOutputId) {
    const output = this.getOutputByRef(outputId);
    return deepClone(output?.previewProgram || createDefaultProgram());
  }

  getVmixConfig() {
    return deepClone(this.state.integrations.vmix);
  }

  updateVmixConfig(patch = {}) {
    this.state.integrations.vmix = {
      ...this.state.integrations.vmix,
      ...patch,
    };
    this.touch();
    return this.getVmixConfig();
  }

  getUpdateConfig() {
    return deepClone(this.state.integrations.updates);
  }

  updateUpdateConfig(patch = {}) {
    this.state.integrations.updates = {
      ...this.state.integrations.updates,
      ...patch,
    };
    this.touch();
    return this.getUpdateConfig();
  }

  getNavigationShortcuts() {
    // Always return the v2 shape, migrating any legacy flat bindings that may
    // still be sitting in loaded state (old projects) on the way out.
    return normalizeGlobalShortcuts(this.state.integrations.shortcuts || {});
  }

  getMidiBindings() {
    return deepClone(this.state.integrations.midi?.bindings || []);
  }

  updateMidiBindings(bindings = []) {
    this.state.integrations.midi = {
      ...(this.state.integrations.midi || {}),
      bindings: Array.isArray(bindings) ? deepClone(bindings) : [],
    };
    this.touch();
    return this.getMidiBindings();
  }

  updateNavigationShortcuts(patch = {}) {
    const current = normalizeGlobalShortcuts(this.state.integrations.shortcuts || {});
    const patchObj = patch && typeof patch === 'object' ? patch : {};

    // Per-id blocks (outputs/timers) merge at the command level so a patch for
    // one output's single command never wipes its other commands or siblings.
    const mergeNested = (field) => {
      const next = { ...(current[field] || {}) };
      const incoming = patchObj[field] && typeof patchObj[field] === 'object' ? patchObj[field] : {};
      for (const [id, commands] of Object.entries(incoming)) {
        if (commands && typeof commands === 'object') {
          next[id] = { ...(next[id] || {}), ...commands };
        }
      }
      return next;
    };
    const mergeFlat = (field) => ({
      ...(current[field] || {}),
      ...((patchObj[field] && typeof patchObj[field] === 'object' && patchObj[field]) || {}),
    });

    this.state.integrations.shortcuts = normalizeGlobalShortcuts({
      outputs: mergeNested('outputs'),
      timers: mergeNested('timers'),
      plugins: mergeNested('plugins'),
      global: mergeFlat('global'),
      globalActions: mergeFlat('globalActions'),
    });
    this.touch();
    return this.getNavigationShortcuts();
  }

  getTimers(now = Date.now()) {
    return this.state.timers.map((timer) => {
      const currentMs = this.getTimerCurrentValue(timer, now);

      return {
        ...deepClone(timer),
        currentMs,
        display: formatTimer(currentMs, timer.displayFormat),
        color: resolveTimerColor(timer, currentMs),
      };
    });
  }

  getTimerUpdate(now = Date.now()) {
    return {
      serverTime: now,
      timers: this.getTimers(now),
    };
  }

  getTimerCurrentValue(timer, now = Date.now()) {
    if (!timer.running || !timer.startedAt) {
      return timer.valueMs;
    }

    const elapsed = now - new Date(timer.startedAt).valueOf();

    if (timer.mode === 'countup') {
      return timer.valueMs + elapsed;
    }

    return Math.max(0, timer.valueMs - elapsed);
  }

  getSnapshot() {
    const selectedOutput = this.getSelectedOutput();
    const selectedEntry = this.getSelectedEntry();
    const entries = this.getEntries();
    const selectedEntryView = selectedEntry ? entries.find((entry) => entry.id === selectedEntry.id) || selectedEntry : null;

    return {
      serverTime: Date.now(),
      integrations: deepClone(this.state.integrations),
      templates: this.templateService.getTemplates(),
      entries,
      outputs: deepClone(this.state.outputs),
      selectedOutputId: this.state.selectedOutputId,
      selectedOutput,
      selectedEntryId: selectedOutput?.selectedEntryId || null,
      selectedEntry: selectedEntryView,
      program: this.getProgram(),
      previewProgram: this.getPreviewProgram(),
      timers: this.getTimers(),
      sources: this.getSources(),
      overlays: deepClone(this.state.overlays || []),
    };
  }

  // Plugin overlays on air. `setOverlayOnAir(id, url)` shows it; `(id, null)`
  // hides it. The renderer composites whatever is in the snapshot's `overlays`.
  getOverlays() {
    return deepClone(this.state.overlays || []);
  }

  setOverlayOnAir(pluginId, url) {
    if (!Array.isArray(this.state.overlays)) this.state.overlays = [];
    const without = this.state.overlays.filter((item) => item.pluginId !== pluginId);
    this.state.overlays = url ? [...without, { pluginId, url }] : without;
    this.emit('change', this.getSnapshot());
    return this.getOverlays();
  }

  getSources() {
    return deepClone(this.state.sources || []);
  }

  // Replace the whole data-source library. The control panel is the editor and
  // pushes the full library (debounced); the server stores + broadcasts it so
  // every other client/plugin/MIDI sees the same data.
  replaceSources(library = []) {
    this.state.sources = normalizeSources(library);
    this.touch();
    return this.getSources();
  }

  // --- Access grants (capability model for plugins) ------------------------
  // Kept out of getSnapshot() so raw tokens are never broadcast over WS.

  #ensureAccess() {
    if (!this.state.access || typeof this.state.access !== 'object') {
      this.state.access = { grants: [] };
    }
    if (!Array.isArray(this.state.access.grants)) {
      this.state.access.grants = [];
    }
    return this.state.access;
  }

  // Public view for UIs: grants without their raw token (only a preview).
  listAccessGrants() {
    return this.#ensureAccess().grants.map((grant) => publicGrant(grant));
  }

  // Create a grant and return it *with* its raw token — the only time the token
  // is exposed, so the operator can hand it to the plugin/client.
  createAccessGrant({ name, capabilities } = {}) {
    const access = this.#ensureAccess();
    const grant = normalizeGrant({ name, capabilities });
    access.grants.push(grant);
    this.touch();
    return grant;
  }

  updateAccessGrant(id, { name, capabilities } = {}) {
    const access = this.#ensureAccess();
    const grant = access.grants.find((item) => item.id === id);
    if (!grant) {
      throw new Error('Grant not found.');
    }
    const next = normalizeGrant({ ...grant, name: name ?? grant.name, capabilities: capabilities ?? grant.capabilities });
    Object.assign(grant, next);
    this.touch();
    return publicGrant(grant);
  }

  revokeAccessGrant(id) {
    const access = this.#ensureAccess();
    const before = access.grants.length;
    access.grants = access.grants.filter((item) => item.id !== id);
    if (access.grants.length !== before) {
      this.touch();
    }
    return { ok: true, removed: before - access.grants.length };
  }

  // Internal: resolve a raw token to its grant (used by the plugin bridge to
  // authorize). Records last use. Returns null for unknown/empty tokens.
  resolveGrantByToken(token) {
    if (!token) return null;
    const grant = this.#ensureAccess().grants.find((item) => item.token === token);
    if (!grant) return null;
    grant.lastUsedAt = Date.now();
    this.schedulePersist();
    return grant;
  }

  grantHasCapability(token, capability) {
    return hasCapability(this.resolveGrantByToken(token), capability);
  }

  // --- Plugin registry (enabled state + settings, app-level) ---------------

  #ensurePlugins() {
    if (!this.state.plugins || typeof this.state.plugins !== 'object') {
      this.state.plugins = { installed: {} };
    }
    if (!this.state.plugins.installed || typeof this.state.plugins.installed !== 'object') {
      this.state.plugins.installed = {};
    }
    return this.state.plugins;
  }

  getPluginState(pluginId) {
    const entry = this.#ensurePlugins().installed[pluginId];
    return entry ? { enabled: Boolean(entry.enabled), settings: { ...entry.settings }, grantId: entry.grantId || null } : null;
  }

  listPluginStates() {
    const installed = this.#ensurePlugins().installed;
    return Object.fromEntries(
      Object.entries(installed).map(([id, entry]) => [
        id,
        { enabled: Boolean(entry.enabled), settings: { ...entry.settings }, grantId: entry.grantId || null },
      ]),
    );
  }

  // Enable/disable a plugin. Enabling mints a scoped grant with exactly the
  // plugin's requested capabilities (the bridge enforces it); disabling revokes
  // that grant so a disabled plugin holds no access. Returns { state, token }
  // where token is the raw grant token, exposed only to the trusted host.
  setPluginEnabled(pluginId, enabled, requestedCapabilities = []) {
    const plugins = this.#ensurePlugins();
    const entry = plugins.installed[pluginId] || { enabled: false, settings: {}, grantId: null };
    let token = null;

    if (enabled) {
      if (entry.grantId) {
        // Re-issue a fresh grant to match current requested capabilities.
        this.revokeAccessGrant(entry.grantId);
      }
      const grant = this.createAccessGrant({ name: `plugin:${pluginId}`, capabilities: requestedCapabilities });
      entry.grantId = grant.id;
      entry.enabled = true;
      token = grant.token;
    } else {
      if (entry.grantId) {
        this.revokeAccessGrant(entry.grantId);
      }
      entry.grantId = null;
      entry.enabled = false;
    }

    plugins.installed[pluginId] = entry;
    this.touch();
    return { state: this.getPluginState(pluginId), token };
  }

  updatePluginSettings(pluginId, settings = {}) {
    const plugins = this.#ensurePlugins();
    const entry = plugins.installed[pluginId] || { enabled: false, settings: {}, grantId: null };
    entry.settings = settings && typeof settings === 'object' ? settings : {};
    plugins.installed[pluginId] = entry;
    this.touch();
    return this.getPluginState(pluginId);
  }

  // Forget a plugin entirely (on uninstall): revoke its grant and drop its
  // enabled/settings record so no stale access or config lingers.
  removePluginState(pluginId) {
    const plugins = this.#ensurePlugins();
    const entry = plugins.installed[pluginId];
    if (!entry) return { ok: true, removed: false };
    if (entry.grantId) {
      this.revokeAccessGrant(entry.grantId);
    }
    delete plugins.installed[pluginId];
    this.touch();
    return { ok: true, removed: true };
  }

  // The raw grant token for an enabled plugin (host-only; used to hand the
  // plugin a scoped token or to authorize its bridge calls). Null if disabled.
  getPluginGrantToken(pluginId) {
    const entry = this.#ensurePlugins().installed[pluginId];
    if (!entry?.enabled || !entry.grantId) return null;
    const grant = this.#ensureAccess().grants.find((item) => item.id === entry.grantId);
    return grant ? grant.token : null;
  }

  // --- Plugin content data (the plugin's own model) ------------------------
  // A plugin owns a JSON blob (bingo board, scores, …). It's persisted and
  // broadcast to every surface of that plugin (control panel + on-air overlay +
  // any browser source) so they stay in sync, like a HUD's socket state.

  getPluginData(pluginId) {
    const entry = this.#ensurePlugins().installed[pluginId];
    return entry?.data && typeof entry.data === 'object' ? deepClone(entry.data) : {};
  }

  setPluginData(pluginId, data) {
    const plugins = this.#ensurePlugins();
    const entry = plugins.installed[pluginId] || { enabled: false, settings: {}, grantId: null, data: {} };
    entry.data = data && typeof data === 'object' ? data : {};
    plugins.installed[pluginId] = entry;
    this.schedulePersist();
    // Targeted event: plugin data is not part of the app snapshot, so it gets
    // its own WS channel instead of a full re-broadcast.
    this.emit('plugin-data', { pluginId, data: deepClone(entry.data) });
    return entry.data;
  }

  // Record which data-source row is applied to an output. Set by the control
  // panel whenever it applies a row, so the server can resolve "current row"
  // and "current timer" for MIDI / Companion / plugins.
  setOutputAppliedRow(outputRef, appliedRow) {
    const output = this.getOutputByRef(outputRef);
    if (!output) {
      throw new Error('Output not found.');
    }
    output.appliedRow = normalizeAppliedRow(appliedRow);
    this.touch();
    return deepClone(output.appliedRow);
  }

  // The timer currently driving an output = the timer linked to the output's
  // applied data row (per-output link first, then the source default). Sources
  // are server-owned now, so this resolves without the browser.
  getOutputCurrentTimerId(outputRef) {
    const output = this.getOutputByRef(outputRef);
    const applied = output?.appliedRow;
    if (!applied?.sourceId) return null;
    const source = (this.state.sources || []).find((item) => item.id === applied.sourceId);
    if (!source) return null;
    const perOutput = source.linkedTimerByOutput?.[output.id];
    return normalizeSourceLinkedTimerId(perOutput) || normalizeSourceLinkedTimerId(source.linkedTimerId);
  }

  // Apply a data row to a single output: map the values onto its selected
  // title, record the applied row, and push it to air if the output is live.
  // Returns true if it applied (false when the output has no title to fill).
  #applyRowToSingleOutput(outputId, source, row) {
    const output = this.getOutputByRef(outputId);
    const entry = this.getEntry(output?.selectedEntryId);
    if (!output || !entry) {
      return false;
    }
    const { templateFields } = this.getEntryPresentation(entry);
    if (!templateFields.length) {
      return false;
    }
    const fieldMap = buildEffectiveEntryFieldMap(entry, templateFields);
    const nextFields = applyRowToFields(templateFields, row.values, entry.fields || {}, fieldMap);

    const wasVisible = Boolean(output.program?.visible);
    // updateEntry refreshes the entry (and preview / non-live program), but a
    // live program is intentionally frozen — push it explicitly, mirroring the
    // control panel's apply flow. updateEntry may rebuild the outputs array, so
    // re-fetch the output before writing appliedRow.
    this.updateEntry(entry.id, { fields: nextFields });
    if (wasVisible && entry.entryType !== 'vmix') {
      this.updateProgram(entry.id, output.id);
    }
    const liveOutput = this.getOutputByRef(outputId);
    if (liveOutput) {
      liveOutput.appliedRow = { sourceId: source.id, rowId: row.id };
    }
    return true;
  }

  // Apply a specific data-source row to an output and every output synced with
  // it (same syncGroupId), each using its own title + field mapping. Used by
  // server-side row stepping for MIDI / Companion / plugins so it matches the
  // control panel's synced-output fan-out.
  applyRowToOutput(outputRef, sourceId, rowId) {
    const output = this.getOutputByRef(outputRef);
    if (!output) {
      throw new Error('Output not found.');
    }
    const source = (this.state.sources || []).find((item) => item.id === sourceId);
    const row = source?.rows?.find((item) => item.id === rowId);
    if (!source || !row) {
      throw new Error('Data row not found.');
    }
    if (!this.getEntry(output.selectedEntryId)) {
      throw new Error('No title selected on this output.');
    }

    const syncGroupId = output.syncGroupId;
    const targetOutputIds = syncGroupId
      ? this.state.outputs.filter((item) => item.syncGroupId === syncGroupId).map((item) => item.id)
      : [output.id];

    for (const targetId of targetOutputIds) {
      this.#applyRowToSingleOutput(targetId, source, row);
    }
    this.touch();
    return this.getSnapshot();
  }

  // Step the applied data row up/down for an output and apply the result.
  // direction: 'next' (down / further) or 'previous' (up / higher).
  stepOutputRow(outputRef, direction = 'next') {
    const output = this.getOutputByRef(outputRef);
    if (!output) {
      throw new Error('Output not found.');
    }
    const applied = output.appliedRow;
    const source =
      (applied?.sourceId && (this.state.sources || []).find((item) => item.id === applied.sourceId)) || null;
    if (!source || !source.rows.length) {
      throw new Error('No data source is applied to this output.');
    }
    const rows = source.rows;
    const currentIndex = applied?.rowId ? rows.findIndex((row) => row.id === applied.rowId) : -1;
    const nextIndex =
      currentIndex === -1
        ? direction === 'next'
          ? 0
          : rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, currentIndex + (direction === 'next' ? 1 : -1)));
    return this.applyRowToOutput(output.id, source.id, rows[nextIndex].id);
  }

  selectOutput(outputRef) {
    const output = this.getOutputByRef(outputRef);

    if (!output) {
      throw new Error('Output not found.');
    }

    this.state.selectedOutputId = output.id;
    this.ensureOutputsConsistent();
    this.touch();
    return deepClone(output);
  }

  createOutput({ name, key } = {}) {
    const output = createOutput(
      {
        name: name?.trim() || `OUTPUT ${this.state.outputs.length + 1}`,
        key: this.ensureUniqueOutputKey(key || name || `output-${this.state.outputs.length + 1}`),
        selectedEntryId: null,
      },
      this.state.outputs.length + 1,
    );

    if (output.selectedEntryId) {
      const entry = this.state.entries.find((item) => item.id === output.selectedEntryId);
      const presentation = this.getEntryPresentation(entry);
      output.program = {
        entryId: entry?.id || null,
        templateId: presentation.templateId,
        entryName: entry?.name || 'No title loaded',
        templateName: presentation.templateName,
        fields: deepClone(entry?.fields || {}),
        fieldStyles: deepClone(entry?.fieldStyles || {}),
        visible: false,
        lastAction: 'LOAD',
        revision: 1,
        updatedAt: new Date().toISOString(),
      };
      output.previewProgram = {
        entryId: entry?.id || null,
        templateId: presentation.templateId,
        entryName: entry?.name || 'No title loaded',
        templateName: presentation.templateName,
        fields: deepClone(entry?.fields || {}),
        fieldStyles: deepClone(entry?.fieldStyles || {}),
        visible: false,
        lastAction: 'PREVIEW LOAD',
        revision: 1,
        updatedAt: new Date().toISOString(),
      };
    }

    this.state.outputs.push(output);
    this.state.selectedOutputId = output.id;
    this.ensureOutputsConsistent();
    this.touch();
    return deepClone(output);
  }

  updateOutput(outputRef, payload = {}) {
    const output = this.getOutputByRef(outputRef);

    if (!output) {
      throw new Error('Output not found.');
    }

    if (typeof payload.name === 'string') {
      output.name = payload.name.trim() || output.name;
    }

    if (typeof payload.key === 'string') {
      output.key = this.ensureUniqueOutputKey(payload.key || output.name, output.id);
    } else if (typeof payload.name === 'string') {
      output.key = this.ensureUniqueOutputKey(output.key || output.name, output.id);
    }

    if (typeof payload.syncGroupId === 'string') {
      output.syncGroupId = payload.syncGroupId.trim() || buildSyncGroupId(output.id);
    }

    this.ensureOutputsConsistent();
    this.touch();
    return deepClone(output);
  }

  toggleOutputSync(outputRef, targetOutputRef) {
    const output = this.getOutputByRef(outputRef);
    const targetOutput = this.getOutputByRef(targetOutputRef);

    if (!output || !targetOutput) {
      throw new Error('Output not found.');
    }

    const outputGroupId = output.syncGroupId || buildSyncGroupId(output.id);
    const targetGroupId = targetOutput.syncGroupId || buildSyncGroupId(targetOutput.id);
    const currentGroupMembers = this.state.outputs.filter((item) => item.syncGroupId === outputGroupId);

    if (outputGroupId === targetGroupId) {
      if (currentGroupMembers.length <= 1) {
        return deepClone(this.state.outputs);
      }

      const nextTargetGroupId = buildSyncGroupId(targetOutput.id);
      const remainingMembers = currentGroupMembers.filter((item) => item.id !== targetOutput.id);

      if (nextTargetGroupId === outputGroupId) {
        const nextRemainingGroupId = buildSyncGroupId(remainingMembers[0].id);

        for (const item of remainingMembers) {
          item.syncGroupId = nextRemainingGroupId;
        }
      }

      targetOutput.syncGroupId = nextTargetGroupId;
    } else {
      for (const item of this.state.outputs) {
        if (item.syncGroupId === outputGroupId || item.syncGroupId === targetGroupId) {
          item.syncGroupId = outputGroupId;
        }
      }
    }

    this.ensureOutputsConsistent();
    this.touch();
    return deepClone(this.state.outputs);
  }

  deleteOutput(outputRef) {
    const output = this.getOutputByRef(outputRef);

    if (!output) {
      throw new Error('Output not found.');
    }

    if (this.state.outputs.length <= 1) {
      throw new Error('At least one output is required.');
    }

    this.state.outputs = this.state.outputs.filter((item) => item.id !== output.id);
    this.ensureOutputsConsistent();
    this.touch();
  }

  selectEntry(entryId, outputRef = this.state.selectedOutputId) {
    const output = this.getOutputByRef(outputRef);
    const entry = this.state.entries.find((item) => item.id === entryId);

    if (!output || !entry) {
      throw new Error('Entry not found.');
    }

    output.selectedEntryId = entryId;
    this.state.selectedOutputId = output.id;
    this.ensureOutputsConsistent();

    if (!output.program.visible) {
      this.applyProgramFromEntry(output.id, entryId, { visible: false, lastAction: 'LOAD' });
      return;
    }

    this.touch();
  }

  addEntry(payload = {}) {
    const { templateId, name, fields = {} } = payload;

    if (templateId === 'vmix' || payload.entryType === 'vmix') {
      const initialFields = { ...(payload.fields || {}) };
      const entry = {
        id: nanoid(10),
        entryType: 'vmix',
        templateId: null,
        name: payload.name?.trim() || payload.vmixInputTitle || 'vMix Title',
        fields: initialFields,
        vmixInputKey: payload.vmixInputKey || null,
        vmixInputNumber: payload.vmixInputNumber || null,
        vmixInputTitle: payload.vmixInputTitle || 'vMix Title',
        vmixFieldMap: Array.isArray(payload.vmixFieldMap) ? payload.vmixFieldMap : buildVmixFieldDefinitions({ fields: initialFields }),
        vmixShowAction: normalizeVmixAction(payload.vmixShowAction, 'TransitionIn'),
        vmixHideAction: normalizeVmixAction(payload.vmixHideAction, 'TransitionOut'),
        shortcuts: normalizeEntryShortcuts(payload.shortcuts),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        missingTemplate: false,
      };

      this.state.entries.push(entry);
      this.ensureOutputsConsistent();
      this.touch();
      return entry;
    }

    const template = this.getTemplate(templateId);

    if (!template) {
      throw new Error('Template not found.');
    }

    const entry = {
      id: nanoid(10),
      templateId,
      name: name?.trim() || this.buildEntryName(template),
      fields: this.buildEntryFields(template, fields),
      localFieldMap: buildLocalFieldMap(template, payload.localFieldMap),
      fieldStyles: buildLocalFieldStyles(template, payload.fieldStyles),
      shortcuts: normalizeEntryShortcuts(payload.shortcuts),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      missingTemplate: false,
    };

    this.state.entries.push(entry);
    this.ensureOutputsConsistent();
    this.touch();
    return entry;
  }

  updateEntry(entryId, payload) {
    const entry = this.state.entries.find((item) => item.id === entryId);

    if (!entry) {
      throw new Error('Entry not found.');
    }

    if (payload.entryType === 'vmix' || entry.entryType === 'vmix') {
      entry.entryType = 'vmix';
      entry.templateId = null;

      if (payload.fields) {
        entry.fields = this.buildEntryFields(null, { ...entry.fields, ...payload.fields });
      }

      if (payload.vmixInputKey !== undefined) {
        entry.vmixInputKey = payload.vmixInputKey || null;
      }

      if (payload.vmixInputNumber !== undefined) {
        entry.vmixInputNumber = payload.vmixInputNumber || null;
      }

      if (payload.vmixInputTitle !== undefined) {
        entry.vmixInputTitle = payload.vmixInputTitle || entry.vmixInputTitle || 'vMix Title';
      }

      if (Array.isArray(payload.vmixFieldMap)) {
        entry.vmixFieldMap = payload.vmixFieldMap;
      }

      if (payload.vmixShowAction !== undefined) {
        entry.vmixShowAction = normalizeVmixAction(payload.vmixShowAction, entry.vmixShowAction || 'TransitionIn');
      }

      if (payload.vmixHideAction !== undefined) {
        entry.vmixHideAction = normalizeVmixAction(payload.vmixHideAction, entry.vmixHideAction || 'TransitionOut');
      }
    } else if (payload.templateId && payload.templateId !== entry.templateId) {
      const newTemplate = this.getTemplate(payload.templateId);

      if (!newTemplate) {
        throw new Error('Template not found.');
      }

      entry.templateId = payload.templateId;
      entry.fields = this.buildEntryFields(newTemplate, payload.fields || entry.fields);
      entry.localFieldMap = buildLocalFieldMap(newTemplate, payload.localFieldMap || entry.localFieldMap);
      entry.fieldStyles = buildLocalFieldStyles(newTemplate, payload.fieldStyles || entry.fieldStyles);
      entry.missingTemplate = false;
    } else if (payload.fields) {
      const template = this.getTemplate(entry.templateId);
      entry.fields = this.buildEntryFields(template, { ...entry.fields, ...payload.fields });
    }

    if (Array.isArray(payload.localFieldMap) && entry.entryType !== 'vmix') {
      const template = this.getTemplate(entry.templateId);
      entry.localFieldMap = buildLocalFieldMap(template, payload.localFieldMap);
    }

    if (payload.fieldStyles && entry.entryType !== 'vmix') {
      const template = this.getTemplate(entry.templateId);
      entry.fieldStyles = buildLocalFieldStyles(template, payload.fieldStyles);
    }

    if (typeof payload.name === 'string') {
      entry.name = payload.name.trim() || entry.name;
    }

    if (payload.shortcuts) {
      entry.shortcuts = normalizeEntryShortcuts({
        ...entry.shortcuts,
        ...payload.shortcuts,
      });
    }

    entry.updatedAt = new Date().toISOString();

    for (const output of this.state.outputs) {
      if (output.selectedEntryId === entry.id && !output.program.visible) {
        const presentation = this.getEntryPresentation(entry);
        output.program = {
          entryId: entry.id,
          templateId: presentation.templateId,
          entryName: entry.name,
          templateName: presentation.templateName,
          fields: deepClone(entry.fields),
          fieldStyles: deepClone(entry.fieldStyles || {}),
          visible: false,
          lastAction: 'LOAD',
          revision: (output.program.revision || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
      }

      if (output.previewProgram.entryId === entry.id) {
        const presentation = this.getEntryPresentation(entry);
        output.previewProgram = {
          ...output.previewProgram,
          templateId: presentation.templateId,
          entryName: entry.name,
          templateName: presentation.templateName,
          fields: deepClone(entry.fields),
          fieldStyles: deepClone(entry.fieldStyles || {}),
          revision: (output.previewProgram.revision || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    this.ensureOutputsConsistent();
    this.touch();
    return entry;
  }

  duplicateEntry(entryId) {
    const sourceIndex = this.state.entries.findIndex((entry) => entry.id === entryId);

    if (sourceIndex === -1) {
      throw new Error('Entry not found.');
    }

    const source = this.state.entries[sourceIndex];
    const clone = {
      ...deepClone(source),
      id: nanoid(10),
      name: `${source.name} copy`,
      // A duplicate shouldn't silently inherit keyboard/MIDI bindings conceptually
      // tied to the original entry — start clean, same as a freshly added title.
      shortcuts: normalizeEntryShortcuts({}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.state.entries.splice(sourceIndex + 1, 0, clone);
    this.ensureOutputsConsistent();
    this.touch();
    return clone;
  }

  deleteEntry(entryId) {
    const nextEntries = this.state.entries.filter((entry) => entry.id !== entryId);

    if (nextEntries.length === this.state.entries.length) {
      throw new Error('Entry not found.');
    }

    this.state.entries = nextEntries;

    for (const output of this.state.outputs) {
      if (output.selectedEntryId === entryId) {
        output.selectedEntryId = null;
      }

      if (output.program.entryId === entryId) {
        output.program = createDefaultProgram();

        if (output.selectedEntryId) {
          const entry = this.state.entries.find((item) => item.id === output.selectedEntryId);
          const presentation = this.getEntryPresentation(entry);

          output.program = {
            entryId: entry?.id || null,
            templateId: presentation.templateId,
            entryName: entry?.name || 'No title loaded',
            templateName: presentation.templateName,
            fields: deepClone(entry?.fields || {}),
            fieldStyles: deepClone(entry?.fieldStyles || {}),
            visible: false,
            lastAction: 'LOAD',
            revision: (output.program.revision || 0) + 1,
            updatedAt: new Date().toISOString(),
          };
        }
      }

      if (output.previewProgram.entryId === entryId) {
        output.previewProgram = createDefaultProgram();
      }
    }

    this.ensureOutputsConsistent();
    this.touch();
  }

  reorderEntries(ids) {
    const lookup = new Map(this.state.entries.map((entry) => [entry.id, entry]));
    const ordered = ids.map((id) => lookup.get(id)).filter(Boolean);
    const remaining = this.state.entries.filter((entry) => !ids.includes(entry.id));
    this.state.entries = [...ordered, ...remaining];
    this.touch();
  }

  reorderOutputs(ids) {
    const lookup = new Map(this.state.outputs.map((output) => [output.id, output]));
    const ordered = ids.map((id) => lookup.get(id)).filter(Boolean);
    const remaining = this.state.outputs.filter((output) => !ids.includes(output.id));
    this.state.outputs = [...ordered, ...remaining];
    this.touch();
  }

  applyProgramFromEntry(outputRef, entryId, { visible, lastAction }) {
    const output = this.getOutputByRef(outputRef);
    const entry = this.state.entries.find((item) => item.id === entryId);

    if (!output || !entry) {
      throw new Error('Entry not found.');
    }

    const presentation = this.getEntryPresentation(entry);
    output.selectedEntryId = entry.id;
    output.program = {
      entryId: entry.id,
      templateId: presentation.templateId,
      entryName: entry.name,
      templateName: presentation.templateName,
      fields: deepClone(entry.fields),
      fieldStyles: deepClone(entry.fieldStyles || {}),
      visible,
      lastAction,
      revision: (output.program.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.state.selectedOutputId = output.id;
    this.ensureOutputsConsistent();
    this.touch();
  }

  applyPreviewFromEntry(outputRef, entryId, { visible, lastAction }) {
    const output = this.getOutputByRef(outputRef);
    const entry = this.state.entries.find((item) => item.id === entryId);

    if (!output || !entry) {
      throw new Error('Entry not found.');
    }

    const presentation = this.getEntryPresentation(entry);
    output.previewProgram = {
      entryId: entry.id,
      templateId: presentation.templateId,
      entryName: entry.name,
      templateName: presentation.templateName,
      fields: deepClone(entry.fields),
      fieldStyles: deepClone(entry.fieldStyles || {}),
      visible,
      lastAction,
      revision: (output.previewProgram.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.state.selectedOutputId = output.id;
    this.ensureOutputsConsistent();
    this.touch();
  }

  showSelected(entryId, outputRef = this.state.selectedOutputId) {
    const output = this.getOutputByRef(outputRef);

    if (!output) {
      throw new Error('Output not found.');
    }

    if (entryId) {
      output.selectedEntryId = entryId;
    }

    this.applyProgramFromEntry(output.id, output.selectedEntryId, { visible: true, lastAction: 'SHOW' });
  }

  updateProgram(entryId, outputRef = this.state.selectedOutputId) {
    const output = this.getOutputByRef(outputRef);

    if (!output) {
      throw new Error('Output not found.');
    }

    if (entryId) {
      output.selectedEntryId = entryId;
    }

    this.applyProgramFromEntry(output.id, output.selectedEntryId, {
      visible: output.program.visible,
      lastAction: 'UPDATE',
    });
  }

  hideProgram(outputRef = this.state.selectedOutputId) {
    const output = this.getOutputByRef(outputRef);

    if (!output) {
      throw new Error('Output not found.');
    }

    output.program = {
      ...output.program,
      visible: false,
      lastAction: 'HIDE',
      revision: (output.program.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.state.selectedOutputId = output.id;
    this.ensureOutputsConsistent();
    this.touch();
  }

  showPreview(entryId, outputRef = this.state.selectedOutputId) {
    const output = this.getOutputByRef(outputRef);

    if (!output) {
      throw new Error('Output not found.');
    }

    if (entryId) {
      output.selectedEntryId = entryId;
    }

    this.applyPreviewFromEntry(output.id, output.selectedEntryId, { visible: true, lastAction: 'PREVIEW SHOW' });
  }

  hidePreview(outputRef = this.state.selectedOutputId) {
    const output = this.getOutputByRef(outputRef);

    if (!output) {
      throw new Error('Output not found.');
    }

    output.previewProgram = {
      ...output.previewProgram,
      visible: false,
      lastAction: 'PREVIEW HIDE',
      revision: (output.previewProgram.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.state.selectedOutputId = output.id;
    this.ensureOutputsConsistent();
    this.touch();
  }

  createEntriesFromText({ templateId, text, outputId } = {}) {
    const template = this.getTemplate(templateId);

    if (!template) {
      throw new Error('Template not found.');
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    const entries = lines.map((line, index) => {
      const values = line.split('|').map((value) => value.trim());
      const fields = {};

      template.fields.forEach((field, fieldIndex) => {
        fields[field.name] = values[fieldIndex] ?? field.defaultValue ?? '';
      });

      return {
        id: nanoid(10),
        templateId,
        name: values[0] || `${template.name} ${String(index + 1).padStart(2, '0')}`,
        fields,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        missingTemplate: false,
      };
    });

    this.state.entries.push(...entries);

    if (entries[0]) {
      this.selectEntry(entries[0].id, outputId);
      return entries;
    }

    this.touch();
    return entries;
  }

  createTimer(payload = {}) {
    const timer = normalizeTimer({
      id: payload.id || nanoid(8),
      name: payload.name,
      mode: payload.mode,
      durationMs: payload.durationMs,
      valueMs: payload.mode === 'countup' ? 0 : Number(payload.durationMs ?? 30000),
      running: false,
      startedAt: null,
      sourceType: payload.sourceType,
      targetOutputId: payload.targetOutputId,
      targetTemplateId: payload.targetTemplateId,
      targetTimerId: payload.targetTimerId,
      vmixInputKey: payload.vmixInputKey,
      vmixTextField: payload.vmixTextField,
      displayFormat: payload.displayFormat,
      defaultColor: payload.defaultColor,
      colorTriggers: payload.colorTriggers,
    });

    this.state.timers.push(timer);
    this.touch();
    return timer;
  }

  updateTimer(timerId, payload = {}) {
    const timer = this.state.timers.find((item) => item.id === timerId);

    if (!timer) {
      throw new Error('Timer not found.');
    }

    if (typeof payload.name === 'string') {
      timer.name = payload.name.trim() || timer.name;
    }

    if (payload.mode) {
      timer.mode = payload.mode === 'countup' ? 'countup' : 'countdown';
    }

    if (payload.durationMs !== undefined) {
      timer.durationMs = Number(payload.durationMs);
    }

    if (payload.sourceType !== undefined) {
      timer.sourceType = payload.sourceType === 'vmix' ? 'vmix' : 'local';
    }

    if (payload.targetOutputId !== undefined) {
      timer.targetOutputId = payload.targetOutputId || null;
    }

    if (payload.targetTemplateId !== undefined) {
      timer.targetTemplateId = payload.targetTemplateId || null;
    }

    if (payload.targetTimerId !== undefined) {
      timer.targetTimerId = payload.targetTimerId || timer.id;
    }

    if (payload.vmixInputKey !== undefined) {
      timer.vmixInputKey = payload.vmixInputKey || null;
    }

    if (payload.vmixTextField !== undefined) {
      timer.vmixTextField = payload.vmixTextField?.trim() || 'Text';
    }

    if (payload.displayFormat !== undefined) {
      timer.displayFormat = ['hh:mm:ss', 'mm:ss', 'ss'].includes(payload.displayFormat) ? payload.displayFormat : timer.displayFormat;
    }

    if (payload.defaultColor !== undefined) {
      timer.defaultColor = typeof payload.defaultColor === 'string' ? payload.defaultColor.trim() : '';
    }

    if (payload.colorTriggers !== undefined) {
      timer.colorTriggers = normalizeTimer({
        ...timer,
        colorTriggers: payload.colorTriggers,
      }).colorTriggers;
    }

    if (payload.valueMs !== undefined) {
      timer.valueMs = Number(payload.valueMs);
      if (timer.running) {
        timer.startedAt = new Date().toISOString();
      }
    } else if (!timer.running) {
      timer.valueMs = timer.mode === 'countup' ? Number(payload.valueMs ?? timer.valueMs ?? 0) : Number(payload.valueMs ?? timer.durationMs ?? timer.valueMs);
    }

    this.touch();
    return timer;
  }

  deleteTimer(timerId) {
    const nextTimers = this.state.timers.filter((timer) => timer.id !== timerId);

    if (nextTimers.length === this.state.timers.length) {
      throw new Error('Timer not found.');
    }

    this.state.timers = nextTimers;
    this.touch();
  }

  startTimer(timerId) {
    const timer = this.state.timers.find((item) => item.id === timerId);

    if (!timer || timer.running) {
      return timer;
    }

    timer.running = true;
    timer.startedAt = new Date().toISOString();
    this.touch();
    return timer;
  }

  stopTimer(timerId) {
    const timer = this.state.timers.find((item) => item.id === timerId);

    if (!timer || !timer.running) {
      return timer;
    }

    timer.valueMs = this.getTimerCurrentValue(timer);
    timer.running = false;
    timer.startedAt = null;
    this.touch();
    return timer;
  }

  resetTimer(timerId) {
    const timer = this.state.timers.find((item) => item.id === timerId);

    if (!timer) {
      throw new Error('Timer not found.');
    }

    timer.running = false;
    timer.startedAt = null;
    timer.valueMs = timer.mode === 'countup' ? 0 : timer.durationMs;
    this.touch();
    return timer;
  }

  hasRunningTimers() {
    return this.state.timers.some((timer) => timer.running);
  }

  normalizeRunningTimers(now = Date.now()) {
    let changed = false;

    for (const timer of this.state.timers) {
      if (!timer.running || timer.mode !== 'countdown') {
        continue;
      }

      const currentMs = this.getTimerCurrentValue(timer, now);

      if (currentMs <= 0) {
        timer.running = false;
        timer.startedAt = null;
        timer.valueMs = 0;
        changed = true;
      }
    }

    if (changed) {
      this.touch();
    }
  }
}
