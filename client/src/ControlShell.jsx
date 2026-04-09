import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createRemoteSourceConfig,
  loadSourceLibrary,
  normalizeSourceLibrary,
  parseSourceText,
  saveSourceLibrary,
} from './source-library.js';
import {
  getRemoteSourceTypeLabel,
  normalizeRemoteSourceType,
} from './remote-sources/index.js';
import { api, BACKEND_ORIGIN, copyText } from './control-shell/api.js';
import {
  buildSourceFromRemoteFetch,
  fetchRemoteSourcePayload,
  getRemoteImportFallbackName,
} from './control-shell/source-service.js';
import KhuralStyleEditorModal from './control-shell/KhuralStyleEditorModal.jsx';
import { useMidiState, useRealtimeState, useSystemInfo, useVmixState } from './control-shell/hooks.js';
import ProjectPanel from './control-shell/ProjectPanel.jsx';
import PreviewTitlePanel from './control-shell/PreviewTitlePanel.jsx';
import SettingsPanel from './control-shell/SettingsPanel.jsx';
import TitlesPanel from './control-shell/TitlesPanel.jsx';
import LiveTab from './control-shell/tabs/LiveTab.jsx';
import MappingTab from './control-shell/tabs/MappingTab.jsx';
import SourcesTab from './control-shell/tabs/SourcesTab.jsx';
import TimersTab from './control-shell/tabs/TimersTab.jsx';
import {
  ChevronUpIcon,
} from './control-shell/icons.jsx';

const isTypingTarget = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

const createClientId = (prefix = 'item') => {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const slugFieldKey = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `field_${Math.random().toString(16).slice(2, 6)}`;

const getSourceRowEditKey = (sourceId, rowId) => `${sourceId}:${rowId}`;
const normalizeLinkedTimerId = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};
const timerIdMatches = (timer, linkedTimerId) => normalizeLinkedTimerId(timer?.id) === normalizeLinkedTimerId(linkedTimerId);
const getSourceLinkedTimerId = (source, outputId = null) => {
  if (!source) {
    return null;
  }

  const normalizedOutputId = outputId ? String(outputId).trim() : '';
  if (normalizedOutputId && source.linkedTimerByOutput?.[normalizedOutputId]) {
    return normalizeLinkedTimerId(source.linkedTimerByOutput[normalizedOutputId]);
  }

  return normalizeLinkedTimerId(source.linkedTimerId);
};
const getLinkedTimerStatus = (timer, fallbackBaseMs = 0) => {
  if (!timer) {
    return 'idle';
  }

  const currentMs = Number(timer.currentMs ?? timer.valueMs ?? 0);
  const referenceMs = Number(
    timer.mode === 'countup'
      ? timer.valueMs ?? fallbackBaseMs
      : timer.durationMs ?? fallbackBaseMs,
  );

  if (timer.running) {
    return 'running';
  }

  if (currentMs === 0 && timer.mode !== 'countup') {
    return 'finished';
  }

  if (timer.mode === 'countup') {
    return currentMs > 0 ? 'paused' : 'idle';
  }

  return currentMs !== referenceMs ? 'paused' : 'idle';
};

const TIMER_FORMATS = ['hh:mm:ss', 'mm:ss', 'ss'];
const VMIX_TITLE_ACTIONS = [
  { value: 'TransitionIn', label: 'TransitionIn' },
  { value: 'TransitionOut', label: 'TransitionOut' },
  { value: 'none', label: 'No Action' },
];
const normalizeVmixTitleAction = (value, fallback) => {
  const normalizedValue = value === 'TitleBeginAnimation' ? 'TransitionIn' : value === 'TitleEndAnimation' ? 'TransitionOut' : value;
  const normalizedFallback = fallback === 'TitleBeginAnimation' ? 'TransitionIn' : fallback === 'TitleEndAnimation' ? 'TransitionOut' : fallback;
  return VMIX_TITLE_ACTIONS.some((action) => action.value === normalizedValue) ? normalizedValue : normalizedFallback;
};

const formatStatusTime = (value) =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

const buildWindowTitle = (projectName, dirty) => {
  const cleanProjectName = projectName && projectName !== 'Unsaved Project' ? projectName : null;
  const dirtyMarker = dirty ? ' *' : '';
  return cleanProjectName ? `${cleanProjectName}${dirtyMarker} - Web Title Pro` : `Web Title Pro${dirtyMarker}`;
};

