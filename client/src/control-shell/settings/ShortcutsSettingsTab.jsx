export default function ShortcutsSettingsTab({
  learningShortcut,
  shortcutBindings,
  outputs,
  entries = [],
  timers = [],
  onStartLearning,
  onClearShortcut,
  onCancelLearning,
  onToggleGlobal,
}) {
  const isMouseShortcut = (value = '') => /Mouse(\s|$)/i.test(value);
  const globalActions = shortcutBindings?.globalActions || {};
  const globalBindings = [
    { id: 'show', label: 'TITLE IN' },
    { id: 'live', label: 'LIVE' },
    { id: 'hide', label: 'TITLE OUT' },
    { id: 'previousTitle', label: 'PREVIOUS TITLE' },
    { id: 'nextTitle', label: 'NEXT TITLE' },
  ];

  const renderRow = ({ key, label, value, action }) => {
    const isLearning = learningShortcut?.action === action;
    const isGlobal = Boolean(globalActions[action]);
    const canBeGlobal = Boolean(value) && !isMouseShortcut(value);

    return (
      <div className={`shortcut-action-row ${isLearning ? 'is-learning' : ''}`} key={key}>
        <strong>{label}</strong>
        {isLearning ? (
          <code className="shortcut-learning-cell" title="Press a key or mouse button.">Press key...</code>
        ) : (
          <code className={`shortcut-binding-value ${value ? '' : 'is-unset'}`} title={value || 'Not assigned'}>
            {value || 'Not assigned'}
          </code>
        )}
        <div className="topbar-actions">
          {!isLearning && (
            <label
              className={`shortcut-global-toggle ${isGlobal ? 'is-on' : ''} ${!canBeGlobal ? 'is-disabled' : ''}`}
              title={canBeGlobal
                ? 'Global: shortcut works even when the app window is not in focus'
                : (value ? 'Mouse buttons cannot be global' : 'Assign a shortcut first')}
            >
              <input
                type="checkbox"
                checked={isGlobal}
                disabled={!canBeGlobal}
                onChange={(event) => onToggleGlobal?.(action, event.target.checked)}
              />
              <span>Global</span>
            </label>
          )}
          {isLearning ? (
            <button className="ghost-button compact-button is-cancel-learn" onClick={onCancelLearning}>Cancel</button>
          ) : (
            <>
              <button className="ghost-button compact-button" onClick={() => onStartLearning(null, action)}>
                Learn
              </button>
              <button
                className="ghost-button compact-button"
                onClick={() => onClearShortcut(null, action)}
                disabled={!value}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="integration-grid">
      <div className="shortcut-entry-card shortcut-bindings-card">
        <div className="card-head">
          <div>
            <h3>Commands</h3>
          </div>
        </div>
        <div className="shortcut-action-grid">
          {globalBindings.map((binding) =>
            renderRow({
              key: binding.id,
              label: binding.label,
              value: shortcutBindings?.[binding.id] || '',
              action: binding.id,
            }),
          )}
        </div>
      </div>

      <div className="shortcut-entry-card shortcut-bindings-card">
        <div className="card-head">
          <div>
            <h3>Outputs</h3>
          </div>
        </div>
        <div className="shortcut-action-grid">
          {outputs.map((output) =>
            renderRow({
              key: `output-${output.id}`,
              label: output.name,
              value: shortcutBindings?.outputSelectById?.[output.id] || '',
              action: `selectOutput:${output.id}`,
            }),
          )}
        </div>
      </div>

      {entries.length > 0 && (
        <div className="shortcut-entry-card shortcut-bindings-card">
          <div className="card-head">
            <div>
              <h3>Title entries</h3>
            </div>
          </div>
          <div className="shortcut-action-grid">
            {entries.map((entry) =>
              renderRow({
                key: `entry-${entry.id}`,
                label: entry.name || entry.templateName || entry.id,
                value: shortcutBindings?.entrySelectById?.[entry.id] || '',
                action: `selectEntry:${entry.id}`,
              }),
            )}
          </div>
        </div>
      )}

      {timers.length > 0 && (
        <div className="shortcut-entry-card shortcut-bindings-card">
          <div className="card-head">
            <div>
              <h3>Timers</h3>
            </div>
          </div>
          <div className="shortcut-action-grid">
            {timers.flatMap((timer) => [
              renderRow({
                key: `timer-toggle-${timer.id}`,
                label: `${timer.name || timer.id} - Start / Stop`,
                value: shortcutBindings?.timerToggleById?.[timer.id] || '',
                action: `timerToggle:${timer.id}`,
              }),
              renderRow({
                key: `timer-reset-${timer.id}`,
                label: `${timer.name || timer.id} - Reset`,
                value: shortcutBindings?.timerResetById?.[timer.id] || '',
                action: `timerReset:${timer.id}`,
              }),
            ])}
          </div>
        </div>
      )}
    </div>
  );
}
