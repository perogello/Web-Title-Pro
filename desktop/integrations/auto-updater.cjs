const { autoUpdater } = require('electron-updater');
const {
  isNewer,
  describeNetworkError,
  isNoReleaseError,
  cleanupLegacyPortableScratch,
} = require('./auto-updater-utils.cjs');

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
  broadcastState,
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

  const showUpdateFailureDialog = async ({ title, message, error, detail, onRetry }) => {
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
      detail: detail || describeNetworkError(error),
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

  // Normalized update state for the in-app Settings -> Updates hero, shaped
  // like the server UpdateService state it replaces. This is the SINGLE source
  // of truth on desktop: the in-app check, the startup check and the install
  // all go through electron-updater, so the hero can never disagree with what
  // Install will actually do.
  const buildState = (extra = {}) => ({
    currentVersion: app.getVersion(),
    repoUrl,
    fixedRepo: true,
    channel: 'stable',
    lastCheckAt: new Date().toISOString(),
    releaseUrl: releasesPageUrl,
    latestVersion: null,
    available: false,
    status: 'idle',
    errorKind: null,
    assetName: null,
    ...extra,
  });

  const emitState = (state) => {
    if (typeof broadcastState === 'function') {
      try {
        broadcastState(state);
      } catch {}
    }
    return state;
  };

  // Ask electron-updater whether an update exists (does NOT download), and
  // publish the normalized state to the renderer. Returns that state.
  const checkForUpdates = async () => {
    if (!app.isPackaged) {
      return emitState(
        buildState({
          status: 'unsupported',
          notes: 'Automatic updates are only available in the installed app.',
        }),
      );
    }

    try {
      const result = await autoUpdater.checkForUpdates();
      const latestVersion = (result && result.updateInfo && result.updateInfo.version) || null;
      const available = isUpdateAvailable(result);
      return emitState(
        buildState({
          latestVersion,
          available,
          status: available ? 'available' : 'up-to-date',
          notes: available
            ? `Version ${latestVersion} is available.`
            : `You are on the latest version (${app.getVersion()}).`,
        }),
      );
    } catch (error) {
      log(`autoupdater:check-error ${error?.stack || error?.message}`);
      // A missing update manifest (no NSIS release published yet) is "nothing to
      // update to", not a connectivity failure — report it calmly as up to date.
      if (isNoReleaseError(error)) {
        return emitState(
          buildState({
            status: 'up-to-date',
            notes: `You are on the latest version (${app.getVersion()}). No newer release has been published.`,
          }),
        );
      }
      return emitState(
        buildState({
          status: 'error',
          errorKind: 'network',
          notes: describeNetworkError(error),
        }),
      );
    }
  };

  // Called from the in-app "Install update" button (IPC). Reuses checkForUpdates
  // (which also refreshes the hero) so check and install share one code path.
  const installAvailableUpdate = async () => {
    const state = await checkForUpdates();

    if (state.status === 'unsupported') {
      await dialog.showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Updates',
        message: 'Automatic updates are only available in the installed app.',
        buttons: ['OK'],
      });
      return { ok: false, reason: 'unsupported', updateState: state };
    }

    if (state.status === 'error') {
      await showUpdateFailureDialog({
        title: 'Update Check',
        message: 'The update check failed.',
        detail: state.notes,
        onRetry: installAvailableUpdate,
      });
      return { ok: false, reason: 'error', updateState: state };
    }

    if (!state.available) {
      await dialog.showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Updates',
        message: `You are on the latest version: ${app.getVersion()}`,
        buttons: ['OK'],
      });
      return { ok: false, reason: 'no-update', updateState: state };
    }

    const proceed = await confirmInstall();
    if (!proceed) {
      return { ok: false, reason: 'cancelled', updateState: state };
    }

    await downloadAndInstall();
    return { ok: true, updateState: state };
  };

  // Runs once shortly after launch. Silent on failure — the operator can
  // re-check from Settings -> Updates; we don't nag on every flaky-network boot.
  // The check still publishes state to the hero even when it's up to date.
  const runStartupUpdateCheck = async () => {
    if (startupCheckStarted || !app.isPackaged) {
      return;
    }
    startupCheckStarted = true;

    // Sweep any leftovers from the old portable updater once per cold start,
    // the same way the portable build used to.
    cleanupLegacyPortableScratch({
      userDataDir: app.getPath('userData'),
      tempDir: app.getPath('temp'),
    });

    const state = await checkForUpdates();
    if (state.status !== 'available' || !state.available) {
      return;
    }

    const choice = await dialog.showMessageBox(getMainWindow(), {
      type: 'info',
      title: 'Update Available',
      message: `A newer version is available: ${state.latestVersion}`,
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
    checkForUpdates,
    installAvailableUpdate,
    runStartupUpdateCheck,
  };
};

module.exports = {
  createAutoUpdaterIntegration,
};
