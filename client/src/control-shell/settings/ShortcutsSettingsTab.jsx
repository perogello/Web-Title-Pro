export default function ShortcutsSettingsTab({
  learningShortcut,
  shortcutBindings,
  outputs,
  onStartLearning,
  onClearShortcut,
  onCancelLearning,
}) {
  const globalBindings = [
    { id: 'show', label: 'SHOW' },
    { id: 'live', label: 'LIVE' },
    { id: 'hide', label: 'HIDE' },
    { id: 'previousTitle', label: 'PREVIOUS TITLE' },
    { id: 'nextTitle', label: 'NEXT TITLE' },
  ];

  return (
    <div className="integration-grid">
      {learningShortcut && (
        <div className="meta-card">
          <span className="meta-label">Learning</span>
          <strong>{learningShortcut.label || `Global / ${String(learningShortcut.action).toUpperCase()}`}</strong>
          <span className="output-note">Press the desired key or mouse button now.</span>
          <div className="output-url-actions">
            <button className="ghost-button compact-button" onClick={onCancelLearning}>Cancel Learn</button>
          </div>
        </div>
      )}

      <div className="shortcut-entry-card">
        <div className="card-head">
          <div>
            <h3>Commands</h3>
          </div>
        </div>
        <div className="shortcut-action-grid">
          {globalBindings.map((binding) => {
            const value = shortcutBindings?.[binding.id] || '';

            return (
              <div className="shortcut-action-row" key={binding.id}>
                <strong>{binding.label}</strong>
                <code>{value || 'Not assigned'}</code>
                <div className="topbar-actions">
                  <button className="ghost-button compact-button" onClick={() => onStartLearning(null, binding.id)}>
                    Learn
                  </button>
                  <button className="ghost-button compact-button" onClick={() => onClearShortcut(null, binding.id)} disabled={!value}>
                    Clear
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shortcut-entry-card">
        <div className="card-head">
          <div>
            <h3>Outputs</h3>
          </div>
        </div>
        <div className="shortcut-action-grid">
          {outputs.map((output) => {
            const value = shortcutBindings?.outputSelectById?.[output.id] || '';
            return (
              <div className="shortcut-action-row" key={`output-${output.id}`}>
                <strong>{output.name}</strong>
                <code>{value || 'Not assigned'}</code>
                <div className="topbar-actions">
                  <button className="ghost-button compact-button" onClick={() => onStartLearning(null, `selectOutput:${output.id}`)}>
                    Learn
                  </button>
                  <button className="ghost-button compact-button" onClick={() => onClearShortcut(null, `selectOutput:${output.id}`)} disabled={!value}>
                    Clear
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
