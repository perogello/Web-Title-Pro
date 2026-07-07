const { autoUpdater } = require('electron-updater');

/**
 * electron-updater based updater for the NSIS install target.
 *
 * Replaces the hand-rolled portable updater (schtasks + PowerShell self-copy):
 * electron-updater reads latest.yml from the GitHub release, downloads the NSIS
 * installer and applies it on quit. We keep our own UI on top of it — the
 * progress window, the renderer "confirm install" prompt, and the friendly
 * network-error dialog with a manual "Open Release Page" fallback.
 *
 * Windows note: code signing is intentionally not used. electron-updater does
 * not require a signature to update on Windows; the operator accepts the same
 * unsigned posture as the previous portable build.
 */
const createAutoUpdaterIntegration = ({
  app,
  dialog,
  shell,
  log,
  getMainWindow,
  createUpdateWindow,
  closeUpdateWindow,
  setWindowProgress,
  confirmInstall,
  authorizeClose,
  repoUrl,
}) => {
  const releasesPageUrl = repoUrl ? `${String(repoUrl).replace(/\/+$/, '')}/releases` : '';
  let startupCheckStarted = false;

  autoUpdater.autoDownload = false; // we confirm before pulling ~95 MB
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (message) => log(`autoupdater:info ${message}`),
    warn: (message) => log(`autoupdater:warn ${message}`),
    error: (message) => log(`autoupdater:error ${message}`),
    debug: () => {},
  };

  const parseVersion = (value) =>
    String(value || '0')
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);

  const isNewer = (candidate, current) => {
    const a = parseVersion(candidate);
    const b = parseVersion(current);
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const left = a[i] || 0;
      const right = b[i] || 0;
      if (left > right) return true;
      if (left < right) return false;
    }
    return false;
  };

  // Same classifier as the portable updater: turn undici/electron-updater
  // network failures into an actionable sentence instead of "fetch failed".
  const describeNetworkError = (error) => {
    const raw = error?.message || String(error || '');
    const code = error?.cause?.code || error?.code || '';
    const haystack = `${raw} ${code} ${error?.name || ''}`.toLowerCase();
    const has = (...needles) => needles.some((needle) => haystack.includes(needle));

    if (error?.name === 'AbortError' || has('timed out', 'etimedout', 'timeout')) {
      return 'The update timed out. The network is slow or is blocking GitHub. You can download the release manually instead.';
    }
    if (has('403', 'rate limit', 'api rate')) {
      return 'GitHub temporarily limited requests from this network (hourly limit). Try again later, or download the release manually.';
    }
    if (has('certificate', 'self-signed', 'self signed', 'unable to verify', 'cert_')) {
      return 'A network proxy is intercepting the secure connection to GitHub. Download the release manually, or check with your IT team.';
    }
    if (
      has(
        'fetch failed',
        'enotfound',
        'eai_again',
        'econnrefused',
        'econnreset',
        'enetunreach',
        'ehostunreach',
        'network',
        'getaddrinfo',
        'socket',
        'net::',
        'download',
      )
    ) {
      return 'GitHub could not be reached from this network. A proxy or firewall may be blocking github.com, or the machine is offline. You can download the release manually instead.';
    }
    return raw || 'The update could not be completed.';
  };

  const showUpdateFailureDialog = async ({ title, message, error, onRetry }) => {
    const buttons = [];
    const actions = [];
    if (typeof onRetry === 'function') {
      buttons.push('Try Again');
      actions.push('retry');
    }
    if (releasesPageUrl) {
      buttons.push('Open Release Page');
      actions.push('open');
    }
    buttons.push('Close');
    actions.push('close');

    const result = await dialog.showMessageBox(getMainWindow(), {
      type: 'error',
      title,
      message,
      detail: describeNetworkError(error),
      buttons,
      defaultId: 0,
      cancelId: buttons.length - 1,
    });

    const action = actions[result.response] || 'close';
    if (action === 'open' && releasesPageUrl) {
      await shell.openExternal(releasesPageUrl).catch(() => {});
    } else if (action === 'retry' && typeof onRetry === 'function') {
      await onRetry();
    }
  };

  const isUpdateAvailable = (result) => {
    if (!result) return false;
    if (typeof result.isUpdateAvailable === 'boolean') return result.isUpdateAvailable;
    const version = result.updateInfo && result.updateInfo.version;
    return Boolean(version) && isNewer(version, app.getVersion());
  };

  const downloadAndInstall = async () => {
    const progressWindow = await createUpdateWindow();
    await setWindowProgress(progressWindow, 'Downloading update...', 8);

    const onProgress = (progress) => {
      const percent = Math.max(8, Math.min(96, Math.round(progress?.percent || 0)));
      void setWindowProgress(progressWindow, 'Downloading update...', percent);
    };
    autoUpdater.on('download-progress', onProgress);

    try {
      await autoUpdater.downloadUpdate();
      autoUpdater.removeListener('download-progress', onProgress);
      await setWindowProgress(progressWindow, 'Installing and restarting...', 100);

      // Authorize the close (drops the unsaved-changes guard) but do NOT quit
      // the app ourselves — quitAndInstall quits it and runs the NSIS
      // installer. Quitting/exiting here would race and defeat the install.
      await authorizeClose();
      setImmediate(() => {
        try {
          autoUpdater.quitAndInstall(true, true);
        } catch (error) {
          log(`autoupdater:quit-install-error ${error?.stack || error?.message}`);
        }
      });
    } catch (error) {
      autoUpdater.removeListener('download-progress', onProgress);
      log(`autoupdater:download-error ${error?.stack || error?.message}`);
      closeUpdateWindow();
      await showUpdateFailureDialog({
        title: 'Update Failed',
        message: 'The update could not be downloaded or installed.',
        error,
        onRetry: () => downloadAndInstall(),
      });
    }
  };

  // Called from the in-app "Install update" button (IPC).
  const installAvailableUpdate = async () => {
    if (!app.isPackaged) {
      await dialog.showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Updates',
        message: 'Automatic updates are only available in the installed app.',
        buttons: ['OK'],
      });
      return { ok: false, reason: 'unsupported' };
    }

    let result;
    try {
      result = await autoUpdater.checkForUpdates();
    } catch (error) {
      log(`autoupdater:check-error ${error?.stack || error?.message}`);
      await showUpdateFailureDialog({
        title: 'Update Check',
        message: 'The update check failed.',
        error,
        onRetry: installAvailableUpdate,
      });
      return { ok: false, reason: 'error' };
    }

    if (!isUpdateAvailable(result)) {
      await dialog.showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Updates',
        message: `You are on the latest version: ${app.getVersion()}`,
        buttons: ['OK'],
      });
      return { ok: false, reason: 'no-update' };
    }

    const proceed = await confirmInstall();
    if (!proceed) {
      return { ok: false, reason: 'cancelled' };
    }

    await downloadAndInstall();
    return { ok: true };
  };

  // Runs once shortly after launch. Silent on failure — the operator can
  // re-check from Settings -> Updates; we don't nag on every flaky-network boot.
  const runStartupUpdateCheck = async () => {
    if (startupCheckStarted || !app.isPackaged) {
      return;
    }
    startupCheckStarted = true;

    let result;
    try {
      result = await autoUpdater.checkForUpdates();
    } catch (error) {
      log(`autoupdater:startup-check-error ${error?.stack || error?.message}`);
      return;
    }

    if (!isUpdateAvailable(result)) {
      return;
    }

    const version = result.updateInfo && result.updateInfo.version;
    const choice = await dialog.showMessageBox(getMainWindow(), {
      type: 'info',
      title: 'Update Available',
      message: `A newer version is available: ${version}`,
      detail: `Current version: ${app.getVersion()}\nSource: ${repoUrl}\n\nDownload and install it now?`,
      buttons: ['Update Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (choice.response === 0) {
      const proceed = await confirmInstall();
      if (!proceed) {
        return;
      }
      await downloadAndInstall();
    }
  };

  return {
    installAvailableUpdate,
    runStartupUpdateCheck,
  };
};

module.exports = {
  createAutoUpdaterIntegration,
};
