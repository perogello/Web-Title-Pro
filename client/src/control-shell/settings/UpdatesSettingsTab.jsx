/**
 * Updates settings — one hero card that calls out the current state at a
 * glance (UP TO DATE / UPDATE AVAILABLE / CHECKING…), followed by a
 * compact details strip. Replaces the previous 4-card grid that gave the
 * "available" state the same visual weight as the static "Packaging"
 * blurb and made it easy to miss a pending release.
 */
export default function UpdatesSettingsTab({
  appMeta,
  updateState,
  formatStatusTime,
  onCheckForUpdates,
  onRefreshAppMeta,
  onInstallUpdate,
}) {
  const currentVersion = appMeta?.version || updateState?.currentVersion || '0.0.0';
  const status = updateState?.status || 'idle';
  const available = Boolean(updateState?.available);

  // tone drives the hero's accent border / icon color
  const tone =
    available ? 'live'
      : status === 'error' || status === 'unsupported' ? 'warn'
        : status === 'up-to-date' ? 'good'
          : 'neutral';

  const heroTitle =
    available ? `Update available · ${updateState.latestVersion}`
      : status === 'up-to-date' ? 'You are on the latest version'
        : status === 'error' ? 'Update check failed'
          : status === 'unsupported' ? 'Update source not supported'
            : status === 'no-releases' ? 'No releases published yet'
              : 'No update checks have been run';

  const heroHint =
    available ? 'Click "Install update" to download and apply the release automatically. The app will restart.'
      : updateState?.notes || 'Run a check to fetch the latest release information from GitHub.';

  return (
    <div className="updates-shell-v3">
      <section className={`update-hero-v3 is-${tone}`}>
        <div className="update-hero-v3-head">
          <span className="kicker-v3">Application updates</span>
          <span className="update-hero-v3-version">v{currentVersion}</span>
        </div>
        <h2 className="update-hero-v3-title">{heroTitle}</h2>
        <p className="update-hero-v3-hint">{heroHint}</p>
        <div className="update-hero-v3-actions">
          <button className="btn-v3-ghost btn-v3-sm" onClick={onCheckForUpdates}>
            Check for updates
          </button>
          {available && (
            <button className="btn-v3-primary btn-v3-sm" onClick={onInstallUpdate}>
              Install update
            </button>
          )}
          <button className="btn-v3-ghost btn-v3-sm" onClick={onRefreshAppMeta}>
            Refresh status
          </button>
        </div>
      </section>

      <section className="update-details-v3">
        <div className="update-detail-row">
          <span className="update-detail-label">Source</span>
          <code className="update-detail-value">
            {updateState?.repoUrl || 'https://github.com/perogello/Web-Title-Pro'}
          </code>
        </div>
        <div className="update-detail-row">
          <span className="update-detail-label">Channel</span>
          <span className="update-detail-value">{updateState?.channel || 'stable'}</span>
        </div>
        <div className="update-detail-row">
          <span className="update-detail-label">Latest release</span>
          <span className="update-detail-value">{updateState?.latestVersion || '—'}</span>
        </div>
        <div className="update-detail-row">
          <span className="update-detail-label">Last check</span>
          <span className="update-detail-value">
            {updateState?.lastCheckAt ? formatStatusTime(updateState.lastCheckAt) : 'never'}
          </span>
        </div>
        <div className="update-detail-row">
          <span className="update-detail-label">Asset</span>
          <span className="update-detail-value">{updateState?.assetName || '—'}</span>
        </div>
      </section>

      <p className="note-v3">
        Update checks run automatically on startup. The release source is built into the app
        and cannot be changed by the user.
      </p>
    </div>
  );
}
