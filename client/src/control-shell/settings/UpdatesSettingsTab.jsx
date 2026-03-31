export default function UpdatesSettingsTab({
  appMeta,
  updateState,
  formatStatusTime,
  onCheckForUpdates,
  onRefreshAppMeta,
}) {
  return (
    <div className="integration-grid">
      <div className="meta-card">
        <span className="meta-label">Application</span>
        <strong>{appMeta?.name || 'Web Title Pro'} {appMeta?.version || updateState?.currentVersion || '0.0.0'}</strong>
        <span className="output-note">Desktop update checks run automatically on startup. The update source is built into the app and is not edited by the user.</span>
      </div>
      <div className="meta-card">
        <span className="meta-label">Update Source</span>
        <code>{updateState?.repoUrl || 'https://github.com/perogello/Web-Title-Pro'}</code>
        <span className="output-note">Update channel: {updateState?.channel || 'prerelease'}.</span>
        <div className="output-url-actions">
          <button className="ghost-button compact-button" onClick={onCheckForUpdates}>Check Updates</button>
          <button className="ghost-button compact-button" onClick={onRefreshAppMeta}>Refresh Status</button>
        </div>
      </div>
      <div className="meta-card">
        <span className="meta-label">Status</span>
        <strong>{String(updateState?.status || 'idle').toUpperCase()}</strong>
        <span className="output-note">{updateState?.notes || 'No update checks have been run yet.'}</span>
        <code>Current: {appMeta?.version || updateState?.currentVersion || '0.0.0'}</code>
        <code>Latest: {updateState?.latestVersion || 'not available'}</code>
        <code>Last Check: {updateState?.lastCheckAt ? formatStatusTime(updateState.lastCheckAt) : 'never'}</code>
        <code>Asset: {updateState?.assetName || 'not available'}</code>
      </div>
      <div className="meta-card">
        <span className="meta-label">Packaging</span>
        <strong>Desktop updater is built around GitHub Releases</strong>
        <span className="output-note">When a new version is available, the desktop app can download the release `.exe`, show progress, and complete the update through a dedicated update window.</span>
      </div>
    </div>
  );
}
