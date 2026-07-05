import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createRemoteSourceConfig,
  loadSourceLibrary,
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
import ChangelogModal from './control-shell/ChangelogModal.jsx';
import { useMidiState, useRealtimeState, useSystemInfo, useVmixState } from './control-shell/hooks.js';
import SettingsPanel from './control-shell/SettingsPanel.jsx';
import SourcesTab from './control-shell/tabs/SourcesTab.jsx';
import TimersTab from './control-shell/tabs/TimersTab.jsx';
import TopBar from './control-shell/v2/TopBar.jsx';
import OutputsSidebar from './control-shell/v2/OutputsSidebar.jsx';
import LiveTabV2 from './control-shell/v2/LiveTabV2.jsx';
import ConfigTab from './control-shell/v2/ConfigTab.jsx';
import PreviewOverlay from './control-shell/v2/PreviewOverlay.jsx';
import PluginHost from './control-shell/PluginHost.jsx';
import SegmentedTimerInput from './control-shell/v2/SegmentedTimerInput.jsx';
import { useResizableSidebar } from './control-shell/v2/useResizableSidebar.js';
import { useGlobalShortcuts } from './control-shell/use-global-shortcuts.js';
import {
  buildBindingPatch,
  findActionForShortcut,
  mergeBindingPatches,
  parseActionId,
} from './control-shell/shortcut-model.js';
import {
  LINKED_TIMER_OVERRIDE_MS,
  TIMER_MAX_MS,
  TIMER_FORMATS,
  changeTimerSegment,
  formatCompactTimer,
  formatStatusTime,
  getLinkedTimerStatus,
  getSourceLinkedTimerId,
  getTimerSegments,
  normalizeLinkedTimerId,
  timerIdMatches,
} from './control-shell/lib/timer-utils.js';
import {
  VMIX_TITLE_ACTIONS,
  applyRowToFields,
  buildEffectiveEntryFieldMap,
  buildEffectiveLocalFieldMap,
  buildEffectiveVmixFieldMap,
  buildFieldMapSignature,
  buildUploadFormData,
  buildVmixEntryConfig,
  createClientId,
  getEntryDataPreview,
  getRundownPrimaryLabel,
  getRundownSecondaryLabel,
  getSourceRowEditKey,
  isVmixTitleInput,
  loadLiveSourceColumnWidths,
  normalizeLocalFieldStyles,
  normalizeVmixTitleAction,
  pickPreferredFontFile,
  saveLiveSourceColumnWidths,
  slugFieldKey,
  supportsFieldStyleEditor,
} from './control-shell/lib/entry-utils.js';
import { useFeedback } from './control-shell/lib/use-feedback.js';
import { useProjectActions } from './control-shell/lib/use-project-actions.js';
import { useProjectState } from './control-shell/lib/use-project-state.js';