const formatCompactTimer = (milliseconds, format = 'mm:ss') => {
  const safeMilliseconds = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(safeMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const fullMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (format === 'hh:mm:ss') {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  if (format === 'ss') {
    return String(totalSeconds).padStart(2, '0');
  }

  return `${String(fullMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const changeTimerSegment = (milliseconds, segment, delta) => {
  const date = {
    hours: Math.floor(milliseconds / 3600000),
    minutes: Math.floor((milliseconds % 3600000) / 60000),
    seconds: Math.floor((milliseconds % 60000) / 1000),
  };
  const limits = { hours: 99, minutes: 59, seconds: 59 };
  const next = { ...date };

  next[segment] = Math.max(0, Math.min(limits[segment], next[segment] + delta));

  return (next.hours * 3600 + next.minutes * 60 + next.seconds) * 1000;
};

const getTimerSegments = (milliseconds, format = 'mm:ss') => {
  const safeMilliseconds = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(safeMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const fullMinutes = Math.floor(totalSeconds / 60);
  const normalizedMinutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (format === 'hh:mm:ss') {
    return [
      { key: 'hours', value: String(hours).padStart(2, '0') },
      { key: 'minutes', value: String(normalizedMinutes).padStart(2, '0') },
      { key: 'seconds', value: String(seconds).padStart(2, '0') },
    ];
  }

  if (format === 'ss') {
    return [{ key: 'seconds', value: String(totalSeconds).padStart(2, '0') }];
  }

  return [
    { key: 'minutes', value: String(fullMinutes).padStart(2, '0') },
    { key: 'seconds', value: String(seconds).padStart(2, '0') },
  ];
};

const describeMouseButton = (button) => {
  const labels = {
    0: 'Mouse Left',
    1: 'Mouse Middle',
    2: 'Mouse Right',
    3: 'Mouse Back',
    4: 'Mouse Forward',
  };

  return labels[button] || `Mouse ${button}`;
};

const normalizeKeyName = (key = '') => {
  const map = {
    ' ': 'Space',
    Escape: 'Escape',
    Esc: 'Escape',
    Enter: 'Enter',
    ArrowUp: 'Arrow Up',
    ArrowDown: 'Arrow Down',
    ArrowLeft: 'Arrow Left',
    ArrowRight: 'Arrow Right',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Tab: 'Tab',
  };

  if (map[key]) {
    return map[key];
  }

  if (key.length === 1) {
    return key.toUpperCase();
  }

  return key;
};

const formatShortcutFromEvent = (event) => {
  const parts = [];

  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');

  const base =
    event.type === 'mousedown'
      ? describeMouseButton(event.button)
      : normalizeKeyName(event.key || '');

  if (!base || ['Control', 'Shift', 'Alt', 'Meta'].includes(base)) {
    return '';
  }

  return [...parts, base].join('+');
};

const buildEffectiveLocalFieldMap = (entry, templateFields = []) => {
  const existing = Array.isArray(entry?.localFieldMap) ? entry.localFieldMap : [];
  const mapByName = new Map(existing.filter((item) => item?.name).map((item) => [item.name, item]));

  return templateFields.map((field, index) => {
    const mapped = mapByName.get(field.name);
    const sourceColumnIndex = Number.isInteger(mapped?.sourceColumnIndex)
      ? mapped.sourceColumnIndex
      : Number.parseInt(mapped?.sourceColumnIndex ?? '', 10);

    return {
      name: field.name,
      label: field.label || field.name,
      sourceColumnIndex: Number.isFinite(sourceColumnIndex) ? sourceColumnIndex : index,
    };
  });
};

const buildEffectiveVmixFieldMap = (entry, templateFields = []) => {
  const existing = Array.isArray(entry?.vmixFieldMap) ? entry.vmixFieldMap : [];
  const mapByName = new Map(existing.filter((item) => item?.name).map((item) => [item.name, item]));

  return templateFields.map((field, index) => {
    const mapped = mapByName.get(field.name);
    const sourceColumnIndex = Number.isInteger(mapped?.sourceColumnIndex)
      ? mapped.sourceColumnIndex
      : Number.parseInt(mapped?.sourceColumnIndex ?? '', 10);

    return {
      name: field.name,
      label: field.label || field.name,
      vmixFieldName: mapped?.vmixFieldName || field.label || field.name,
      sourceColumnIndex: Number.isFinite(sourceColumnIndex) ? sourceColumnIndex : index,
    };
  });
};

const buildEffectiveEntryFieldMap = (entry, templateFields = []) =>
  entry?.entryType === 'vmix'
    ? buildEffectiveVmixFieldMap(entry, templateFields)
    : buildEffectiveLocalFieldMap(entry, templateFields);

const buildFieldMapSignature = (fieldMap = []) =>
  JSON.stringify(
    (Array.isArray(fieldMap) ? fieldMap : []).map((field) => ({
      name: field?.name || '',
      sourceColumnIndex: Number.isFinite(Number(field?.sourceColumnIndex))
        ? Number(field.sourceColumnIndex)
        : null,
      vmixFieldName: field?.vmixFieldName || '',
    })),
  );

const applyRowToFields = (templateFields, rowValues, currentFields, fieldMap = null) => {
  const nextFields = { ...currentFields };
  const mapByName = new Map(
    Array.isArray(fieldMap)
      ? fieldMap.filter((item) => item?.name).map((item) => [item.name, item])
      : [],
  );

  templateFields.forEach((field, index) => {
    const mapped = mapByName.get(field.name);
    const sourceColumnIndex = Number.isInteger(mapped?.sourceColumnIndex)
      ? mapped.sourceColumnIndex
      : Number.parseInt(mapped?.sourceColumnIndex ?? '', 10);
    const resolvedIndex = Number.isFinite(sourceColumnIndex) && sourceColumnIndex >= 0 ? sourceColumnIndex : null;
    nextFields[field.name] = resolvedIndex === null ? '' : rowValues[resolvedIndex] ?? '';
  });

  return nextFields;
};

const getEntryDataPreview = (entry) => {
  const values = Object.values(entry?.fields || {})
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return values.slice(0, 2).join(' В· ');
};

const getRundownPrimaryLabel = (entry) =>
  entry?.entryType === 'vmix'
    ? entry?.vmixInputTitle || entry?.templateName || entry?.name || 'vMix Title'
    : entry?.templateName || entry?.name || 'Local Title';

const getRundownSecondaryLabel = (entry) => {
  const preview = getEntryDataPreview(entry);

  if (preview && preview !== getRundownPrimaryLabel(entry)) {
    return preview;
  }

  if (entry?.name && entry.name !== getRundownPrimaryLabel(entry)) {
    return entry.name;
  }

  return '';
};

const supportsFieldStyleEditor = (template = null, entry = null) => {
  if (entry?.entryType === 'vmix') {
    return false;
  }

  const fieldNames = (template?.fields || entry?.templateFields || [])
    .map((field) => String(field?.name || '').toLowerCase())
    .filter(Boolean);
  return Boolean(template?.fieldStyleEditor === true && fieldNames.length > 0);
};

const normalizeLocalFieldStyles = (templateFields = [], styles = {}) =>
  Object.fromEntries(
    (Array.isArray(templateFields) ? templateFields : [])
      .map((field) => {
        const style = styles?.[field.name] || {};
        const fontFamily = typeof style.fontFamily === 'string' ? style.fontFamily.trim() : '';
        const fontSourcePath = typeof style.fontSourcePath === 'string' ? style.fontSourcePath.trim() : '';
        const fontSize = Number.parseInt(style.fontSize ?? '', 10);
        const color = typeof style.color === 'string' ? style.color.trim() : '';

        return [
          field.name,
          {
            ...(fontFamily ? { fontFamily } : {}),
            ...(fontSourcePath ? { fontSourcePath } : {}),
            ...(Number.isFinite(fontSize) && fontSize > 0 ? { fontSize } : {}),
            ...(color ? { color } : {}),
          },
        ];
      })
      .filter(([, style]) => Object.keys(style).length > 0),
  );

const buildUploadFormData = (files, name) => {
  const formData = new FormData();

  if (name.trim()) {
    formData.append('name', name.trim());
  }

  files.forEach((file) => {
    formData.append('files', file, file.webkitRelativePath || file.name);
  });

  return formData;
};

const FONT_STYLE_HINTS = ['thin', 'extralight', 'light', 'regular', 'medium', 'semibold', 'bold', 'extrabold', 'black', 'italic'];

const pickPreferredFontFile = (fontName, filePaths = []) => {
  const normalizedFontName = String(fontName || '').toLowerCase();
  const desiredHints = FONT_STYLE_HINTS.filter((hint) => normalizedFontName.includes(hint));
  const candidates = (Array.isArray(filePaths) ? filePaths : [])
    .map((filePath) => String(filePath || '').trim())
    .filter(Boolean);

  if (!candidates.length) {
    return '';
  }

  const scoreFile = (filePath) => {
    const normalizedPath = filePath.toLowerCase();
    let score = 0;

    if (desiredHints.length) {
      desiredHints.forEach((hint) => {
        if (normalizedPath.includes(hint)) {
          score += 6;
        }
      });
    } else {
      if (normalizedPath.includes('regular')) score += 6;
      if (normalizedPath.includes('variablefont_wght') && !normalizedPath.includes('italic')) score += 5;
      if (!/(italic|bold|black|light|thin|medium|semibold|extrabold)/.test(normalizedPath)) score += 4;
    }

    if (!normalizedPath.includes('italic')) score += 2;
    if (!normalizedPath.includes('bold')) score += 1;
    if (normalizedPath.endsWith('.ttf')) score += 1;

    return score;
  };

  return [...candidates].sort((left, right) => scoreFile(right) - scoreFile(left))[0] || candidates[0];
};

const buildVmixEntryConfig = (input) => {
  const textFields = input?.textFields?.length ? input.textFields : [{ name: 'Text', index: '0' }];
  const usedKeys = new Set();
  const fieldMap = textFields.map((field, index) => {
    let key = slugFieldKey(field.name || `field_${index + 1}`);

    while (usedKeys.has(key)) {
      key = `${key}_${index + 1}`;
    }

    usedKeys.add(key);
    return {
      name: key,
      label: field.name || `Field ${index + 1}`,
      vmixFieldName: field.name || 'Text',
      index: field.index || String(index),
      sourceColumnIndex: index,
    };
  });

  return {
    fieldMap,
    fields: Object.fromEntries(fieldMap.map((field) => [field.name, ''])),
  };
};

const buildPersistedEntry = (entry = {}) => {
  const base = {
    id: entry.id,
    entryType: entry.entryType === 'vmix' ? 'vmix' : 'local',
    templateId: entry.entryType === 'vmix' ? null : entry.templateId,
    name: entry.name || '',
    fields: entry.fields || {},
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
    hidden: Boolean(entry.hidden),
    shortcuts: entry.shortcuts || { show: '', live: '', hide: '' },
  };

  if (entry.entryType === 'vmix') {
    return {
      ...base,
      vmixInputKey: entry.vmixInputKey || null,
      vmixInputTitle: entry.vmixInputTitle || '',
      vmixFieldMap: Array.isArray(entry.vmixFieldMap) ? entry.vmixFieldMap : [],
      vmixShowAction: entry.vmixShowAction || 'TransitionIn',
      vmixHideAction: entry.vmixHideAction || 'TransitionOut',
    };
  }

  return {
    ...base,
    localFieldMap: Array.isArray(entry.localFieldMap) ? entry.localFieldMap : [],
  };
};

const buildPersistedTimer = (timer = {}) => ({
  id: timer.id,
  name: timer.name || 'New Timer',
  mode: timer.mode === 'countup' ? 'countup' : 'countdown',
  durationMs: Number(timer.durationMs ?? 0),
  valueMs: Number(timer.valueMs ?? 0),
  running: Boolean(timer.running),
  startedAt: timer.startedAt || null,
  sourceType: timer.sourceType === 'vmix' ? 'vmix' : 'local',
  targetOutputId: timer.targetOutputId || null,
  targetTemplateId: timer.targetTemplateId || null,
  targetTimerId: timer.targetTimerId || null,
  vmixInputKey: timer.vmixInputKey || null,
  vmixTextField: timer.vmixTextField || 'Text',
  displayFormat: timer.displayFormat || 'mm:ss',
});

const buildPersistedProjectStateFromSnapshot = (snapshot) => ({
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

const buildProjectSignature = ({ snapshot, sourceLibrary, selectedSourceId }) =>
  JSON.stringify({
    state: buildPersistedProjectStateFromSnapshot(snapshot),
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

const isVmixTitleInput = (input) => {
  if (!input) {
    return false;
  }

  const title = `${input.title || ''} ${input.shortTitle || ''}`.toLowerCase();
  const type = String(input.type || '').toLowerCase();
  const hasTextFields = Array.isArray(input.textFields) && input.textFields.length > 0;

  return hasTextFields && (title.includes('.gtzip') || title.includes('.gt') || type.includes('gt') || type.includes('title'));
};


function ControlShell() {
  const desktopBridge = window.webTitleDesktop || null;
  const { snapshot, connection, error } = useRealtimeState();
  const systemInfo = useSystemInfo();
  const [vmixState, setVmixState] = useVmixState();
  const [midiState, setMidiState] = useMidiState();
  const [appMeta, setAppMeta] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [activeTab, setActiveTab] = useState('rundown');
  const [settingsTab, setSettingsTab] = useState('output');
  const [draftFields, setDraftFields] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [templateValidationReport, setTemplateValidationReport] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [styleEditorEntryId, setStyleEditorEntryId] = useState(null);
  const [styleEditorDraft, setStyleEditorDraft] = useState({});
  const [systemFontOptions, setSystemFontOptions] = useState([]);
  const [systemFontAssetMap, setSystemFontAssetMap] = useState({});
  const [systemFontOptionsLoading, setSystemFontOptionsLoading] = useState(false);
  const [showProjectPanel, setShowProjectPanel] = useState(false);
  const [newEntryMode, setNewEntryMode] = useState('local');
  const [newEntryTemplateId, setNewEntryTemplateId] = useState('');
  const [newEntryName, setNewEntryName] = useState('');
  const [newVmixInputKey, setNewVmixInputKey] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [uploadName, setUploadName] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadDirectoryPath, setUploadDirectoryPath] = useState('');
  const [txtTemplateId, setTxtTemplateId] = useState('');
  const [txtPayload, setTxtPayload] = useState('');
  const [txtFileName, setTxtFileName] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [feedback, setFeedback] = useState('');
  const [localSelectedOutputId, setLocalSelectedOutputId] = useState(null);
  const [sourceLibrary, setSourceLibrary] = useState(() => loadSourceLibrary());
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [sourcePayload, setSourcePayload] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');
  const [remoteSourceName, setRemoteSourceName] = useState('');
  const [remoteSourceUrl, setRemoteSourceUrl] = useState('');
  const [remoteSourceType, setRemoteSourceType] = useState('csv-url');
  const [remoteSourceAutoRefresh, setRemoteSourceAutoRefresh] = useState(true);
  const [remoteSourceRefreshIntervalSec, setRemoteSourceRefreshIntervalSec] = useState(30);
  const [projectStatus, setProjectStatus] = useState({
    supported: false,
    currentProjectPath: null,
    recentProjects: [],
  });
  const [yandexAuthState, setYandexAuthState] = useState({
    supported: false,
    encrypted: false,
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    scope: 'cloud_api:disk.read',
    accessToken: '',
    refreshToken: '',
    accountLogin: '',
    accountName: '',
    updatedAt: null,
  });
  const [yandexDeviceAuth, setYandexDeviceAuth] = useState({
    status: 'idle',
    error: '',
  });
  const [projectBaselineSignature, setProjectBaselineSignature] = useState(null);
  const [projectDirty, setProjectDirty] = useState(false);
  const [manualRowValues, setManualRowValues] = useState({});
  const [editingSourceRows, setEditingSourceRows] = useState({});
  const [sourceRowDrafts, setSourceRowDrafts] = useState({});
  const [entryFieldMapDraft, setEntryFieldMapDraft] = useState(null);
  const [vmixHostDraft, setVmixHostDraft] = useState('');
  const feedbackTimerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const folderInputRef = useRef(null);
  const [activeSourceRows, setActiveSourceRows] = useState({});
  const [activeTimerRows, setActiveTimerRows] = useState({});
  const [sourceRowTimers, setSourceRowTimers] = useState({});
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [expandedRender, setExpandedRender] = useState(null);
  const [manageRundown, setManageRundown] = useState(false);
  const [showHiddenEntries, setShowHiddenEntries] = useState(false);
  const [learningShortcut, setLearningShortcut] = useState(null);
  const [showSourceSyncMenu, setShowSourceSyncMenu] = useState(false);
  const [draggedRundownEntryId, setDraggedRundownEntryId] = useState(null);
  const [manageSources, setManageSources] = useState(false);
  const [draggedSourceId, setDraggedSourceId] = useState(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDelaySec, setReminderDelaySec] = useState(15);
  const [pendingReminder, setPendingReminder] = useState(null);
  const reminderTimeoutRef = useRef(null);
  const remoteRefreshStateRef = useRef({});
  const latestDraftRef = useRef({ name: '', fields: {} });
  const appCloseAuthorizedRef = useRef(false);
  const outputs = snapshot?.outputs || [];
  const currentProjectName = useMemo(() => {
    const currentPath = projectStatus?.currentProjectPath || '';
    if (!currentPath) {
      return 'Unsaved Project';
    }

    const parts = currentPath.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || 'Unsaved Project';
  }, [projectStatus?.currentProjectPath]);
  const currentProjectDisplayName = useMemo(
    () => currentProjectName.replace(/\.wtp-project(\.json)?$/i, '') || 'Unsaved Project',
    [currentProjectName],
  );
  const currentProjectSignature = useMemo(
    () => (snapshot ? buildProjectSignature({ snapshot, sourceLibrary, selectedSourceId }) : null),
    [snapshot, sourceLibrary, selectedSourceId],
  );
  const updateState = appMeta?.updates || snapshot?.integrations?.updates || null;
  const effectiveSelectedOutputId = localSelectedOutputId || snapshot?.selectedOutputId || outputs[0]?.id || null;
  const selectedOutput =
    outputs.find((output) => output.id === effectiveSelectedOutputId) || snapshot?.selectedOutput || null;
  const selectedEntry =
    (snapshot?.entries || []).find((entry) => entry.id === selectedOutput?.selectedEntryId) || null;
  const program = selectedOutput?.program || snapshot?.program || null;
  const previewProgram = selectedOutput?.previewProgram || snapshot?.previewProgram || null;
  const templates = snapshot?.templates || [];
  const timers = snapshot?.timers || [];
  const templateMap = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates]);
  const selectedTemplate = selectedEntry ? templateMap.get(selectedEntry.templateId) : null;
  const selectedCreateTemplate = templateMap.get(newEntryTemplateId) || null;
  const selectedTxtTemplate = templateMap.get(txtTemplateId) || null;
  const selectedEntryFields = useMemo(
    () => selectedEntry?.templateFields || selectedTemplate?.fields || [],
    [selectedEntry?.templateFields, selectedTemplate?.fields],
  );
  const canManageEntryAppearance = (entry) => supportsFieldStyleEditor(templateMap.get(entry?.templateId), entry);
  const styleEditorEntry = useMemo(
    () => (snapshot?.entries || []).find((entry) => entry.id === styleEditorEntryId) || null,
    [snapshot?.entries, styleEditorEntryId],
  );
  const styleEditorTemplateFields = useMemo(
    () => styleEditorEntry?.templateFields || templateMap.get(styleEditorEntry?.templateId)?.fields || [],
    [styleEditorEntry?.templateFields, styleEditorEntry?.templateId, templateMap],
  );
  const selectedVmixInput = useMemo(
    () =>
      selectedEntry?.entryType === 'vmix'
        ? (vmixState?.inputs || []).find(
            (input) => (input.key || input.number) === selectedEntry.vmixInputKey,
          ) || null
        : null,
    [selectedEntry?.entryType, selectedEntry?.vmixInputKey, vmixState?.inputs],
  );
  const selectedVmixTextFields = useMemo(
    () => (selectedVmixInput?.textFields?.length ? selectedVmixInput.textFields : [{ name: 'Text', index: '0' }]),
    [selectedVmixInput],
  );
  const showVmixFieldBinding = useMemo(() => {
    const actualFields = (selectedVmixTextFields || []).filter((field) => String(field?.name || '').trim());
    return actualFields.length > 1 || (actualFields[0]?.name || '') !== 'Text';
  }, [selectedVmixTextFields]);
  const vmixTitleInputs = useMemo(() => {
    const inputs = vmixState?.inputs || [];
    const strictMatches = inputs.filter((input) => isVmixTitleInput(input));

    if (strictMatches.length) {
      return strictMatches;
    }

    const textInputs = inputs.filter((input) => Array.isArray(input.textFields) && input.textFields.length > 0);
    return textInputs.length ? textInputs : inputs;
  }, [vmixState?.inputs]);
  const selectedNewVmixInput = useMemo(
    () =>
      vmixTitleInputs.find(
        (input) => (input.key || input.number) === newVmixInputKey,
      ) || null,
    [newVmixInputKey, vmixTitleInputs],
  );
  const selectedSource = sourceLibrary.find((item) => item.id === selectedSourceId) || null;
  const selectedEntryFieldMap = useMemo(
    () => buildEffectiveEntryFieldMap(selectedEntry, selectedEntryFields),
    [selectedEntry, selectedEntryFields],
  );
  const effectiveSelectedEntryFieldMap = useMemo(
    () => (entryFieldMapDraft?.length ? entryFieldMapDraft : selectedEntryFieldMap),
    [entryFieldMapDraft, selectedEntryFieldMap],
  );
  const selectedSourceDisplayColumns = useMemo(() => {
    if (!selectedSource) {
      return [];
    }

    const widestRow = (selectedSource.rows || []).reduce((max, row) => Math.max(max, row.values?.length || 0), 0);
    const columnCount = Math.max(selectedSource.columns?.length || 0, widestRow, selectedEntryFields.length);

    return Array.from({ length: columnCount }, (_item, index) => {
      const storedColumn = selectedSource.columns?.[index];
      const baseLabel =
        storedColumn?.label ||
        selectedEntryFields[index]?.label ||
        selectedEntryFields[index]?.name ||
        `Column ${index + 1}`;
      const mappedField = effectiveSelectedEntryFieldMap.find((field) => field.sourceColumnIndex === index) || null;
      const vmixFieldName = mappedField?.vmixFieldName || null;
      const targetLabel = mappedField?.label || mappedField?.name || null;

      return {
        id: storedColumn?.id || `col-${index}`,
        label: baseLabel,
        binding:
          selectedEntry?.entryType === 'vmix'
            ? (targetLabel ? `${targetLabel}${vmixFieldName && vmixFieldName !== targetLabel ? ` В· ${vmixFieldName}` : ''}` : null)
            : (targetLabel || null),
      };
    });
  }, [effectiveSelectedEntryFieldMap, selectedEntry?.entryType, selectedEntryFields, selectedSource]);
  const sourceMappingColumns = useMemo(() => {
    const widestRow = (selectedSource?.rows || []).reduce((max, row) => Math.max(max, row.values?.length || 0), 0);
    const columnCount = Math.max(selectedSource?.columns?.length || 0, widestRow);

    return Array.from({ length: columnCount }, (_item, index) => ({
      index,
      id: selectedSource?.columns?.[index]?.id || `col-${index}`,
      label: selectedSource?.columns?.[index]?.label || `Column ${index + 1}`,
    }));
  }, [selectedSource]);
  const sourceColumnChoices = useMemo(() => sourceMappingColumns, [sourceMappingColumns]);
  const selectedLinkedTimerId = getSourceLinkedTimerId(selectedSource, selectedOutput?.id);
  const selectedSyncGroupId = selectedOutput?.syncGroupId || null;
  const syncedOutputIds = useMemo(
    () =>
      selectedSyncGroupId
        ? outputs.filter((output) => output.syncGroupId === selectedSyncGroupId).map((output) => output.id)
        : selectedOutput?.id
          ? [selectedOutput.id]
          : [],
    [outputs, selectedOutput?.id, selectedSyncGroupId],
  );
  const visibleEntries = useMemo(
    () => (snapshot?.entries || []).filter((entry) => showHiddenEntries || !entry.hidden),
    [showHiddenEntries, snapshot?.entries],
  );
  const localTimerTemplates = useMemo(
    () => templates.filter((template) => Array.isArray(template.timers) && template.timers.length > 0),
    [templates],
  );
  const localTimerTemplateMap = useMemo(
    () => new Map(localTimerTemplates.map((template) => [template.id, template])),
    [localTimerTemplates],
  );
  const linkedSourceTimer = useMemo(
    () => timers.find((timer) => timerIdMatches(timer, selectedLinkedTimerId)) || null,
    [selectedLinkedTimerId, timers],
  );
  const outputInfo = useMemo(() => {
    if (!systemInfo) {
      return null;
    }

    const controlUrl =
      systemInfo.recommendedRenderUrl?.replace(/\/render(?:\.html)?(?:\?.*)?$/i, '') ||
      systemInfo.networkUrls?.[0]?.replace(/\/render(?:\.html)?(?:\?.*)?$/i, '') ||
      systemInfo.localUrls?.[0]?.replace(/\/render(?:\.html)?(?:\?.*)?$/i, '') ||
      BACKEND_ORIGIN;
    const primaryRenderUrl =
      systemInfo.recommendedRenderUrl ||
      systemInfo.networkUrls?.[0] ||
      systemInfo.localUrls?.[0] ||
      `${BACKEND_ORIGIN}/render.html`;
    const primaryPreviewUrl = systemInfo.recommendedPreviewUrl || `${primaryRenderUrl}?preview=1`;
    const fallbackUrls = [...new Set([...(systemInfo.networkUrls || []), ...(systemInfo.localUrls || [])])].filter(
      (url) => url !== primaryRenderUrl,
    );

    return {
      controlUrl,
      primaryRenderUrl,
      primaryPreviewUrl,
      fallbackUrls,
    };
  }, [systemInfo]);
  const manualRowColumns = useMemo(() => {
    const templateColumns = selectedEntryFields.map((field, index) => ({
      id: `manual-col-${index}`,
      label: field.label || field.name,
    }));

    if (templateColumns.length) {
      return templateColumns;
    }

    return selectedSource?.columns || [];
  }, [selectedEntryFields, selectedSource]);
  const bitfocusActions = useMemo(
    () => [
      {
        id: 'show',
        label: 'SHOW',
        url: `${BACKEND_ORIGIN}/api/commands/show`,
        payload: { entryId: selectedOutput?.selectedEntryId || undefined, outputId: selectedOutput?.id || undefined },
      },
      {
        id: 'live',
        label: 'LIVE',
        url: `${BACKEND_ORIGIN}/api/commands/live`,
        payload: { entryId: selectedOutput?.selectedEntryId || undefined, outputId: selectedOutput?.id || undefined },
      },
      {
        id: 'hide',
        label: 'HIDE',
        url: `${BACKEND_ORIGIN}/api/commands/hide`,
        payload: { outputId: selectedOutput?.id || undefined },
      },
      {
        id: 'previous-title',
        label: 'PREVIOUS TITLE',
        url: `${BACKEND_ORIGIN}/api/commands/previous-title`,
        payload: { outputId: selectedOutput?.id || undefined },
      },
      {
        id: 'next-title',
        label: 'NEXT TITLE',
        url: `${BACKEND_ORIGIN}/api/commands/next-title`,
        payload: { outputId: selectedOutput?.id || undefined },
      },
    ],
    [selectedOutput?.id, selectedOutput?.selectedEntryId],
  );
  const outputRenderTargets = useMemo(() => {
    if (!outputInfo) {
      return [];
    }

    return outputs.map((output) => ({
      id: output.id,
      name: output.name,
      key: output.key,
      renderUrl: `${outputInfo.primaryRenderUrl}?output=${encodeURIComponent(output.key)}`,
      previewUrl: `${outputInfo.primaryPreviewUrl}&output=${encodeURIComponent(output.key)}`,
    }));
  }, [outputInfo, outputs]);
  const embeddedRenderUrl = useMemo(() => {
    if (!selectedOutput?.key) {
      return `${BACKEND_ORIGIN}/render.html?embed=1`;
    }

    return `${BACKEND_ORIGIN}/render.html?embed=1&output=${encodeURIComponent(selectedOutput.key)}`;
  }, [selectedOutput?.key]);
  const embeddedPreviewUrl = useMemo(() => {
    if (!selectedOutput?.key) {
      return `${BACKEND_ORIGIN}/render.html?preview=1&embed=1`;
    }

    return `${BACKEND_ORIGIN}/render.html?preview=1&embed=1&output=${encodeURIComponent(selectedOutput.key)}`;
  }, [selectedOutput?.key]);
  const expandedRenderUrl = expandedRender === 'preview' ? embeddedPreviewUrl : embeddedRenderUrl;
  const shortcutBindings = snapshot?.integrations?.shortcuts || {
    show: '',
    live: '',
    hide: '',
    nextTitle: '',
    previousTitle: '',
    outputSelectById: {},
  };
  const activeSourceBinding = selectedOutput ? activeSourceRows[selectedOutput.id] || null : null;
  const activeTimerBinding = selectedOutput ? activeTimerRows[selectedOutput.id] || null : null;
  const reminderRow = useMemo(() => {
    if (!pendingReminder) {
      return null;
    }

    const source = sourceLibrary.find((item) => item.id === pendingReminder.sourceId);
    return source?.rows?.find((row) => row.id === pendingReminder.rowId) || null;
  }, [pendingReminder, sourceLibrary]);
  const reminderSource = useMemo(
    () => (pendingReminder ? sourceLibrary.find((item) => item.id === pendingReminder.sourceId) || null : null),
    [pendingReminder, sourceLibrary],
  );
  const reminderLinkedTimerId = useMemo(
    () => getSourceLinkedTimerId(reminderSource, pendingReminder?.outputId),
    [pendingReminder?.outputId, reminderSource],
  );
  const reminderLinkedTimer = useMemo(
    () => timers.find((timer) => timerIdMatches(timer, reminderLinkedTimerId)) || null,
    [reminderLinkedTimerId, timers],
  );

  useEffect(() => {
    if (!folderInputRef.current) return;
    folderInputRef.current.setAttribute('webkitdirectory', '');
    folderInputRef.current.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    saveSourceLibrary(sourceLibrary);
  }, [sourceLibrary]);

  useEffect(() => {
    if (!sourceLibrary.length) {
      setSelectedSourceId('');
      return;
    }

    if (!sourceLibrary.some((item) => item.id === selectedSourceId)) {
      setSelectedSourceId(sourceLibrary[0].id);
    }
  }, [sourceLibrary, selectedSourceId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now();

      sourceLibrary.forEach((source) => {
        const remoteConfig = source.remote;
        if (!remoteConfig?.autoRefresh || !remoteConfig?.url) {
          return;
        }

        const refreshIntervalMs = Math.max(10, Number(remoteConfig.refreshIntervalSec || 30)) * 1000;
        const lastFetchedAt = remoteConfig.lastFetchedAt ? Date.parse(remoteConfig.lastFetchedAt) : 0;

        if (remoteRefreshStateRef.current[source.id] || (lastFetchedAt && now - lastFetchedAt < refreshIntervalMs)) {
          return;
        }

        void refreshRemoteSource(source.id, { silent: true });
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [sourceLibrary]);

  useEffect(() => {
    setActiveTimerRows((current) => {
      const next = { ...current };
      let changed = false;

      for (const [outputId, binding] of Object.entries(current)) {
        const source = sourceLibrary.find((item) => item.id === binding?.sourceId);
        const row = source?.rows?.find((item) => item.id === binding?.rowId);
        const timerExists = timers.some((timer) => timerIdMatches(timer, binding?.timerId));

        if (!source || !row || !timerExists) {
          delete next[outputId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [sourceLibrary, timers]);

  useEffect(() => {
    if (!selectedEntry) {
      setDraftName('');
      setDraftFields({});
      setEntryFieldMapDraft(null);
      return;
    }

    setDraftName(selectedEntry.name || '');
    setDraftFields(selectedEntry.fields || {});
    setEntryFieldMapDraft(null);
  }, [selectedEntry?.id, selectedEntry?.updatedAt]);

  useEffect(() => {
    if (!entryFieldMapDraft?.length) {
      return;
    }

    if (buildFieldMapSignature(entryFieldMapDraft) === buildFieldMapSignature(selectedEntryFieldMap)) {
      setEntryFieldMapDraft(null);
    }
  }, [entryFieldMapDraft, selectedEntryFieldMap]);

  useEffect(() => {
    latestDraftRef.current = {
      name: draftName,
      fields: draftFields,
    };
  }, [draftFields, draftName]);

  useEffect(() => {
    if (!outputs.length) {
      if (localSelectedOutputId !== null) {
        setLocalSelectedOutputId(null);
      }
      return;
    }

    const localOutputExists = localSelectedOutputId && outputs.some((output) => output.id === localSelectedOutputId);
    if (localOutputExists) {
      return;
    }

    const preferredOutputId =
      (snapshot?.selectedOutputId && outputs.some((output) => output.id === snapshot.selectedOutputId)
        ? snapshot.selectedOutputId
        : outputs[0]?.id) || null;

    if (preferredOutputId && preferredOutputId !== localSelectedOutputId) {
      setLocalSelectedOutputId(preferredOutputId);
    }
  }, [localSelectedOutputId, outputs, snapshot?.selectedOutputId]);

  useEffect(() => {
    if (!templates.length) return;
    setNewEntryTemplateId((current) => current || templates[0].id);
    setTxtTemplateId((current) => current || templates[0].id);
  }, [templates]);

  useEffect(() => {
    if (!vmixTitleInputs.length) {
      return;
    }

    setNewVmixInputKey((current) => {
      if (current && vmixTitleInputs.some((input) => (input.key || input.number) === current)) {
        return current;
      }

      return vmixTitleInputs[0].key || vmixTitleInputs[0].number || '';
    });
  }, [vmixTitleInputs]);

  useEffect(() => {
    setVmixHostDraft(vmixState?.config?.host || snapshot?.integrations?.vmix?.host || 'http://127.0.0.1:8088');
  }, [vmixState?.config?.host, snapshot?.integrations?.vmix?.host]);

  useEffect(() => {
    let mounted = true;

    api('/api/app/meta')
      .then((payload) => {
        if (mounted) {
          setAppMeta(payload);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!desktopBridge?.getProjectStatus) {
      return undefined;
    }

    desktopBridge
      .getProjectStatus()
      .then((status) => {
        if (mounted && status) {
          setProjectStatus(status);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [desktopBridge]);

  useEffect(() => {
    let mounted = true;

    if (!desktopBridge?.getYandexAuthSettings) {
      return undefined;
    }

    desktopBridge
      .getYandexAuthSettings()
      .then((payload) => {
        if (mounted && payload) {
          setYandexAuthState((current) => ({ ...current, ...payload }));
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [desktopBridge]);

  useEffect(() => {
    let mounted = true;

    if (!styleEditorEntry) {
      return undefined;
    }

    if (!desktopBridge?.getSystemFonts) {
      return undefined;
    }

    setSystemFontOptions([]);
    setSystemFontAssetMap({});
    setSystemFontOptionsLoading(true);
    desktopBridge
      .getSystemFonts({ force: true })
      .then((payload) => {
        if (!mounted || !payload) {
          return;
        }
        const nextFonts = Array.isArray(payload.fonts)
          ? payload.fonts.filter((item) => typeof item === 'string' && item.trim())
          : [];
        const nextFontAssetMap = Object.fromEntries(
          Object.entries(payload.fontFiles && typeof payload.fontFiles === 'object' ? payload.fontFiles : {})
            .map(([fontName, filePaths]) => [
              String(fontName || '').trim(),
              pickPreferredFontFile(fontName, filePaths),
            ])
            .filter(([fontName, filePath]) => fontName && filePath),
        );
        setSystemFontOptions(nextFonts);
        setSystemFontAssetMap(nextFontAssetMap);
      })
      .catch(() => {
        if (mounted) {
          setSystemFontOptions([]);
          setSystemFontAssetMap({});
        }
      })
      .finally(() => {
        if (mounted) {
          setSystemFontOptionsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [desktopBridge, styleEditorEntry?.id]);

  useEffect(() => {
    if (!styleEditorEntry || !Object.keys(systemFontAssetMap).length) {
      return;
    }

    setStyleEditorDraft((current) => {
      let changed = false;
      const next = { ...current };

      Object.entries(current).forEach(([fieldName, style]) => {
        const fontFamily = typeof style?.fontFamily === 'string' ? style.fontFamily.trim() : '';
        const fontSourcePath = typeof style?.fontSourcePath === 'string' ? style.fontSourcePath.trim() : '';
        const mappedFontPath = fontFamily ? systemFontAssetMap[fontFamily] || '' : '';

        if (fontFamily && mappedFontPath && fontSourcePath !== mappedFontPath) {
          next[fieldName] = {
            ...style,
            fontSourcePath: mappedFontPath,
          };
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [styleEditorEntry?.id, systemFontAssetMap]);

  useEffect(() => {
    let mounted = true;

    if (!desktopBridge?.getStartupProject) {
      return undefined;
    }

    desktopBridge
      .getStartupProject()
      .then(async (result) => {
        if (!mounted || !result) {
          return;
        }

        if (result.status) {
          setProjectStatus(result.status);
        }

        if (result.project) {
          await applyProjectDocument(result.project, result.status || null);
          pushFeedback(`Project opened: ${result.path?.split(/[\\/]/).pop() || 'project'}`);
        } else if (result.error) {
          pushFeedback(result.error);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [desktopBridge]);

  useEffect(() => {
    const nextTitle = buildWindowTitle(currentProjectDisplayName, projectDirty);
    document.title = nextTitle;
    desktopBridge?.setWindowTitle?.({ title: nextTitle });
  }, [currentProjectDisplayName, projectDirty, desktopBridge]);

  useEffect(() => {
    if (!currentProjectSignature) {
      return;
    }

    setProjectBaselineSignature((current) => current || currentProjectSignature);
  }, [currentProjectSignature]);

  useEffect(() => {
    if (!currentProjectSignature || !projectBaselineSignature) {
      return;
    }

    setProjectDirty(currentProjectSignature !== projectBaselineSignature);
  }, [currentProjectSignature, projectBaselineSignature]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!projectDirty || appCloseAuthorizedRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [projectDirty]);

  useEffect(() => {
    const nextValues = {};

    manualRowColumns.forEach((_column, index) => {
      nextValues[index] = '';
    });

    setManualRowValues(nextValues);
  }, [selectedSource?.id, selectedEntry?.id, manualRowColumns.length]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setSourceRowTimers((current) => {
        let changed = false;
        const now = Date.now();
        const next = { ...current };

        for (const [rowKey, timer] of Object.entries(current)) {
          if (timer.status !== 'running') {
            continue;
          }

          const elapsed = now - (timer.lastTickAt || now);
          const nextMs = Math.max(0, timer.currentMs - elapsed);
          changed = true;
          next[rowKey] = {
            ...timer,
            currentMs: nextMs,
            lastTickAt: now,
            status: nextMs === 0 ? 'finished' : 'running',
          };
        }

        return changed ? next : current;
      });
    }, 250);

    return () => window.clearInterval(timerId);
  }, []);

  const getSourceRowTimerState = (sourceId, row, linkedTimer = null, isTimerRow = false) => {
    if (linkedTimer && isTimerRow) {
      return {
        status: getLinkedTimerStatus(linkedTimer, Number(row.timer?.baseMs || 0)),
        currentMs: Number(linkedTimer.currentMs ?? 0),
        lastTickAt: linkedTimer.startedAt ? new Date(linkedTimer.startedAt).valueOf() : null,
        linked: true,
      };
    }

    const rowKey = getSourceRowEditKey(sourceId, row.id);
    return sourceRowTimers[rowKey] || {
      status: 'idle',
      currentMs: Number(row.timer?.baseMs || 0),
      lastTickAt: null,
    };
  };

  const updateSourceRowTimerBase = async (sourceId, rowId, nextBaseMs, options = {}) => {
    if (selectedOutput?.id && options.linkedTimer) {
      setActiveTimerRows((current) => ({
        ...current,
        [selectedOutput.id]: {
          sourceId,
          rowId,
          timerId: normalizeLinkedTimerId(options.linkedTimer?.id || options.linkedTimerId || options.syncTimerId),
        },
      }));
    }

    setSourceLibrary((current) =>
      current.map((source) => {
        if (source.id !== sourceId) {
          return source;
        }

        return {
          ...source,
          rows: source.rows.map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  timer: {
                    ...(row.timer || {}),
                    baseMs: Math.max(0, nextBaseMs),
                    format: row.timer?.format || 'mm:ss',
                  },
                }
              : row,
          ),
        };
      }),
    );
    const rowKey = getSourceRowEditKey(sourceId, rowId);
    setSourceRowTimers((current) => ({
      ...current,
      [rowKey]: {
        status: 'idle',
        currentMs: Math.max(0, nextBaseMs),
        lastTickAt: null,
      },
    }));

    const effectiveSyncTimerId = normalizeLinkedTimerId(
      options.syncTimerId || options.linkedTimerId || options.linkedTimer?.id || null,
    );

    if (effectiveSyncTimerId) {
      await updateTimer(effectiveSyncTimerId, {
        durationMs: Math.max(0, nextBaseMs),
        valueMs: Math.max(0, nextBaseMs),
      });
    }
  };

  const adjustSourceRowTimerSegment = async (sourceId, row, segment, delta, options = {}) => {
    const currentMs = Number(options.currentMs ?? (row.timer?.baseMs || 0));
    const nextBaseMs = changeTimerSegment(currentMs, segment, delta);
    await updateSourceRowTimerBase(sourceId, row.id, nextBaseMs, {
      syncTimerId: options.syncTimerId || null,
      linkedTimerId: options.linkedTimerId || null,
      linkedTimer: options.linkedTimer || null,
    });
  };

  const controlSourceRowTimer = async (sourceId, row, action, options = {}) => {
    const rowKey = getSourceRowEditKey(sourceId, row.id);
    const currentTimer = getSourceRowTimerState(sourceId, row, options.linkedTimer || null, options.isTimerRow || false);
    const effectiveSyncTimerId = normalizeLinkedTimerId(
      options.syncTimerId || options.linkedTimerId || options.linkedTimer?.id || null,
    );
    const isLinkedTimer = Boolean(effectiveSyncTimerId && options.linkedTimer);

    if (selectedOutput?.id && options.linkedTimer) {
      setActiveTimerRows((current) => ({
        ...current,
        [selectedOutput.id]: {
          sourceId,
          rowId: row.id,
          timerId: normalizeLinkedTimerId(effectiveSyncTimerId),
        },
      }));
    }

    if (action === 'toggle') {
      const shouldPause = currentTimer.status === 'running';
      if (effectiveSyncTimerId) {
        if (!shouldPause && selectedOutput?.id && activeTimerBinding?.timerId && normalizeLinkedTimerId(activeTimerBinding.timerId) !== effectiveSyncTimerId) {
          await commandTimer(activeTimerBinding.timerId, 'stop');
        }

        if (shouldPause) {
          await commandTimer(effectiveSyncTimerId, 'stop');
        } else {
          if (selectedOutput?.id) {
            const output = outputs.find((item) => item.id === selectedOutput.id) || selectedOutput;
            const outputEntry = snapshot?.entries?.find((entry) => entry.id === output?.selectedEntryId) || selectedEntry;
            await ensureTimerRoutedToEntry(options.linkedTimer, output, outputEntry);
          }
          await updateTimer(effectiveSyncTimerId, {
            durationMs: Number(row.timer?.baseMs || 0),
            valueMs: Math.max(0, currentTimer.currentMs || Number(row.timer?.baseMs || 0)),
          });
          await commandTimer(effectiveSyncTimerId, 'start');
        }
      }

      if (!isLinkedTimer) {
        setSourceRowTimers((current) => ({
          ...Object.fromEntries(
            Object.entries(current).map(([key, timerState]) => [
              key,
              key === rowKey
                ? {
                    status: shouldPause ? 'paused' : 'running',
                    currentMs: shouldPause ? currentTimer.currentMs : Math.max(0, currentTimer.currentMs || Number(row.timer?.baseMs || 0)),
                    lastTickAt: Date.now(),
                  }
                : timerState.status === 'running'
                  ? {
                      ...timerState,
                      status: 'paused',
                      lastTickAt: null,
                    }
                  : timerState,
            ]),
          ),
        }));

        if (selectedOutput?.id && !shouldPause) {
          setActiveTimerRows((current) => ({
            ...current,
            [selectedOutput.id]: {
              sourceId,
              rowId: row.id,
              timerId: normalizeLinkedTimerId(effectiveSyncTimerId),
            },
          }));
        }
      }
      return;
    }

    if (action === 'reset') {
      await updateSourceRowTimerBase(sourceId, row.id, 0, {
        syncTimerId: options.syncTimerId || null,
        linkedTimer: options.linkedTimer || null,
      });
      if (effectiveSyncTimerId) {
        await commandTimer(effectiveSyncTimerId, 'reset');
      }

      if (selectedOutput?.id) {
        setActiveTimerRows((current) => {
          const next = { ...current };
          if (next[selectedOutput.id]?.sourceId === sourceId && next[selectedOutput.id]?.rowId === row.id) {
            delete next[selectedOutput.id];
          }
          return next;
        });
      }
    }
  };

  const pushFeedback = (message) => {
    setFeedback(message);
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(''), 2600);
  };

  const persistDraft = async (override = null) => {
    if (!selectedEntry) return;
    const payload = override || latestDraftRef.current;

    await api(`/api/entries/${selectedEntry.id}`, {
      method: 'PUT',
      body: { name: payload.name, fields: payload.fields },
    });

    if (
      autoUpdate &&
      (
        (selectedEntry.entryType === 'vmix') ||
        (program?.visible && program.entryId === selectedEntry.id)
      )
    ) {
      if (selectedEntry.entryType === 'vmix') {
        await api(`/api/entries/${selectedEntry.id}/vmix-sync`, {
          method: 'POST',
          body: { action: 'update' },
        });
      } else {
        await api('/api/program/update', {
          method: 'POST',
          body: { entryId: selectedEntry.id, outputId: selectedOutput?.id },
        });
      }
    }
  };

  const schedulePersist = (override = null) => {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      persistDraft(override).catch((requestError) => pushFeedback(requestError.message));
    }, 180);
  };

  const updateSelectedVmixEntry = async (patch = {}) => {
    if (!selectedEntry || selectedEntry.entryType !== 'vmix') {
      return;
    }

    try {
      await api(`/api/entries/${selectedEntry.id}`, {
        method: 'PUT',
        body: patch,
      });
      pushFeedback('vMix title updated');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const updateSelectedVmixFieldBinding = async (fieldName, vmixFieldName) => {
    if (!selectedEntry || selectedEntry.entryType !== 'vmix') {
      return;
    }

    const nextFieldMap = effectiveSelectedEntryFieldMap.map((field) =>
      field.name === fieldName
        ? {
            ...field,
            vmixFieldName: vmixFieldName || field.vmixFieldName || field.label || field.name,
          }
        : field,
    );
    await updateSelectedFieldMap(nextFieldMap, 'vMix title mapping updated');
  };

  const updateSelectedFieldMap = async (nextFieldMap, feedbackMessage) => {
    if (!selectedEntry) {
      return;
    }

    setEntryFieldMapDraft(nextFieldMap);
    const binding = selectedOutput?.id ? activeSourceRows[selectedOutput.id] || null : null;
    const boundSource = binding?.sourceId ? sourceLibrary.find((item) => item.id === binding.sourceId) || null : null;
    const boundRow = binding?.rowId ? (boundSource?.rows || []).find((row) => row.id === binding.rowId) || null : null;
    const nextFields = boundRow
      ? applyRowToFields(selectedEntryFields, boundRow.values, selectedEntry.fields || {}, nextFieldMap)
      : null;
    const nextName = boundRow?.values?.[0] || selectedEntry.name;
    const patch = selectedEntry.entryType === 'vmix' ? { vmixFieldMap: nextFieldMap } : { localFieldMap: nextFieldMap };

    try {
      await api(`/api/entries/${selectedEntry.id}`, {
        method: 'PUT',
        body: {
          ...patch,
          ...(nextFields ? { fields: nextFields, name: nextName } : {}),
        },
      });

      if (nextFields) {
        setDraftFields(nextFields);
        setDraftName(nextName);

        if (autoUpdate) {
          if (selectedEntry.entryType === 'vmix') {
            await api(`/api/entries/${selectedEntry.id}/vmix-sync`, {
              method: 'POST',
              body: { action: 'update' },
            });
          } else if (program?.visible && program.entryId === selectedEntry.id) {
            await api('/api/program/update', {
              method: 'POST',
              body: { entryId: selectedEntry.id, outputId: selectedOutput?.id },
            });
          }
        }
      }

      pushFeedback(feedbackMessage);
    } catch (requestError) {
      setEntryFieldMapDraft(null);
      pushFeedback(requestError.message);
    }
  };

  const updateSelectedSourceColumnMapping = async (columnIndex, targetFieldName) => {
    if (!selectedEntry) {
      return;
    }

    const parsedIndex = Number.parseInt(columnIndex ?? '', 10);
    const resolvedIndex = Number.isFinite(parsedIndex) ? parsedIndex : -1;
    const nextFieldMap = effectiveSelectedEntryFieldMap.map((field) => {
      if (!targetFieldName) {
        return field.sourceColumnIndex === resolvedIndex
          ? {
              ...field,
              sourceColumnIndex: -1,
            }
          : field;
      }

      if (field.name === targetFieldName) {
        return {
          ...field,
          sourceColumnIndex: resolvedIndex,
        };
      }

      if (field.sourceColumnIndex === resolvedIndex) {
        return {
          ...field,
          sourceColumnIndex: -1,
        };
      }

      return field;
    });

    await updateSelectedFieldMap(nextFieldMap, `${selectedEntry.entryType === 'vmix' ? 'vMix' : 'Local'} source mapping updated`);
  };

  const selectEntry = async (entryId) => {
    setBusyAction(`select-${entryId}`);

    try {
      await api(`/api/entries/${entryId}/select`, {
        method: 'POST',
        body: { outputId: selectedOutput?.id },
      });
    } finally {
      setBusyAction('');
    }
  };

  const selectOutput = async (outputId) => {
    setBusyAction(`output-${outputId}`);
    setLocalSelectedOutputId(outputId);
    setBusyAction('');
  };

  const createOutput = async () => {
    try {
      await api('/api/outputs', {
        method: 'POST',
        body: { name: `OUTPUT ${outputs.length + 1}` },
      });
      pushFeedback('Output added');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const updateOutput = async (outputId, patch) => {
    try {
      await api(`/api/outputs/${outputId}`, {
        method: 'PUT',
        body: patch,
      });
      pushFeedback('Output updated');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const deleteOutput = async (outputId) => {
    try {
      await api(`/api/outputs/${outputId}`, { method: 'DELETE' });
      setActiveSourceRows((current) => {
        const next = { ...current };
        delete next[outputId];
        return next;
      });
      setActiveTimerRows((current) => {
        const next = { ...current };
        delete next[outputId];
        return next;
      });
      pushFeedback('Output deleted');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const runProgramAction = async (action, entryId) => {
    if (action !== 'hide' && !selectedEntry) return;
    if (action === 'update' && selectedEntry?.entryType === 'vmix') {
      pushFeedback('LIVE is not used for vMix titles');
      return;
    }

    setBusyAction(action);

    try {
      if (action !== 'hide') {
        await persistDraft();
      }

      await api(`/api/program/${action}`, {
        method: 'POST',
        body: {
          ...(entryId ? { entryId } : {}),
          outputId: selectedOutput?.id,
        },
      });

      pushFeedback(`${action === 'update' ? 'LIVE' : action.toUpperCase()} sent`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const createEntry = async () => {
    setBusyAction('create-entry');

    try {
      if (newEntryMode === 'vmix') {
        const vmixConfig = buildVmixEntryConfig(selectedNewVmixInput);

        await api('/api/entries', {
          method: 'POST',
          body: {
            entryType: 'vmix',
            templateId: 'vmix',
            name: newEntryName || selectedNewVmixInput?.title || selectedNewVmixInput?.shortTitle || 'vMix Title',
            vmixInputKey:
              newVmixInputKey || selectedNewVmixInput?.key || selectedNewVmixInput?.number || '',
            vmixInputTitle:
              selectedNewVmixInput?.title || selectedNewVmixInput?.shortTitle || 'vMix Title',
            vmixFieldMap: vmixConfig.fieldMap,
            fields: vmixConfig.fields,
          },
        });
      } else {
        await api('/api/entries', {
          method: 'POST',
          body: { templateId: newEntryTemplateId, name: newEntryName },
        });
      }

      setShowAddModal(false);
      setNewEntryName('');
      setNewEntryMode('local');
      pushFeedback('Title added to rundown');
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const uploadTemplate = async () => {
    if (!uploadFiles.length) {
      pushFeedback('Р’С‹Р±РµСЂРёС‚Рµ ZIP, РїР°РїРєСѓ РёР»Рё HTML/CSS/JS С„Р°Р№Р»С‹');
      return;
    }

    setBusyAction('upload-template');

    try {
      await api('/api/templates/upload', {
        method: 'POST',
        body: buildUploadFormData(uploadFiles, uploadName),
      });

      setUploadFiles([]);
      setUploadName('');
      setShowAddModal(false);
      setTemplateValidationReport(null);
      pushFeedback('РЁР°Р±Р»РѕРЅ Р·Р°РіСЂСѓР¶РµРЅ');
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const importTxtToRundown = async () => {
    const text = txtPayload.trim();

    if (!text) {
      pushFeedback('Р’СЃС‚Р°РІСЊС‚Рµ TXT-РґР°РЅРЅС‹Рµ РёР»Рё РІС‹Р±РµСЂРёС‚Рµ TXT С„Р°Р№Р»');
      return;
    }

    setBusyAction('import-txt');

    try {
      await api('/api/import/txt', {
        method: 'POST',
        body: { templateId: txtTemplateId, text, outputId: selectedOutput?.id },
      });

      setTxtPayload('');
      setTxtFileName('');
      setShowImportModal(false);
      pushFeedback('TXT РґРѕР±Р°РІР»РµРЅ РІ rundown');
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const onTxtFilePicked = async (file) => {
    if (!file) return;
    setTxtPayload(await file.text());
    setTxtFileName(file.name);
  };

  const importSourceDataset = async () => {
    const rawText = sourcePayload.trim();

    if (!rawText) {
      pushFeedback('Р—Р°РіСЂСѓР·РёС‚Рµ TXT/CSV С„Р°Р№Р» РёР»Рё РІСЃС‚Р°РІСЊС‚Рµ СЃС‚СЂРѕРєРё РёСЃС‚РѕС‡РЅРёРєР°');
      return;
    }

    try {
      const dataset = parseSourceText({
        text: rawText,
        name: sourceName || sourceFileName || 'Source Table',
        templateFields: selectedEntryFields,
      });

      setSourceLibrary((current) => [dataset, ...current]);
      setSelectedSourceId(dataset.id);
      setSourcePayload('');
      setSourceName('');
      setSourceFileName('');
      pushFeedback('РСЃС‚РѕС‡РЅРёРє РґРѕР±Р°РІР»РµРЅ РІ С‚Р°Р±Р»РёС†Сѓ');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const onSourceFilePicked = async (file) => {
    if (!file) return;
    setSourcePayload(await file.text());
    setSourceFileName(file.name);
    setSourceName(file.name.replace(/\.[^.]+$/, ''));
  };

  const replaceSelectedSourceFromFile = async (file) => {
    if (!file || !selectedSource) return;

    try {
      const nextDataset = parseSourceText({
        text: await file.text(),
        name: selectedSource.name || file.name.replace(/\.[^.]+$/, ''),
        templateFields: selectedEntryFields,
      });

      setSourceLibrary((current) =>
        current.map((source) =>
          source.id === selectedSource.id
            ? {
                ...nextDataset,
                id: source.id,
                name: source.name,
                remote: null,
                linkedTimerId: source.linkedTimerId || null,
                linkedTimerByOutput: source.linkedTimerByOutput || {},
                createdAt: source.createdAt || nextDataset.createdAt,
              }
            : source,
        ),
      );
      setSourceFileName(file.name);
      pushFeedback(`${selectedSource.name} replaced from file`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const pickTemplateFolder = async () => {
    if (!desktopBridge?.pickTemplateFolder) {
      pushFeedback('Folder import is available in the desktop app only');
      return;
    }

    try {
      const result = await desktopBridge.pickTemplateFolder();

      if (result?.canceled || !result?.directoryPath) {
        return;
      }

      setUploadDirectoryPath(result.directoryPath);
      setUploadFiles([]);
      if (!uploadName.trim()) {
        const folderName = result.directoryPath.split(/[/\\]/).filter(Boolean).pop() || '';
        setUploadName(folderName);
      }
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const uploadTemplateFromSelection = async () => {
    if (!uploadFiles.length && !uploadDirectoryPath) {
      pushFeedback('Choose a ZIP file, template files, or a folder first');
      return;
    }

    setBusyAction('upload-template');

    try {
      let importedTemplate = null;

      if (uploadDirectoryPath) {
        importedTemplate = await api('/api/templates/import-directory', {
          method: 'POST',
          body: {
            directoryPath: uploadDirectoryPath,
            name: uploadName,
          },
        });
      } else {
        importedTemplate = await api('/api/templates/upload', {
          method: 'POST',
          body: buildUploadFormData(uploadFiles, uploadName),
        });
      }

      if (importedTemplate?.id) {
        await api('/api/entries', {
          method: 'POST',
          body: {
            templateId: importedTemplate.id,
            name: uploadName.trim() || importedTemplate.name || '',
          },
        });
        setNewEntryMode('local');
        setNewEntryTemplateId(importedTemplate.id);
        setNewEntryName('');
      }

      setUploadFiles([]);
      setUploadDirectoryPath('');
      setUploadName('');
      setShowAddModal(false);
      setTemplateValidationReport(null);
      pushFeedback(importedTemplate?.id ? 'Template uploaded and added to rundown' : 'Template uploaded');
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const deleteCustomTemplate = async (templateId, nextSelectionSetter = null) => {
    if (!templateId) {
      return;
    }

    try {
      await api(`/api/templates/${encodeURIComponent(templateId)}`, {
        method: 'DELETE',
      });

      const fallbackTemplate = templates.find((template) => template.source !== 'custom') || templates[0] || null;
      if (typeof nextSelectionSetter === 'function') {
        nextSelectionSetter(fallbackTemplate?.id || '');
      }
      pushFeedback('Custom template removed');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const importRemoteSourceDataset = async () => {
    const remoteConfig = createRemoteSourceConfig({
      type: remoteSourceType,
      url: remoteSourceUrl,
      autoRefresh: remoteSourceAutoRefresh,
      refreshIntervalSec: remoteSourceRefreshIntervalSec,
    });

    if (!remoteConfig?.url) {
      pushFeedback('Add a remote CSV or Google Sheets URL first');
      return;
    }

    try {
      setBusyAction('import-remote-source');
      const payload = await fetchRemoteSourcePayload(api, remoteConfig);
      const dataset = buildSourceFromRemoteFetch({
        payload,
        fallbackName: getRemoteImportFallbackName({ remoteConfig, remoteSourceName, sourceName }),
        remoteConfig,
        fallbackFields: selectedEntryFields,
      });

        setSourceLibrary((current) => [dataset, ...current]);
        setSelectedSourceId(dataset.id);
        setRemoteSourceName('');
        setRemoteSourceUrl('');
        setRemoteSourceAutoRefresh(true);
        setRemoteSourceRefreshIntervalSec(30);
        pushFeedback(`${getRemoteSourceTypeLabel(remoteConfig.type)} source added`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const refreshRemoteSource = async (sourceId, { silent = false, remoteConfigOverride = null, sourceOverride = null } = {}) => {
    const source = sourceOverride || sourceLibrary.find((item) => item.id === sourceId);
    const remoteConfig = createRemoteSourceConfig({
      ...(source?.remote || {}),
      ...(remoteConfigOverride || {}),
    });

    if (!source || !remoteConfig?.url) {
      return;
    }

    if (remoteRefreshStateRef.current[sourceId]) {
      return remoteRefreshStateRef.current[sourceId];
    }

    const refreshPromise = (async () => {
      try {
        if (!silent) {
          setBusyAction(`refresh-source-${sourceId}`);
        }
        const payload = await fetchRemoteSourcePayload(api, remoteConfig);
        const nextSource = buildSourceFromRemoteFetch({
          currentSource: source,
          payload,
          fallbackName: source.name,
          remoteConfig,
          fallbackFields: selectedEntryFields,
        });

        setSourceLibrary((current) => current.map((item) => (item.id === sourceId ? nextSource : item)));
        if (!silent) {
          pushFeedback(`${source.name} refreshed`);
        }
      } catch (requestError) {
        setSourceLibrary((current) =>
          current.map((item) =>
            item.id === sourceId
              ? {
                  ...item,
                  remote: createRemoteSourceConfig({
                    ...(item.remote || {}),
                    sheetName: item.remote?.sheetName || '',
                    sheetNames: item.remote?.sheetNames || [],
                    lastError: requestError.message,
                  }),
                }
              : item,
          ),
        );
        if (!silent) {
          pushFeedback(requestError.message);
        }
      } finally {
        delete remoteRefreshStateRef.current[sourceId];
        if (!silent) {
          setBusyAction((current) => (current === `refresh-source-${sourceId}` ? '' : current));
        }
      }
    })();

    remoteRefreshStateRef.current[sourceId] = refreshPromise;
    return refreshPromise;
  };

  const updateSelectedSourceRemote = (patch = {}) => {
    if (!selectedSource?.id || !selectedSource?.remote) {
      return;
    }

    const nextRemoteConfig = createRemoteSourceConfig({
      ...(selectedSource.remote || {}),
      ...patch,
    });

    setSourceLibrary((current) =>
      current.map((source) =>
        source.id === selectedSource.id
          ? {
              ...source,
              remote: nextRemoteConfig,
            }
          : source,
      ),
    );

    if (patch.sheetName !== undefined) {
      window.setTimeout(() => {
        void refreshRemoteSource(selectedSource.id, {
          silent: true,
          sourceOverride: {
            ...selectedSource,
            remote: nextRemoteConfig,
          },
          remoteConfigOverride: nextRemoteConfig,
        });
      }, 0);
    }
  };

  const reloadYandexAuthSettings = async () => {
    if (!desktopBridge?.getYandexAuthSettings) {
      pushFeedback('Yandex credentials are available in the desktop app only');
      return;
    }

    try {
      const payload = await desktopBridge.getYandexAuthSettings();
      if (payload) {
        setYandexAuthState((current) => ({ ...current, ...payload }));
        pushFeedback('Yandex settings reloaded');
      }
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const saveYandexAuthSettings = async (nextSettings = null) => {
    if (!desktopBridge?.saveYandexAuthSettings) {
      pushFeedback('Yandex credentials are available in the desktop app only');
      return null;
    }

    try {
      const source = nextSettings || yandexAuthState;
      const payload = await desktopBridge.saveYandexAuthSettings({
        clientId: source.clientId || '',
        clientSecret: source.clientSecret || '',
        redirectUri: '',
        scope: source.scope || 'cloud_api:disk.read',
      });
      if (payload) {
        setYandexAuthState((current) => ({ ...current, ...payload }));
      }
      pushFeedback('Yandex settings saved locally');
      return payload;
    } catch (requestError) {
      pushFeedback(requestError.message);
      return null;
    }
  };

  const startYandexConnect = async () => {
    if (!desktopBridge?.startYandexAuth) {
      pushFeedback('Yandex connect is available in the desktop app only');
      return;
    }

    try {
      setYandexDeviceAuth({
        status: 'waiting',
        error: '',
      });
      const payload = await desktopBridge.startYandexAuth();
      if (payload) {
        setYandexAuthState((current) => ({ ...current, ...payload }));
      }
      setYandexDeviceAuth({
        status: 'success',
        error: '',
      });
      pushFeedback('Yandex connected');
    } catch (requestError) {
      setYandexDeviceAuth({
        status: 'error',
        error: requestError.message,
      });
      pushFeedback(requestError.message);
    }
  };

  const disconnectYandex = async () => {
    if (!desktopBridge?.disconnectYandexAuth) {
      pushFeedback('Yandex disconnect is available in the desktop app only');
      return;
    }

    try {
      const payload = await desktopBridge.disconnectYandexAuth();
      if (payload) {
        setYandexAuthState((current) => ({ ...current, ...payload }));
      }
      setYandexDeviceAuth({
        status: 'idle',
        error: '',
      });
      pushFeedback('Yandex disconnected locally');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const setEntryHidden = async (entry, hidden) => {
    if (!entry?.id) {
      return;
    }

    setBusyAction(`${hidden ? 'hide' : 'show'}-entry-${entry.id}`);

    try {
      if (hidden) {
        const liveOutputs = (snapshot?.outputs || []).filter(
          (output) => output.program?.entryId === entry.id && output.program?.visible,
        );

        for (const output of liveOutputs) {
          await api('/api/program/hide', {
            method: 'POST',
            body: { outputId: output.id },
          });
        }
      }

      await api(`/api/entries/${entry.id}`, {
        method: 'PUT',
        body: { hidden },
      });
      pushFeedback(hidden ? 'Title hidden from rundown' : 'Title restored to rundown');
    } catch (requestError) {
      if (requestError.details?.length) {
        setTemplateValidationReport({
          title: requestError.message,
          details: requestError.details,
        });
      }
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const reorderEntry = async (entryId, direction) => {
    const currentIds = (snapshot?.entries || []).map((entry) => entry.id);
    const currentIndex = currentIds.indexOf(entryId);

    if (currentIndex === -1) {
      return;
    }

    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (nextIndex < 0 || nextIndex >= currentIds.length) {
      return;
    }

    const nextIds = [...currentIds];
    [nextIds[currentIndex], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[currentIndex]];

    setBusyAction(`reorder-${entryId}`);

    try {
      await api('/api/entries/reorder', {
        method: 'POST',
        body: { ids: nextIds },
      });
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const reorderEntriesToTarget = async (draggedEntryId, targetEntryId) => {
    if (!draggedEntryId || !targetEntryId || draggedEntryId === targetEntryId) {
      return;
    }

    const currentIds = (snapshot?.entries || []).map((entry) => entry.id);
    const draggedIndex = currentIds.indexOf(draggedEntryId);
    const targetIndex = currentIds.indexOf(targetEntryId);

    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    const nextIds = [...currentIds];
    const [movedId] = nextIds.splice(draggedIndex, 1);
    nextIds.splice(targetIndex, 0, movedId);

    setBusyAction(`reorder-${draggedEntryId}`);

    try {
      await api('/api/entries/reorder', {
        method: 'POST',
        body: { ids: nextIds },
      });
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
      setDraggedRundownEntryId(null);
    }
  };

  const removeEntry = async (entry) => {
    if (!entry?.id) {
      return;
    }

    setBusyAction(`remove-entry-${entry.id}`);

    try {
      const liveOutputs = (snapshot?.outputs || []).filter(
        (output) => output.program?.entryId === entry.id && output.program?.visible,
      );

      for (const output of liveOutputs) {
        await api('/api/program/hide', {
          method: 'POST',
          body: { outputId: output.id },
        });
      }

      await api(`/api/entries/${entry.id}`, { method: 'DELETE' });
      pushFeedback(
        entry.entryType === 'vmix'
          ? 'vMix title hidden and removed from rundown'
          : 'Local title removed from rundown',
      );
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const openStyleEditor = (entry) => {
    if (!canManageEntryAppearance(entry)) {
      return;
    }

    setStyleEditorEntryId(entry.id);
    setStyleEditorDraft(
      normalizeLocalFieldStyles(entry.templateFields || templateMap.get(entry.templateId)?.fields || [], entry.fieldStyles || {}),
    );
  };

  const closeStyleEditor = () => {
    setStyleEditorEntryId(null);
    setStyleEditorDraft({});
  };

  const updateStyleEditorField = (fieldName, property, value) => {
    setStyleEditorDraft((current) => {
      const nextField = {
        ...(current[fieldName] || {}),
        [property]: value,
      };

      if (property === 'fontFamily' && !String(value || '').trim()) {
        delete nextField.fontFamily;
        delete nextField.fontSourcePath;
      }

      if (property === 'fontFamily' && String(value || '').trim()) {
        const nextFontSourcePath = systemFontAssetMap[String(value).trim()] || '';
        if (nextFontSourcePath) {
          nextField.fontSourcePath = nextFontSourcePath;
        } else {
          delete nextField.fontSourcePath;
        }
      }

      if (property === 'fontSize') {
        const parsedSize = Number.parseInt(value ?? '', 10);
        if (Number.isFinite(parsedSize) && parsedSize > 0) {
          nextField.fontSize = parsedSize;
        } else {
          delete nextField.fontSize;
        }
      }

      if (property === 'color' && !String(value || '').trim()) {
        delete nextField.color;
      }

      const next = {
        ...current,
        [fieldName]: nextField,
      };

      if (!Object.keys(nextField).length) {
        delete next[fieldName];
      }

      return next;
    });
  };

  const saveStyleEditor = async () => {
    if (!styleEditorEntry) {
      return;
    }

    try {
      await api(`/api/entries/${styleEditorEntry.id}`, {
        method: 'PUT',
        body: {
          fieldStyles: normalizeLocalFieldStyles(styleEditorTemplateFields, styleEditorDraft),
        },
      });
      pushFeedback('Khural text styles updated');
      closeStyleEditor();
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const openTemplateFolders = async () => {
    if (!desktopBridge?.openTemplateFolders) {
      pushFeedback('Folder access is available in the desktop app only');
      return;
    }

    try {
      const result = await desktopBridge.openTemplateFolders();
      if (!result?.ok) {
        throw new Error(result?.error || 'The template folders could not be opened.');
      }
      pushFeedback('Template folders opened');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const setSelectedSourceLinkedTimer = (timerId) => {
    if (!selectedSource || !selectedOutput?.id) {
      return;
    }

    const nextLinkedTimerId = normalizeLinkedTimerId(timerId);
    const linkedTimer = timers.find((timer) => timerIdMatches(timer, nextLinkedTimerId)) || null;

    setSourceLibrary((current) =>
      current.map((source) =>
        source.id === selectedSource.id
          ? (() => {
              const nextLinkedTimerByOutput = { ...(source.linkedTimerByOutput || {}) };

              if (nextLinkedTimerId) {
                nextLinkedTimerByOutput[selectedOutput.id] = nextLinkedTimerId;
              } else {
                delete nextLinkedTimerByOutput[selectedOutput.id];
              }

              return {
                ...source,
                linkedTimerId: null,
                linkedTimerByOutput: nextLinkedTimerByOutput,
                rows: (source.rows || []).map((row) => ({
                  ...row,
                  timer: {
                    ...(row.timer || {}),
                    format: linkedTimer?.displayFormat || row.timer?.format || 'mm:ss',
                  },
                })),
              };
            })()
          : source,
      ),
    );
  };

  const applySourceRow = async (row) => {
    if (!selectedOutput?.id) {
      pushFeedback('РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ output');
      return;
    }

    try {
      const targetOutputIds = syncedOutputIds.length ? syncedOutputIds : [selectedOutput.id];

      for (const outputId of targetOutputIds) {
        const output = outputs.find((item) => item.id === outputId);
        const snapshotEntry = snapshot?.entries?.find((entry) => entry.id === output?.selectedEntryId) || null;
        const outputEntry =
          outputId === selectedOutput.id && selectedEntry?.id === output?.selectedEntryId
            ? {
                ...(snapshotEntry || {}),
                ...selectedEntry,
                fields: latestDraftRef.current.fields || selectedEntry.fields || {},
              }
            : snapshotEntry;
        const outputFields = outputEntry?.templateFields || [];
        const outputFieldMap =
          outputId === selectedOutput.id && selectedEntry?.id === output?.selectedEntryId
            ? effectiveSelectedEntryFieldMap
            : buildEffectiveEntryFieldMap(outputEntry, outputFields);

        if (!output || !outputEntry || !outputFields.length) {
          continue;
        }

        const nextFields = applyRowToFields(
          outputFields,
          row.values,
          outputEntry.fields || {},
          outputFieldMap,
        );
        const nextName = row.values[0] || outputEntry.name;

        await api(`/api/entries/${outputEntry.id}`, {
          method: 'PUT',
          body: { name: nextName, fields: nextFields },
        });

        if (autoUpdate && (outputEntry.entryType === 'vmix' || output.program?.visible)) {
          if (outputEntry.entryType === 'vmix') {
            await api(`/api/entries/${outputEntry.id}/vmix-sync`, {
              method: 'POST',
              body: { action: 'update' },
            });
          } else {
            await api('/api/program/update', {
              method: 'POST',
              body: { entryId: outputEntry.id, outputId },
            });
          }
        }

        setActiveSourceRows((current) => ({
          ...current,
          [outputId]: {
            sourceId: selectedSource?.id || null,
            rowId: row.id,
          },
        }));

        if (outputId === selectedOutput.id) {
          setDraftFields(nextFields);
          setDraftName(nextName);
        }
      }

      const isDifferentBoundTimerRow =
        activeTimerBinding &&
        normalizeLinkedTimerId(activeTimerBinding.timerId) === selectedLinkedTimerId &&
        (activeTimerBinding.sourceId !== selectedSource?.id || activeTimerBinding.rowId !== row.id);
      const isSameBoundTimerRow =
        activeTimerBinding &&
        normalizeLinkedTimerId(activeTimerBinding.timerId) === selectedLinkedTimerId &&
        activeTimerBinding.sourceId === selectedSource?.id &&
        activeTimerBinding.rowId === row.id;
      const hasBoundTimerForCurrentLink =
        activeTimerBinding &&
        normalizeLinkedTimerId(activeTimerBinding.timerId) === selectedLinkedTimerId;
      const currentOutput = outputs.find((item) => item.id === selectedOutput.id) || selectedOutput;
      const currentOutputEntry =
        snapshot?.entries?.find((entry) => entry.id === currentOutput?.selectedEntryId) || selectedEntry;

      if (linkedSourceTimer && !isDifferentBoundTimerRow) {
        if (currentOutput?.id === selectedOutput.id) {
          await ensureTimerRoutedToEntry(linkedSourceTimer, currentOutput, currentOutputEntry);
        }

        if (!hasBoundTimerForCurrentLink || isSameBoundTimerRow || !linkedSourceTimer.running) {
          await updateTimer(linkedSourceTimer.id, {
            durationMs: Number(row.timer?.baseMs || 0),
            valueMs: Number(row.timer?.baseMs || 0),
          });
        }
      }

      scheduleTimerReminder(selectedSource?.id || '', row);
      pushFeedback(`РЎС‚СЂРѕРєР° ${row.index} РїСЂРёРјРµРЅРµРЅР° Рє ${targetOutputIds.length} output(s)`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const runPreviewAction = async (action, entryId) => {
    if (action !== 'hide' && !selectedEntry) return;

    setBusyAction(`preview-${action}`);

    try {
      if (action !== 'hide') {
        await persistDraft();
      }

      await api(`/api/preview/${action === 'hide' ? 'hide' : 'show'}`, {
        method: 'POST',
        body: {
          ...(entryId ? { entryId } : {}),
          outputId: selectedOutput?.id,
        },
      });

      pushFeedback(action === 'hide' ? 'Preview hidden' : 'Preview updated');
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const toggleSourceSyncOutput = (outputId) => {
    if (!selectedOutput?.id) {
      return;
    }

    api(`/api/outputs/${selectedOutput.id}/sync-toggle`, {
      method: 'POST',
      body: { targetOutputId: outputId },
    }).catch((requestError) => pushFeedback(requestError.message));
  };

  const scheduleTimerReminder = (sourceId, row) => {
    window.clearTimeout(reminderTimeoutRef.current);

    if (!reminderEnabled || !row?.timer?.baseMs) {
      return;
    }

    reminderTimeoutRef.current = window.setTimeout(() => {
      setPendingReminder({
        sourceId,
        outputId: selectedOutput?.id || null,
        rowId: row.id,
        sourceName: selectedSource?.name || 'Source',
      });
    }, Math.max(1, Number(reminderDelaySec || 0)) * 1000);
  };

  const startReminderTimer = () => {
    if (!pendingReminder || !reminderRow) {
      setPendingReminder(null);
      return;
    }

    const reminderSource = sourceLibrary.find((item) => item.id === pendingReminder.sourceId);
    const reminderLinkedTimerId = getSourceLinkedTimerId(reminderSource, pendingReminder.outputId);
    const reminderLinkedTimer = timers.find((timer) => timerIdMatches(timer, reminderLinkedTimerId)) || null;
    const isTimerReminderRow =
      activeTimerBinding?.sourceId === pendingReminder.sourceId && activeTimerBinding?.rowId === reminderRow.id;

    void controlSourceRowTimer(pendingReminder.sourceId, reminderRow, 'toggle', {
      syncTimerId: reminderLinkedTimerId,
      linkedTimerId: reminderLinkedTimerId,
      linkedTimer: reminderLinkedTimer,
      isTimerRow: isTimerReminderRow,
    });
    setPendingReminder(null);
  };

  const syncSourceRowToOutputs = async (sourceId, rowId, rowValues) => {
    const boundOutputIds = Object.entries(activeSourceRows)
      .filter(([, binding]) => binding?.sourceId === sourceId && binding?.rowId === rowId)
      .map(([outputId]) => outputId);

    for (const outputId of boundOutputIds) {
      const output = outputs.find((item) => item.id === outputId);
      const snapshotEntry = snapshot?.entries?.find((entry) => entry.id === output?.selectedEntryId) || null;
      const outputEntry =
        outputId === selectedOutput?.id && selectedEntry?.id === output?.selectedEntryId
          ? {
              ...(snapshotEntry || {}),
              ...selectedEntry,
              fields: latestDraftRef.current.fields || selectedEntry.fields || {},
            }
          : snapshotEntry;
      const outputFields = outputEntry?.templateFields || [];
      const outputFieldMap =
        outputId === selectedOutput?.id && selectedEntry?.id === output?.selectedEntryId
          ? effectiveSelectedEntryFieldMap
          : buildEffectiveEntryFieldMap(outputEntry, outputFields);

      if (!output || !outputEntry || !outputFields.length) {
        continue;
      }

      const nextFields = applyRowToFields(
        outputFields,
        rowValues,
        outputEntry.fields || {},
        outputFieldMap,
      );
      const nextName = rowValues[0] || outputEntry.name;

      await api(`/api/entries/${outputEntry.id}`, {
        method: 'PUT',
        body: { name: nextName, fields: nextFields },
      });

      if (outputEntry.entryType === 'vmix' || output.program?.visible) {
        await api('/api/program/update', {
          method: 'POST',
          body: { entryId: outputEntry.id, outputId },
        });
      }

      if (outputId === selectedOutput?.id) {
        setDraftName(nextName);
        setDraftFields(nextFields);
      }
    }
  };

  const deleteSourceById = (sourceId) => {
    const sourceToDelete = sourceLibrary.find((item) => item.id === sourceId);
    if (!sourceToDelete) {
      return;
    }

    setSourceLibrary((current) => current.filter((item) => item.id !== sourceId));
    setEditingSourceRows((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${sourceId}:`))),
    );
    setSourceRowDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${sourceId}:`))),
    );
    setActiveSourceRows((current) => {
      const next = { ...current };

      for (const [outputId, binding] of Object.entries(next)) {
        if (binding?.sourceId === sourceId) {
          delete next[outputId];
        }
      }

      return next;
    });
    pushFeedback(`${sourceToDelete.name} deleted`);
  };

  const deleteSelectedSource = () => {
    if (!selectedSource) return;
    deleteSourceById(selectedSource.id);
  };

  const renameSource = (sourceId, nextName) => {
    const trimmed = String(nextName || '').trim();
    if (!trimmed) {
      return;
    }

    setSourceLibrary((current) =>
      current.map((source) => (source.id === sourceId ? { ...source, name: trimmed } : source)),
    );
  };

  const reorderSourcesToTarget = (draggedId, targetId) => {
    if (!draggedId || !targetId || draggedId === targetId) {
      return;
    }

    setSourceLibrary((current) => {
      const draggedIndex = current.findIndex((source) => source.id === draggedId);
      const targetIndex = current.findIndex((source) => source.id === targetId);

      if (draggedIndex === -1 || targetIndex === -1) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedSourceId(null);
  };

  const updateSourceColumnLabel = (sourceId, columnId, nextLabel) => {
    setSourceLibrary((current) =>
      current.map((source) => {
        if (source.id !== sourceId) {
          return source;
        }

        return {
          ...source,
          columns: (source.columns || []).map((column) =>
            column.id === columnId
              ? {
                  ...column,
                  label: nextLabel,
                }
              : column,
          ),
        };
      }),
    );
  };

  const startSourceRowEdit = (sourceId, row) => {
    const rowKey = getSourceRowEditKey(sourceId, row.id);
    setEditingSourceRows((current) => ({ ...current, [rowKey]: true }));
    setSourceRowDrafts((current) => ({ ...current, [rowKey]: [...row.values] }));
  };

  const updateSourceRowCell = (sourceId, rowId, valueIndex, value) => {
    const rowKey = getSourceRowEditKey(sourceId, rowId);
    setSourceRowDrafts((current) => {
      const nextValues = [...(current[rowKey] || [])];
      nextValues[valueIndex] = value;
      return {
        ...current,
        [rowKey]: nextValues,
      };
    });
  };

  const saveSourceRowEdit = (sourceId, rowId) => {
    const rowKey = getSourceRowEditKey(sourceId, rowId);
    const nextValues = sourceRowDrafts[rowKey];

    if (!nextValues) {
      setEditingSourceRows((current) => {
        const next = { ...current };
        delete next[rowKey];
        return next;
      });
      return;
    }

    setSourceLibrary((current) =>
      current.map((source) => {
        if (source.id !== sourceId) {
          return source;
        }

        return {
          ...source,
          rows: source.rows.map((row) => {
            if (row.id !== rowId) {
              return row;
            }

            return {
              ...row,
              values: nextValues,
              label: nextValues.filter(Boolean).slice(0, 2).join(' | ') || `Row ${row.index}`,
            };
          }),
        };
      }),
    );
    setEditingSourceRows((current) => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
    setSourceRowDrafts((current) => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
    void syncSourceRowToOutputs(sourceId, rowId, nextValues).catch((requestError) => pushFeedback(requestError.message));
    pushFeedback('Source row saved');
  };

  const deleteSourceRow = (sourceId, rowId) => {
    setSourceLibrary((current) =>
      current.map((source) => {
        if (source.id !== sourceId) {
          return source;
        }

        return {
          ...source,
          rows: source.rows
            .filter((row) => row.id !== rowId)
            .map((row, index) => ({
              ...row,
              index: index + 1,
            })),
        };
      }),
    );
    const rowKey = getSourceRowEditKey(sourceId, rowId);
    setEditingSourceRows((current) => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
    setSourceRowDrafts((current) => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
    setActiveSourceRows((current) => {
      const next = { ...current };

      for (const [outputId, binding] of Object.entries(next)) {
        if (binding?.sourceId === sourceId && binding?.rowId === rowId) {
          delete next[outputId];
        }
      }

      return next;
    });
    pushFeedback('Source row deleted');
  };

  const resolveAutoTimerOutputId = (timer, patch = {}) => {
    const nextSourceType = patch.sourceType ?? timer?.sourceType ?? 'local';

    if (nextSourceType === 'vmix') {
      return null;
    }

    const nextTargetTemplateId =
      patch.targetTemplateId !== undefined ? patch.targetTemplateId || null : timer?.targetTemplateId || null;

    if (!selectedOutput?.id || !nextTargetTemplateId) {
      return patch.targetOutputId !== undefined ? patch.targetOutputId || null : timer?.targetOutputId || null;
    }

    const outputEntry = (snapshot?.entries || []).find((entry) => entry.id === selectedOutput?.selectedEntryId);

    if (outputEntry?.templateId === nextTargetTemplateId) {
      return selectedOutput.id;
    }

    return patch.targetOutputId !== undefined ? patch.targetOutputId || null : timer?.targetOutputId || null;
  };

  const ensureTimerRoutedToEntry = async (timer, output, entry) => {
    if (!timer || timer.sourceType === 'vmix' || !output?.id || !entry?.templateId) {
      return;
    }

    const template = templateMap.get(entry.templateId);
    const timerSlots = Array.isArray(template?.timers) ? template.timers : [];

    if (!timerSlots.length) {
      return;
    }

    const nextTargetTimerId = timerSlots.some((slot) => slot.id === timer.targetTimerId)
      ? timer.targetTimerId
      : timerSlots[0]?.id || null;
    const nextTargetOutputId = output.id;
    const nextTargetTemplateId = entry.templateId;

    if (
      timer.targetOutputId === nextTargetOutputId &&
      timer.targetTemplateId === nextTargetTemplateId &&
      timer.targetTimerId === nextTargetTimerId
    ) {
      return;
    }

    await updateTimer(timer.id, {
      targetOutputId: nextTargetOutputId,
      targetTemplateId: nextTargetTemplateId,
      targetTimerId: nextTargetTimerId,
    });
  };

  const updateTimer = async (timerId, patch) => {
    try {
      const timer = timers.find((item) => item.id === timerId) || null;
      const nextPatch = { ...patch };

      if (timer || nextPatch.targetTemplateId !== undefined || nextPatch.sourceType !== undefined) {
        nextPatch.targetOutputId = resolveAutoTimerOutputId(timer, nextPatch);
      }

      await api(`/api/timers/${timerId}`, { method: 'PUT', body: nextPatch });
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const deleteTimer = async (timerId) => {
    try {
      await api(`/api/timers/${timerId}`, { method: 'DELETE' });
      pushFeedback('Timer deleted');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const commandTimer = async (timerId, action) => {
    try {
      await api(`/api/timers/${timerId}/${action}`, { method: 'POST' });
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const runTimerPanelCommand = async (timer, action) => {
    const normalizedTimerId = normalizeLinkedTimerId(timer?.id);
    const autoOutputId = resolveAutoTimerOutputId(timer, {});

    if (selectedOutput?.id) {
      setActiveTimerRows((current) => {
        const next = { ...current };
        const currentBinding = next[selectedOutput.id] || null;
        const currentBindingMatches = normalizeLinkedTimerId(currentBinding?.timerId) === normalizedTimerId;
        const canBindFromCurrentSource =
          selectedSource?.id &&
          selectedLinkedTimerId === normalizedTimerId &&
          activeSourceBinding?.sourceId === selectedSource.id &&
          activeSourceBinding?.rowId;

        if (action === 'start') {
          if (canBindFromCurrentSource) {
            next[selectedOutput.id] = {
              sourceId: selectedSource.id,
              rowId: activeSourceBinding.rowId,
              timerId: normalizedTimerId,
            };
          } else if (!currentBindingMatches) {
            delete next[selectedOutput.id];
          }
        }

        if (action === 'reset' && currentBindingMatches) {
          delete next[selectedOutput.id];
        }

        return next;
      });
    }

    if (action === 'start' && timer?.sourceType !== 'vmix' && autoOutputId !== (timer?.targetOutputId || null)) {
      await updateTimer(timer.id, { targetOutputId: autoOutputId });
    }

    await commandTimer(timer.id, action);
  };

  const createTimer = async () => {
    const firstTemplate = localTimerTemplates[0];
    const firstTimerSlot = firstTemplate?.timers?.[0];
    const outputEntry = (snapshot?.entries || []).find((entry) => entry.id === selectedOutput?.selectedEntryId);
    const autoOutputId = outputEntry?.templateId === firstTemplate?.id ? selectedOutput?.id || null : null;

    try {
      await api('/api/timers', {
        method: 'POST',
        body: {
          name: `Timer ${timers.length + 1}`,
          mode: 'countdown',
          durationMs: 30000,
          sourceType: 'local',
          targetOutputId: autoOutputId,
          targetTemplateId: firstTemplate?.id || null,
          targetTimerId: firstTimerSlot?.id || null,
          vmixTextField: 'Text',
          displayFormat: 'mm:ss',
        },
      });
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const shiftTimerFormat = (timer, direction) => {
    const currentIndex = Math.max(0, TIMER_FORMATS.indexOf(timer.displayFormat || 'mm:ss'));
    const delta = direction === 'left' ? -1 : 1;
    const nextIndex = (currentIndex + delta + TIMER_FORMATS.length) % TIMER_FORMATS.length;
    updateTimer(timer.id, { displayFormat: TIMER_FORMATS[nextIndex] });
  };

  const connectVmix = async (host) => {
    try {
      const nextState = await api('/api/vmix/connect', {
        method: 'POST',
        body: { host },
      });
      setVmixState(nextState);
      pushFeedback('vMix connection settings updated');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const refreshVmixState = async () => {
    try {
      const nextState = await api('/api/vmix/sync', {
        method: 'POST',
      });
      setVmixState(nextState);
      pushFeedback('vMix synchronized');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const refreshMidiState = async () => {
    try {
      const nextState = await api('/api/midi/refresh', {
        method: 'POST',
      });
      setMidiState(nextState);
      pushFeedback('MIDI devices refreshed');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const startMidiLearn = async (action) => {
    try {
      const nextState = await api('/api/midi/learn/start', {
        method: 'POST',
        body: { action },
      });
      setMidiState(nextState);
      pushFeedback(`MIDI learn started for ${action.toUpperCase()}`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const stopMidiLearn = async () => {
    try {
      const nextState = await api('/api/midi/learn/stop', {
        method: 'POST',
      });
      setMidiState(nextState);
      pushFeedback('MIDI learn stopped');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const refreshAppMeta = async () => {
    try {
      const nextMeta = await api('/api/app/meta');
      setAppMeta(nextMeta);
      return nextMeta;
    } catch (requestError) {
      pushFeedback(requestError.message);
      return null;
    }
  };

  const checkForUpdates = async () => {
    try {
      const nextState = await api('/api/updates/check', {
        method: 'POST',
      });
      setAppMeta((current) => ({
        ...(current || { name: 'Web Title Pro', version: nextState.currentVersion }),
        version: nextState.currentVersion,
        updates: nextState,
      }));
      pushFeedback('Update check completed');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const installAvailableUpdate = async () => {
    if (!desktopBridge?.installAvailableUpdate) {
      pushFeedback('Desktop updater is not available in this mode');
      return;
    }

    try {
      const result = await desktopBridge.installAvailableUpdate(updateState || null);

      if (!result?.ok && result?.reason === 'no-update') {
        pushFeedback('No update is currently available');
        if (result?.updateState) {
          setAppMeta((current) => ({
            ...(current || { name: 'Web Title Pro', version: result.updateState.currentVersion }),
            version: result.updateState.currentVersion,
            updates: result.updateState,
          }));
        }
        return;
      }

      if (!result?.ok && result?.reason === 'cancelled') {
        pushFeedback('Update cancelled');
        return;
      }
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const clearMidiBinding = async (action) => {
    try {
      const nextState = await api(`/api/midi/bindings/${encodeURIComponent(action)}`, {
        method: 'DELETE',
      });
      setMidiState(nextState);
      pushFeedback(`MIDI binding cleared for ${action.toUpperCase()}`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const buildProjectDocument = async () => {
    const exported = await api('/api/project/export');

    return {
      version: 1,
      meta: {
        name: currentProjectDisplayName,
        updatedAt: new Date().toISOString(),
        appVersion: appMeta?.version || null,
      },
      state: exported?.state || {},
      sources: {
        selectedSourceId: selectedSourceId || null,
        items: sourceLibrary,
      },
    };
  };

  const confirmProceedWithUnsavedProject = async (detail) => {
    if (!projectDirty) {
      return true;
    }

    if (desktopBridge?.confirmUnsavedChanges) {
      const result = await desktopBridge.confirmUnsavedChanges({ detail });

      if (result?.action === 'cancel') {
        return false;
      }

      if (result?.action === 'save') {
        const saveResult = await saveProject();
        return Boolean(saveResult && !saveResult.canceled);
      }

      return true;
    }

    return window.confirm('The current project has unsaved changes. Continue without saving?');
  };

  useEffect(() => {
    window.__webTitleHandleCloseRequest = async () => {
      const shouldProceed = await confirmProceedWithUnsavedProject('Do you want to save the current project before closing Web Title Pro?');

      if (!shouldProceed) {
        return false;
      }

      if (desktopBridge?.requestAppClose) {
        appCloseAuthorizedRef.current = true;
        await desktopBridge.requestAppClose();
      }

      return true;
    };

    return () => {
      delete window.__webTitleHandleCloseRequest;
    };
  }, [confirmProceedWithUnsavedProject, desktopBridge]);

  useEffect(() => {
    window.__webTitleAuthorizeAppClose = () => {
      appCloseAuthorizedRef.current = true;
      return true;
    };

    return () => {
      delete window.__webTitleAuthorizeAppClose;
    };
  }, []);

  useEffect(() => {
    window.__webTitleConfirmUpdateInstall = async () =>
      confirmProceedWithUnsavedProject('Do you want to save the current project before updating Web Title Pro?');

    return () => {
      delete window.__webTitleConfirmUpdateInstall;
    };
  }, [confirmProceedWithUnsavedProject]);

  const applyProjectDocument = async (projectDocument, nextProjectStatus = null) => {
    await api('/api/project/load', {
      method: 'POST',
      body: {
        state: projectDocument?.state || {},
        seedExamples: false,
      },
    });

    const nextSourceLibrary = normalizeSourceLibrary(projectDocument?.sources?.items || []);
    setSourceLibrary(nextSourceLibrary);
    setSelectedSourceId(projectDocument?.sources?.selectedSourceId || nextSourceLibrary[0]?.id || '');
    setActiveSourceRows({});
    setActiveTimerRows({});
    setSourceRowTimers({});
    setShowHiddenEntries(false);
    setManageRundown(false);
    setShowSourceSyncMenu(false);
    setShowProjectPanel(false);

    if (nextProjectStatus) {
      setProjectStatus(nextProjectStatus);
    }

    const nextSignature = buildProjectSignature({
      snapshot: {
        selectedOutputId: projectDocument?.state?.selectedOutputId || null,
        outputs: projectDocument?.state?.outputs || [],
        integrations: projectDocument?.state?.integrations || {},
        entries: projectDocument?.state?.entries || [],
        timers: projectDocument?.state?.timers || [],
      },
      sourceLibrary: nextSourceLibrary,
      selectedSourceId: projectDocument?.sources?.selectedSourceId || nextSourceLibrary[0]?.id || '',
    });
    setProjectBaselineSignature(nextSignature);
    setProjectDirty(false);
  };

  const createNewProject = async () => {
    try {
      const shouldProceed = await confirmProceedWithUnsavedProject('Do you want to save the current project before creating a new one?');

      if (!shouldProceed) {
        return;
      }

      const nextSnapshot = await api('/api/project/load', {
        method: 'POST',
        body: {
          state: {},
          seedExamples: true,
        },
      });
      setSourceLibrary([]);
      setSelectedSourceId('');
      setActiveSourceRows({});
      setActiveTimerRows({});
      setSourceRowTimers({});
      setShowHiddenEntries(false);
      setManageRundown(false);
      setShowSourceSyncMenu(false);
      setShowProjectPanel(false);

      if (desktopBridge?.createNewProject) {
        const status = await desktopBridge.createNewProject();
        if (status) {
          setProjectStatus(status);
        }
      }

      const nextSignature = buildProjectSignature({
        snapshot: nextSnapshot,
        sourceLibrary: [],
        selectedSourceId: '',
      });
      setProjectBaselineSignature(nextSignature);
      setProjectDirty(false);

      pushFeedback('New project created');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const openProject = async () => {
    if (!desktopBridge?.openProjectDialog) {
      pushFeedback('Project files are available in the desktop app only');
      return;
    }

    try {
      const shouldProceed = await confirmProceedWithUnsavedProject('Do you want to save the current project before opening another one?');

      if (!shouldProceed) {
        return;
      }

      const result = await desktopBridge.openProjectDialog();

      if (result?.canceled) {
        return;
      }

      await applyProjectDocument(result.project, result.status || null);
      pushFeedback(`Project opened: ${result.path?.split(/[\\/]/).pop() || 'project'}`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const openRecentProject = async (projectPath) => {
    if (!desktopBridge?.openRecentProject || !projectPath) {
      return;
    }

    try {
      const shouldProceed = await confirmProceedWithUnsavedProject('Do you want to save the current project before opening another one?');

      if (!shouldProceed) {
        return;
      }

      const result = await desktopBridge.openRecentProject(projectPath);

      if (result?.canceled) {
        return;
      }

      await applyProjectDocument(result.project, result.status || null);
      pushFeedback(`Project opened: ${result.path?.split(/[\\/]/).pop() || 'project'}`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const saveProject = async ({ saveAs = false } = {}) => {
    if (!desktopBridge?.saveProject || !desktopBridge?.saveProjectAs) {
      pushFeedback('Project files are available in the desktop app only');
      return { canceled: true };
    }

    try {
      await persistDraft();
      const project = await buildProjectDocument();
      const savedSignature = buildProjectSignature({
        snapshot: project.state || {},
        sourceLibrary: project.sources?.items || [],
        selectedSourceId: project.sources?.selectedSourceId || null,
      });
      const suggestedName = (project.meta?.name || 'WebTitleProject').replace(/[<>:\"/\\|?*]+/g, ' ').trim() || 'WebTitleProject';
      const result = saveAs
        ? await desktopBridge.saveProjectAs({ project, suggestedName })
        : await desktopBridge.saveProject({
            path: projectStatus?.currentProjectPath || null,
            project,
            suggestedName,
          });

      if (result?.canceled) {
        return result;
      }

      if (result?.status) {
        setProjectStatus(result.status);
      }

      setProjectBaselineSignature(savedSignature);
      setProjectDirty(false);

      pushFeedback(`Project saved: ${result.path?.split(/[\\/]/).pop() || 'project'}`);
      return result;
    } catch (requestError) {
      pushFeedback(requestError.message);
      return { canceled: true, error: requestError.message };
    }
  };

  const saveGlobalShortcut = async (action, value) => {
    try {
      const body = action.startsWith('selectOutput:')
        ? {
            outputSelectById: {
              ...(shortcutBindings?.outputSelectById || {}),
              [action.slice('selectOutput:'.length)]: value,
            },
          }
        : {
            [action]: value,
          };

      await api('/api/shortcuts/navigation', {
        method: 'PUT',
        body,
      });
      pushFeedback(value ? `Shortcut saved for ${action}` : `Shortcut cleared for ${action}`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const triggerGlobalShortcut = async (action) => {
    try {
      if (action === 'hide') {
        await api('/api/program/hide', {
          method: 'POST',
          body: { outputId: selectedOutput?.id },
        });
      } else if (action === 'show' || action === 'live') {
        if (!selectedEntry?.id) {
          return;
        }
        await api(`/api/program/${action === 'live' ? 'live' : 'show'}`, {
          method: 'POST',
          body: {
            entryId: selectedEntry.id,
            outputId: selectedOutput?.id,
          },
        });
      } else {
        return;
      }

      pushFeedback(`Shortcut ${action.toUpperCase()}`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const triggerNavigationShortcut = async (action) => {
    try {
      const apiAction = action === 'previousTitle' ? 'previous-title' : 'next-title';
      await api(`/api/commands/${apiAction}`, {
        method: 'POST',
        body: {
          outputId: selectedOutput?.id,
        },
      });
      pushFeedback(action === 'previousTitle' ? 'Previous title selected' : 'Next title selected');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const selectVmixTimerInput = async (inputKey) => {
    try {
      const nextState = await api('/api/vmix/select-timer-input', {
        method: 'POST',
        body: { inputKey },
      });
      setVmixState(nextState);
      pushFeedback('vMix timer input selected');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const runVmixTimerAction = async (action) => {
    try {
      const nextState = await api('/api/vmix/timer-action', {
        method: 'POST',
        body: { action },
      });
      setVmixState(nextState);
      pushFeedback(`vMix ${action} sent`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const addManualSourceRow = () => {
    const values = manualRowColumns.map((_column, index) => (manualRowValues[index] || '').trim());

    if (!values.some(Boolean)) {
      pushFeedback('Р—Р°РїРѕР»РЅРёС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕ РїРѕР»Рµ СЃС‚СЂРѕРєРё');
      return;
    }

    if (!manualRowColumns.length) {
      pushFeedback('РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ С‚РёС‚СЂ РёР»Рё РёСЃС‚РѕС‡РЅРёРє РґР°РЅРЅС‹С…');
      return;
    }

    const buildRow = (index) => ({
      id: createClientId('row'),
      index,
      values,
      label: values.filter(Boolean).slice(0, 2).join(' | ') || `Row ${index}`,
      timer: { baseMs: 0, format: 'mm:ss' },
    });

    if (selectedSource) {
      const nextSource = {
        ...selectedSource,
        columns: manualRowColumns.length ? manualRowColumns : selectedSource.columns,
        rows: [...selectedSource.rows, buildRow(selectedSource.rows.length + 1)],
      };

      setSourceLibrary((current) => current.map((item) => (item.id === nextSource.id ? nextSource : item)));
      setSelectedSourceId(nextSource.id);
    } else {
      const nextSource = {
        id: createClientId('source'),
        name: selectedEntry?.name ? `${selectedEntry.name} Manual` : 'Manual Source',
        delimiter: '|',
        linkedTimerId: null,
        linkedTimerByOutput: {},
        columns: manualRowColumns,
        rows: [buildRow(1)],
        createdAt: new Date().toISOString(),
      };

      setSourceLibrary((current) => [nextSource, ...current]);
      setSelectedSourceId(nextSource.id);
    }

    setManualRowValues(
      manualRowColumns.reduce((acc, _column, index) => {
        acc[index] = '';
        return acc;
      }, {}),
    );
    pushFeedback('РЎС‚СЂРѕРєР° РґРѕР±Р°РІР»РµРЅР° РІ Source Table');
  };

  useEffect(() => {
    const onShortcutInput = (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (
        event.type === 'mousedown' &&
        event.button === 0 &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.metaKey
      ) {
        return;
      }

      const shortcutValue = formatShortcutFromEvent(event);

      if (!shortcutValue) {
        return;
      }

      if (learningShortcut) {
        event.preventDefault();
        event.stopPropagation();
        void saveGlobalShortcut(learningShortcut.action, shortcutValue);
        setLearningShortcut(null);
        return;
      }

      if (
        shortcutBindings?.show === shortcutValue ||
        shortcutBindings?.live === shortcutValue ||
        shortcutBindings?.hide === shortcutValue
      ) {
        event.preventDefault();
        const action =
          shortcutBindings?.show === shortcutValue
            ? 'show'
            : shortcutBindings?.live === shortcutValue
              ? 'live'
              : 'hide';
        void triggerGlobalShortcut(action);
        return;
      }

      if (shortcutBindings?.nextTitle === shortcutValue || shortcutBindings?.previousTitle === shortcutValue) {
        event.preventDefault();
        void triggerNavigationShortcut(shortcutBindings?.nextTitle === shortcutValue ? 'nextTitle' : 'previousTitle');
        return;
      }

      const outputShortcutEntry = Object.entries(shortcutBindings?.outputSelectById || {})
        .find(([, value]) => value === shortcutValue);

      if (outputShortcutEntry) {
        event.preventDefault();
        setLocalSelectedOutputId(outputShortcutEntry[0]);
        pushFeedback(`Output switched to ${outputs.find((output) => output.id === outputShortcutEntry[0])?.name || 'selected output'}`);
      }
    };

    window.addEventListener('keydown', onShortcutInput, true);
    window.addEventListener('mousedown', onShortcutInput, true);
    return () => {
      window.removeEventListener('keydown', onShortcutInput, true);
      window.removeEventListener('mousedown', onShortcutInput, true);
    };
  }, [
    learningShortcut,
    selectedOutput?.id,
    selectedEntry?.id,
    shortcutBindings?.show,
    shortcutBindings?.live,
    shortcutBindings?.hide,
    shortcutBindings?.nextTitle,
    shortcutBindings?.previousTitle,
    outputs,
    JSON.stringify(shortcutBindings?.outputSelectById || {}),
  ]);

  if (!snapshot || !program) {
    return <div className="loading-shell">Loading control surface...</div>;
  }

  return (
    <div className="app-shell">
      <ProjectPanel
        isOpen={showProjectPanel}
        currentProjectName={currentProjectDisplayName}
        projectStatus={projectStatus}
        onClose={() => setShowProjectPanel(false)}
        onNew={createNewProject}
        onOpen={openProject}
        onSave={() => saveProject()}
        onSaveAs={() => saveProject({ saveAs: true })}
        onOpenRecent={openRecentProject}
      />

      <section className="tabs-card">
        <div className="mode-toggle app-tab-toggle" role="tablist" aria-label="Primary workspace tabs">
          <button type="button" className={`mode-toggle-button ${activeTab === 'rundown' ? 'is-active' : ''}`} onClick={() => setActiveTab('rundown')}>Live</button>
          <button type="button" className={`mode-toggle-button ${activeTab === 'sources' ? 'is-active' : ''}`} onClick={() => setActiveTab('sources')}>Data Source</button>
          <button type="button" className={`mode-toggle-button ${activeTab === 'mapping' ? 'is-active' : ''}`} onClick={() => setActiveTab('mapping')}>Mapping</button>
          <button type="button" className={`mode-toggle-button ${activeTab === 'timers' ? 'is-active' : ''}`} onClick={() => setActiveTab('timers')}>Timers</button>
          <button type="button" className={`mode-toggle-button ${activeTab === 'settings' ? 'is-active' : ''}`} onClick={() => setActiveTab('settings')}>Output & Settings</button>
        </div>
        <div className="tab-toolbar">
          <span className={`connection-pill is-${connection}`}>{connection.toUpperCase()}</span>
          <button className={`ghost-button compact-button ${showProjectPanel ? 'is-active-manage' : ''}`} onClick={() => setShowProjectPanel((current) => !current)}>
            Project
          </button>
          <button className="ghost-button compact-button" onClick={() => setShowImportModal(true)}>Bulk TXT Import</button>
          <button className="primary-button compact-button" onClick={() => setShowAddModal(true)}>Add Title</button>
        </div>
      </section>

      <section className="outputs-card">
        <div className="card-head">
          <div>
            <span className="panel-kicker">Outputs</span>
            <h3>{selectedOutput?.name || 'No output selected'}</h3>
          </div>
          <div className="outputs-toolbar">
            <div className="outputs-live-group">
              <button className="top-air-button show" onClick={() => runProgramAction('show', selectedEntry?.id)} disabled={!selectedEntry || busyAction === 'show'}>SHOW</button>
              <button className={`top-air-button set ${selectedEntry?.entryType === 'vmix' ? 'is-disabled-mode' : ''}`} onClick={() => runProgramAction('update', selectedEntry?.id)} disabled={!selectedEntry || selectedEntry?.entryType === 'vmix' || busyAction === 'update'}>SET</button>
              <button className="top-air-button hide" onClick={() => runProgramAction('hide')} disabled={busyAction === 'hide'}>HIDE</button>
            </div>
            <div className="outputs-status-group">
              <span className={`status-badge ${program.visible ? 'tone-on' : 'tone-off'}`}>{program.visible ? 'ON AIR' : 'OFF'}</span>
              <button className="ghost-button compact-button" onClick={createOutput}>+ Add Output</button>
            </div>
          </div>
        </div>
        <div className="output-chip-list">
          {outputs.map((output) => (
            <button
              key={output.id}
              className={`output-chip ${output.id === selectedOutput?.id ? 'is-active' : ''}`}
              onClick={() => selectOutput(output.id)}
              disabled={busyAction === `output-${output.id}`}
            >
              <strong>{output.name}</strong>
              <span>{output.key}</span>
            </button>
          ))}
        </div>
        {activeTab !== 'settings' && (
          <PreviewTitlePanel
            showPreviewPanel={showPreviewPanel}
            selectedEntry={selectedEntry}
            selectedVmixInput={selectedVmixInput}
            autoUpdate={autoUpdate}
            draftName={draftName}
            draftFields={draftFields}
            selectedEntryFields={selectedEntryFields}
            selectedOutput={selectedOutput}
            program={program}
            previewProgram={previewProgram}
            embeddedPreviewUrl={embeddedPreviewUrl}
            embeddedRenderUrl={embeddedRenderUrl}
            feedback={feedback}
            error={error}
            vmixTitleActions={VMIX_TITLE_ACTIONS}
            normalizeVmixTitleAction={normalizeVmixTitleAction}
            onToggleShowPreviewPanel={() => setShowPreviewPanel((current) => !current)}
            onRunPreviewAction={runPreviewAction}
            onSetAutoUpdate={setAutoUpdate}
            onUpdateSelectedVmixEntry={updateSelectedVmixEntry}
            onDraftNameChange={(nextName) => {
              setDraftName(nextName);
              schedulePersist({ name: nextName, fields: latestDraftRef.current.fields });
            }}
            onDraftFieldChange={(fieldName, value) => {
              const nextFields = { ...latestDraftRef.current.fields, [fieldName]: value };
              setDraftFields(nextFields);
              schedulePersist({ name: latestDraftRef.current.name, fields: nextFields });
            }}
            onSetExpandedRender={setExpandedRender}
          />
        )}
      </section>

      {activeTab === 'settings' && (
        <SettingsPanel
          settingsTab={settingsTab}
          currentProjectName={currentProjectDisplayName}
          projectDirty={projectDirty}
          projectStatus={projectStatus}
          outputInfo={outputInfo}
          outputRenderTargets={outputRenderTargets}
          selectedOutput={selectedOutput}
          outputs={outputs}
          learningShortcut={learningShortcut}
          shortcutBindings={shortcutBindings}
          bitfocusActions={bitfocusActions}
          midiState={midiState}
          appMeta={appMeta}
          updateState={updateState}
          yandexAuthState={yandexAuthState}
          yandexDeviceAuth={yandexDeviceAuth}
          formatStatusTime={formatStatusTime}
          onSetSettingsTab={setSettingsTab}
          onSelectOutput={selectOutput}
          onDeleteOutput={deleteOutput}
          onUpdateOutput={updateOutput}
          onCopyRenderUrl={(output) => copyText(output.renderUrl).then(() => pushFeedback(`Render URL ${output.name} copied`))}
          onCopyPreviewUrl={(output) => copyText(output.previewUrl).then(() => pushFeedback(`Preview URL ${output.name} copied`))}
          onCopyBaseUrl={(url) => copyText(url).then(() => pushFeedback('Base URL copied'))}
          onStartLearningShortcut={(_entry, action) => setLearningShortcut({
            scope: 'navigation',
            entry: null,
            action,
            label: action.startsWith('selectOutput:')
              ? `Output / ${outputs.find((output) => output.id === action.slice('selectOutput:'.length))?.name || 'Select Output'}`
              : `Command / ${String(action).toUpperCase()}`,
          })}
          onClearShortcut={(_entry, action) => saveGlobalShortcut(action, '')}
          onCancelLearningShortcut={() => setLearningShortcut(null)}
          onCopyBitfocusUrl={(action) => copyText(action.url).then(() => pushFeedback(`URL ${action.label} copied`))}
          onCopyBitfocusPayload={(action) => copyText(JSON.stringify(action.payload)).then(() => pushFeedback(`Payload ${action.label} copied`))}
          onRefreshMidiState={refreshMidiState}
          onStartMidiLearn={startMidiLearn}
          onStopMidiLearn={stopMidiLearn}
          onClearMidiBinding={clearMidiBinding}
          onCheckForUpdates={checkForUpdates}
          onInstallUpdate={installAvailableUpdate}
          onRefreshAppMeta={refreshAppMeta}
          onSaveYandexAuthSettings={saveYandexAuthSettings}
          onReloadYandexAuthSettings={reloadYandexAuthSettings}
          onConnectYandex={startYandexConnect}
          onDisconnectYandex={disconnectYandex}
        />
      )}

      {(activeTab === 'rundown' || activeTab === 'mapping' || activeTab === 'timers') && <main className={
        activeTab === 'timers'
          ? 'timer-tab-grid'
          : activeTab === 'mapping'
            ? 'workspace-grid live-rundown-grid'
            : 'workspace-grid live-only-grid'
      }>
        {activeTab === 'mapping' && (
          <TitlesPanel
            visibleEntries={visibleEntries}
            selectedEntry={selectedEntry}
            program={program}
            templateMap={templateMap}
            manageRundown={manageRundown}
            showHiddenEntries={showHiddenEntries}
            draggedRundownEntryId={draggedRundownEntryId}
            busyAction={busyAction}
            onToggleManage={() => setManageRundown((current) => !current)}
            onToggleShowHidden={() => setShowHiddenEntries((current) => !current)}
            onOpenTemplateFolders={openTemplateFolders}
            onSelectEntry={selectEntry}
            onDragStartEntry={setDraggedRundownEntryId}
            onDropEntry={(targetEntryId) => void reorderEntriesToTarget(draggedRundownEntryId, targetEntryId)}
            onDragEndEntry={() => setDraggedRundownEntryId(null)}
            onToggleEntryHidden={setEntryHidden}
            onRemoveEntry={removeEntry}
            canManageEntryAppearance={canManageEntryAppearance}
            onManageEntryAppearance={openStyleEditor}
            getRundownPrimaryLabel={getRundownPrimaryLabel}
            getRundownSecondaryLabel={getRundownSecondaryLabel}
          />
        )}

        {activeTab === 'rundown' && (
          <LiveTab
            selectedSource={selectedSource}
            selectedSourceId={selectedSourceId}
            sourceLibrary={sourceLibrary}
            selectedLinkedTimerId={selectedLinkedTimerId}
            timers={timers}
            showSourceSyncMenu={showSourceSyncMenu}
            outputs={outputs}
            selectedOutput={selectedOutput}
            selectedSyncGroupId={selectedSyncGroupId}
            syncedOutputIds={syncedOutputIds}
            selectedSourceDisplayColumns={selectedSourceDisplayColumns}
            activeSourceBinding={activeSourceBinding}
            activeTimerBinding={activeTimerBinding}
            linkedSourceTimer={linkedSourceTimer}
            normalizeLinkedTimerId={normalizeLinkedTimerId}
            getSourceRowTimerState={getSourceRowTimerState}
            getTimerSegments={getTimerSegments}
            onSelectSource={setSelectedSourceId}
            onSetSelectedSourceLinkedTimer={setSelectedSourceLinkedTimer}
            onToggleShowSourceSyncMenu={() => setShowSourceSyncMenu((current) => !current)}
            onToggleSourceSyncOutput={toggleSourceSyncOutput}
            onApplySourceRow={applySourceRow}
            onControlSourceRowTimer={controlSourceRowTimer}
            onAdjustSourceRowTimerSegment={adjustSourceRowTimerSegment}
          />
        )}

        {activeTab === 'timers' && (
          <TimersTab
            timers={timers}
            reminderEnabled={reminderEnabled}
            reminderDelaySec={reminderDelaySec}
            localTimerTemplateMap={localTimerTemplateMap}
            localTimerTemplates={localTimerTemplates}
            vmixState={vmixState}
            vmixHostDraft={vmixHostDraft}
            onSetReminderEnabled={setReminderEnabled}
            onSetReminderDelaySec={setReminderDelaySec}
            onCreateTimer={createTimer}
            onUpdateTimer={updateTimer}
            onShiftTimerFormat={shiftTimerFormat}
            onRunTimerPanelCommand={runTimerPanelCommand}
            onDeleteTimer={deleteTimer}
            onSetVmixHostDraft={setVmixHostDraft}
            onConnectVmix={connectVmix}
            onRefreshVmixState={refreshVmixState}
          />
        )}
        {activeTab === 'mapping' && (
          <MappingTab
            selectedEntry={selectedEntry}
            selectedSource={selectedSource}
            selectedTemplate={selectedTemplate}
            selectedVmixInput={selectedVmixInput}
            sourceColumnChoices={sourceColumnChoices}
            selectedEntryFields={selectedEntryFields}
            effectiveSelectedEntryFieldMap={effectiveSelectedEntryFieldMap}
            showVmixFieldBinding={showVmixFieldBinding}
            selectedVmixTextFields={selectedVmixTextFields}
            onSourceColumnMappingChange={updateSelectedSourceColumnMapping}
            onVmixFieldBindingChange={updateSelectedVmixFieldBinding}
          />
        )}
      </main>}

      {activeTab === 'sources' && (
        <SourcesTab
          sourceName={sourceName}
          sourceFileName={sourceFileName}
          sourcePayload={sourcePayload}
          remoteSourceName={remoteSourceName}
          remoteSourceUrl={remoteSourceUrl}
          remoteSourceAutoRefresh={remoteSourceAutoRefresh}
          remoteSourceRefreshIntervalSec={remoteSourceRefreshIntervalSec}
          remoteSourceBusy={busyAction === 'import-remote-source'}
          sourceLibrary={sourceLibrary}
          selectedSourceId={selectedSourceId}
          selectedSource={selectedSource}
          selectedSourceRefreshing={busyAction === `refresh-source-${selectedSource?.id}`}
          yandexConnected={Boolean(yandexAuthState?.accessToken)}
          yandexConnecting={yandexDeviceAuth?.status === 'waiting'}
          activeSourceBinding={activeSourceBinding}
          editingSourceRows={editingSourceRows}
          sourceRowDrafts={sourceRowDrafts}
          manualRowColumns={manualRowColumns}
          manualRowValues={manualRowValues}
          onSourceNameChange={setSourceName}
          onSourceFilePicked={(file) => onSourceFilePicked(file).catch((requestError) => pushFeedback(requestError.message))}
          onSourcePayloadChange={setSourcePayload}
          onImportSourceDataset={importSourceDataset}
          onRemoteSourceNameChange={setRemoteSourceName}
          onRemoteSourceUrlChange={setRemoteSourceUrl}
          onRemoteSourceTypeChange={(value) => setRemoteSourceType(normalizeRemoteSourceType(value))}
          onRemoteSourceAutoRefreshChange={setRemoteSourceAutoRefresh}
          onRemoteSourceRefreshIntervalChange={(value) => setRemoteSourceRefreshIntervalSec(Number.parseInt(value || '30', 10) || 30)}
          onImportRemoteSourceDataset={importRemoteSourceDataset}
          onConnectYandex={startYandexConnect}
          onSelectSource={setSelectedSourceId}
          manageSources={manageSources}
          draggedSourceId={draggedSourceId}
          onToggleManageSources={() => setManageSources((current) => !current)}
          onDragStartSource={setDraggedSourceId}
          onDropSource={(targetSourceId) => reorderSourcesToTarget(draggedSourceId, targetSourceId)}
          onDragEndSource={() => setDraggedSourceId(null)}
          onRenameSource={renameSource}
          onDeleteSource={deleteSourceById}
          onDeleteSelectedSource={deleteSelectedSource}
          onRefreshSelectedSource={() => refreshRemoteSource(selectedSource?.id)}
          onUpdateSelectedSourceRemote={updateSelectedSourceRemote}
          onReplaceSelectedSourceFile={replaceSelectedSourceFromFile}
          onUpdateSourceColumnLabel={updateSourceColumnLabel}
          getSourceRowEditKey={getSourceRowEditKey}
          onApplySourceRow={applySourceRow}
          onUpdateSourceRowCell={updateSourceRowCell}
          onSaveSourceRowEdit={saveSourceRowEdit}
          onStartSourceRowEdit={startSourceRowEdit}
          onDeleteSourceRow={deleteSourceRow}
          onManualRowValueChange={(index, value) => setManualRowValues((current) => ({ ...current, [index]: value }))}
          onAddManualSourceRow={addManualSourceRow}
        />
      )}

      {styleEditorEntry && (
        <KhuralStyleEditorModal
          entry={styleEditorEntry}
          templateFields={styleEditorTemplateFields}
          draftStyles={styleEditorDraft}
          systemFonts={systemFontOptions}
          systemFontsLoading={systemFontOptionsLoading}
          onChange={updateStyleEditorField}
          onClose={closeStyleEditor}
          onSave={saveStyleEditor}
        />
      )}


      {pendingReminder && reminderRow && (
        <div className="modal-backdrop" onClick={() => setPendingReminder(null)}>
          <div className="modal-card modal-card--narrow" onClick={(event) => event.stopPropagation()}>
            <div className="card-head">
              <div>
                <span className="panel-kicker">Timer Reminder</span>
                <h3>Р—Р°РїСѓСЃС‚РёС‚СЊ С‚Р°Р№РјРµСЂ?</h3>
              </div>
              <button className="ghost-button" onClick={() => setPendingReminder(null)}>РќРµС‚</button>
            </div>
            <div className="manual-row-card">
              <span className="output-note">{pendingReminder.sourceName}</span>
              <strong>{reminderRow.values[0] || 'Selected row'}</strong>
              <div className="row-timer-segments reminder-timer-segments">
                {getTimerSegments(
                  Number(reminderRow.timer?.baseMs || 0),
                  reminderLinkedTimer?.displayFormat || reminderRow.timer?.format || 'mm:ss',
                ).map((segment, index) => {
                  const isTimerReminderRow =
                    activeTimerBinding?.sourceId === pendingReminder.sourceId && activeTimerBinding?.rowId === reminderRow.id;

                  return (
                    <div className="row-timer-segment-group" key={`reminder-${segment.key}`}>
                      {index > 0 && <span className="row-timer-colon">:</span>}
                      <div className="row-timer-segment">
                        <button
                          className="row-timer-arrow"
                          onClick={() => adjustSourceRowTimerSegment(pendingReminder.sourceId, reminderRow, segment.key, 1, {
                            currentMs: Number(reminderRow.timer?.baseMs || 0),
                            syncTimerId: reminderLinkedTimer ? reminderLinkedTimer.id : null,
                            linkedTimerId: reminderLinkedTimerId,
                            linkedTimer: reminderLinkedTimer || null,
                          })}
                        >
                          <ChevronUpIcon />
                        </button>
                        <strong>{segment.value}</strong>
                        <button
                          className="row-timer-arrow"
                          onClick={() => adjustSourceRowTimerSegment(pendingReminder.sourceId, reminderRow, segment.key, -1, {
                            currentMs: Number(reminderRow.timer?.baseMs || 0),
                            syncTimerId: reminderLinkedTimer ? reminderLinkedTimer.id : null,
                            linkedTimerId: reminderLinkedTimerId,
                            linkedTimer: reminderLinkedTimer || null,
                          })}
                        >
                          <ChevronDownIcon />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="timer-command-row">
                <button className="primary-button" onClick={startReminderTimer}>Start</button>
                <button className="ghost-button" onClick={() => setPendingReminder(null)}>РќРµС‚</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {templateValidationReport && (
        <div className="modal-backdrop" onClick={() => setTemplateValidationReport(null)}>
          <div className="modal-card modal-card--narrow" onClick={(event) => event.stopPropagation()}>
            <div className="card-head">
              <div>
                <span className="panel-kicker">Template Validation</span>
                <h3>{templateValidationReport.title || 'Template validation failed'}</h3>
              </div>
              <button className="ghost-button" onClick={() => setTemplateValidationReport(null)}>Close</button>
            </div>
            <div className="source-list">
              {templateValidationReport.details?.map((item, index) => (
                <div className="meta-card" key={`${item.file || 'file'}-${index}`}>
                  <span className="meta-label">{item.file || '(package)'}</span>
                  <strong>{item.message || 'Validation issue'}</strong>
                  {item.hint && <span className="output-note">{item.hint}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {expandedRender && (
        <div className="modal-backdrop render-modal-backdrop" onClick={() => setExpandedRender(null)}>
          <div className="modal-card render-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="card-head">
              <div>
                <span className="panel-kicker">Render View</span>
                <h3>{expandedRender === 'preview' ? 'Preview Renderer' : 'Live Renderer'}</h3>
              </div>
              <button className="ghost-button" onClick={() => setExpandedRender(null)}>Close</button>
            </div>
            <div className="render-modal-actions">
              {expandedRender === 'preview' ? (
                <>
                  <button className="ghost-button compact-button" onClick={() => runPreviewAction('show', selectedEntry?.id)} disabled={!selectedEntry || selectedEntry?.entryType === 'vmix'}>
                    Preview Show
                  </button>
                  <button className="ghost-button compact-button" onClick={() => runPreviewAction('hide')} disabled={selectedEntry?.entryType === 'vmix'}>
                    Preview Hide
                  </button>
                </>
              ) : (
                <>
                  <button className="ghost-button compact-button" onClick={() => runProgramAction('show', selectedEntry?.id)} disabled={!selectedEntry || busyAction === 'show'}>
                    Show
                  </button>
                  <button className="ghost-button compact-button" onClick={() => runProgramAction('hide')} disabled={busyAction === 'hide'}>
                    Hide
                  </button>
                </>
              )}
            </div>
            <div className="render-modal-frame-wrap">
              <iframe
                key={`expanded-${expandedRender}-${selectedOutput?.id || 'default'}`}
                className="render-modal-frame"
                title={expandedRender === 'preview' ? 'Expanded Preview Renderer' : 'Expanded Live Renderer'}
                src={expandedRenderUrl}
              />
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="card-head">
              <div>
                <span className="panel-kicker">Add Title</span>
                <h3>РЎРѕР·РґР°С‚СЊ С‚РёС‚СЂ РІ rundown РёР»Рё Р·Р°РіСЂСѓР·РёС‚СЊ РЅРѕРІС‹Р№ С€Р°Р±Р»РѕРЅ</h3>
              </div>
              <button className="ghost-button" onClick={() => setShowAddModal(false)}>Close</button>
            </div>
            <div className="modal-grid add-title-modal-grid">
              <div className="modal-section add-title-section">
                <h4>Create Entry</h4>
                <div className="mode-toggle" role="tablist" aria-label="Title entry mode">
                  <button
                    className={`mode-toggle-button ${newEntryMode === 'local' ? 'is-active' : ''}`}
                    onClick={() => setNewEntryMode('local')}
                    type="button"
                  >
                    Local
                  </button>
                  <button
                    className={`mode-toggle-button ${newEntryMode === 'vmix' ? 'is-active' : ''}`}
                    onClick={() => setNewEntryMode('vmix')}
                    type="button"
                  >
                    vMix Title
                  </button>
                </div>
                {newEntryMode === 'local' ? (
                  <>
                    <label className="input-block">
                      <span>Template</span>
                      <select value={newEntryTemplateId} onChange={(event) => setNewEntryTemplateId(event.target.value)}>
                        {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                      </select>
                    </label>
                    {selectedCreateTemplate?.source === 'custom' && (
                      <div className="template-manage-row">
                        <span className="output-note">Custom template selected</span>
                        <button
                          className="ghost-button compact-button danger-button"
                          type="button"
                          onClick={() => deleteCustomTemplate(selectedCreateTemplate.id, setNewEntryTemplateId)}
                        >
                          Delete Template
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {!vmixTitleInputs.length && (
                      <div className="output-note">Connect and sync vMix first to discover title inputs and text fields.</div>
                    )}
                    <label className="input-block">
                      <span>vMix Input</span>
                      <select value={newVmixInputKey} onChange={(event) => setNewVmixInputKey(event.target.value)}>
                        {vmixTitleInputs.map((input) => (
                          <option key={input.key || input.number} value={input.key || input.number}>
                            {input.number ? `${input.number} В· ` : ''}{input.title || input.shortTitle || 'Untitled input'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="field-chip-row add-title-field-grid">
                      {(selectedNewVmixInput?.textFields?.length ? selectedNewVmixInput.textFields : [{ name: 'Text' }]).map((field, index) => (
                        <div className="field-chip add-title-field-chip" key={`${field.name}-${index}`}>
                          <span>{field.name || `Field ${index + 1}`}</span>
                          <strong>Text Field</strong>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <label className="input-block add-title-name-input">
                  <input value={newEntryName} onChange={(event) => setNewEntryName(event.target.value)} placeholder="Rundown Name" />
                </label>
                <button
                  className="primary-button full-width"
                  onClick={createEntry}
                  disabled={busyAction === 'create-entry' || (newEntryMode === 'vmix' && !vmixTitleInputs.length)}
                >
                  Add To Rundown
                </button>
              </div>
              <div className="modal-section add-title-section">
                <h4>Upload Template Package</h4>
                <label className="input-block">
                  <span>Template Name</span>
                  <input value={uploadName} onChange={(event) => setUploadName(event.target.value)} placeholder="Custom Lower Third" />
                </label>
                <label className="input-block">
                  <span>ZIP file or loose files</span>
                  <input
                    type="file"
                    accept=".zip,.html,.css,.js,.json,.png,.jpg,.jpeg,.webp,.svg,.woff,.woff2,.ttf,.otf,.mp4,.webm"
                    multiple
                    onChange={(event) => {
                      setUploadFiles([...event.target.files]);
                      setUploadDirectoryPath('');
                    }}
                  />
                </label>
                <label className="input-block">
                  <span>Folder upload</span>
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    onChange={(event) => {
                      setUploadFiles([...event.target.files]);
                      setUploadDirectoryPath('');
                    }}
                  />
                </label>
                <button className="ghost-button full-width" onClick={pickTemplateFolder} type="button">Choose Folder</button>
                {uploadDirectoryPath && <div className="file-chip">{uploadDirectoryPath}</div>}
                <button className="primary-button full-width" onClick={uploadTemplateFromSelection} disabled={busyAction === 'upload-template'}>Upload Template</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div className="modal-card modal-card--narrow" onClick={(event) => event.stopPropagation()}>
            <div className="card-head">
              <div>
                <span className="panel-kicker">TXT Import</span>
                <h3>Р”РѕР±Р°РІР»РµРЅРёРµ СЃС‚СЂРѕРє С‚РёС‚СЂРѕРІ РІ rundown</h3>
              </div>
              <button className="ghost-button" onClick={() => setShowImportModal(false)}>Close</button>
            </div>
            <label className="input-block">
              <span>Template</span>
              <select value={txtTemplateId} onChange={(event) => setTxtTemplateId(event.target.value)}>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            {selectedTxtTemplate?.source === 'custom' && (
              <div className="template-manage-row">
                <span className="output-note">Custom template selected</span>
                <button
                  className="ghost-button compact-button danger-button"
                  type="button"
                  onClick={() => deleteCustomTemplate(selectedTxtTemplate.id, setTxtTemplateId)}
                >
                  Delete Template
                </button>
              </div>
            )}
            <label className="input-block">
              <span>TXT file</span>
              <input type="file" accept=".txt,.csv" onChange={(event) => onTxtFilePicked(event.target.files?.[0]).catch((requestError) => pushFeedback(requestError.message))} />
            </label>
            {txtFileName && <div className="file-chip">Р¤Р°Р№Р»: {txtFileName}</div>}
            <label className="input-block">
              <span>TXT Payload</span>
              <textarea value={txtPayload} onChange={(event) => setTxtPayload(event.target.value)} placeholder="John Carter|Lead Anchor|Studio A&#10;Maya Chen|Field Reporter|Berlin" />
            </label>
            <button className="primary-button full-width" onClick={importTxtToRundown} disabled={busyAction === 'import-txt'}>Import Lines To Rundown</button>
          </div>
        </div>
      )}

    </div>
  );
}

export default ControlShell;








