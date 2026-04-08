const path = require('node:path');
const fsp = require('node:fs/promises');
const { spawn } = require('node:child_process');

const createUpdaterIntegration = ({
  app,
  dialog,
  shell,
  log,
  getMainWindow,
  createUpdateWindow,
  closeUpdateWindow,
  setWindowProgress,
  confirmInstall,
  requestQuitForUpdate,
  serverUrl,
  repoUrl,
  stablePortableExeName,
}) => {
  const appMetaUrl = `${serverUrl}/api/app/meta`;
  const updateCheckUrl = `${serverUrl}/api/updates/check`;
  let startupUpdateCheckStarted = false;

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return response.json();
  };

  const getAppMeta = async () => fetchJson(appMetaUrl);
  const checkForUpdates = async () => fetchJson(updateCheckUrl, { method: 'POST' });

  const downloadFileWithProgress = async (url, destinationPath, onProgress) => {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': 'Web-Title-Pro-Updater',
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`Download failed with ${response.status}`);
    }

    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });

    const contentLength = Number(response.headers.get('content-length') || 0);
    const reader = response.body.getReader();
    const fileHandle = await fsp.open(destinationPath, 'w');
    let received = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = Buffer.from(value);
        await fileHandle.write(chunk);
        received += chunk.length;

        if (typeof onProgress === 'function') {
          const percent = contentLength > 0 ? Math.round((received / contentLength) * 100) : null;
          onProgress({ received, total: contentLength, percent });
        }
      }
    } finally {
      await fileHandle.close();
    }
  };

  const resolveStablePortableExePath = () => {
    const currentPath = process.execPath;
    const currentDir = path.dirname(currentPath);
    const currentBase = path.basename(currentPath);

    if (/^WebTitlePro-\d+\.\d+\.\d+\.exe$/i.test(currentBase)) {
      return path.join(currentDir, stablePortableExeName);
    }

    return currentPath;
  };

  const createUpdateScript = async ({ sourcePath, targetPath }) => {
    const timestamp = Date.now();
    const scriptPath = path.join(app.getPath('temp'), `web-title-pro-apply-update-${timestamp}.ps1`);
    const logPath = path.join(app.getPath('temp'), `web-title-pro-apply-update-${timestamp}.log`);
    const script = [
      'param(',
      '  [string]$Source,',
      '  [string]$Target,',
      '  [int]$PidToWait,',
      '  [string]$LogPath',
      ')',
      "$ErrorActionPreference = 'Stop'",
      'function Write-UpdateLog([string]$Message) {',
      "  try { Add-Content -LiteralPath $LogPath -Value \"[$([DateTime]::Now.ToString('s'))] $Message\" -Encoding UTF8 } catch {}",
      '}',
      'Write-UpdateLog "Update helper started. Source=$Source Target=$Target PID=$PidToWait"',
      '$targetDir = Split-Path -Parent $Target',
      'if ($targetDir) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }',
      'for ($i = 0; $i -lt 240; $i++) {',
      '  if (-not (Get-Process -Id $PidToWait -ErrorAction SilentlyContinue)) { break }',
      '  Start-Sleep -Milliseconds 500',
      '}',
      'for ($i = 0; $i -lt 240; $i++) {',
      '  try {',
      '    Copy-Item -LiteralPath $Source -Destination $Target -Force',
      '    Remove-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue',
      "    Write-UpdateLog 'Copied update package successfully.'",
      '    break',
      '  } catch {',
      '    Write-UpdateLog ("Copy attempt failed: " + $_.Exception.Message)',
      '    Start-Sleep -Milliseconds 500',
      '  }',
      '}',
      'if (-not (Test-Path -LiteralPath $Target)) {',
      "  Write-UpdateLog 'Update helper timed out before replacing executable.'",
      '  exit 1',
      '}',
      'for ($i = 0; $i -lt 30; $i++) {',
      '  try {',
      '    Start-Process -FilePath $Target -WorkingDirectory $targetDir',
      "    Write-UpdateLog 'Restarted stable executable.'",
      '    exit 0',
      '  } catch {',
      '    Write-UpdateLog ("Restart attempt failed: " + $_.Exception.Message)',
      '    Start-Sleep -Milliseconds 500',
      '  }',
      '}',
      "Write-UpdateLog 'Update helper replaced the executable, but restart failed.'",
      'exit 1',
      '',
    ].join('\r\n');

    await fsp.writeFile(scriptPath, script, 'utf8');
    return { scriptPath, logPath };
  };

  const applyDownloadedUpdate = async (downloadPath) => {
    const targetPath = resolveStablePortableExePath();
    const { scriptPath, logPath } = await createUpdateScript({
      sourcePath: downloadPath,
      targetPath,
    });

    const helper = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        scriptPath,
        '-Source',
        downloadPath,
        '-Target',
        targetPath,
        '-PidToWait',
        String(process.pid),
        '-LogPath',
        logPath,
      ],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );

    helper.unref();
    await requestQuitForUpdate();
  };

  const installUpdateFromRelease = async (updateState) => {
    if (!updateState?.assetUrl || !updateState?.assetName) {
      if (updateState?.releaseUrl) {
        await shell.openExternal(updateState.releaseUrl);
      }
      await dialog.showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Update Package Not Found',
        message: 'The release page was opened in the browser.',
        detail: 'No portable .exe asset was attached to the latest release, so the download could not start automatically.',
        buttons: ['OK'],
        defaultId: 0,
      });
      return;
    }

    const progressWindow = await createUpdateWindow();
    await setWindowProgress(progressWindow, 'Downloading update package...', 8);

    const updatesDir = path.join(app.getPath('userData'), 'updates');
    const tempDownloadPath = path.join(updatesDir, `${updateState.assetName}.download`);

    try {
      await downloadFileWithProgress(updateState.assetUrl, tempDownloadPath, ({ percent }) => {
        const safePercent = percent === null ? 50 : Math.max(12, Math.min(92, percent));
        void setWindowProgress(progressWindow, 'Downloading update package...', safePercent);
      });

      await setWindowProgress(progressWindow, 'Preparing update handoff...', 96);
      await applyDownloadedUpdate(tempDownloadPath);
    } catch (error) {
      closeUpdateWindow();
      await dialog.showMessageBox(getMainWindow(), {
        type: 'error',
        title: 'Update Failed',
        message: 'The update could not be downloaded or prepared.',
        detail: error.message || String(error),
      });
      throw error;
    }
  };

  const installAvailableUpdate = async (payload = {}) => {
    const nextState =
      payload?.available && (payload?.assetUrl || payload?.releaseUrl)
        ? payload
        : await checkForUpdates();

    if (!nextState?.available) {
      return {
        ok: false,
        reason: 'no-update',
        updateState: nextState,
      };
    }

    const shouldProceed = await confirmInstall();
    if (!shouldProceed) {
      return {
        ok: false,
        reason: 'cancelled',
        updateState: nextState,
      };
    }

    await installUpdateFromRelease(nextState);
    return {
      ok: true,
      updateState: nextState,
    };
  };

  const runStartupUpdateCheck = async () => {
    if (startupUpdateCheckStarted || !app.isPackaged) {
      return;
    }

    startupUpdateCheckStarted = true;

    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const meta = await getAppMeta();
      const updateState = await checkForUpdates();

      if (updateState?.status === 'error' || updateState?.status === 'unsupported' || updateState?.status === 'no-releases') {
        await dialog.showMessageBox(getMainWindow(), {
          type: 'warning',
          title: 'Update Check',
          message: 'Automatic update check could not complete normally.',
          detail: updateState?.notes || 'Unknown update status.',
          buttons: ['OK'],
          defaultId: 0,
        });
        return;
      }

      if (updateState?.available) {
        const result = await dialog.showMessageBox(getMainWindow(), {
          type: 'info',
          title: 'Update Available',
          message: `A newer version is available: ${updateState.latestVersion}`,
          detail:
            `Current version: ${meta?.version || updateState.currentVersion || '0.0.0'}\n` +
            `Release source: ${repoUrl}\n\n` +
            'Do you want to download and apply the update now?',
          buttons: ['Update Now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        });

        if (result.response === 0) {
          const shouldProceed = await confirmInstall();
          if (!shouldProceed) {
            return;
          }

          await installUpdateFromRelease(updateState);
        }

        return;
      }

      await dialog.showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Updates',
        message: `You are on the latest version: ${meta?.version || updateState?.currentVersion || '0.0.0'}`,
        detail:
          `${updateState?.notes || 'Update check completed successfully.'}\n` +
          `Source: ${repoUrl}`,
        buttons: ['OK'],
        defaultId: 0,
      });
    } catch (error) {
      log(`updates:startup-check-error ${error.stack || error.message}`);
      await dialog.showMessageBox(getMainWindow(), {
        type: 'warning',
        title: 'Update Check',
        message: 'Automatic update check failed.',
        detail: error.message || String(error),
        buttons: ['OK'],
        defaultId: 0,
      });
    }
  };

  return {
    getAppMeta,
    checkForUpdates,
    installAvailableUpdate,
    runStartupUpdateCheck,
    __private: {
      resolveStablePortableExePath,
      createUpdateScript,
      downloadFileWithProgress,
    },
  };
};

module.exports = {
  createUpdaterIntegration,
};
