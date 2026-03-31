import { EventEmitter } from 'node:events';
import fs from 'fs-extra';
import { nanoid } from 'nanoid';

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
});

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

const slugifyOutputKey = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

const buildSyncGroupId = (outputId) => `sync-${outputId}`;

const createOutput = ({ id, name, key, selectedEntryId = null, program, previewProgram, syncGroupId } = {}, index = 1) => {
  const fallbackName = `OUTPUT ${index}`;
  const fallbackKey = index === 1 ? 'main' : `output-${index}`;
  const outputId = id || nanoid(10);

  return {
    id: outputId,
    name: name?.trim() || fallbackName,
    key: slugifyOutputKey(key || name || fallbackKey) || fallbackKey,
    syncGroupId: syncGroupId || buildSyncGroupId(outputId),
    selectedEntryId,
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
});

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
      channel: 'prerelease',
      fixedRepo: true,
      lastCheckAt: null,
      latestVersion: null,
      available: false,
      status: 'idle',
      notes: 'Automatic update checks use the built-in GitHub repository.',
    },
  },
  program: createDefaultProgram(),
  entries: [],
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

const buildProjectState = (incoming = {}) => {
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
    },
    program: {
      ...baseState.program,
      ...(incoming?.program || {}),
    },
    timers: incoming?.timers?.length ? incoming.timers.map((timer) => normalizeTimer(timer)) : baseState.timers,
    entries: Array.isArray(incoming?.entries) ? incoming.entries : [],
  };
};

export class TitleStore extends EventEmitter {
  constructor({ stateFile, templateService }) {
    super();
    this.stateFile = stateFile;
    this.templateService = templateService;
    this.state = createDefaultState();
    this.persistTimer = null;
    this.isClosing = false;
  }

  async init() {
    await fs.ensureFile(this.stateFile);
    await this.refreshTemplates();

    try {
      const existing = await fs.readJson(this.stateFile);
      this.state = buildProjectState(existing);
    } catch {
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
      this.persist().catch((error) => console.error('Persist failed:', error));
    }, 120);
  }

  async persist() {
    await fs.writeJson(this.stateFile, this.state, { spaces: 2 });
  }

  async close() {
    this.isClosing = true;

    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    await this.persist();
  }

  exportProjectState() {
    return deepClone(this.state);
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

    this.state.entries = this.state.entries
      .map((entry) => {
        if (entry.entryType === 'vmix') {
          return {
            ...entry,
            templateId: null,
            fields: this.buildEntryFields(null, entry.fields || {}),
            vmixShowAction: normalizeVmixAction(entry.vmixShowAction, 'TransitionIn'),
            vmixHideAction: normalizeVmixAction(entry.vmixHideAction, 'TransitionOut'),
            hidden: Boolean(entry.hidden),
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
          hidden: Boolean(entry.hidden),
          shortcuts: normalizeEntryShortcuts(entry.shortcuts),
          missingTemplate: false,
          fields: this.buildEntryFields(template, entry.fields),
          localFieldMap: buildLocalFieldMap(template, entry.localFieldMap),
        };
      })
      .sort((a, b) => new Date(a.createdAt || 0).valueOf() - new Date(b.createdAt || 0).valueOf());
  }

  seedExampleEntries() {
    const templates = this.templateService.getTemplates();

    for (const template of templates) {
      this.state.entries.push({
        id: nanoid(10),
        templateId: template.id,
        name: this.buildEntryName(template),
        fields: this.buildEntryFields(template),
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

    const firstEntryId = this.state.entries[0]?.id || null;

    this.state.outputs = this.state.outputs.map((output, index) => {
      const nextOutput = createOutput(output, index + 1);
      const selectedEntryExists = this.state.entries.some((entry) => entry.id === nextOutput.selectedEntryId);
      nextOutput.selectedEntryId = selectedEntryExists ? nextOutput.selectedEntryId : firstEntryId;
      nextOutput.key = this.ensureUniqueOutputKey(nextOutput.key || nextOutput.name || `output-${index + 1}`, nextOutput.id);

      const programEntryExists = this.state.entries.some((entry) => entry.id === nextOutput.program.entryId);

      if (!programEntryExists) {
        nextOutput.program = createDefaultProgram();
      }

      if (!nextOutput.program.templateId && nextOutput.selectedEntryId) {
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

  getTimers(now = Date.now()) {
    return this.state.timers.map((timer) => {
      const currentMs = this.getTimerCurrentValue(timer, now);

      return {
        ...deepClone(timer),
        currentMs,
        display: formatTimer(currentMs, timer.displayFormat),
      };
    });
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
    };
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
        selectedEntryId: this.state.entries[0]?.id || null,
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
        vmixInputTitle: payload.vmixInputTitle || 'vMix Title',
        vmixFieldMap: Array.isArray(payload.vmixFieldMap) ? payload.vmixFieldMap : buildVmixFieldDefinitions({ fields: initialFields }),
        vmixShowAction: normalizeVmixAction(payload.vmixShowAction, 'TransitionIn'),
        vmixHideAction: normalizeVmixAction(payload.vmixHideAction, 'TransitionOut'),
        hidden: false,
        shortcuts: normalizeEntryShortcuts(payload.shortcuts),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        missingTemplate: false,
      };

      this.state.entries.push(entry);
      this.selectEntry(entry.id);
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
      hidden: false,
      shortcuts: normalizeEntryShortcuts(payload.shortcuts),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      missingTemplate: false,
    };

    this.state.entries.push(entry);
    this.selectEntry(entry.id);
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
      entry.missingTemplate = false;
    } else if (payload.fields) {
      const template = this.getTemplate(entry.templateId);
      entry.fields = this.buildEntryFields(template, { ...entry.fields, ...payload.fields });
    }

    if (Array.isArray(payload.localFieldMap) && entry.entryType !== 'vmix') {
      const template = this.getTemplate(entry.templateId);
      entry.localFieldMap = buildLocalFieldMap(template, payload.localFieldMap);
    }

    if (typeof payload.name === 'string') {
      entry.name = payload.name.trim() || entry.name;
    }

    if (typeof payload.hidden === 'boolean') {
      entry.hidden = payload.hidden;
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
          revision: (output.previewProgram.revision || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    this.ensureOutputsConsistent();
    this.touch();
    return entry;
  }

  deleteEntry(entryId) {
    const nextEntries = this.state.entries.filter((entry) => entry.id !== entryId);

    if (nextEntries.length === this.state.entries.length) {
      throw new Error('Entry not found.');
    }

    this.state.entries = nextEntries;

    for (const output of this.state.outputs) {
      if (output.selectedEntryId === entryId) {
        output.selectedEntryId = this.state.entries[0]?.id || null;
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
