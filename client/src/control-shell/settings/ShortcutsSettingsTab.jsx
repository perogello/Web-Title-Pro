export default function ShortcutsSettingsTab({
  learningShortcut,
  shortcutBindings,
  outputs,
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
    </div>
  );
}