function ControlShell() {
  const desktopBridge = window.webTitleDesktop || null;
  const { snapshot, connection, error } = useRealtimeState();
  const systemInfo = useSystemInfo();
  const [vmixState, setVmixState] = useVmixState();
  const [midiState, setMidiState] = useMidiState();
  const [appMeta, setAppMeta] = useState(null);
  const [changelogInfo, setChangelogInfo] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [activeTab, setActiveTab] = useState('rundown');
  const [settingsTab, setSettingsTab] = useState('outputs');
  const [showPreviewOverlay, setShowPreviewOverlay] = useState(false);
  const [globalShortcutConflicts, setGlobalShortcutConflicts] = useState([]);
  const globalConflictSignatureRef = useRef('');
  const [draftFields, setDraftFields] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [templateValidationReport, setTemplateValidationReport] = useState(null);
  const [styleEditorEntryId, setStyleEditorEntryId] = useState(null);
  const [styleEditorDraft, setStyleEditorDraft] = useState({});
  const [systemFontOptions, setSystemFontOptions] = useState([]);
  const [systemFontAssetMap, setSystemFontAssetMap] = useState({});
  const [systemFontOptionsLoading, setSystemFontOptionsLoading] = useState(false);
  const [newEntryMode, setNewEntryMode] = useState('local');
  const [newEntryTemplateId, setNewEntryTemplateId] = useState('');
  const [newEntryName, setNewEntryName] = useState('');
  const [newVmixInputKey, setNewVmixInputKey] = useState('');
  // Live-edit: when ON, saving fields of the ON-AIR title pushes the change to
  // air immediately. Default OFF and persisted — editing must never alter the
  // live title unless the operator explicitly opts in (prevented a broadcast
  // incident where a data edit went live unexpectedly).
  const [autoUpdate, setAutoUpdate] = useState(() => {
    try {
      return window.localStorage.getItem('wtp.live-edit') === '1';
    } catch {
      return false;
    }
  });

  const toggleAutoUpdate = () => {
    setAutoUpdate((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('wtp.live-edit', next ? '1' : '0');
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  };
  const [uploadName, setUploadName] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [busyAction, setBusyAction] = useState('');
  const [localSelectedOutputId, setLocalSelectedOutputId] = useState(null);
  const [sourceLibrary, setSourceLibrary] = useState(() => loadSourceLibrary());
  const sourcesHydratedRef = useRef(false);
  const sourcesSyncTimerRef = useRef(null);
  const appliedRowSentRef = useRef({});
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [sourcePayload, setSourcePayload] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');
  const [remoteSourceName, setRemoteSourceName] = useState('');
  const [remoteSourceUrl, setRemoteSourceUrl] = useState('');
  const [remoteSourceType, setRemoteSourceType] = useState('csv-url');
  const [remoteSourceAutoRefresh, setRemoteSourceAutoRefresh] = useState(true);
  const [remoteSourceRefreshIntervalSec, setRemoteSourceRefreshIntervalSec] = useState(30);
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
  const [manualRowValues, setManualRowValues] = useState({});
  const [editingSourceRows, setEditingSourceRows] = useState({});
  const [sourceRowDrafts, setSourceRowDrafts] = useState({});
  const [entryFieldMapDraft, setEntryFieldMapDraft] = useState(null);
  const [vmixHostDraft, setVmixHostDraft] = useState('');
  const [activeSourceRows, setActiveSourceRows] = useState({});
  const [activeTimerRows, setActiveTimerRows] = useState({});
  const [sourceRowTimers, setSourceRowTimers] = useState({});
  const [liveSourceColumnWidths, setLiveSourceColumnWidths] = useState(() => loadLiveSourceColumnWidths());
  const [learningShortcut, setLearningShortcut] = useState(null);
  const [draggedSourceId, setDraggedSourceId] = useState(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDelaySec, setReminderDelaySec] = useState(15);
  const [pendingReminder, setPendingReminder] = useState(null);
  const reminderTimeoutRef = useRef(null);
  const remoteRefreshStateRef = useRef({});
  const latestDraftRef = useRef({ name: '', fields: {} });
  const outputs = snapshot?.outputs || [];
  const [feedback, pushFeedback] = useFeedback();
  const {
    projectStatus,
    setProjectStatus,
    currentProjectDisplayName,
    projectDirty,
    setProjectBaselineSignature,
    setDirty: setProjectDirty,
  } = useProjectState({ snapshot, sourceLibrary, selectedSourceId });
  const updateState = snapshot?.integrations?.updates || appMeta?.updates || null;
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
  const selectedEntryFields = useMemo(() => {
    if (selectedEntry?.templateFields?.length) return selectedEntry.templateFields;
    if (selectedTemplate?.fields?.length) return selectedTemplate.fields;
    // Fallback: derive a field list from the entry's own `fields` keys so the
    // mapping panel still works even when the template parser didn't pick up
    // any `[data-field]` markers (custom templates, legacy projects, etc.).
    const fieldKeys = Object.keys(selectedEntry?.fields || {});
    return fieldKeys.map((name) => ({ name, label: name }));
  }, [selectedEntry?.templateFields, selectedEntry?.fields, selectedTemplate?.fields]);
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
            (input) =>
              input.key === selectedEntry.vmixInputKey ||
              input.number === selectedEntry.vmixInputKey ||
              input.number === selectedEntry.vmixInputNumber,
          ) || null
        : null,
    [selectedEntry?.entryType, selectedEntry?.vmixInputKey, selectedEntry?.vmixInputNumber, vmixState?.inputs],
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
  const displayEntries = useMemo(() => {
    const inputs = vmixState?.inputs || [];
    return (snapshot?.entries || []).map((entry) => {
      if (entry.entryType !== 'vmix') {
        return entry;
      }

      const input = inputs.find(
        (item) =>
          item.key === entry.vmixInputKey ||
          item.number === entry.vmixInputKey ||
          item.number === entry.vmixInputNumber,
      );

      return {
        ...entry,
        vmixInputNumber: entry.vmixInputNumber || input?.number || null,
        vmixInputTitle: entry.vmixInputTitle || input?.title || input?.shortTitle || 'vMix Title',
      };
    });
  }, [snapshot?.entries, vmixState?.inputs]);
  const displaySelectedEntry = useMemo(
    () => displayEntries.find((entry) => entry.id === selectedEntry?.id) || selectedEntry,
    [displayEntries, selectedEntry],
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
  // Companion (Bitfocus) URLs, keyed by the same canonical action ids the
  // shortcut model uses. Only commands with a stable HTTP endpoint are exposed;
  // client-resolved commands (row stepping, an output's "current timer", the
  // global panic) have no single URL and are intentionally omitted.
  const bitfocusActions = useMemo(() => {
    const allTimers = snapshot?.timers || [];
    // Every Companion button hits the same endpoint; only the actionId in the
    // JSON body changes. One URL, one canonical command surface.
    const cmd = (section, actionId, label) => ({
      section,
      action: actionId,
      label,
      url: `${BACKEND_ORIGIN}/api/command`,
      payload: { actionId },
    });
    const result = [];
    for (const output of outputs) {
      const oid = output.id;
      const name = output.name;
      result.push(
        cmd(name, `output:${oid}:titleIn`, `${name} — Title IN`),
        cmd(name, `output:${oid}:titleOut`, `${name} — Title OUT`),
        cmd(name, `output:${oid}:previewIn`, `${name} — PVW IN`),
        cmd(name, `output:${oid}:previewOut`, `${name} — PVW OUT`),
        cmd(name, `output:${oid}:rowPrev`, `${name} — Row ▲ (prev)`),
        cmd(name, `output:${oid}:rowNext`, `${name} — Row ▼ (next)`),
      );
    }
    for (const timer of allTimers) {
      const tid = timer.id;
      const label = timer.name || tid;
      result.push(
        cmd(`Timer: ${label}`, `timer:${tid}:start`, `${label} — Start`),
        cmd(`Timer: ${label}`, `timer:${tid}:stop`, `${label} — Stop`),
        cmd(`Timer: ${label}`, `timer:${tid}:reset`, `${label} — Reset`),
      );
    }
    result.push(cmd('Global', 'global:allOutputsOut', 'ALL OUTPUTS OUT (panic)'));
    return result;
  }, [outputs, snapshot?.timers]);
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
      // Embed variants scale the 1920x1080 stage to fit the host box; used by
      // the in-app frames (PreviewOverlay) and the pop-out live window. The
      // plain render/preview URLs above stay unchanged for vMix/OBS sources.
      liveEmbedUrl: `${outputInfo.primaryRenderUrl}?output=${encodeURIComponent(output.key)}&embed=1`,
      previewEmbedUrl: `${outputInfo.primaryPreviewUrl}&output=${encodeURIComponent(output.key)}&embed=1`,
    }));
  }, [outputInfo, outputs]);
  const shortcutBindings = snapshot?.integrations?.shortcuts || {
    outputs: {},
    timers: {},
    global: {},
    globalActions: {},
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

  // One-time hydration + migration between the browser and the server. The
  // data-source library is now server-owned (it rides in the snapshot) so
  // MIDI, Companion, a second panel and future plugins can all see it. On the
  // first snapshot: if the browser has no sources but the server does, adopt
  // the server's; otherwise push the local library up (migrating legacy
  // localStorage data). The control panel stays the editor after that.
  useEffect(() => {
    if (sourcesHydratedRef.current || !snapshot) {
      return;
    }
    sourcesHydratedRef.current = true;
    const serverSources = snapshot.sources || [];
    if (!sourceLibrary.length && serverSources.length) {
      setSourceLibrary(serverSources);
    } else if (sourceLibrary.length) {
      void api('/api/sources', { method: 'PUT', body: { items: sourceLibrary } }).catch(() => {});
    }
  }, [snapshot, sourceLibrary]);

  // Mirror the library to the server (debounced) so it stays in the snapshot,
  // plus a localStorage backup. The server is the runtime store now;
  // localStorage is only a fallback. We hold off pushing until the initial
  // hydration decision above has run, to avoid clobbering server data on load.
  useEffect(() => {
    saveSourceLibrary(sourceLibrary);
    if (!sourcesHydratedRef.current) {
      return undefined;
    }
    clearTimeout(sourcesSyncTimerRef.current);
    sourcesSyncTimerRef.current = setTimeout(() => {
      void api('/api/sources', { method: 'PUT', body: { items: sourceLibrary } }).catch(() => {});
    }, 250);
    return () => clearTimeout(sourcesSyncTimerRef.current);
  }, [sourceLibrary]);

  useEffect(() => {
    saveLiveSourceColumnWidths(liveSourceColumnWidths);
  }, [liveSourceColumnWidths]);

  // Mirror "which row is applied to each output" to the server so MIDI,
  // Companion and plugins can resolve the output's current row and current
  // timer. Only the changed outputs are pushed (diffed against a ref).
  useEffect(() => {
    if (!sourcesHydratedRef.current) {
      return;
    }
    for (const [outputId, binding] of Object.entries(activeSourceRows || {})) {
      const signature = binding?.sourceId && binding?.rowId ? `${binding.sourceId}:${binding.rowId}` : '';
      if (appliedRowSentRef.current[outputId] === signature) {
        continue;
      }
      appliedRowSentRef.current[outputId] = signature;
      void api(`/api/outputs/${outputId}/applied-row`, {
        method: 'POST',
        body: signature ? { sourceId: binding.sourceId, rowId: binding.rowId } : null,
      }).catch(() => {});
    }
  }, [activeSourceRows]);

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

  // Post-update "what's new": ask the desktop shell once on mount whether we
  // just updated to a newer version; if so, surface the changelog dialog.
  useEffect(() => {
    let mounted = true;

    if (!desktopBridge?.getStartupInfo) {
      return undefined;
    }

    desktopBridge
      .getStartupInfo()
      .then((info) => {
        if (mounted && info?.justUpdatedFrom) {
          setChangelogInfo(info);
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
          const timerMode = timer.mode === 'countup' ? 'countup' : 'countdown';
          const nextMs = timerMode === 'countup'
            ? Math.min(TIMER_MAX_MS, Math.max(0, timer.currentMs + elapsed))
            : Math.max(0, timer.currentMs - elapsed);
          changed = true;
          next[rowKey] = {
            ...timer,
            currentMs: nextMs,
            lastTickAt: now,
            status: timerMode === 'countdown' && nextMs === 0 ? 'finished' : 'running',
          };
        }

        return changed ? next : current;
      });
    }, 250);

    return () => window.clearInterval(timerId);
  }, []);

  // Clear any pending reminder timeout on unmount so callbacks don't fire on a dead tree.
  useEffect(() => {
    return () => {
      window.clearTimeout(reminderTimeoutRef.current);
    };
  }, []);

  const getSourceRowTimerState = (sourceId, row, linkedTimer = null, isTimerRow = false) => {
    const rowKey = getSourceRowEditKey(sourceId, row.id);
    const localTimerState = sourceRowTimers[rowKey] || null;
    const fallbackTimerState = {
      status: 'idle',
      currentMs: Number(row.timer?.baseMs || 0),
      lastTickAt: null,
    };

    if (linkedTimer && isTimerRow) {
      const overrideIsFresh =
        localTimerState?.linkedOverride &&
        Number(localTimerState.linkedOverrideExpiresAt || 0) > Date.now();

      if (overrideIsFresh) {
        return {
          ...localTimerState,
          linked: true,
        };
      }

      return {
        status: getLinkedTimerStatus(linkedTimer, Number(row.timer?.baseMs || 0)),
        currentMs: Number(linkedTimer.currentMs ?? 0),
        lastTickAt: linkedTimer.startedAt ? new Date(linkedTimer.startedAt).valueOf() : null,
        linked: true,
      };
    }

    if (localTimerState?.linkedOverride) {
      return fallbackTimerState;
    }

    return localTimerState || fallbackTimerState;
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
    setSourceRowTimers((current) => {
      const next = { ...current };

      if (options.linkedTimer) {
        for (const [key, timerState] of Object.entries(next)) {
          if (key !== rowKey && timerState?.linkedOverride) {
            delete next[key];
          }
        }
      }

      next[rowKey] = (() => {
        const previous = current[rowKey] || {};
        const linkedTimerIsRunning = Boolean(options.linkedTimer?.running && !options.forceIdle);
        const isRunning = (previous.status === 'running' || linkedTimerIsRunning) && !options.forceIdle;
        const linkedOverride = Boolean(options.linkedTimer);
        return {
          status: isRunning ? 'running' : 'idle',
          currentMs: Math.max(0, nextBaseMs),
          lastTickAt: isRunning ? Date.now() : null,
          mode: options.linkedTimer?.mode === 'countup' ? 'countup' : 'countdown',
          linkedOverride,
          ...(linkedOverride ? { linkedOverrideExpiresAt: Date.now() + LINKED_TIMER_OVERRIDE_MS } : {}),
        };
      })();

      return next;
    });

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

      if (isLinkedTimer) {
        setSourceRowTimers((current) => {
          const next = { ...current };
          for (const [key, timerState] of Object.entries(next)) {
            if (key !== rowKey && timerState?.linkedOverride) {
              delete next[key];
            }
          }

          next[rowKey] = {
            status: shouldPause ? 'paused' : 'running',
            currentMs: shouldPause
              ? Math.max(0, currentTimer.currentMs || Number(row.timer?.baseMs || 0))
              : Math.max(0, currentTimer.currentMs || Number(row.timer?.baseMs || 0)),
            lastTickAt: shouldPause ? null : Date.now(),
            mode: options.linkedTimer?.mode === 'countup' ? 'countup' : 'countdown',
            linkedOverride: true,
            linkedOverrideExpiresAt: Date.now() + LINKED_TIMER_OVERRIDE_MS,
          };

          return next;
        });
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
      const resetMs = Number(row.timer?.baseMs || options.linkedTimer?.durationMs || 0);
      await updateSourceRowTimerBase(sourceId, row.id, resetMs, {
        syncTimerId: options.syncTimerId || null,
        linkedTimer: options.linkedTimer || null,
        forceIdle: true,
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

  const {
    createNewProject,
    openProject,
    openRecentProject,
    saveProject,
    exportProjectBundle,
    importProjectBundleFile,
  } = useProjectActions({
    desktopBridge,
    appVersion: appMeta?.version || null,
    currentProjectDisplayName,
    projectDirty,
    projectStatus,
    sourceLibrary,
    selectedSourceId,
    vmixState,
    setProjectBaselineSignature,
    setProjectDirty,
    setProjectStatus,
    setSourceLibrary,
    setSelectedSourceId,
    setActiveSourceRows,
    setActiveTimerRows,
    setSourceRowTimers,
    persistDraft,
    pushFeedback,
  });

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
    const patch = selectedEntry.entryType === 'vmix' ? { vmixFieldMap: nextFieldMap } : { localFieldMap: nextFieldMap };

    try {
      await api(`/api/entries/${selectedEntry.id}`, {
        method: 'PUT',
        body: {
          ...patch,
          ...(nextFields ? { fields: nextFields } : {}),
        },
      });

      if (nextFields) {
        setDraftFields(nextFields);

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

  // Fire show/hide for an explicit output (used by per-output Play/Stop buttons on the OutputsSidebar v2).
  const runProgramActionForOutput = async (outputId, action, entryId) => {
    if (!outputId) return;
    setLocalSelectedOutputId(outputId);
    setBusyAction(action);
    try {
      await api(`/api/program/${action}`, {
        method: 'POST',
        body: { ...(entryId ? { entryId } : {}), outputId },
      });
      pushFeedback(`${action.toUpperCase()} sent`);
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  // Assign a title (entry) to a specific output — used by the OutputCard's title picker.
  const assignEntryToOutput = async (outputId, entryId) => {
    if (!outputId || !entryId) return;
    setLocalSelectedOutputId(outputId);
    setBusyAction(`select-${entryId}`);
    try {
      await api(`/api/entries/${entryId}/select`, {
        method: 'POST',
        body: { outputId },
      });
      pushFeedback('Title assigned');
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
            vmixInputNumber: selectedNewVmixInput?.number || null,
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

  const importSourceDataset = async () => {
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

  const uploadTemplateFromSelection = async () => {
    if (!uploadFiles.length) {
      pushFeedback('Choose a ZIP file or template files first');
      return;
    }

    setBusyAction('upload-template');

    try {
      const importedTemplate = await api('/api/templates/upload', {
        method: 'POST',
        body: buildUploadFormData(uploadFiles, uploadName),
      });

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

    const usedEntries = (snapshot?.entries || []).filter((entry) => entry.templateId === templateId);
    if (usedEntries.length > 0) {
      const confirmed = window.confirm(
        `Delete this custom template and ${usedEntries.length} title(s) that use it? This cannot be undone.`,
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      await api(`/api/templates/${encodeURIComponent(templateId)}?force=1`, {
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

  const reorderEntriesByIds = async (nextIds) => {
    try {
      await api('/api/entries/reorder', { method: 'POST', body: { ids: nextIds } });
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const reorderOutputsByIds = async (nextIds) => {
    try {
      await api('/api/outputs/reorder', { method: 'POST', body: { ids: nextIds } });
    } catch (requestError) {
      pushFeedback(requestError.message);
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
          ? 'vMix title removed from rundown'
          : 'Local title removed from rundown',
      );
    } catch (requestError) {
      pushFeedback(requestError.message);
    } finally {
      setBusyAction('');
    }
  };

  const duplicateEntry = async (entry) => {
    if (!entry?.id) {
      return;
    }

    setBusyAction(`duplicate-entry-${entry.id}`);

    try {
      await api(`/api/entries/${entry.id}/duplicate`, { method: 'POST' });
      pushFeedback(`Duplicated «${entry.name}»`);
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
      pushFeedback('Сначала выберите output');
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
        await api(`/api/entries/${outputEntry.id}`, {
          method: 'PUT',
          body: { fields: nextFields },
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

        if (!linkedSourceTimer.running && (!hasBoundTimerForCurrentLink || isSameBoundTimerRow)) {
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
      await api(`/api/entries/${outputEntry.id}`, {
        method: 'PUT',
        body: { fields: nextFields },
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

      if (outputId === selectedOutput?.id) {
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

  // Duplicate a source — useful before destructive edits on a large table.
  // The remote config is dropped intentionally so the clone is a snapshot
  // local copy (auto-refresh from the same URL on two sources would clobber).
  const cloneSource = (sourceId) => {
    const original = sourceLibrary.find((item) => item.id === sourceId);
    if (!original) {
      return;
    }
    const cloneId = createClientId('src');
    const baseName = original.name || 'Source';
    const cloneName = `${baseName} (copy)`;
    const clone = {
      ...original,
      id: cloneId,
      name: cloneName,
      remote: null,
      rows: (original.rows || []).map((row) => ({
        ...row,
        id: createClientId('row'),
      })),
    };
    setSourceLibrary((current) => {
      const originalIndex = current.findIndex((item) => item.id === sourceId);
      if (originalIndex === -1) return [...current, clone];
      // Insert the clone right after the original so it's easy to find.
      return [...current.slice(0, originalIndex + 1), clone, ...current.slice(originalIndex + 1)];
    });
    setSelectedSourceId(cloneId);
    pushFeedback(`Cloned ${baseName} → ${cloneName}`);
  };

  // Export a source as a portable JSON blob — saved by the browser as a
  // download. Use Import via the existing TXT/CSV file picker to bring it
  // back; alternatively a future "Import .source.json" path can take this
  // shape directly. Schema is intentionally minimal: columns + rows.
  const exportSource = (sourceId) => {
    const source = sourceLibrary.find((item) => item.id === sourceId);
    if (!source) {
      return;
    }
    const payload = {
      version: 1,
      kind: 'web-title-pro:source',
      exportedAt: new Date().toISOString(),
      source: {
        name: source.name || 'Source',
        columns: source.columns || [],
        rows: (source.rows || []).map((row) => ({
          values: row.values || [],
        })),
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (source.name || 'source').replace(/[<>:"/\\|?*]+/g, ' ').trim() || 'source';
    link.href = url;
    link.download = `${safeName}.source.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    pushFeedback(`Exported ${source.name || 'source'}`);
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

  const duplicateSourceRow = (sourceId, rowId) => {
    setSourceLibrary((current) =>
      current.map((source) => {
        if (source.id !== sourceId) {
          return source;
        }

        const sourceIndex = source.rows.findIndex((row) => row.id === rowId);
        if (sourceIndex === -1) {
          return source;
        }

        const original = source.rows[sourceIndex];
        const newId =
          window.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const clone = {
          ...original,
          id: newId,
          values: [...(original.values || [])],
          timer: original.timer ? { ...original.timer } : original.timer,
        };

        const nextRows = [
          ...source.rows.slice(0, sourceIndex + 1),
          clone,
          ...source.rows.slice(sourceIndex + 1),
        ].map((row, index) => ({ ...row, index: index + 1 }));

        return { ...source, rows: nextRows };
      }),
    );
    pushFeedback('Source row duplicated');
  };

  const reorderSourceRowToTarget = (sourceId, draggedRowId, targetRowId) => {
    if (!sourceId || !draggedRowId || !targetRowId || draggedRowId === targetRowId) {
      return;
    }

    setSourceLibrary((current) =>
      current.map((source) => {
        if (source.id !== sourceId || source.remote?.url) {
          return source;
        }

        const draggedIndex = source.rows.findIndex((row) => row.id === draggedRowId);
        const targetIndex = source.rows.findIndex((row) => row.id === targetRowId);

        if (draggedIndex === -1 || targetIndex === -1) {
          return source;
        }

        const rows = [...source.rows];
        const [moved] = rows.splice(draggedIndex, 1);
        rows.splice(targetIndex, 0, moved);

        return {
          ...source,
          rows: rows.map((row, index) => ({
            ...row,
            index: index + 1,
          })),
        };
      }),
    );
    pushFeedback('Source rows reordered');
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

  const updateMidiBinding = async (action, patch) => {
    try {
      const nextState = await api(`/api/midi/bindings/${encodeURIComponent(action)}`, {
        method: 'PATCH',
        body: patch,
      });
      setMidiState(nextState);
      pushFeedback('MIDI binding updated');
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  const saveGlobalShortcut = async (actionId, value) => {
    try {
      // A combination can only trigger one command — the dispatcher takes the
      // first match otherwise. If it's already bound elsewhere, move it: clear
      // the previous owner and set the new one in a single PUT.
      const previousOwner = value ? findActionForShortcut(shortcutBindings || {}, value) : null;
      let body = buildBindingPatch(actionId, value);
      if (previousOwner && previousOwner !== actionId) {
        body = mergeBindingPatches(buildBindingPatch(previousOwner, ''), body);
      }

      await api('/api/shortcuts/navigation', { method: 'PUT', body });

      if (previousOwner && previousOwner !== actionId) {
        pushFeedback(`Клавиша ${value} перенесена на новую команду`);
      } else {
        pushFeedback(value ? 'Клавиша назначена' : 'Клавиша очищена');
      }
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  // The "current timer" of an output is the timer of the data row applied to
  // that output (what the operator sees ticking in the Live row). Falls back
  // to resolving it from the applied source when the binding isn't cached yet.
  const resolveOutputCurrentTimerId = (outputId) => {
    if (!outputId) return null;
    const direct = activeTimerRows[outputId]?.timerId;
    if (direct) return normalizeLinkedTimerId(direct);
    const rowBinding = activeSourceRows[outputId];
    if (rowBinding?.sourceId) {
      const source = sourceLibrary.find((item) => item.id === rowBinding.sourceId);
      const resolved = getSourceLinkedTimerId(source, outputId);
      if (resolved) return resolved;
    }
    return null;
  };

  // Apply a specific data row to a single explicit output (used by the per-
  // output Row ↑/↓ shortcuts). For the selected output we reuse the full
  // applySourceRow path; for others we do a focused field apply so the command
  // works on any output regardless of the current selection.
  const applyRowToOutput = async (outputId, source, row) => {
    if (!outputId || !source || !row) return;
    if (outputId === selectedOutput?.id) {
      await applySourceRow(row);
      return;
    }
    const output = outputs.find((item) => item.id === outputId);
    const entry = snapshot?.entries?.find((item) => item.id === output?.selectedEntryId) || null;
    const fields = entry?.templateFields || [];
    if (!output || !entry || !fields.length) return;

    const fieldMap = buildEffectiveEntryFieldMap(entry, fields);
    const nextFields = applyRowToFields(fields, row.values, entry.fields || {}, fieldMap);
    await api(`/api/entries/${entry.id}`, { method: 'PUT', body: { fields: nextFields } });
    if (output.program?.visible && entry.entryType !== 'vmix') {
      await api('/api/program/update', { method: 'POST', body: { entryId: entry.id, outputId } });
    }
    setActiveSourceRows((current) => ({
      ...current,
      [outputId]: { sourceId: source.id, rowId: row.id },
    }));
  };

  // Step the applied data row up/down for an output and apply the result.
  const stepOutputRow = async (outputId, direction) => {
    const rowBinding = activeSourceRows[outputId];
    const source =
      (rowBinding?.sourceId && sourceLibrary.find((item) => item.id === rowBinding.sourceId)) ||
      selectedSource ||
      null;
    const rows = source?.rows || [];
    if (!rows.length) {
      pushFeedback('Нет строк данных для этого output');
      return;
    }
    const currentIndex = rowBinding?.rowId ? rows.findIndex((r) => r.id === rowBinding.rowId) : -1;
    const nextIndex =
      currentIndex === -1
        ? direction === 'next'
          ? 0
          : rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, currentIndex + (direction === 'next' ? 1 : -1)));
    await applyRowToOutput(outputId, source, rows[nextIndex]);
  };

  const sendCommand = (actionId) => api('/api/command', { method: 'POST', body: { actionId } });

  // Single entry point for the in-window listener and OS-global shortcuts.
  // Most commands run through the unified server command bus (the same path
  // MIDI / Companion / plugins use). Row stepping keeps the richer client flow
  // so the on-air reminder still fires; per-output timer commands resolve the
  // current timer client-side (richer than the server's applied-row lookup)
  // and then run through the bus by explicit timer id.
  const dispatchAction = async (actionId) => {
    const parsed = parseActionId(actionId);
    if (!parsed) return;

    try {
      if (parsed.kind === 'global' || parsed.kind === 'timer') {
        await sendCommand(actionId);
        return;
      }

      // parsed.kind === 'output'
      const outputId = parsed.id;
      const output = (snapshot?.outputs || []).find((o) => o.id === outputId) || null;
      switch (parsed.command) {
        case 'titleIn':
        case 'previewIn':
          // Nothing selected on this output — stay a silent no-op as before.
          if (!output?.selectedEntryId) return;
          await sendCommand(actionId);
          break;
        case 'titleOut':
        case 'previewOut':
          await sendCommand(actionId);
          break;
        case 'rowPrev':
          await stepOutputRow(outputId, 'previous');
          break;
        case 'rowNext':
          await stepOutputRow(outputId, 'next');
          break;
        case 'timerStart':
        case 'timerStop':
        case 'timerReset': {
          const timerId = resolveOutputCurrentTimerId(outputId);
          if (!timerId) {
            pushFeedback('У этого output нет текущего таймера');
            return;
          }
          const timerAction =
            parsed.command === 'timerStart' ? 'start' : parsed.command === 'timerStop' ? 'stop' : 'reset';
          await sendCommand(`timer:${timerId}:${timerAction}`);
          break;
        }
        default:
          break;
      }
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  // Preview bus: show/hide the selected title on the previewProgram of the
  // selected output. Rendered by ?preview=1 pages and the Preview frame,
  // never touches the on-air program.
  const commandPreview = async (action) => {
    try {
      if (action === 'show') {
        if (!selectedEntry?.id) {
          pushFeedback('Select a title to preview first');
          return;
        }
        await api('/api/preview/show', {
          method: 'POST',
          body: { entryId: selectedEntry.id, outputId: selectedOutput?.id },
        });
        pushFeedback('Preview IN');
      } else {
        await api('/api/preview/hide', {
          method: 'POST',
          body: { outputId: selectedOutput?.id },
        });
        pushFeedback('Preview OUT');
      }
    } catch (requestError) {
      pushFeedback(requestError.message);
    }
  };

  // Pop out a preview/live view of an output into its own OS window (Electron)
  // or a browser window as a fallback. Preview windows use the ?preview=1 page
  // (dark backdrop); live windows use the embed page over a dark window.
  const openRenderWindow = (target, kind) => {
    if (!target) {
      return;
    }
    const url = kind === 'preview' ? target.previewUrl : target.liveEmbedUrl;
    const title = `${kind === 'preview' ? 'Preview' : 'Live'} — ${target.name}`;
    if (window.webTitleDesktop?.openRenderWindow) {
      window.webTitleDesktop
        .openRenderWindow({ key: `${kind}:${target.id}`, url, title })
        .catch(() => {});
    } else {
      window.open(url, `wtp-${kind}-${target.id}`, 'width=960,height=540,resizable=yes');
    }
    pushFeedback(`${title} window opened`);
  };

  const resizeLiveSourceColumn = (sourceId, columnId, width) => {
    if (!sourceId || !columnId) {
      return;
    }

    setLiveSourceColumnWidths((current) => ({
      ...current,
      [`${sourceId}:${columnId}`]: Math.max(72, Math.min(640, Math.round(Number(width) || 0))),
    }));
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

  useGlobalShortcuts({
    shortcutBindings,
    learningShortcut,
    setLearningShortcut,
    saveGlobalShortcut,
    dispatchAction,
  });

  // Sync registered OS-level global shortcuts with the desktop main process
  // whenever the bindings (or which of them are flagged global) change.
  useEffect(() => {
    if (!window.webTitleDesktop?.syncGlobalShortcuts) return;
    window.webTitleDesktop
      .syncGlobalShortcuts({
        outputs: shortcutBindings?.outputs || {},
        timers: shortcutBindings?.timers || {},
        global: shortcutBindings?.global || {},
        globalActions: shortcutBindings?.globalActions || {},
      })
      .then((result) => {
        const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
        const signature = conflicts.map((item) => `${item.action}:${item.accelerator}`).join('|');
        if (signature && signature !== globalConflictSignatureRef.current) {
          pushFeedback(
            `Клавиша занята другой программой: ${conflicts.map((item) => item.raw || item.accelerator).join(', ')}`,
          );
        }
        globalConflictSignatureRef.current = signature;
        setGlobalShortcutConflicts(conflicts);
      })
      .catch(() => {});
  }, [
    JSON.stringify(shortcutBindings?.outputs || {}),
    JSON.stringify(shortcutBindings?.timers || {}),
    JSON.stringify(shortcutBindings?.global || {}),
    JSON.stringify(shortcutBindings?.globalActions || {}),
  ]);

  // A fired OS-global shortcut runs through the same dispatchAction as the
  // in-window listener, keeping both paths identical.
  useEffect(() => {
    if (!window.webTitleDesktop?.onGlobalShortcutFired) return undefined;
    return window.webTitleDesktop.onGlobalShortcutFired(({ action }) => {
      if (action) void dispatchAction(action);
    });
  }, [dispatchAction]);

  const sidebarHook = useResizableSidebar();

  if (!snapshot || !program) {
    return <div className="loading-shell">Loading control surface...</div>;
  }

  const effectiveTab = activeTab === 'mapping' ? 'config' : activeTab;
  const sidebar = sidebarHook;

  return (
    <div
      className="shell-v2"
      style={{ '--sidebar-width': `${sidebar.width}px` }}
    >
      <TopBar
        activeTab={effectiveTab}
        onSetActiveTab={setActiveTab}
        autoUpdate={autoUpdate}
        onToggleAutoUpdate={toggleAutoUpdate}
        currentProjectName={currentProjectDisplayName}
        projectDirty={projectDirty}
        projectStatus={projectStatus}
        connection={connection}
        vmixState={vmixState}
        midiState={midiState}
        yandexAuthState={yandexAuthState}
        onNewProject={createNewProject}
        onOpenProject={openProject}
        onSaveProject={() => saveProject()}
        onSaveAsProject={() => saveProject({ saveAs: true })}
        onOpenRecentProject={openRecentProject}
        onOpenTemplateFolders={openTemplateFolders}
        onExportProjectBundle={exportProjectBundle}
        onImportProjectBundleFile={importProjectBundleFile}
        onOpenSettingsTab={(tab) => { setActiveTab('settings'); setSettingsTab(tab); }}
      />

      <div className="main-v2">
        <OutputsSidebar
          outputs={outputs}
          entries={displayEntries}
          selectedOutputId={selectedOutput?.id}
          busyAction={busyAction}
          onSelectOutput={selectOutput}
          onAssignEntry={assignEntryToOutput}
          onPlay={(outputId, entryId) => runProgramActionForOutput(outputId, 'show', entryId)}
          onStop={(outputId) => runProgramActionForOutput(outputId, 'hide')}
        />

        <div
          className={`splitter-v2 ${sidebar.dragging ? 'is-dragging' : ''}`}
          onMouseDown={sidebar.beginDrag}
          aria-label="Resize sidebar"
        />

        <div className="content-v2">
          <PreviewOverlay
            isOpen={showPreviewOverlay && effectiveTab === 'rundown'}
            onClose={() => setShowPreviewOverlay(false)}
            outputs={outputs}
            entries={displayEntries}
            selectedOutputId={selectedOutput?.id}
            outputRenderTargets={outputRenderTargets}
            canPreviewShow={Boolean(selectedEntry?.id)}
            onPreviewShow={() => commandPreview('show')}
            onPreviewHide={() => commandPreview('hide')}
            onOpenWindow={openRenderWindow}
          />

          <div className="content-v2-inner">

      {effectiveTab === 'rundown' && (
        <LiveTabV2
          selectedOutput={selectedOutput}
          selectedSource={selectedSource}
          selectedSourceId={selectedSourceId}
          sourceLibrary={sourceLibrary}
          selectedLinkedTimerId={selectedLinkedTimerId}
          timers={timers}
          outputs={outputs}
          syncedOutputIds={syncedOutputIds}
          selectedSourceDisplayColumns={selectedSourceDisplayColumns}
          activeSourceBinding={activeSourceBinding}
          activeTimerBinding={activeTimerBinding}
          linkedSourceTimer={linkedSourceTimer}
          liveSourceColumnWidths={liveSourceColumnWidths}
          normalizeLinkedTimerId={normalizeLinkedTimerId}
          getSourceRowTimerState={getSourceRowTimerState}
          getTimerSegments={getTimerSegments}
          onSelectSource={setSelectedSourceId}
          onSetSelectedSourceLinkedTimer={setSelectedSourceLinkedTimer}
          onToggleSourceSyncOutput={toggleSourceSyncOutput}
          onApplySourceRow={applySourceRow}
          onControlSourceRowTimer={controlSourceRowTimer}
          onAdjustSourceRowTimerSegment={adjustSourceRowTimerSegment}
          onSetSourceRowTimerBase={updateSourceRowTimerBase}
          onResizeSourceColumn={resizeLiveSourceColumn}
          onTogglePreview={() => setShowPreviewOverlay((v) => !v)}
          previewOpen={showPreviewOverlay}
        />
      )}

      {effectiveTab === 'rundown' && (
        <PluginHost location="live" snapshot={snapshot} onCommand={sendCommand} />
      )}

      {effectiveTab === 'config' && (
        <ConfigTab
          outputs={outputs}
          entries={displayEntries}
          selectedOutputId={selectedOutput?.id}
          selectedEntry={displaySelectedEntry}
          selectedEntryFieldMap={effectiveSelectedEntryFieldMap}
          sourceColumnChoices={sourceColumnChoices}
          busyAction={busyAction}
          outputRenderTargets={outputRenderTargets}
          onSelectOutput={selectOutput}
          onSelectEntry={selectEntry}
          onUpdateOutput={updateOutput}
          onDeleteOutput={deleteOutput}
          onRemoveEntry={removeEntry}
          onDuplicateEntry={duplicateEntry}
          onManageEntryAppearance={openStyleEditor}
          canManageEntryAppearance={canManageEntryAppearance}
          onSourceColumnMappingChange={updateSelectedSourceColumnMapping}
          onCopyRenderUrl={(output) => copyText(output.renderUrl).then(() => pushFeedback(`Render URL ${output.name} copied`))}
          onCopyPreviewUrl={(output) => copyText(output.previewUrl).then(() => pushFeedback(`Preview URL ${output.name} copied`))}
          onOpenAddTitle={() => setShowAddModal(true)}
          onOpenAddOutput={createOutput}
          onOpenTemplateFolders={openTemplateFolders}
          onReorderOutputs={reorderOutputsByIds}
          onReorderEntries={reorderEntriesByIds}
        />
      )}

      {effectiveTab === 'timers' && (
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

      {effectiveTab === 'settings' && (
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
          globalShortcutConflicts={globalShortcutConflicts}
          shortcutTimers={snapshot?.timers || []}
          bitfocusActions={bitfocusActions}
          midiState={midiState}
          appMeta={appMeta}
          updateState={updateState}
          yandexAuthState={yandexAuthState}
          yandexDeviceAuth={yandexDeviceAuth}
          vmixState={vmixState}
          vmixHostDraft={vmixHostDraft}
          formatStatusTime={formatStatusTime}
          onSetSettingsTab={setSettingsTab}
          onSelectOutput={selectOutput}
          onDeleteOutput={deleteOutput}
          onUpdateOutput={updateOutput}
          onCopyRenderUrl={(output) => copyText(output.renderUrl).then(() => pushFeedback(`Render URL ${output.name} copied`))}
          onCopyPreviewUrl={(output) => copyText(output.previewUrl).then(() => pushFeedback(`Preview URL ${output.name} copied`))}
          onCopyBaseUrl={(url) => copyText(url).then(() => pushFeedback('Base URL copied'))}
          onStartLearningShortcut={(_entry, action) => {
            setLearningShortcut({ scope: 'navigation', entry: null, action });
          }}
          onClearShortcut={(_entry, action) => saveGlobalShortcut(action, '')}
          onCancelLearningShortcut={() => setLearningShortcut(null)}
          onToggleGlobalShortcut={(action, isOn) => {
            void api('/api/shortcuts/navigation', {
              method: 'PUT',
              body: { globalActions: { [action]: !!isOn } },
            }).catch((requestError) => pushFeedback(requestError.message));
          }}
          onCopyBitfocusUrl={(action) => copyText(action.url).then(() => pushFeedback(`URL ${action.label} copied`))}
          onCopyBitfocusPayload={(action) => copyText(JSON.stringify(action.payload)).then(() => pushFeedback(`Payload ${action.label} copied`))}
          onRefreshMidiState={refreshMidiState}
          onStartMidiLearn={startMidiLearn}
          onStopMidiLearn={stopMidiLearn}
          onClearMidiBinding={clearMidiBinding}
          onUpdateMidiBinding={updateMidiBinding}
          onCheckForUpdates={checkForUpdates}
          onInstallUpdate={installAvailableUpdate}
          onRefreshAppMeta={refreshAppMeta}
          onSaveYandexAuthSettings={saveYandexAuthSettings}
          onReloadYandexAuthSettings={reloadYandexAuthSettings}
          onConnectYandex={startYandexConnect}
          onDisconnectYandex={disconnectYandex}
          onSetVmixHostDraft={setVmixHostDraft}
          onConnectVmix={connectVmix}
          onRefreshVmixState={refreshVmixState}
          isDesktop={Boolean(window.webTitleDesktop?.resetApp)}
          onResetApp={() => window.webTitleDesktop?.resetApp?.().catch(() => {})}
          onUninstallApp={() => window.webTitleDesktop?.uninstallApp?.().catch(() => {})}
        />
      )}

      {effectiveTab === 'sources' && (
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
          draggedSourceId={draggedSourceId}
          onDragStartSource={setDraggedSourceId}
          onDropSource={(targetSourceId) => reorderSourcesToTarget(draggedSourceId, targetSourceId)}
          onDragEndSource={() => setDraggedSourceId(null)}
          onRenameSource={renameSource}
          onDeleteSource={deleteSourceById}
          onCloneSource={cloneSource}
          onExportSource={exportSource}
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
          onDuplicateSourceRow={duplicateSourceRow}
          onReorderSourceRow={reorderSourceRowToTarget}
          onManualRowValueChange={(index, value) => setManualRowValues((current) => ({ ...current, [index]: value }))}
          onAddManualSourceRow={addManualSourceRow}
        />
      )}

          </div>
        </div>
      </div>

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

      {changelogInfo && (
        <ChangelogModal
          version={changelogInfo.version}
          previousVersion={changelogInfo.justUpdatedFrom}
          changelog={changelogInfo.changelog}
          onClose={() => setChangelogInfo(null)}
        />
      )}


      {pendingReminder && reminderRow && (
        <div className="modal-backdrop" onClick={() => setPendingReminder(null)}>
          {/* Only one Cancel path now — bottom-row "Отмена" + backdrop click.
              The header used to double-stack a "Нет" next to the title which
              was a redundant dismiss button. */}
          <div className="modal-card modal-card--narrow" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head-v3">
              <div>
                <span className="kicker-v3">Timer Reminder</span>
                <h3>Запустить таймер?</h3>
              </div>
            </div>
            <div className="manual-row-card">
              <span className="note-v3">{pendingReminder.sourceName}</span>
              <strong>{reminderRow.values?.[0] || reminderRow.label || 'Selected row'}</strong>
              <SegmentedTimerInput
                value={Number(reminderRow.timer?.baseMs || 0)}
                format={reminderLinkedTimer?.displayFormat || reminderRow.timer?.format || 'mm:ss'}
                size="lg"
                withArrows
                className="reminder-timer-readout"
                onCommit={(nextMs) => updateSourceRowTimerBase(pendingReminder.sourceId, reminderRow.id, nextMs, {
                  syncTimerId: reminderLinkedTimer ? reminderLinkedTimer.id : null,
                  linkedTimerId: reminderLinkedTimerId,
                  linkedTimer: reminderLinkedTimer || null,
                })}
              />
              <div className="timer-command-row">
                <button className="btn-v3-primary" onClick={startReminderTimer}>Запустить</button>
                <button className="btn-v3-ghost" onClick={() => setPendingReminder(null)}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {templateValidationReport && (
        <div className="modal-backdrop" onClick={() => setTemplateValidationReport(null)}>
          <div className="modal-card modal-card--narrow" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head-v3">
              <div>
                <span className="kicker-v3">Template Validation</span>
                <h3>{templateValidationReport.title || 'Template validation failed'}</h3>
              </div>
              <button className="btn-v3-ghost" onClick={() => setTemplateValidationReport(null)}>Close</button>
            </div>
            <div className="source-list">
              {templateValidationReport.details?.map((item, index) => (
                <div className="info-card-v3" key={`${item.file || 'file'}-${index}`}>
                  <span className="info-label-v3">{item.file || '(package)'}</span>
                  <strong>{item.message || 'Validation issue'}</strong>
                  {item.hint && <span className="note-v3">{item.hint}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head-v3">
              <div>
                <span className="kicker-v3">Add Title</span>
                <h3>Создать титр в rundown или загрузить новый шаблон</h3>
              </div>
              <button className="btn-v3-ghost" onClick={() => setShowAddModal(false)}>Close</button>
            </div>
            <div className="modal-grid add-title-modal-grid">
              <div className="modal-section add-title-section">
                <h4>Create Entry</h4>
                <div className="seg-control-v3" role="tablist" aria-label="Title entry mode">
                  <button
                    className={`seg-button-v3 ${newEntryMode === 'local' ? 'is-active' : ''}`}
                    onClick={() => setNewEntryMode('local')}
                    type="button"
                  >
                    Local
                  </button>
                  <button
                    className={`seg-button-v3 ${newEntryMode === 'vmix' ? 'is-active' : ''}`}
                    onClick={() => setNewEntryMode('vmix')}
                    type="button"
                  >
                    vMix Title
                  </button>
                </div>
                {newEntryMode === 'local' ? (
                  <>
                    <label className="field-v3">
                      <span>Template</span>
                      <select value={newEntryTemplateId} onChange={(event) => setNewEntryTemplateId(event.target.value)}>
                        {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                      </select>
                    </label>
                    {selectedCreateTemplate?.source === 'custom' && (
                      <div className="template-manage-row">
                        <span className="note-v3">Custom template selected</span>
                        <button
                          className="btn-v3-ghost btn-v3-sm btn-v3-danger"
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
                      <div className="note-v3">Connect and sync vMix first to discover title inputs and text fields.</div>
                    )}
                    <label className="field-v3">
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
                <label className="field-v3 add-title-name-input">
                  <input value={newEntryName} onChange={(event) => setNewEntryName(event.target.value)} placeholder="Rundown Name" />
                </label>
                <button
                  className="btn-v3-primary btn-v3-full"
                  onClick={createEntry}
                  disabled={busyAction === 'create-entry' || (newEntryMode === 'vmix' && !vmixTitleInputs.length)}
                >
                  Add To Rundown
                </button>
              </div>
              <div className="modal-section add-title-section">
                <h4>Upload Template Package</h4>
                <label className="field-v3">
                  <span>Template Name</span>
                  <input value={uploadName} onChange={(event) => setUploadName(event.target.value)} placeholder="Custom Lower Third" />
                </label>
                {/* Drop zone — accepts both clicks (opens the native picker via
                    the wrapped <input>) and dragged files. The visible filename
                    list is just a read-back of what's queued; actual upload
                    fires on the Upload Template button below. */}
                <label
                  className={`field-v3 template-drop-zone ${uploadFiles?.length ? 'has-files' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.currentTarget.classList.add('is-dragover');
                  }}
                  onDragLeave={(event) => event.currentTarget.classList.remove('is-dragover')}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.currentTarget.classList.remove('is-dragover');
                    const dropped = Array.from(event.dataTransfer?.files || []);
                    if (dropped.length) setUploadFiles(dropped);
                  }}
                >
                  <span>ZIP file or loose files</span>
                  <input
                    className="add-title-file-input"
                    type="file"
                    accept=".zip,.html,.css,.js,.json,.png,.jpg,.jpeg,.webp,.svg,.woff,.woff2,.ttf,.otf,.mp4,.webm"
                    multiple
                    onChange={(event) => {
                      setUploadFiles([...event.target.files]);
                    }}
                  />
                  <span className="add-title-file-picker" aria-hidden="true">
                    <span className="add-title-file-button">Choose files</span>
                    <span className="add-title-file-name">
                      {uploadFiles?.length
                        ? uploadFiles.map((file) => file.name).join(', ')
                        : 'No file selected'}
                    </span>
                  </span>
                  <span className="note-v3">
                    {uploadFiles?.length
                      ? `${uploadFiles.length} file${uploadFiles.length === 1 ? '' : 's'} queued: ${uploadFiles.map((f) => f.name).join(', ')}`
                      : 'Click to pick or drag a .zip / loose files here'}
                  </span>
                </label>
                <button className="btn-v3-primary btn-v3-full" onClick={uploadTemplateFromSelection} disabled={busyAction === 'upload-template'}>Upload Template</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ControlShell;
