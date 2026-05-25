export default function AboutSettingsTab({
  appMeta,
  currentProjectName,
  projectDirty,
  projectStatus,
  outputInfo,
  onCopyBaseUrl,
}) {
  const handleCopy = () => {
    if (outputInfo?.controlUrl && onCopyBaseUrl) {
      onCopyBaseUrl(outputInfo.controlUrl);
    }
  };

  return (
    <div className="integration-grid">
      <div className="output-settings-grid">
        <div className="info-card-v3">
          <span className="info-label-v3">About</span>
          <strong>Web Title Pro</strong>
          <span className="note-v3">
            Desktop control app for local HTML titles, vMix titles, data sources, mapping, timers and live playout.
          </span>
          <span className="note-v3">Author: perogello</span>
          <span className="note-v3">Version: {appMeta?.version || 'Unknown'}</span>
        </div>
        <div className="info-card-v3">
          <span className="info-label-v3">Current Project</span>
          <strong>{currentProjectName || 'Unsaved Project'}</strong>
          <span className="note-v3">{projectDirty ? 'Unsaved changes' : 'Saved'}</span>
          <span className="note-v3">{projectStatus?.currentProjectPath || 'Not saved yet'}</span>
        </div>
      </div>
      {outputInfo?.controlUrl && (
        <div className="info-card-v3">
          <span className="info-label-v3">Control UI URL</span>
          <span className="note-v3">
            Open the control panel from any device on the same network using this URL.
          </span>
          <div className="output-url-row">
            <code className="output-url-copy">{outputInfo.controlUrl}</code>
            <button className="btn-v3-ghost btn-v3-sm" onClick={handleCopy} type="button">
              Copy URL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
