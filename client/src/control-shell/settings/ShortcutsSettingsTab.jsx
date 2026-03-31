export default function ShortcutsSettingsTab({
  learningShortcut,
  entries,
  getRundownPrimaryLabel,
  onStartLearning,
  onClearShortcut,
  onCancelLearning,
}) {
  return (
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
            <button className="ghost-button compact-button" onClick={onCancelLearning}>Cancel Learn</button>
          </div>
        </div>
      )}
      <div className="shortcut-list">
        {entries.map((entry) => (
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
                      <button className="ghost-button compact-button" onClick={() => onStartLearning(entry, action)} disabled={disabled}>
                        Learn
                      </button>
                      <button className="ghost-button compact-button" onClick={() => onClearShortcut(entry, action)} disabled={disabled || !value}>
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
  );
}
