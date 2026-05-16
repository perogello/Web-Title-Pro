export default function ShortcutsSettingsTab({
  learningShortcut,
  shortcutBindings,
  outputs,
  entries = [],
  timers = [],
  onStartLearning,
  onClearShortcut,
  onCancelLearning,
}) {
  const globalBindings = [
    { id: 'show', label: 'TITLE IN' },
    { id: 'live', label: 'LIVE' },
    { id: 'hide', label: 'TITLE OUT' },
    { id: 'previousTitle', label: 'PREVIOUS TITLE' },
    { id: 'nextTitle', label: 'NEXT TITLE' },
  ];

  const renderRow = ({ key, label, value, action }) => {
    const isLearning = learningShortcut?.action === action;
    return (
      <div className={`shortcut-action-row ${isLearning ? 'is-learning' : ''}`} key={key}>
        <strong>{label}</strong>
        {isLearning ? (
          <code className="shortcut-learning-cell">Press a key or mouse button…</code>
        ) : (
          <code>{value || 'Not assigned'}</code>
        )}
        <div className="topbar-actions">
          {isLearning ? (
            <button className="ghost-button compact-button" onClick={onCancelLearning}>Cancel</button>
          ) : (
            <button className="ghost-button compact-button" onClick={() => onStartLearning(null, action)}>
              Learn
            </button>
          )}
          <button
            className="ghost-button compact-button"
            onClick={() => onClearShortcut(null, action)}
            disabled={!value || isLearning}
          >
            Clear
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="integration-grid">
      <div className="shortcut-entry-card">
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

      <div className="shortcut-entry-card">
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
        <div className="shortcut-entry-card">
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
        <div className="shortcut-entry-card">
          <div className="card-head">
            <div>
              <h3>Timers</h3>
            </div>
          </div>
          <div className="shortcut-action-grid">
            {timers.flatMap((timer) => [
              renderRow({
                key: `timer-toggle-${timer.id}`,
                label: `${timer.name || timer.id} — Start / Stop`,
                value: shortcutBindings?.timerToggleById?.[timer.id] || '',
                action: `timerToggle:${timer.id}`,
              }),
              renderRow({
                key: `timer-reset-${timer.id}`,
                label: `${timer.name || timer.id} — Reset`,
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
