export default function AboutSettingsTab({
  appMeta,
  currentProjectName,
  projectDirty,
  projectStatus,
}) {
  return (
    <div className="integration-grid">
      <div className="output-settings-grid">
        <div className="meta-card">
          <span className="meta-label">About</span>
          <strong>Web Title Pro</strong>
          <span className="output-note">
            Desktop control app for local HTML titles, vMix titles, data sources, mapping, timers and live playout.
          </span>
          <span className="output-note">
            Author: perogello
          </span>
          <span className="output-note">
            Version: {appMeta?.version || 'Unknown'}
          </span>
        </div>
        <div className="meta-card">
          <span className="meta-label">Current Project</span>
          <strong>{currentProjectName || 'Unsaved Project'}</strong>
          <span className="output-note">
            {projectDirty ? 'Unsaved changes' : 'Saved'}
          </span>
          <span className="output-note">
            {projectStatus?.currentProjectPath || 'Not saved yet'}
          </span>
        </div>
      </div>
      <div className="meta-card">
        <span className="meta-label">What this section is for</span>
        <span className="output-note">
          Use `Output`, `Shortcuts`, `Bitfocus`, `MIDI`, `Yandex` and `Updates` for configuration. This `About` page keeps the app overview in one place without taking vertical space in the live workspace.
        </span>
      </div>
    </div>
  );
}
