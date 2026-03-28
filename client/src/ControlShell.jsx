import { useEffect, useMemo, useRef, useState } from 'react';
import { loadSourceLibrary, parseSourceText, saveSourceLibrary } from './source-library.js';

const BACKEND_ORIGIN = window.location.port === '5173' ? 'http://localhost:4000' : window.location.origin;
const WS_ORIGIN = BACKEND_ORIGIN.replace(/^http/, 'ws');

const isTypingTarget = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

const api = async (path, options = {}) => {
  const response = await fetch(`${BACKEND_ORIGIN}${path}`, {
    method: options.method || 'GET',
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body:
      options.body instanceof FormData
        ? options.body
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: 'Request failed' }));
    const error = new Error(errorPayload.error || 'Request failed');
    error.details = errorPayload.details || null;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

const copyText = async (value) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {}

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
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

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

const EditIcon = () => (
  <svg {...iconProps}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const SaveIcon = () => (
  <svg {...iconProps}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8" />
    <path d="M7 3v5h8" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg {...iconProps}>
    <path d="m18 15-6-6-6 6" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg {...iconProps}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const PlayIcon = () => (
  <svg {...iconProps}>
    <path d="m8 5 11 7-11 7z" />
  </svg>
);

const PauseIcon = () => (
  <svg {...iconProps}>
    <path d="M10 4H6v16h4z" />
    <path d="M18 4h-4v16h4z" />
  </svg>
);

const ResetIcon = () => (
  <svg {...iconProps}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 3v6h6" />
  </svg>
);

const StopwatchIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="13" r="7" />
    <path d="M12 13V9" />
    <path d="M12 13l3 2" />
    <path d="M9 3h6" />
    <path d="M12 3v3" />
  </svg>
);

const ZoomIcon = () => (
  <svg {...iconProps}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.2-4.2" />
    <path d="M11 8v6" />
    <path d="M8 11h6" />
  </svg>
);

const EyeIcon = () => (
  <svg {...iconProps}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg {...iconProps}>
    <path d="M3 3l18 18" />
    <path d="M10.7 5.1A11.5 11.5 0 0 1 12 5c6.5 0 10 7 10 7a18.7 18.7 0 0 1-4 4.9" />
    <path d="M6.6 6.6A18.2 18.2 0 0 0 2 12s3.5 7 10 7c1.8 0 3.4-.4 4.8-1" />
    <path d="M9.5 9.5A3.5 3.5 0 0 0 14.5 14.5" />
  </svg>
);

const TrashIcon = () => (
  <svg {...iconProps}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

const GripIcon = () => (
  <svg {...iconProps}>
    <circle cx="8" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="8" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="8" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg {...iconProps}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg {...iconProps}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

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

const applyRowToFields = (templateFields, rowValues, currentFields) => {
  const nextFields = { ...currentFields };

  templateFields.forEach((field, index) => {
    nextFields[field.name] = rowValues[index] ?? '';
  });

  return nextFields;
};

const getEntryDataPreview = (entry) => {
  const values = Object.values(entry?.fields || {})
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return values.slice(0, 2).join(' · ');
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
    };
  });

  return {
    fieldMap,
    fields: Object.fromEntries(fieldMap.map((field) => [field.name, ''])),
  };
};

