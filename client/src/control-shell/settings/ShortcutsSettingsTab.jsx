import { useMemo, useState } from 'react';
import {
  GLOBAL_COMMANDS,
  OUTPUT_COMMANDS,
  TIMER_COMMANDS,
  globalActionId,
  outputActionId,
  pluginActionId,
  readCommand,
  timerActionId,
} from '../shortcut-model.js';

export default function ShortcutsSettingsTab({
  learningShortcut,
  shortcutBindings,
  globalShortcutConflicts = [],
  outputs = [],
  timers = [],
  pluginCommands = [],
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
  const [collapsed, setCollapsed] = useState({});
  const [editingAction, setEditingAction] = useState(null);

  const isMouseShortcut = (value = '') => /Mouse(\s|$)/i.test(value);
  const globalActions = shortcutBindings?.globalActions || {};
  const midiInputs = midiState?.inputs || [];
  const openMidiInputs = midiInputs.filter((input) => input?.open !== false);
  const midiStatusLabel = midiState?.enabled
    ? `${openMidiInputs.length || midiInputs.length} MIDI device(s)`
    : midiState?.error
      ? `MIDI offline: ${midiState.error}`
      : 'MIDI offline';
  const midiDeviceNames = midiInputs
    .map((input) => {
      const name = input?.name || input?.id || '';
      return name && input?.open === false ? `${name} (unavailable)` : name;
    })
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

  // MIDI + Companion are keyed by the same canonical action ids the keyboard
  // bindings use, so no alias translation is needed anymore.
  const midiByAction = useMemo(() => {
    const rawBindings = midiState?.bindings || [];
    const map = {};
    if (Array.isArray(rawBindings)) {
      rawBindings.forEach((binding) => {
        const action = String(binding?.action || '');
        if (action && !map[action]) map[action] = binding;
      });
    } else {
      Object.entries(rawBindings).forEach(([action, binding]) => {
        if (!map[action]) map[action] = binding;
      });
    }
    return map;
  }, [midiState?.bindings]);

  const bitfocusByAction = useMemo(() => {
    const map = new Map();
    (bitfocusActions || []).forEach((b) => {
      if (b.action) map.set(b.action, b);
    });
    return map;
  }, [bitfocusActions]);

  const conflictByAction = useMemo(() => {
    const map = new Map();
    (globalShortcutConflicts || []).forEach((c) => {
      if (c?.action) map.set(c.action, c);
    });
    return map;
  }, [globalShortcutConflicts]);

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
    if (!binding || binding.type !== 'cc') return;
    const nextMode = field === 'valueMode' ? value : binding.valueMode || 'any';
    const nextValue = field === 'value' ? Number(value) : binding.value ?? 1;
    onUpdateMidiBinding?.(action, {
      valueMode: nextMode,
      value: nextMode === 'any' ? undefined : nextValue,
    });
  };

  // Build one section per output, one per timer, plus the global section. Each
  // section is a visually distinct card so the operator sees at a glance which
  // shortcuts belong to which output/timer.
  const sections = useMemo(() => {
    const buildRow = (action, label, hint) => ({
      action,
      label,
      hint,
      keyboard: readCommand(shortcutBindings, action),
      midi: midiByAction[action],
      url: bitfocusByAction.get(action),
      conflict: conflictByAction.get(action),
    });

    const outputSections = outputs.map((output, index) => ({
      id: `output:${output.id}`,
      kind: 'output',
      accentIndex: index,
      label: output.name,
      badge: 'OUTPUT',
      items: OUTPUT_COMMANDS.map((cmd) =>
        buildRow(outputActionId(output.id, cmd.key), cmd.label, cmd.hint),
      ),
    }));

    const timerSections = timers.map((timer) => ({
      id: `timer:${timer.id}`,
      kind: 'timer',
      accentColor: timer.color || '',
      label: timer.name || timer.id,
      badge: 'TIMER',
      items: TIMER_COMMANDS.map((cmd) =>
        buildRow(timerActionId(timer.id, cmd.key), cmd.label, cmd.hint),
      ),
    }));

    const globalSection = {
      id: 'global',
      kind: 'global',
      label: 'Общие',
      badge: 'GLOBAL',
      items: GLOBAL_COMMANDS.map((cmd) => buildRow(globalActionId(cmd.key), cmd.label, cmd.hint)),
    };

    // One section per plugin that declares commands. These bind to the keyboard
    // only (dispatched to the plugin's iframe client-side); MIDI/Companion/OS-
    // global can't reach a plugin's JS, so those controls are hidden for them.
    const pluginGroups = new Map();
    for (const cmd of pluginCommands) {
      if (!pluginGroups.has(cmd.pluginId)) {
        pluginGroups.set(cmd.pluginId, { name: cmd.pluginName || cmd.pluginId, items: [] });
      }
      pluginGroups.get(cmd.pluginId).items.push(
        buildRow(pluginActionId(cmd.pluginId, cmd.commandId), cmd.label || cmd.commandId, 'Plugin command'),
      );
    }
    const pluginSections = [...pluginGroups.entries()].map(([pluginId, group]) => ({
      id: `plugin:${pluginId}`,
      kind: 'plugin',
      label: group.name,
      badge: 'PLUGIN',
      items: group.items,
    }));

    return [...outputSections, ...timerSections, ...pluginSections, globalSection];
  }, [outputs, timers, pluginCommands, shortcutBindings, midiByAction, bitfocusByAction, conflictByAction]);

  const filtered = sections
    .map((s) => ({
      ...s,
      items: query
        ? s.items.filter(
            (it) =>
              it.label.toLowerCase().includes(query.toLowerCase()) ||
              s.label.toLowerCase().includes(query.toLowerCase()),
          )
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
          placeholder="Поиск команды / output / таймера..."
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
          const accentStyle =
            section.kind === 'output'
              ? { '--ctl-accent': `hsl(${(section.accentIndex * 67) % 360} 70% 58%)` }
              : section.kind === 'timer' && section.accentColor
                ? { '--ctl-accent': section.accentColor }
                : undefined;
          return (
            <div
              className={`ctl-section ctl-section--${section.kind} ${isOpen ? 'is-open' : 'is-closed'}`}
              key={section.id}
              style={accentStyle}
            >
              <button
                type="button"
                className="ctl-section-head"
                onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !!isOpen }))}
              >
                <span className="ctl-section-toggle">{isOpen ? '▾' : '▸'}</span>
                <span className="ctl-section-badge">{section.badge}</span>
                <span className="ctl-section-label">{section.label}</span>
                <span className="ctl-section-count">{section.items.length}</span>
              </button>
              {isOpen && (
                <div className="ctl-section-body">
                  {section.items.map((row) => {
                    const kbLearning = isLearningKey(row.action);
                    const mdLearning = isLearningMidi(row.action);
                    // Plugin commands are keyboard-only: their handler lives in
                    // the plugin iframe (client), so OS-global/MIDI can't reach it.
                    const isPlugin = row.action.startsWith('plugin:');
                    const canBeGlobal = Boolean(row.keyboard) && !isMouseShortcut(row.keyboard) && !isPlugin;
                    const isGlobal = Boolean(globalActions[row.action]);
                    const isExpanded = editingAction === row.action;
                    return (
                      <div className={`ctl-row ${isExpanded ? 'is-expanded' : ''}`} key={row.action}>
                        <button
                          type="button"
                          className="ctl-row-label"
                          onClick={() => setEditingAction(isExpanded ? null : row.action)}
                        >
                          <span className="ctl-row-name" title={row.hint || ''}>{row.label}</span>
                          <span className="ctl-row-summary">
                            {row.keyboard && <span className="ctl-binding-pill ctl-pill-kb" title={`Keyboard: ${row.keyboard}`}>⌨ {row.keyboard}</span>}
                            {row.conflict && (
                              <span
                                className="ctl-binding-pill ctl-pill-warn"
                                title={`Глобальная клавиша ${row.conflict.raw || row.conflict.accelerator} занята другой программой. В фокусе приложения шорткат работает.`}
                              >
                                ⚠ занята
                              </span>
                            )}
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
                                {kbLearning ? 'Нажмите клавишу...' : (row.keyboard || 'Не назначено')}
                              </code>
                              <div className="ctl-detail-actions">
                                {canBeGlobal && !kbLearning && (
                                  <label className={`ctl-global-toggle ${isGlobal ? 'is-on' : ''}`} title="Global: работает, когда окно не в фокусе">
                                    <input type="checkbox" checked={isGlobal} onChange={(e) => onToggleGlobal?.(row.action, e.target.checked)} />
                                    Global
                                  </label>
                                )}
                                {kbLearning ? (
                                  <button type="button" className="btn-v3-ghost btn-v3-sm is-cancel-learn" onClick={onCancelLearning}>Отмена</button>
                                ) : (
                                  <>
                                    <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={() => onStartLearning?.(null, row.action)}>Learn</button>
                                    <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={() => onClearShortcut?.(null, row.action)} disabled={!row.keyboard}>Clear</button>
                                  </>
                                )}
                              </div>
                            </div>
                            {/* MIDI — not available for plugin commands. */}
                            {!isPlugin && (
                            <>
                            <div className="ctl-detail-row">
                              <span className="ctl-detail-label">🎹 MIDI</span>
                              <code className={`ctl-binding-value ${row.midi ? '' : 'is-unset'}`}>
                                {mdLearning ? 'Нажмите MIDI-кнопку/пэд...' : (formatMidiBinding(row.midi) || 'Не назначено')}
                              </code>
                              <div className="ctl-detail-actions">
                                {mdLearning ? (
                                  <button type="button" className="btn-v3-ghost btn-v3-sm is-cancel-learn" onClick={() => onStopMidiLearn?.(row.action)}>Отмена</button>
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
                            </>
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
          <div className="empty-v3">Ничего не найдено по запросу "{query}".</div>
        )}
      </div>
    </div>
  );
}
