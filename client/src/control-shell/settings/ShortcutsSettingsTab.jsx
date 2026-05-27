import { useMemo, useState } from 'react';

export default function ShortcutsSettingsTab({
  learningShortcut,
  shortcutBindings,
  outputs,
  entries = [],
  timers = [],
  midiState,
  bitfocusActions,
  onStartLearning,
  onClearShortcut,
  onCancelLearning,
  onToggleGlobal,
  onRefreshMidiState,
  onStartMidiLearn,
  onStopMidiLearn,
  onClearMidiBinding,
  onUpdateMidiBinding,
  onCopyBitfocusUrl,
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({ commands: false, outputs: false, entries: false, timers: false });
  const [editingAction, setEditingAction] = useState(null);

  const isMouseShortcut = (value = '') => /Mouse(\s|$)/i.test(value);
  const globalActions = shortcutBindings?.globalActions || {};
  const midiStatusLabel = midiState?.enabled
    ? `${midiState?.inputs?.length || 0} MIDI device(s)`
    : midiState?.error
      ? `MIDI offline: ${midiState.error}`
      : 'MIDI offline';
  const midiDeviceNames = (midiState?.inputs || [])
    .map((input) => input?.name || input?.id || '')
    .filter(Boolean);
  const lastMidiMessage = midiState?.lastMessage
    ? [
        midiState.lastMessage.device || '',
        midiState.lastMessage.type || '',
        midiState.lastMessage.channel ? `Ch ${midiState.lastMessage.channel}` : '',
        midiState.lastMessage.note != null ? `Note ${midiState.lastMessage.note}` : '',
        midiState.lastMessage.controller != null ? `CC ${midiState.lastMessage.controller}` : '',
        midiState.lastMessage.value != null ? `Value ${midiState.lastMessage.value}` : '',
      ]
        .filter(Boolean)
        .join(' / ')
    : '';
  const midiBindings = useMemo(() => {
    const rawBindings = midiState?.bindings || [];
    const map = {};
    const addBinding = (action, binding) => {
      if (action && !map[action]) {
        map[action] = binding;
      }
    };
    const addAliases = (action, binding) => {
      addBinding(action, binding);
      if (action === 'previous-title') addBinding('previousTitle', binding);
      if (action === 'next-title') addBinding('nextTitle', binding);

      const outputMatch = action.match(/^select-output:(.+)$/);
      if (outputMatch) addBinding(`selectOutput:${outputMatch[1]}`, binding);

      const entryMatch = action.match(/^entry-select:(.+)$/);
      if (entryMatch) addBinding(`selectEntry:${entryMatch[1]}`, binding);

      const timerToggleMatch = action.match(/^timer-toggle:(.+)$/);
      if (timerToggleMatch) addBinding(`timerToggle:${timerToggleMatch[1]}`, binding);

      const timerResetMatch = action.match(/^timer-reset:(.+)$/);
      if (timerResetMatch) addBinding(`timerReset:${timerResetMatch[1]}`, binding);
    };

    if (Array.isArray(rawBindings)) {
      rawBindings.forEach((binding) => addAliases(String(binding?.action || ''), binding));
    } else {
      Object.entries(rawBindings).forEach(([action, binding]) => addAliases(action, binding));
    }

    return map;
  }, [midiState?.bindings]);

  // Bitfocus actions are built in ControlShell with kebab-case ids (e.g.
  // `select-output-${outputId}`, `previous-title`, `timer-toggle-${id}`).
  // The UI here addresses them in camelCase + colon form (e.g.
  // `selectOutput:${outputId}`, `previousTitle`, `timerToggle:${id}`). We
  // build the lookup map under both spellings so the 🔗 Companion chip
  // actually surfaces for every binding row.
  const bitfocusByAction = useMemo(() => {
    const map = new Map();
    const COMMAND_ALIASES = {
      'show': 'show',
      'live': 'live',
      'hide': 'hide',
      'previous-title': 'previousTitle',
      'next-title': 'nextTitle',
    };
    (bitfocusActions || []).forEach((b) => {
      const id = String(b.id || '');
      // Original ID (so existing callers that pass the kebab form still work)
      if (id) map.set(id, b);
      if (b.action) map.set(b.action, b);

      // Top-level commands
      if (COMMAND_ALIASES[id]) {
        map.set(COMMAND_ALIASES[id], b);
      }

      // select-output-<id>  →  selectOutput:<id>
      const outputMatch = id.match(/^select-output-(.+)$/);
      if (outputMatch) {
        map.set(`selectOutput:${outputMatch[1]}`, b);
      }

      // select-entry-<id>  →  selectEntry:<id>
      const entryMatch = id.match(/^select-entry-(.+)$/);
      if (entryMatch) {
        map.set(`selectEntry:${entryMatch[1]}`, b);
      }

      // timer-toggle-<id>  →  timerToggle:<id>
      const toggleMatch = id.match(/^timer-toggle-(.+)$/);
      if (toggleMatch) {
        map.set(`timerToggle:${toggleMatch[1]}`, b);
      }

      // timer-reset-<id>  →  timerReset:<id>
      const resetMatch = id.match(/^timer-reset-(.+)$/);
      if (resetMatch) {
        map.set(`timerReset:${resetMatch[1]}`, b);
      }
    });
    return map;
  }, [bitfocusActions]);

  const formatMidiBinding = (binding) => {
    if (!binding) return '';
    if (typeof binding === 'string') return binding;
    const channel = binding.channel != null ? `Ch${binding.channel}` : '';
    const note = binding.note != null ? `Note ${binding.note}` : '';
    const cc = binding.controller != null ? `CC ${binding.controller}` : '';
    const value =
      binding.type === 'cc' && binding.valueMode && binding.valueMode !== 'any' && binding.value != null
        ? `Value ${binding.valueMode === 'eq' ? '=' : binding.valueMode === 'gte' ? '>=' : '<='} ${binding.value}`
        : '';
    const device = binding.deviceName || (binding.device && binding.device !== 'any' ? binding.device : '');
    return [channel, note, cc, value, device].filter(Boolean).join(' / ');
  };

  const updateMidiValueRule = (action, binding, field, value) => {
    if (!binding || binding.type !== 'cc') {
      return;
    }

    const nextMode = field === 'valueMode' ? value : binding.valueMode || 'any';
    const nextValue = field === 'value' ? Number(value) : binding.value ?? 1;
    onUpdateMidiBinding?.(action, {
      valueMode: nextMode,
      value: nextMode === 'any' ? undefined : nextValue,
    });
  };

  const sections = [
    {
      id: 'commands',
      label: 'Commands',
      icon: '▶',
      items: [
        { action: 'show', label: 'Title In' },
        { action: 'live', label: 'Live' },
        { action: 'hide', label: 'Title Out' },
        { action: 'previousTitle', label: 'Previous title' },
        { action: 'nextTitle', label: 'Next title' },
      ].map((row) => ({
        ...row,
        keyboard: shortcutBindings?.[row.action] || '',
        midi: midiBindings[row.action],
        url: bitfocusByAction.get(row.action),
      })),
    },
    {
      id: 'outputs',
      label: 'Outputs',
      icon: '◧',
      items: outputs.map((output) => ({
        action: `selectOutput:${output.id}`,
        label: output.name,
        keyboard: shortcutBindings?.outputSelectById?.[output.id] || '',
        midi: midiBindings[`selectOutput:${output.id}`],
        url: bitfocusByAction.get(`selectOutput:${output.id}`),
      })),
    },
    {
      id: 'entries',
      label: 'Title entries',
      icon: '◉',
      items: entries.map((entry) => ({
        action: `selectEntry:${entry.id}`,
        label: entry.name || entry.templateName || entry.id,
        keyboard: shortcutBindings?.entrySelectById?.[entry.id] || '',
        midi: midiBindings[`selectEntry:${entry.id}`],
        url: bitfocusByAction.get(`selectEntry:${entry.id}`),
      })),
    },
    {
      id: 'timers',
      label: 'Timers',
      icon: '⏱',
      items: timers.flatMap((timer) => [
        {
          action: `timerToggle:${timer.id}`,
          label: `${timer.name || timer.id} — Start / Stop`,
          keyboard: shortcutBindings?.timerToggleById?.[timer.id] || '',
          midi: midiBindings[`timerToggle:${timer.id}`],
          url: bitfocusByAction.get(`timerToggle:${timer.id}`),
        },
        {
          action: `timerReset:${timer.id}`,
          label: `${timer.name || timer.id} — Reset`,
          keyboard: shortcutBindings?.timerResetById?.[timer.id] || '',
          midi: midiBindings[`timerResetById:${timer.id}`] || midiBindings[`timerReset:${timer.id}`],
          url: bitfocusByAction.get(`timerReset:${timer.id}`),
        },
      ]),
    },
  ];

  const filtered = sections
    .map((s) => ({
      ...s,
      items: query
        ? s.items.filter((it) => it.label.toLowerCase().includes(query.toLowerCase()))
        : s.items,
    }))
    .filter((s) => s.items.length > 0);

  const isLearningKey = (action) => learningShortcut?.action === action;
  const isLearningMidi = (action) =>
    midiState?.learnTarget?.action === action || midiState?.learningAction === action;

  return (
    <div className="ctl-shell-v2">
      <div className="ctl-toolbar">
        <input
          type="search"
          className="ctl-search"
          placeholder="Search actions..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="ctl-legend">
          <span className="ctl-legend-chip"><span className="kb">⌨</span> Keyboard</span>
          <span className="ctl-legend-chip"><span className="md">🎹</span> MIDI</span>
          <span className="ctl-legend-chip"><span className="cp">🔗</span> Companion</span>
        </div>
        <div className="ctl-midi-status" title={midiState?.error || midiStatusLabel}>
          <span className={`ctl-midi-dot ${midiState?.enabled ? 'is-on' : 'is-off'}`} />
          <span>{midiStatusLabel}</span>
          <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={onRefreshMidiState}>
            Refresh MIDI
          </button>
        </div>
      </div>
      <div className="ctl-midi-details">
        <div>
          <span className="ctl-midi-details-label">Inputs</span>
          <span>{midiDeviceNames.length ? midiDeviceNames.join(', ') : 'No MIDI inputs detected'}</span>
        </div>
        {lastMidiMessage && (
          <div>
            <span className="ctl-midi-details-label">Last</span>
            <span>{lastMidiMessage}</span>
          </div>
        )}
        {midiState?.error && (
          <div className="is-error">
            <span className="ctl-midi-details-label">Error</span>
            <span>{midiState.error}</span>
          </div>
        )}
      </div>

      <div className="ctl-list">
        {filtered.map((section) => {
          const isOpen = !collapsed[section.id];
          return (
            <div className={`ctl-section ${isOpen ? 'is-open' : 'is-closed'}`} key={section.id}>
              <button
                type="button"
                className="ctl-section-head"
                onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !!isOpen }))}
              >
                <span className="ctl-section-toggle">{isOpen ? '▾' : '▸'}</span>
                <span className="ctl-section-icon">{section.icon}</span>
                <span className="ctl-section-label">{section.label}</span>
                <span className="ctl-section-count">{section.items.length}</span>
              </button>
              {isOpen && (
                <div className="ctl-section-body">
                  {section.items.map((row) => {
                    const kbLearning = isLearningKey(row.action);
                    const mdLearning = isLearningMidi(row.action);
                    const canBeGlobal = Boolean(row.keyboard) && !isMouseShortcut(row.keyboard);
                    const isGlobal = Boolean(globalActions[row.action]);
                    const isExpanded = editingAction === row.action;
                    return (
                      <div className={`ctl-row ${isExpanded ? 'is-expanded' : ''}`} key={row.action}>
                        <button
                          type="button"
                          className="ctl-row-label"
                          onClick={() => setEditingAction(isExpanded ? null : row.action)}
                        >
                          <span className="ctl-row-name">{row.label}</span>
                          <span className="ctl-row-summary">
                            {row.keyboard && <span className="ctl-binding-pill ctl-pill-kb" title={`Keyboard: ${row.keyboard}`}>⌨ {row.keyboard}</span>}
                            {row.midi && <span className="ctl-binding-pill ctl-pill-md" title="MIDI binding">🎹 {formatMidiBinding(row.midi)}</span>}
                            {row.url && <span className="ctl-binding-pill ctl-pill-cp" title="Companion URL configured">🔗</span>}
                            {!row.keyboard && !row.midi && !row.url && <span className="ctl-binding-empty">Not bound</span>}
                          </span>
                          <span className="ctl-row-chevron">{isExpanded ? '▾' : '▸'}</span>
                        </button>
                        {isExpanded && (
                          <div className="ctl-row-detail">
                            {/* KEYBOARD */}
                            <div className="ctl-detail-row">
                              <span className="ctl-detail-label">⌨ Keyboard</span>
                              <code className={`ctl-binding-value ${row.keyboard ? '' : 'is-unset'}`}>
                                {kbLearning ? 'Press a key...' : (row.keyboard || 'Not assigned')}
                              </code>
                              <div className="ctl-detail-actions">
                                {canBeGlobal && !kbLearning && (
                                  <label className={`ctl-global-toggle ${isGlobal ? 'is-on' : ''}`} title="Global: works when app is unfocused">
                                    <input type="checkbox" checked={isGlobal} onChange={(e) => onToggleGlobal?.(row.action, e.target.checked)} />
                                    Global
                                  </label>
                                )}
                                {kbLearning ? (
                                  <button type="button" className="btn-v3-ghost btn-v3-sm is-cancel-learn" onClick={onCancelLearning}>Cancel</button>
                                ) : (
                                  <>
                                    <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={() => onStartLearning?.(null, row.action)}>Learn</button>
                                    <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={() => onClearShortcut?.(null, row.action)} disabled={!row.keyboard}>Clear</button>
                                  </>
                                )}
                              </div>
                            </div>
                            {/* MIDI */}
                            <div className="ctl-detail-row">
                              <span className="ctl-detail-label">🎹 MIDI</span>
                              <code className={`ctl-binding-value ${row.midi ? '' : 'is-unset'}`}>
                                {mdLearning ? 'Press a MIDI key/pad...' : (formatMidiBinding(row.midi) || 'Not assigned')}
                              </code>
                              <div className="ctl-detail-actions">
                                {mdLearning ? (
                                  <button type="button" className="btn-v3-ghost btn-v3-sm is-cancel-learn" onClick={() => onStopMidiLearn?.(row.action)}>Cancel</button>
                                ) : (
                                  <>
                                    <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={() => onStartMidiLearn?.(row.action)}>Learn</button>
                                    <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={() => onClearMidiBinding?.(row.action)} disabled={!row.midi}>Clear</button>
                                  </>
                                )}
                              </div>
                            </div>
                            {row.midi?.type === 'cc' && (
                              <div className="ctl-midi-value-rule">
                                <span className="ctl-detail-label">CC Value</span>
                                <select
                                  value={row.midi.valueMode || 'any'}
                                  onChange={(event) =>
                                    updateMidiValueRule(row.action, row.midi, 'valueMode', event.target.value)
                                  }
                                >
                                  <option value="any">Any movement</option>
                                  <option value="gte">At or above</option>
                                  <option value="lte">At or below</option>
                                  <option value="eq">Exactly</option>
                                </select>
                                <input
                                  type="number"
                                  min="0"
                                  max="127"
                                  value={row.midi.value ?? 1}
                                  disabled={!row.midi.valueMode || row.midi.valueMode === 'any'}
                                  onChange={(event) =>
                                    updateMidiValueRule(row.action, row.midi, 'value', event.target.value)
                                  }
                                />
                              </div>
                            )}
                            {/* COMPANION */}
                            {row.url && (
                              <div className="ctl-detail-row">
                                <span className="ctl-detail-label">🔗 Companion</span>
                                <code className="ctl-binding-value" title={row.url.url || ''}>{row.url.url}</code>
                                <div className="ctl-detail-actions">
                                  <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={() => onCopyBitfocusUrl?.(row.url)}>Copy URL</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty-v3">No actions match "{query}".</div>
        )}
      </div>
    </div>
  );
}