const useRealtimeState = () => {
  const [snapshot, setSnapshot] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let mounted = true;

    const loadInitial = async () => {
      try {
        const initial = await api('/api/state');
        if (mounted) {
          setSnapshot(initial);
          setError('');
        }
      } catch (requestError) {
        if (mounted) {
          setError(requestError.message);
        }
      }
    };

    const connect = () => {
      setConnection('connecting');
      socket = new WebSocket(`${WS_ORIGIN}/ws`);

      socket.addEventListener('open', () => {
        if (!mounted) return;
        setConnection('connected');
        setError('');
      });

      socket.addEventListener('message', (event) => {
        if (!mounted) return;
        const message = JSON.parse(event.data);
        if (message?.payload) {
          setSnapshot(message.payload);
        }
      });

      socket.addEventListener('close', () => {
        if (!mounted) return;
        setConnection('reconnecting');
        reconnectTimer = window.setTimeout(connect, 1200);
      });

      socket.addEventListener('error', () => {
        if (!mounted) return;
        setConnection('disconnected');
        setError('WebSocket disconnected');
      });
    };

    loadInitial();
    connect();

    return () => {
      mounted = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { snapshot, connection, error };
};

const useSystemInfo = () => {
  const [systemInfo, setSystemInfo] = useState(null);

  useEffect(() => {
    let mounted = true;

    api('/api/system/info')
      .then((payload) => {
        if (mounted) {
          setSystemInfo(payload);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  return systemInfo;
};

const useVmixState = () => {
  const [vmixState, setVmixState] = useState(null);

  useEffect(() => {
    let mounted = true;
    let timerId;

    const load = async () => {
      try {
        const nextState = await api('/api/vmix/status');

        if (mounted) {
          setVmixState(nextState);
        }
      } catch {}
    };

    load();
    timerId = window.setInterval(load, 1500);

    return () => {
      mounted = false;
      window.clearInterval(timerId);
    };
  }, []);

  return [vmixState, setVmixState];
};

const useMidiState = () => {
  const [midiState, setMidiState] = useState(null);

  useEffect(() => {
    let mounted = true;
    let timerId;

    const load = async () => {
      try {
        const nextState = await api('/api/midi');

        if (mounted) {
          setMidiState(nextState);
        }
      } catch {}
    };

    load();
    timerId = window.setInterval(load, 4000);

    return () => {
      mounted = false;
      window.clearInterval(timerId);
    };
  }, []);

  return [midiState, setMidiState];
};

function ControlShell() {
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
  const [newEntryMode, setNewEntryMode] = useState('local');
  const [newEntryTemplateId, setNewEntryTemplateId] = useState('');
  const [newEntryName, setNewEntryName] = useState('');
  const [newVmixInputKey, setNewVmixInputKey] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [uploadName, setUploadName] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [txtTemplateId, setTxtTemplateId] = useState('');
  const [txtPayload, setTxtPayload] = useState('');
  const [txtFileName, setTxtFileName] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pendingOutputId, setPendingOutputId] = useState(null);
  const [sourceLibrary, setSourceLibrary] = useState(() => loadSourceLibrary());
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [sourcePayload, setSourcePayload] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');
  const [manualRowValues, setManualRowValues] = useState({});
  const [editingSourceRows, setEditingSourceRows] = useState({});
  const [sourceRowDrafts, setSourceRowDrafts] = useState({});
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
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDelaySec, setReminderDelaySec] = useState(15);
  const [pendingReminder, setPendingReminder] = useState(null);
  const reminderTimeoutRef = useRef(null);
  const latestDraftRef = useRef({ name: '', fields: {} });
  const outputs = snapshot?.outputs || [];
  const updateState = appMeta?.updates || snapshot?.integrations?.updates || null;
  const effectiveSelectedOutputId = pendingOutputId || snapshot?.selectedOutputId || null;
  const selectedOutput =
    outputs.find((output) => output.id === effectiveSelectedOutputId) || snapshot?.selectedOutput || null;
  const selectedEntry =
    (snapshot?.entries || []).find((entry) => entry.id === selectedOutput?.selectedEntryId) || null;
  const program = selectedOutput?.program || snapshot?.program || null;
  const templates = snapshot?.templates || [];
  const timers = snapshot?.timers || [];
  const templateMap = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates]);
  const selectedTemplate = selectedEntry ? templateMap.get(selectedEntry.templateId) : null;
  const selectedEntryFields = useMemo(
    () => selectedEntry?.templateFields || selectedTemplate?.fields || [],
    [selectedEntry?.templateFields, selectedTemplate?.fields],
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
  const selectedNewVmixInput = useMemo(
    () =>
      (vmixState?.inputs || []).find(
        (input) => (input.key || input.number) === newVmixInputKey,
      ) || null,
    [newVmixInputKey, vmixState?.inputs],
  );
  const selectedSource = sourceLibrary.find((item) => item.id === selectedSourceId) || null;
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
        payload: { entryId: snapshot?.selectedEntryId || undefined, outputId: snapshot?.selectedOutputId || undefined },
      },
      {
        id: 'live',
        label: 'LIVE',
        url: `${BACKEND_ORIGIN}/api/commands/live`,
        payload: { entryId: snapshot?.selectedEntryId || undefined, outputId: snapshot?.selectedOutputId || undefined },
      },
      {
        id: 'hide',
        label: 'HIDE',
        url: `${BACKEND_ORIGIN}/api/commands/hide`,
        payload: { outputId: snapshot?.selectedOutputId || undefined },
      },
    ],
    [snapshot?.selectedEntryId, snapshot?.selectedOutputId],
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
      return;
    }

    setDraftName(selectedEntry.name || '');
    setDraftFields(selectedEntry.fields || {});
  }, [selectedEntry?.id, selectedEntry?.updatedAt]);

  useEffect(() => {
    latestDraftRef.current = {
      name: draftName,
      fields: draftFields,
    };
  }, [draftFields, draftName]);

  useEffect(() => {
    if (pendingOutputId && snapshot?.selectedOutputId === pendingOutputId) {
      setPendingOutputId(null);
    }
  }, [pendingOutputId, snapshot?.selectedOutputId]);

  useEffect(() => {
    if (!templates.length) return;
    setNewEntryTemplateId((current) => current || templates[0].id);
    setTxtTemplateId((current) => current || templates[0].id);
  }, [templates]);

  useEffect(() => {
    if (!vmixState?.inputs?.length) {
      return;
    }

    setNewVmixInputKey((current) => current || vmixState.inputs[0].key || vmixState.inputs[0].number || '');
  }, [vmixState?.inputs]);

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

    const nextFieldMap = (selectedEntry.vmixFieldMap || []).map((field) =>
      field.name === fieldName
        ? {
            ...field,
            vmixFieldName: vmixFieldName || field.vmixFieldName || field.label || field.name,
          }
        : field,
    );

    await updateSelectedVmixEntry({ vmixFieldMap: nextFieldMap });
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
    setPendingOutputId(outputId);

    try {
      await api(`/api/outputs/${outputId}/select`, { method: 'POST' });
    } catch (requestError) {
      setPendingOutputId(null);
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
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
      pushFeedback('Выберите ZIP, папку или HTML/CSS/JS файлы');
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
      pushFeedback('Шаблон загружен');
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const importTxtToRundown = async () => {
    const text = txtPayload.trim();

    if (!text) {
      pushFeedback('Вставьте TXT-данные или выберите TXT файл');
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
      pushFeedback('TXT добавлен в rundown');
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
    if (!selectedEntryFields.length) {
      pushFeedback('Сначала выберите титр в rundown');
      return;
    }

    const rawText = sourcePayload.trim();

    if (!rawText) {
      pushFeedback('Загрузите TXT/CSV файл или вставьте строки источника');
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
      pushFeedback('Источник добавлен в таблицу');
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
      pushFeedback('Сначала выберите output');
      return;
    }

    try {
      const targetOutputIds = syncedOutputIds.length ? syncedOutputIds : [selectedOutput.id];

      for (const outputId of targetOutputIds) {
        const output = outputs.find((item) => item.id === outputId);
        const outputEntry = snapshot?.entries?.find((entry) => entry.id === output?.selectedEntryId);
        const outputFields = outputEntry?.templateFields || [];

        if (!output || !outputEntry || !outputFields.length) {
          continue;
        }

        const nextFields = applyRowToFields(outputFields, row.values, outputEntry.fields || {});
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
      pushFeedback(`Строка ${row.index} применена к ${targetOutputIds.length} output(s)`);
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
      const outputEntry = snapshot?.entries?.find((entry) => entry.id === output?.selectedEntryId);
      const outputFields = outputEntry?.templateFields || [];

      if (!output || !outputEntry || !outputFields.length) {
        continue;
      }

      const nextFields = applyRowToFields(outputFields, rowValues, outputEntry.fields || {});
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

  const deleteSelectedSource = () => {
    if (!selectedSource) return;
    setSourceLibrary((current) => current.filter((item) => item.id !== selectedSource.id));
    setEditingSourceRows((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${selectedSource.id}:`))),
    );
    setSourceRowDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${selectedSource.id}:`))),
    );
    setActiveSourceRows((current) => {
      const next = { ...current };

      for (const [outputId, binding] of Object.entries(next)) {
        if (binding?.sourceId === selectedSource.id) {
          delete next[outputId];
        }
      }

      return next;
    });
    pushFeedback('Источник удален');
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

  const saveEntryShortcut = async (entry, action, value) => {
    if (!entry?.id) {
      return;
    }

    try {
      await api(`/api/entries/${entry.id}`, {
        method: 'PUT',
        body: {
          shortcuts: {
            ...(entry.shortcuts || {}),
            [action]: value,
          },
        },
      });
      pushFeedback(value ? `Shortcut saved for ${entry.name}` : `Shortcut cleared for ${entry.name}`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const triggerShortcutAction = async (entry, action) => {
    if (!entry?.id) {
      return;
    }

    if (action === 'live' && entry.entryType === 'vmix') {
      return;
    }

    try {
      if (action === 'hide') {
        await api('/api/program/hide', {
          method: 'POST',
          body: { outputId: selectedOutput?.id },
        });
      } else {
        await api(`/api/program/${action === 'live' ? 'update' : action}`, {
          method: 'POST',
          body: {
            entryId: entry.id,
            outputId: selectedOutput?.id,
          },
        });
      }

      pushFeedback(`Shortcut ${action.toUpperCase()} -> ${entry.name}`);
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
      pushFeedback('Заполните хотя бы одно поле строки');
      return;
    }

    if (!manualRowColumns.length) {
      pushFeedback('Сначала выберите титр или источник данных');
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
    pushFeedback('Строка добавлена в Source Table');
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
        void saveEntryShortcut(learningShortcut.entry, learningShortcut.action, shortcutValue);
        setLearningShortcut(null);
        return;
      }

      const matched = (snapshot?.entries || [])
        .filter((entry) => !entry.hidden)
        .find((entry) => entry.shortcuts?.show === shortcutValue || entry.shortcuts?.live === shortcutValue || entry.shortcuts?.hide === shortcutValue);

      if (!matched) {
        return;
      }

      const action =
        matched.shortcuts?.show === shortcutValue
          ? 'show'
          : matched.shortcuts?.live === shortcutValue
            ? 'live'
            : 'hide';

      event.preventDefault();
      void triggerShortcutAction(matched, action);
    };

    window.addEventListener('keydown', onShortcutInput, true);
    window.addEventListener('mousedown', onShortcutInput, true);
    return () => {
      window.removeEventListener('keydown', onShortcutInput, true);
      window.removeEventListener('mousedown', onShortcutInput, true);
    };
  }, [learningShortcut, selectedOutput?.id, snapshot?.entries]);

  if (!snapshot || !program) {
    return <div className="loading-shell">Loading control surface...</div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="eyebrow">Broadcast Title Control</div>
          <h1>Web Title Pro</h1>
        </div>
        <div className="topbar-actions topbar-utility-actions">
          <span className={`connection-pill is-${connection}`}>{connection.toUpperCase()}</span>
          <button className="ghost-button" onClick={() => setShowImportModal(true)}>TXT Rundown</button>
          <button className="primary-button" onClick={() => setShowAddModal(true)}>Add Title</button>
        </div>
      </header>

      <section className="tabs-card">
        <div className="tab-strip">
          <button className={`tab-button ${activeTab === 'rundown' ? 'is-active' : ''}`} onClick={() => setActiveTab('rundown')}>Live Rundown</button>
          <button className={`tab-button ${activeTab === 'sources' ? 'is-active' : ''}`} onClick={() => setActiveTab('sources')}>Data Source</button>
          <button className={`tab-button ${activeTab === 'timers' ? 'is-active' : ''}`} onClick={() => setActiveTab('timers')}>Timers</button>
          <button className={`tab-button ${activeTab === 'settings' ? 'is-active' : ''}`} onClick={() => setActiveTab('settings')}>Output & Settings</button>
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
              <button className={`top-air-button live ${selectedEntry?.entryType === 'vmix' ? 'is-disabled-mode' : ''}`} onClick={() => runProgramAction('update', selectedEntry?.id)} disabled={!selectedEntry || selectedEntry?.entryType === 'vmix' || busyAction === 'update'}>LIVE</button>
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
          <div className="outputs-preview-shell">
            <button className="preview-toggle-button" aria-label={showPreviewPanel ? 'Скрыть preview title' : 'Открыть preview title'} onClick={() => setShowPreviewPanel((current) => !current)}>
              <span className={`preview-toggle-icon ${showPreviewPanel ? 'is-open' : ''}`}><ChevronDownIcon /></span>
            </button>
            {showPreviewPanel && (
              <div className="preview-title-card">
                <div className="preview-title-actions">
                  <button className="ghost-button compact-button" onClick={() => runPreviewAction('show', selectedEntry?.id)} disabled={!selectedEntry || selectedEntry?.entryType === 'vmix' || busyAction === 'preview-show'}>Preview Show</button>
                  <button className="ghost-button compact-button" onClick={() => runPreviewAction('hide')} disabled={selectedEntry?.entryType === 'vmix' || busyAction === 'preview-hide'}>Preview Hide</button>
                </div>
                <div className="preview-title-grid">
                  <section className="active-panel preview-input-panel">
                    <div className="panel-title-row">
                      <div>
                        <span className="panel-kicker">Active Input</span>
                        <h2>{selectedEntry?.name || 'No title selected'}</h2>
                      </div>
                      <div className="topbar-actions">
                        <label className="toggle">
                          <input type="checkbox" checked={autoUpdate} onChange={(event) => setAutoUpdate(event.target.checked)} />
                          <span>{selectedEntry?.entryType === 'vmix' ? 'Auto-send fields' : 'Live update'}</span>
                        </label>
                      </div>
                    </div>
                    {selectedEntry?.entryType === 'vmix' && (
                      <div className="vmix-external-card">
                        <div className="meta-card">
                          <strong className="vmix-input-title">
                            {selectedVmixInput?.number ? `${selectedVmixInput.number}. ` : ''}
                            {selectedVmixInput?.title || selectedEntry?.vmixInputTitle || 'vMix Title Input'}
                          </strong>
                        </div>
                        <div className="vmix-entry-grid">
                          <label className="input-block compact">
                            <span>SHOW Action</span>
                            <select
                              value={normalizeVmixTitleAction(selectedEntry?.vmixShowAction, 'TransitionIn')}
                              onChange={(event) => updateSelectedVmixEntry({ vmixShowAction: event.target.value })}
                            >
                              {VMIX_TITLE_ACTIONS.map((action) => (
                                <option key={`show-${action.value}`} value={action.value}>{action.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="input-block compact">
                            <span>HIDE Action</span>
                            <select
                              value={normalizeVmixTitleAction(selectedEntry?.vmixHideAction, 'TransitionOut')}
                              onChange={(event) => updateSelectedVmixEntry({ vmixHideAction: event.target.value })}
                            >
                              {VMIX_TITLE_ACTIONS.map((action) => (
                                <option key={`hide-${action.value}`} value={action.value}>{action.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    )}
                    {selectedEntry && selectedEntry.entryType !== 'vmix' && (
                      <div className="output-note">
                        Remove only takes this title out of rundown. Template files stay in the templates folder and can be added again later.
                      </div>
                    )}
                    {selectedEntry ? (
                      <div className={`preview-editor-fields ${selectedEntry?.entryType === 'vmix' ? 'is-vmix' : 'is-local'}`}>
                        <label className="input-block compact entry-name-field">
                          {selectedEntry?.entryType !== 'vmix' ? <span>Entry Name</span> : null}
                          <input
                            value={draftName}
                            placeholder={selectedEntry?.entryType === 'vmix' ? 'Rundown name' : ''}
                            onChange={(event) => {
                              const nextName = event.target.value;
                              setDraftName(nextName);
                              schedulePersist({ name: nextName, fields: latestDraftRef.current.fields });
                            }}
                          />
                        </label>
                        {selectedEntryFields.map((field) => (
                          selectedEntry?.entryType === 'vmix' ? (
                            <div className="vmix-field-row" key={field.name}>
                              <label className="input-block compact">
                                <input
                                  value={draftFields[field.name] ?? ''}
                                  placeholder={field.label || field.placeholder || field.defaultValue || ''}
                                  onChange={(event) => {
                                    const nextFields = { ...latestDraftRef.current.fields, [field.name]: event.target.value };
                                    setDraftFields(nextFields);
                                    schedulePersist({ name: latestDraftRef.current.name, fields: nextFields });
                                  }}
                                />
                              </label>
                              <label className="input-block compact vmix-binding-select">
                                <select
                                  value={
                                    (selectedEntry?.vmixFieldMap || []).find((item) => item.name === field.name)?.vmixFieldName ||
                                    selectedVmixTextFields[0]?.name ||
                                    'Text'
                                  }
                                  title={field.label || field.name}
                                  onChange={(event) => updateSelectedVmixFieldBinding(field.name, event.target.value)}
                                >
                                  {selectedVmixTextFields.map((vmixField) => (
                                    <option key={`${field.name}-${vmixField.index}-${vmixField.name}`} value={vmixField.name}>
                                      {vmixField.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          ) : (
                            <label className="input-block compact">
                              <span>{field.label}</span>
                              <input
                                value={draftFields[field.name] ?? ''}
                                placeholder={field.placeholder || field.defaultValue || ''}
                                onChange={(event) => {
                                  const nextFields = { ...latestDraftRef.current.fields, [field.name]: event.target.value };
                                  setDraftFields(nextFields);
                                  schedulePersist({ name: latestDraftRef.current.name, fields: nextFields });
                                }}
                              />
                            </label>
                          )
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">Выберите титр в rundown, затем редактируйте поля и отправляйте его в preview или live.</div>
                    )}
                  </section>
                  <section className="preview-render-pane">
                    <div className="preview-dual-grid">
                      <div className="preview-block">
                        <div className="preview-block-head">
                          <span className={`preview-state ${(snapshot?.previewProgram?.visible) ? 'is-on' : 'is-off'}`}>{snapshot?.previewProgram?.visible ? 'PREVIEW ON' : 'PREVIEW OFF'}</span>
                          <strong>{snapshot?.previewProgram?.entryName || 'No preview title'}</strong>
                          <button className="ghost-button compact-button icon-button preview-zoom-button" onClick={() => setExpandedRender('preview')} title="Увеличить preview" aria-label="Увеличить preview">
                            <ZoomIcon />
                          </button>
                        </div>
                        <div className="preview-monitor">
                          {selectedEntry?.entryType === 'vmix' ? (
                            <div className="preview-frame preview-frame-placeholder">
                              <div className="preview-placeholder-copy">
                                <strong>External vMix Preview</strong>
                                <span>GT title graphics are rendered only inside vMix.</span>
                              </div>
                            </div>
                          ) : (
                            <iframe key={`preview-${selectedOutput?.id || 'default'}`} className="preview-frame" title="Preview Renderer" src={embeddedPreviewUrl} />
                          )}
                        </div>
                      </div>
                      <div className="preview-block">
                        <div className="preview-block-head">
                          <span className={`preview-state ${program.visible ? 'is-on' : 'is-off'}`}>{program.visible ? 'LIVE ON' : 'LIVE OFF'}</span>
                          <strong>{program.entryName}</strong>
                          <button className="ghost-button compact-button icon-button preview-zoom-button" onClick={() => setExpandedRender('live')} title="Увеличить live" aria-label="Увеличить live">
                            <ZoomIcon />
                          </button>
                        </div>
                        <div className="preview-monitor">
                          {selectedEntry?.entryType === 'vmix' ? (
                            <div className="preview-frame preview-frame-placeholder">
                              <div className="preview-placeholder-copy">
                                <strong>External vMix Live</strong>
                                <span>SHOW and HIDE control the configured vMix title actions.</span>
                              </div>
                            </div>
                          ) : (
                            <iframe key={`live-${selectedOutput?.id || 'default'}`} className="preview-frame" title="Live Renderer" src={embeddedRenderUrl} />
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
                <div className="feedback-row preview-feedback-row"><span>{feedback || error || 'Ready for live operation'}</span></div>
              </div>
            )}
          </div>
        )}
      </section>

      {activeTab === 'settings' && <section className="output-card">
        <div className="card-head">
          <div>
            <span className="panel-kicker">Output</span>
            <h3>Output Settings & Integrations</h3>
          </div>
          <span className="output-note">Outputs, Bitfocus and MIDI are grouped here so setup stays separate from live operation.</span>
        </div>
        <div className="settings-tab-strip">
          <button className={`tab-button ${settingsTab === 'output' ? 'is-active' : ''}`} onClick={() => setSettingsTab('output')}>Output</button>
          <button className={`tab-button ${settingsTab === 'shortcuts' ? 'is-active' : ''}`} onClick={() => setSettingsTab('shortcuts')}>Shortcuts</button>
          <button className={`tab-button ${settingsTab === 'bitfocus' ? 'is-active' : ''}`} onClick={() => setSettingsTab('bitfocus')}>Bitfocus</button>
          <button className={`tab-button ${settingsTab === 'midi' ? 'is-active' : ''}`} onClick={() => setSettingsTab('midi')}>MIDI</button>
          <button className={`tab-button ${settingsTab === 'updates' ? 'is-active' : ''}`} onClick={() => setSettingsTab('updates')}>Updates</button>
          <button className={`tab-button ${settingsTab === 'test' ? 'is-active' : ''}`} onClick={() => setSettingsTab('test')}>Test</button>
        </div>
        {settingsTab === 'output' && (outputInfo ? (
          <div className="integration-grid">
            <div className="meta-card">
              <span className="meta-label">Routing</span>
              <strong>Each output has its own permanent URL</strong>
              <span className="output-note">Add a Browser Source in vMix or OBS using `/render.html?output=key`. After that you only switch outputs in the panel and assign titles/data to that output.</span>
            </div>
            <div className="meta-card">
              <span className="meta-label">Naming</span>
              <strong>`name` is the label, `key` is the URL part</strong>
              <span className="output-note">Example: `LOWER THIRD A` and `lower-third-a`. The final URL will be `/render.html?output=lower-third-a`.</span>
            </div>
            <div className="output-settings-grid">
              {outputRenderTargets.map((output) => (
                <div className="output-settings-card" key={output.id}>
                  <div className="card-head output-settings-head">
                    <div>
                      <span className="panel-kicker">Output</span>
                      <h3>{output.name}</h3>
                    </div>
                    <div className="topbar-actions">
                      {output.id === selectedOutput?.id && <span className="flag flag-live">ACTIVE</span>}
                      <button className="ghost-button compact-button" onClick={() => selectOutput(output.id)}>Open</button>
                      <button className="ghost-button compact-button" onClick={() => deleteOutput(output.id)} disabled={outputs.length <= 1}>Delete</button>
                    </div>
                  </div>
                  <div className="output-settings-fields">
                    <label className="input-block compact">
                      <span>Output Name</span>
                      <input
                        key={`${output.id}-name-${output.name}`}
                        defaultValue={output.name}
                        onBlur={(event) => updateOutput(output.id, { name: event.target.value })}
                      />
                    </label>
                    <label className="input-block compact">
                      <span>URL Key</span>
                      <input
                        key={`${output.id}-key-${output.key}`}
                        defaultValue={output.key}
                        onBlur={(event) => updateOutput(output.id, { key: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="output-url-list">
                    <div className="output-url-row">
                      <div className="output-url-copy">
                        <strong>Render URL</strong>
                        <code>{output.renderUrl}</code>
                      </div>
                      <div className="output-url-actions">
                        <button className="ghost-button compact-button" onClick={() => copyText(output.renderUrl).then(() => pushFeedback(`Render URL ${output.name} copied`))}>Copy Render</button>
                      </div>
                    </div>
                    <div className="output-url-row">
                      <div className="output-url-copy">
                        <strong>Preview URL</strong>
                        <code>{output.previewUrl}</code>
                      </div>
                      <div className="output-url-actions">
                        <button className="ghost-button compact-button" onClick={() => copyText(output.previewUrl).then(() => pushFeedback(`Preview URL ${output.name} copied`))}>Copy Preview</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {outputInfo.fallbackUrls.length > 0 && (
              <div className="output-extra-card">
                <span className="meta-label">Fallback base addresses</span>
                <span className="output-note">If the primary network adapter changes, take any base address below and append `?output=key`.</span>
                <div className="output-fallback-list">
                  {outputInfo.fallbackUrls.map((url) => (
                    <div className="output-fallback-row" key={url}>
                      <code>{url}</code>
                      <button className="ghost-button compact-button" onClick={() => copyText(url).then(() => pushFeedback('Base URL copied'))}>Copy</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">Waiting for backend system info.</div>
        ))}
        {settingsTab === 'shortcuts' && (
          <div className="integration-grid">
            <div className="meta-card">
              <span className="meta-label">Shortcuts</span>
              <strong>Per-title shortcuts for keyboard and mouse</strong>
              <span className="output-note">
                Defaults are empty. Click Learn, then press a keyboard key or mouse button. Shortcuts are saved in the project state and restored on the next launch.
              </span>
            </div>
            {learningShortcut && (
              <div className="meta-card">
                <span className="meta-label">Learning</span>
                <strong>{learningShortcut.entry.name} / {String(learningShortcut.action).toUpperCase()}</strong>
                <span className="output-note">Press the desired key or mouse button now.</span>
                <div className="output-url-actions">
                  <button className="ghost-button compact-button" onClick={() => setLearningShortcut(null)}>Cancel Learn</button>
                </div>
              </div>
            )}
            <div className="shortcut-list">
              {(snapshot?.entries || []).map((entry) => (
                <div className="shortcut-entry-card" key={`shortcut-${entry.id}`}>
                  <div className="card-head">
                    <div>
                      <h3>{getRundownPrimaryLabel(entry)}</h3>
                    </div>
                    {entry.hidden && <span className="flag flag-standby">HIDDEN</span>}
                  </div>
                  <div className="shortcut-action-grid">
                    {['show', 'live', 'hide'].map((action) => {
                      const disabled = action === 'live' && entry.entryType === 'vmix';
                      const value = entry.shortcuts?.[action] || '';

                      return (
                        <div className={`shortcut-action-row ${disabled ? 'is-disabled' : ''}`} key={`${entry.id}-${action}`}>
                          <strong>{action.toUpperCase()}</strong>
                          <code>{disabled ? 'Not used for vMix title' : value || 'Not assigned'}</code>
                          <div className="topbar-actions">
                            <button className="ghost-button compact-button" onClick={() => setLearningShortcut({ entry, action })} disabled={disabled}>
                              Learn
                            </button>
                            <button className="ghost-button compact-button" onClick={() => saveEntryShortcut(entry, action, '')} disabled={disabled || !value}>
                              Clear
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {settingsTab === 'bitfocus' && (
          <div className="integration-grid">
            <div className="meta-card">
              <span className="meta-label">Companion</span>
              <strong>Bitfocus работает через HTTP API</strong>
              <span className="output-note">Делайте обычные HTTP POST-запросы из Companion на эти адреса. Для LIVE добавлен отдельный alias, чтобы не путаться с update.</span>
            </div>
            {bitfocusActions.map((action) => (
              <div className="output-url-row" key={action.id}>
                <div className="output-url-copy">
                  <strong>{action.label}</strong>
                  <span className="output-note">Method: POST</span>
                  <code>{action.url}</code>
                  <code>{JSON.stringify(action.payload)}</code>
                </div>
                <div className="output-url-actions">
                  <button className="ghost-button compact-button" onClick={() => copyText(action.url).then(() => pushFeedback(`URL ${action.label} скопирован`))}>Copy URL</button>
                  <button className="ghost-button compact-button" onClick={() => copyText(JSON.stringify(action.payload)).then(() => pushFeedback(`Payload ${action.label} скопирован`))}>Copy Payload</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {settingsTab === 'midi' && (
          <div className="integration-grid">
            <div className="card-head integration-head">
              <div>
                <span className="panel-kicker">MIDI</span>
                <h3>{midiState?.enabled ? 'MIDI listener active' : 'MIDI listener unavailable'}</h3>
              </div>
              <div className="topbar-actions">
                <button className="ghost-button compact-button" onClick={refreshMidiState}>Refresh Devices</button>
                <span className={`connection-pill ${midiState?.enabled ? 'is-connected' : 'is-disconnected'}`}>{midiState?.enabled ? 'MIDI ON' : 'MIDI OFF'}</span>
              </div>
            </div>
            <div className="meta-card">
              <span className="meta-label">Devices</span>
              <strong>{midiState?.inputs?.length || 0} input device(s)</strong>
              <span className="output-note">{midiState?.error || 'Сервис слушает MIDI-входы автоматически при старте приложения.'}</span>
            </div>
            <div className="meta-card">
              <span className="meta-label">Learn</span>
              <strong>{midiState?.learningAction ? `Waiting for ${String(midiState.learningAction).toUpperCase()} trigger` : 'Ready to learn a binding'}</strong>
              <span className="output-note">
                {midiState?.lastMessage
                  ? `Last signal: ${midiState.lastMessage.device} / ${midiState.lastMessage.type}${midiState.lastMessage.note !== undefined ? ` note ${midiState.lastMessage.note}` : ''}${midiState.lastMessage.controller !== undefined ? ` cc ${midiState.lastMessage.controller}` : ''}`
                  : 'Нажмите Learn, затем нужную кнопку на MIDI-устройстве.'}
              </span>
              <div className="output-url-actions">
                <button className="ghost-button compact-button" onClick={() => startMidiLearn('show')}>Learn SHOW</button>
                <button className="ghost-button compact-button" onClick={() => startMidiLearn('live')}>Learn LIVE</button>
                <button className="ghost-button compact-button" onClick={() => startMidiLearn('hide')}>Learn HIDE</button>
                <button className="ghost-button compact-button" onClick={stopMidiLearn} disabled={!midiState?.learningAction}>Cancel Learn</button>
              </div>
            </div>
            <div className="midi-device-list">
              {(midiState?.inputs || []).map((input) => (
                <div className="source-list-item" key={input.name}>
                  <strong>{input.name}</strong>
                  <span>MIDI Input</span>
                </div>
              ))}
              {!midiState?.inputs?.length && <div className="empty-state">MIDI устройства не обнаружены.</div>}
            </div>
            <div className="midi-binding-list">
              {(midiState?.bindings || []).map((binding, index) => (
                <div className="output-url-row" key={`${binding.device}-${binding.note}-${index}`}>
                  <div className="output-url-copy">
                    <strong>{String(binding.action || '').toUpperCase()}</strong>
                    <span className="output-note">{binding.device === 'any' ? 'Любое устройство' : binding.device}</span>
                    <code>{binding.type}{binding.note !== undefined ? ` note ${binding.note}` : ''}{binding.controller !== undefined ? ` cc ${binding.controller}` : ''}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {settingsTab === 'updates' && (
          <div className="integration-grid">
            <div className="meta-card">
              <span className="meta-label">Application</span>
              <strong>{appMeta?.name || 'Web Title Pro'} {appMeta?.version || updateState?.currentVersion || '0.0.0'}</strong>
              <span className="output-note">В desktop-версии проверка обновлений запускается автоматически при старте. Источник обновлений встроен в приложение и не редактируется пользователем.</span>
            </div>
            <div className="meta-card">
              <span className="meta-label">Update Source</span>
              <code>{updateState?.repoUrl || 'https://github.com/perogello/Web-Title-Pro'}</code>
              <span className="output-note">Канал обновлений: {updateState?.channel || 'prerelease'}.</span>
              <div className="output-url-actions">
                <button className="ghost-button compact-button" onClick={checkForUpdates}>Check Updates</button>
                <button className="ghost-button compact-button" onClick={refreshAppMeta}>Refresh Status</button>
              </div>
            </div>
            <div className="meta-card">
              <span className="meta-label">Status</span>
              <strong>{String(updateState?.status || 'idle').toUpperCase()}</strong>
              <span className="output-note">{updateState?.notes || 'No update checks have been run yet.'}</span>
              <code>Current: {appMeta?.version || updateState?.currentVersion || '0.0.0'}</code>
              <code>Latest: {updateState?.latestVersion || 'not available'}</code>
              <code>Last Check: {updateState?.lastCheckAt ? formatStatusTime(updateState.lastCheckAt) : 'never'}</code>
              <code>Asset: {updateState?.assetName || 'not available'}</code>
            </div>
            <div className="meta-card">
              <span className="meta-label">Packaging</span>
              <strong>Desktop updater is built around GitHub Releases</strong>
              <span className="output-note">При наличии новой версии desktop-приложение может скачать релизный `.exe`, показать прогресс и завершить обновление через отдельное диалоговое окно.</span>
            </div>
          </div>
        )}
        {settingsTab === 'test' && (
          <div className="integration-grid">
            <div className="meta-card">
              <span className="meta-label">Test</span>
              <strong>Update verification tab</strong>
              <span className="output-note">This tab is intentionally empty and only exists so you can verify that a GitHub-delivered update was applied correctly.</span>
            </div>
          </div>
        )}
      </section>}

      {(activeTab === 'rundown' || activeTab === 'timers') && <main className={activeTab === 'timers' ? 'timer-tab-grid' : 'workspace-grid live-rundown-grid'}>
        {activeTab === 'rundown' && <section className="card rundown-card">
          <div className="card-head">
            <div>
              <span className="panel-kicker">Rundown</span>
              <h3>{visibleEntries.length} entries</h3>
            </div>
            <div className="topbar-actions">
              <button className={`ghost-button compact-button ${manageRundown ? 'is-active-manage' : ''}`} onClick={() => setManageRundown((current) => !current)}>
                Manage
              </button>
              <button className={`ghost-button compact-button ${showHiddenEntries ? 'is-active-manage' : ''}`} onClick={() => setShowHiddenEntries((current) => !current)}>
                Show Hidden
              </button>
            </div>
          </div>
          <div className="rundown-list">
            {visibleEntries.map((entry, index) => {
              const isSelected = entry.id === selectedEntry?.id;
              const isProgram = entry.id === program.entryId;
              const entryHasTimer =
                Boolean(entry.hasTimer) ||
                (entry.entryType !== 'vmix' && Array.isArray(templateMap.get(entry.templateId)?.timers) && templateMap.get(entry.templateId).timers.length > 0);

              return (
                <div
                  key={entry.id}
                  className={`rundown-item ${isSelected ? 'is-selected' : ''} ${isProgram ? 'is-program' : ''} ${entry.hidden ? 'is-hidden-entry' : ''} ${manageRundown ? 'is-manage' : ''} ${draggedRundownEntryId === entry.id ? 'is-dragging' : ''}`}
                  onClick={() => selectEntry(entry.id)}
                  draggable={manageRundown}
                  onDragStart={(event) => {
                    if (!manageRundown) {
                      return;
                    }
                    event.dataTransfer.effectAllowed = 'move';
                    setDraggedRundownEntryId(entry.id);
                  }}
                  onDragOver={(event) => {
                    if (!manageRundown || !draggedRundownEntryId || draggedRundownEntryId === entry.id) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    if (!manageRundown) {
                      return;
                    }
                    event.preventDefault();
                    void reorderEntriesToTarget(draggedRundownEntryId, entry.id);
                  }}
                  onDragEnd={() => setDraggedRundownEntryId(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectEntry(entry.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-disabled={busyAction === `select-${entry.id}`}
                >
                  {manageRundown && (
                    <div className="rundown-manage-handle" aria-hidden="true">
                      <GripIcon />
                    </div>
                  )}
                  <div className="rundown-main">
                    <div className="rundown-title-row">
                      <strong>{getRundownPrimaryLabel(entry)}</strong>
                      <span className={`entry-type-badge ${entry.entryType === 'vmix' ? 'is-vmix' : 'is-local'}`}>
                        {entry.entryType === 'vmix' ? 'VMIX' : 'LOCAL'}
                      </span>
                      {entryHasTimer && (
                        <span className="entry-feature-badge" title="В этом титре есть timer slot">
                          <StopwatchIcon />
                        </span>
                      )}
                    </div>
                    {getRundownSecondaryLabel(entry) ? <span className="rundown-secondary-label">{getRundownSecondaryLabel(entry)}</span> : null}
                  </div>
                  <div className="rundown-flags">
                    {isSelected && <span className="flag flag-selected">SELECTED</span>}
                    {isProgram && <span className={`flag ${program.visible ? 'flag-live' : 'flag-standby'}`}>{program.visible ? 'LIVE' : 'READY'}</span>}
                  </div>
                  {manageRundown && (
                    <div className="rundown-manage-actions" onClick={(event) => event.stopPropagation()}>
                      <button className="ghost-button compact-button icon-button" onClick={() => setEntryHidden(entry, !entry.hidden)} disabled={busyAction === `${entry.hidden ? 'show' : 'hide'}-entry-${entry.id}`} aria-label={entry.hidden ? 'Restore title' : 'Hide title'}>
                        {entry.hidden ? <EyeIcon /> : <EyeOffIcon />}
                      </button>
                      <button className="ghost-button compact-button icon-button danger-button" onClick={() => removeEntry(entry)} disabled={busyAction === `remove-entry-${entry.id}`} aria-label="Remove title">
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>}

        {activeTab === 'rundown' && <section className="card live-source-card">
          <div className="card-head">
            <div>
              <span className="panel-kicker">Live Data Source</span>
              <h3>{selectedSource?.name || 'No source selected'}</h3>
            </div>
            <div className="topbar-actions">
              <label className="input-block compact live-source-selector">
                <span>Source</span>
                <select value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)}>
                  {sourceLibrary.map((source) => (
                    <option key={source.id} value={source.id}>{source.name}</option>
                  ))}
                </select>
              </label>
              <label className="input-block compact live-source-selector">
                <span>Timer</span>
                <select
                  value={selectedLinkedTimerId || ''}
                  onChange={(event) => setSelectedSourceLinkedTimer(event.target.value)}
                >
                  <option value="">No timer link</option>
                  {timers.map((timer) => (
                    <option key={timer.id} value={normalizeLinkedTimerId(timer.id) || ''}>{timer.name}</option>
                  ))}
                </select>
              </label>
              <div className="live-source-selector sync-menu-control">
                <span className="sync-menu-label">Sync</span>
                <button className="ghost-button compact-button sync-menu-button" onClick={() => setShowSourceSyncMenu((current) => !current)}>
                  <span className={`preview-toggle-icon ${showSourceSyncMenu ? 'is-open' : ''}`}><ChevronDownIcon /></span>
                </button>
              </div>
            </div>
          </div>
          <div className="live-source-toolbar">
            <span className="output-note">
              {linkedSourceTimer
                ? `Связанный таймер: ${linkedSourceTimer.name}`
                : 'Выберите timer для этого data source, чтобы синхронизировать время и формат.'}
            </span>
          </div>
          {showSourceSyncMenu && (
            <div className="sync-output-strip">
              {outputs.map((output) => (
                <button
                  key={output.id}
                  className={`output-chip sync-chip ${output.syncGroupId === selectedSyncGroupId ? 'is-active' : ''}`}
                  onClick={() => toggleSourceSyncOutput(output.id)}
                  disabled={output.id === selectedOutput?.id && syncedOutputIds.length <= 1}
                >
                  <strong>{output.name}</strong>
                  <span>
                    {output.id === selectedOutput?.id
                      ? 'CURRENT'
                      : output.syncGroupId === selectedSyncGroupId
                        ? 'SYNC ON'
                        : 'SYNC OFF'}
                  </span>
                </button>
              ))}
            </div>
          )}
          {selectedSource ? (
            <div className="source-table-wrapper live-source-wrapper">
              <table className="source-table live-source-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {selectedSource.columns.map((column) => <th key={column.id}>{column.label}</th>)}
                    {selectedLinkedTimerId && <th>Timer</th>}
                  </tr>
                </thead>
                <tbody>
                  {selectedSource.rows.map((row) => {
                    const isActiveRow =
                      activeSourceBinding?.sourceId === selectedSource.id && activeSourceBinding?.rowId === row.id;
                    const isTimerRow =
                      activeTimerBinding?.sourceId === selectedSource.id &&
                      activeTimerBinding?.rowId === row.id &&
                      normalizeLinkedTimerId(activeTimerBinding?.timerId) === selectedLinkedTimerId;
                    const timerState = getSourceRowTimerState(selectedSource.id, row, linkedSourceTimer, isTimerRow);
                    const displayedTimerMs = Number(timerState.currentMs ?? (row.timer?.baseMs || 0));
                    const timerFormat = linkedSourceTimer?.displayFormat || row.timer?.format || 'mm:ss';
                    const timerSegments = getTimerSegments(displayedTimerMs, timerFormat);

                    return (
                      <tr
                        key={row.id}
                        className={isActiveRow ? 'is-active-source-row' : ''}
                        onClick={() => applySourceRow(row)}
                      >
                        <td>{row.index}</td>
                        {selectedSource.columns.map((column, index) => (
                          <td key={column.id}>
                            <span className="source-table-value">{row.values[index] || ''}</span>
                          </td>
                        ))}
                        {selectedLinkedTimerId && <td>
                          <div className="row-timer-cell" onClick={(event) => event.stopPropagation()}>
                            <div className="row-timer-actions">
                              <button
                                className={`ghost-button compact-button icon-button timer-state-button is-${timerState.status}`}
                                onClick={() => controlSourceRowTimer(selectedSource.id, row, 'toggle', {
                                  syncTimerId: selectedLinkedTimerId,
                                  linkedTimerId: selectedLinkedTimerId,
                                  linkedTimer: linkedSourceTimer || null,
                                  isTimerRow,
                                })}
                                title={timerState.status === 'running' ? 'Pause timer' : 'Start timer'}
                              >
                                {timerState.status === 'running' ? <PauseIcon /> : <PlayIcon />}
                              </button>
                              <button
                                className="ghost-button compact-button icon-button"
                                onClick={() => controlSourceRowTimer(selectedSource.id, row, 'reset', {
                                  syncTimerId: selectedLinkedTimerId,
                                  linkedTimerId: selectedLinkedTimerId,
                                  linkedTimer: linkedSourceTimer || null,
                                  isTimerRow,
                                })}
                                title="Reset timer"
                              >
                                <ResetIcon />
                              </button>
                            </div>
                            <div className="row-timer-segments">
                              {timerSegments.map((segment, index) => (
                                <div className="row-timer-segment-group" key={`${row.id}-${segment.key}`}>
                                  {index > 0 && <span className="row-timer-colon">:</span>}
                                  <div className="row-timer-segment">
                                    <button
                                      className="row-timer-arrow"
                                      onClick={() => adjustSourceRowTimerSegment(selectedSource.id, row, segment.key, 1, {
                                        currentMs: displayedTimerMs,
                                        syncTimerId: selectedLinkedTimerId,
                                        linkedTimerId: selectedLinkedTimerId,
                                        linkedTimer: linkedSourceTimer || null,
                                      })}
                                    >
                                      <ChevronUpIcon />
                                    </button>
                                    <strong>{segment.value}</strong>
                                    <button
                                      className="row-timer-arrow"
                                      onClick={() => adjustSourceRowTimerSegment(selectedSource.id, row, segment.key, -1, {
                                        currentMs: displayedTimerMs,
                                        syncTimerId: selectedLinkedTimerId,
                                        linkedTimerId: selectedLinkedTimerId,
                                        linkedTimer: linkedSourceTimer || null,
                                      })}
                                    >
                                      <ChevronDownIcon />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state source-empty">Choose a source table and click a row to load it into the current output.</div>
          )}
        </section>}

        {activeTab === 'timers' && <section className="card timer-card">
          <div className="card-head">
            <div>
              <span className="panel-kicker">Timer Outputs</span>
              <h3>{timers.length} timer{timers.length === 1 ? '' : 's'} with explicit output target</h3>
            </div>
            <button className="ghost-button" onClick={createTimer}>Add Timer</button>
          </div>
          <div className="timer-reminder-card">
            <label className="toggle">
              <input type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} />
              <span>Напомнить о запуске таймера после выбора титра</span>
            </label>
            <label className="input-block compact reminder-delay-input">
              <span>Через секунд</span>
              <input type="number" min="1" step="1" value={reminderDelaySec} onChange={(event) => setReminderDelaySec(Number(event.target.value) || 1)} />
            </label>
          </div>
          <div className="timer-grid">
            {timers.map((timer) => (
              <div className="timer-panel" key={timer.id}>
                <div className="timer-source-head">
                  <strong>{timer.name}</strong>
                  <div className="mode-toggle" role="tablist" aria-label={`Timer output mode ${timer.name}`}>
                    <button
                      type="button"
                      className={`mode-toggle-button ${timer.sourceType !== 'vmix' ? 'is-active' : ''}`}
                      onClick={() => updateTimer(timer.id, { sourceType: 'local' })}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      className={`mode-toggle-button ${timer.sourceType === 'vmix' ? 'is-active' : ''}`}
                      onClick={() => updateTimer(timer.id, { sourceType: 'vmix' })}
                    >
                      vMix
                    </button>
                  </div>
                </div>
                <label className="input-block compact">
                  <span>Name</span>
                  <input defaultValue={timer.name} onBlur={(event) => updateTimer(timer.id, { name: event.target.value })} />
                </label>
                <div className="timer-readout">{timer.display}</div>
                <div className="timer-format-row">
                  <span className="meta-label">Format</span>
                  <div className="timer-format-switch">
                    <button className="ghost-button compact-button icon-button" onClick={() => shiftTimerFormat(timer, 'left')}><ChevronLeftIcon /></button>
                    <strong>{timer.displayFormat || 'mm:ss'}</strong>
                    <button className="ghost-button compact-button icon-button" onClick={() => shiftTimerFormat(timer, 'right')}><ChevronRightIcon /></button>
                  </div>
                </div>
                <div className="timer-controls">
                  <select defaultValue={timer.mode} onChange={(event) => updateTimer(timer.id, { mode: event.target.value })}>
                    <option value="countdown">Down</option>
                    <option value="countup">Up</option>
                  </select>
                  <input type="number" min="0" step="1" defaultValue={Math.round(timer.durationMs / 1000)} onBlur={(event) => updateTimer(timer.id, { durationMs: Number(event.target.value) * 1000 })} />
                </div>
                {timer.sourceType !== 'vmix' ? (
                  <>
                    <label className="input-block compact">
                      <span>Local title template</span>
                      <select
                        value={timer.targetTemplateId || ''}
                        onChange={(event) => {
                          const nextTemplate = localTimerTemplateMap.get(event.target.value);
                          updateTimer(timer.id, {
                            sourceType: 'local',
                            targetTemplateId: event.target.value || null,
                            targetTimerId: nextTemplate?.timers?.[0]?.id || null,
                          });
                        }}
                      >
                        <option value="">Select local title</option>
                        {localTimerTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="input-block compact">
                      <span>Timer field in template</span>
                      <select
                        value={timer.targetTimerId || ''}
                        onChange={(event) => updateTimer(timer.id, { targetTimerId: event.target.value || null })}
                        disabled={!timer.targetTemplateId}
                      >
                        <option value="">Select timer field</option>
                        {(localTimerTemplateMap.get(timer.targetTemplateId)?.timers || []).map((slot) => (
                          <option key={slot.id} value={slot.id}>{slot.label}</option>
                        ))}
                      </select>
                    </label>
                    {!localTimerTemplates.length && <div className="output-note">Сейчас среди локальных шаблонов нет ни одного `data-timer`, поэтому локальный вывод таймера некуда привязать.</div>}
                    {timer.targetTemplateId && timer.targetTimerId && (
                      <div className="output-note">Таймер появится, когда в эфир будет выведен шаблон `{localTimerTemplateMap.get(timer.targetTemplateId)?.name}` с полем `{timer.targetTimerId}`.</div>
                    )}
                  </>
                ) : (
                  <>
                    <label className="input-block compact">
                      <span>vMix text input target</span>
                      <select
                        value={timer.vmixInputKey || ''}
                        onChange={(event) => {
                          const nextInput = (vmixState?.inputs || []).find((input) => (input.key || input.number) === event.target.value);
                          updateTimer(timer.id, {
                            sourceType: 'vmix',
                            vmixInputKey: event.target.value || null,
                            vmixTextField: nextInput?.textFields?.[0]?.name || 'Text',
                          });
                        }}
                      >
                        <option value="">Select vMix input</option>
                        {(vmixState?.inputs || []).map((input) => (
                          <option key={input.key || input.number} value={input.key || input.number}>
                            {input.number}. {input.title || input.shortTitle || input.key}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="input-block compact">
                      <span>vMix text field name</span>
                      <select
                        value={timer.vmixTextField || ((vmixState?.inputs || []).find((input) => (input.key || input.number) === timer.vmixInputKey)?.textFields?.[0]?.name || 'Text')}
                        onChange={(event) => updateTimer(timer.id, { vmixTextField: event.target.value || 'Text' })}
                      >
                        {(((vmixState?.inputs || []).find((input) => (input.key || input.number) === timer.vmixInputKey)?.textFields) || [{ name: 'Text', index: '0' }]).map((field) => (
                          <option key={`${field.index}-${field.name}`} value={field.name}>{field.name}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <div className="timer-command-row">
                  <button
                    className="ghost-button compact-button icon-button"
                    onClick={() => runTimerPanelCommand(timer, timer.running ? 'stop' : 'start')}
                    aria-label={timer.running ? 'Stop timer' : 'Start timer'}
                    title={timer.running ? 'Stop timer' : 'Start timer'}
                  >
                    {timer.running ? <PauseIcon /> : <PlayIcon />}
                  </button>
                  <button
                    className="ghost-button compact-button icon-button"
                    onClick={() => runTimerPanelCommand(timer, 'reset')}
                    aria-label="Reset timer"
                    title="Reset timer"
                  >
                    <ResetIcon />
                  </button>
                  <button
                    className="ghost-button compact-button icon-button danger-button"
                    onClick={() => deleteTimer(timer.id)}
                    aria-label="Delete timer"
                    title="Delete timer"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>}

        {activeTab === 'timers' && <section className="card vmix-card">
          <div className="card-head">
            <div>
              <span className="panel-kicker">vMix Connection</span>
              <h3>{vmixState?.connected ? 'Connected to vMix' : 'Disconnected from vMix'}</h3>
            </div>
            <div className="topbar-actions">
              <button className="ghost-button compact-button" onClick={refreshVmixState}>Sync Now</button>
              <span className={`connection-pill ${vmixState?.connected ? 'is-connected' : 'is-disconnected'}`}>{vmixState?.connected ? 'vMix Online' : 'vMix Offline'}</span>
            </div>
          </div>
          <div className="vmix-grid">
            <label className="input-block">
              <span>vMix Host</span>
              <input value={vmixHostDraft} onChange={(event) => setVmixHostDraft(event.target.value)} placeholder="http://127.0.0.1:8088" />
            </label>
            <div className="timer-command-row">
              <button className="ghost-button" onClick={() => connectVmix(vmixHostDraft)}>Connect / Save Host</button>
            </div>
            <div className="vmix-readout">
              <span className="meta-label">Discovered Inputs</span>
              <strong>{vmixState?.inputs?.length || 0} input(s)</strong>
            </div>
            <div className="vmix-readout">
              <span className="meta-label">Status</span>
              <strong>{vmixState?.connected ? 'Connection active' : 'Waiting for connection'}</strong>
              {vmixState?.error ? <span className="output-note">{vmixState.error}</span> : null}
            </div>
          </div>
        </section>}
      </main>}

      {activeTab === 'sources' && <section className="card source-table-card standalone-tab">
        <div className="source-layout">
          <aside className="source-sidebar">
            <div className="source-import-card">
              <label className="input-block">
                <span>Source Name</span>
                <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Guests / Speakers / News List" />
              </label>
              <label className="input-block">
                <span>TXT / CSV file</span>
                <input type="file" accept=".txt,.csv" onChange={(event) => onSourceFilePicked(event.target.files?.[0]).catch((requestError) => pushFeedback(requestError.message))} />
              </label>
              {sourceFileName && <div className="file-chip">File: {sourceFileName}</div>}
              <label className="input-block">
                <span>Source Rows</span>
                <textarea value={sourcePayload} onChange={(event) => setSourcePayload(event.target.value)} placeholder="Ivan Petrov|Presenter&#10;Maria Sokolova|Reporter" />
              </label>
              <button className="primary-button full-width" onClick={importSourceDataset}>Add Source Table</button>
            </div>
            <div className="source-list">
              {sourceLibrary.map((item) => (
                <button key={item.id} className={`source-list-item ${item.id === selectedSourceId ? 'is-selected' : ''}`} onClick={() => setSelectedSourceId(item.id)}>
                  <strong>{item.name}</strong>
                  <span>{item.rows.length} rows</span>
                </button>
              ))}
              {!sourceLibrary.length && <div className="empty-state">Import a TXT/CSV source and it will appear here.</div>}
            </div>
          </aside>
          <section className="source-table-card inner-source-card">
              <div className="card-head">
                <div>
                  <span className="panel-kicker">Current Source</span>
                  <h3>{selectedSource?.name || 'No source selected'}</h3>
                </div>
                <div className="topbar-actions">
                  <button className="ghost-button" onClick={deleteSelectedSource} disabled={!selectedSource}>Delete Source</button>
                </div>
              </div>
            {selectedSource ? (
              <div className="source-table-wrapper">
                <table className="source-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {selectedSource.columns.map((column) => <th key={column.id}>{column.label}</th>)}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSource.rows.map((row) => {
                      const rowKey = getSourceRowEditKey(selectedSource.id, row.id);
                      const isEditing = Boolean(editingSourceRows[rowKey]);
                      const rowValues = isEditing ? sourceRowDrafts[rowKey] || row.values : row.values;

                      return (
                        <tr
                          key={row.id}
                          className={activeSourceBinding?.sourceId === selectedSource.id && activeSourceBinding?.rowId === row.id ? 'is-active-source-row' : ''}
                          onClick={() => !isEditing && applySourceRow(row)}
                        >
                          <td>{row.index}</td>
                          {selectedSource.columns.map((column, index) => (
                            <td key={column.id}>
                              {isEditing ? (
                                <input
                                  className="source-table-input"
                                  value={rowValues[index] || ''}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => updateSourceRowCell(selectedSource.id, row.id, index, event.target.value)}
                                />
                              ) : (
                                <span className="source-table-value">{row.values[index] || ''}</span>
                              )}
                            </td>
                          ))}
                          <td>
                            <div className="source-row-actions" onClick={(event) => event.stopPropagation()}>
                              <button
                                className="ghost-button compact-button icon-button"
                                onClick={() => (isEditing ? saveSourceRowEdit(selectedSource.id, row.id) : startSourceRowEdit(selectedSource.id, row))}
                                title={isEditing ? 'Save row' : 'Edit row'}
                                aria-label={isEditing ? 'Save row' : 'Edit row'}
                              >
                                {isEditing ? <SaveIcon /> : <EditIcon />}
                              </button>
                              <button className="ghost-button compact-button danger-button" onClick={() => deleteSourceRow(selectedSource.id, row.id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state source-empty">Load a TXT/CSV source on the left, then use a row here to feed the current title.</div>
            )}
            <div className="manual-row-card">
              <div className="card-head">
                <div>
                  <h3>Add Row</h3>
                </div>
                <span className="output-note">The fields below come from the selected title. If the title has 4 variables, this form will show 4 fields too.</span>
              </div>
              <div className="manual-row-grid">
                {manualRowColumns.map((column, index) => (
                  <label className="input-block" key={column.id}>
                    <span>{column.label}</span>
                    <input
                      value={manualRowValues[index] || ''}
                      onChange={(event) => setManualRowValues((current) => ({ ...current, [index]: event.target.value }))}
                      placeholder={`Value ${index + 1}`}
                    />
                  </label>
                ))}
                {!manualRowColumns.length && <div className="empty-state">Select a title or a source first so the row fields can be generated.</div>}
              </div>
              <div className="manual-row-actions">
                <button className="primary-button" onClick={addManualSourceRow}>+ Add Row</button>
                <span className="output-note">{selectedSource ? 'The row will be added into the selected source table.' : 'If no table exists yet, a new Manual Source will be created.'}</span>
              </div>
            </div>
          </section>
        </div>
      </section>}

      {pendingReminder && reminderRow && (
        <div className="modal-backdrop" onClick={() => setPendingReminder(null)}>
          <div className="modal-card modal-card--narrow" onClick={(event) => event.stopPropagation()}>
            <div className="card-head">
              <div>
                <span className="panel-kicker">Timer Reminder</span>
                <h3>Запустить таймер?</h3>
              </div>
              <button className="ghost-button" onClick={() => setPendingReminder(null)}>Нет</button>
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
                <button className="ghost-button" onClick={() => setPendingReminder(null)}>Нет</button>
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
                <h3>Создать титр в rundown или загрузить новый шаблон</h3>
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
                  <label className="input-block">
                    <span>Template</span>
                    <select value={newEntryTemplateId} onChange={(event) => setNewEntryTemplateId(event.target.value)}>
                      {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <>
                    {!(vmixState?.inputs || []).length && (
                      <div className="output-note">Connect and sync vMix first to discover title inputs and text fields.</div>
                    )}
                    <label className="input-block">
                      <span>vMix Input</span>
                      <select value={newVmixInputKey} onChange={(event) => setNewVmixInputKey(event.target.value)}>
                        {(vmixState?.inputs || []).map((input) => (
                          <option key={input.key || input.number} value={input.key || input.number}>
                            {input.number ? `${input.number} · ` : ''}{input.title || input.shortTitle || 'Untitled input'}
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
                  disabled={busyAction === 'create-entry' || (newEntryMode === 'vmix' && !(vmixState?.inputs || []).length)}
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
                  <span>ZIP or files</span>
                  <input type="file" multiple onChange={(event) => setUploadFiles([...event.target.files])} />
                </label>
                <label className="input-block">
                  <span>Folder upload</span>
                  <input ref={folderInputRef} type="file" multiple onChange={(event) => setUploadFiles([...event.target.files])} />
                </label>
                <button className="primary-button full-width" onClick={uploadTemplate} disabled={busyAction === 'upload-template'}>Upload Template</button>
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
                <h3>Добавление строк титров в rundown</h3>
              </div>
              <button className="ghost-button" onClick={() => setShowImportModal(false)}>Close</button>
            </div>
            <label className="input-block">
              <span>Template</span>
              <select value={txtTemplateId} onChange={(event) => setTxtTemplateId(event.target.value)}>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <label className="input-block">
              <span>TXT file</span>
              <input type="file" accept=".txt,.csv" onChange={(event) => onTxtFilePicked(event.target.files?.[0]).catch((requestError) => pushFeedback(requestError.message))} />
            </label>
            {txtFileName && <div className="file-chip">Файл: {txtFileName}</div>}
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
