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

  const runProcess = (command, args, options = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        windowsHide: true,
        ...options,
      });
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        reject(
          new Error(
            `${command} exited with code ${code}.${stderr ? ` ${stderr.trim()}` : ''}`.trim(),
          ),
        );
      });
    });

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
    const portableExecutableFile =
      typeof process.env.PORTABLE_EXECUTABLE_FILE === 'string'
        ? process.env.PORTABLE_EXECUTABLE_FILE.trim()
        : '';

    if (portableExecutableFile && /\.exe$/i.test(portableExecutableFile)) {
      return path.normalize(portableExecutableFile);
    }

    const portableExecutableDir =
      typeof process.env.PORTABLE_EXECUTABLE_DIR === 'string'
        ? process.env.PORTABLE_EXECUTABLE_DIR.trim()
        : '';

    if (portableExecutableDir) {
      const stablePortablePath = path.join(portableExecutableDir, stablePortableExeName);
      return path.normalize(stablePortablePath);
    }

    const currentPath = process.execPath;
    const currentDir = path.dirname(currentPath);
    const currentBase = path.basename(currentPath);

    if (/^WebTitlePro-\d+\.\d+\.\d+\.exe$/i.test(currentBase)) {
      return path.join(currentDir, stablePortableExeName);
    }

    return currentPath;
  };

  const createUpdateScript = async ({ sourcePath, targetPath, taskName }) => {
    const timestamp = Date.now();
    const scriptPath = path.join(app.getPath('temp'), `web-title-pro-apply-update-${timestamp}.ps1`);
    const statusScriptPath = path.join(app.getPath('temp'), `web-title-pro-update-status-${timestamp}.ps1`);
    const launcherPath = path.join(app.getPath('temp'), `web-title-pro-apply-update-${timestamp}.vbs`);
    const logPath = path.join(app.getPath('temp'), `web-title-pro-apply-update-${timestamp}.log`);
    const statePath = path.join(app.getPath('temp'), `web-title-pro-apply-update-${timestamp}.json`);
    const script = [
      'param(',
      '  [string]$Source,',
      '  [string]$Target,',
      '  [int]$PidToWait,',
      '  [string]$LogPath,',
      '  [string]$StatePath,',
      '  [string]$TaskName',
      ')',
      "$ErrorActionPreference = 'Stop'",
      'function Write-UpdateLog([string]$Message) {',
      "  try { Add-Content -LiteralPath $LogPath -Value \"[$([DateTime]::Now.ToString('s'))] $Message\" -Encoding UTF8 } catch {}",
      '}',
      'function Write-UpdateState([string]$Status, [string]$Message, [int]$Percent = -1) {',
      '  try {',
      '    $payload = @{ status = $Status; message = $Message; percent = $Percent } | ConvertTo-Json -Compress',
      '    Set-Content -LiteralPath $StatePath -Value $payload -Encoding UTF8',
      '  } catch {}',
      '}',
      'Write-UpdateLog "Update helper started. Source=$Source Target=$Target PID=$PidToWait"',
      "Write-UpdateState 'waiting' 'Waiting for Web Title Pro to close...' 98",
      '$targetDir = Split-Path -Parent $Target',
      'if ($targetDir) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }',
      'for ($i = 0; $i -lt 240; $i++) {',
      '  if (-not (Get-Process -Id $PidToWait -ErrorAction SilentlyContinue)) { break }',
      '  Start-Sleep -Milliseconds 500',
      '}',
      'if (-not (Test-Path -LiteralPath $Source)) {',
      "  Write-UpdateLog 'Update package is missing before copy started.'",
      "  Write-UpdateState 'error' 'The downloaded update package could not be found.' 100",
      '  if ($TaskName) { try { schtasks /delete /tn $TaskName /f | Out-Null } catch {} }',
      '  exit 1',
      '}',
      "Write-UpdateState 'copying' 'Applying the update package...' 99",
      '$copySucceeded = $false',
      'for ($i = 0; $i -lt 240; $i++) {',
      '  try {',
      '    Copy-Item -LiteralPath $Source -Destination $Target -Force',
      '    Remove-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue',
      "    Write-UpdateLog 'Copied update package successfully.'",
      '    $copySucceeded = $true',
      '    break',
      '  } catch {',
      '    Write-UpdateLog ("Copy attempt failed: " + $_.Exception.Message)',
      '    Start-Sleep -Milliseconds 500',
      '  }',
      '}',
      'if (-not $copySucceeded) {',
      "  Write-UpdateLog 'Update helper timed out before replacing executable.'",
      "  Write-UpdateState 'error' 'The update package could not replace Web Title Pro.' 100",
      '  if ($TaskName) { try { schtasks /delete /tn $TaskName /f | Out-Null } catch {} }',
      '  exit 1',
      '}',
      "Write-UpdateState 'restarting' 'Restarting Web Title Pro...' 100",
      'for ($i = 0; $i -lt 30; $i++) {',
      '  try {',
      '    Start-Process -FilePath $Target -WorkingDirectory $targetDir',
      "    Write-UpdateLog 'Restarted stable executable.'",
      "    Write-UpdateState 'done' 'Update complete. Launching Web Title Pro...' 100",
      '    if ($TaskName) { try { schtasks /delete /tn $TaskName /f | Out-Null } catch {} }',
      '    exit 0',
      '  } catch {',
      '    Write-UpdateLog ("Restart attempt failed: " + $_.Exception.Message)',
      "    Write-UpdateState 'restarting' 'Restarting Web Title Pro...' 100",
      '    Start-Sleep -Milliseconds 500',
      '  }',
      '}',
      "Write-UpdateLog 'Update helper replaced the executable, but restart failed.'",
      "Write-UpdateState 'error' 'The update was applied, but Web Title Pro could not restart automatically.' 100",
      'if ($TaskName) { try { schtasks /delete /tn $TaskName /f | Out-Null } catch {} }',
      'exit 1',
      '',
    ].join('\r\n');

    const statusScript = [
      'param([string]$StatePath)',
      "$ErrorActionPreference = 'SilentlyContinue'",
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '[System.Windows.Forms.Application]::EnableVisualStyles()',
      '$form = New-Object System.Windows.Forms.Form',
      "$form.Text = 'Updating Web Title Pro'",
      "$form.StartPosition = 'CenterScreen'",
      "$form.Size = New-Object System.Drawing.Size(430, 170)",
      "$form.MinimumSize = New-Object System.Drawing.Size(430, 170)",
      "$form.MaximumSize = New-Object System.Drawing.Size(430, 170)",
      "$form.FormBorderStyle = 'FixedDialog'",
      '$form.TopMost = $true',
      '$form.MaximizeBox = $false',
      '$form.MinimizeBox = $false',
      '$form.ControlBox = $false',
      "$form.BackColor = [System.Drawing.Color]::FromArgb(9, 10, 13)",
      '$title = New-Object System.Windows.Forms.Label',
      "$title.Text = 'Web Title Pro update'",
      "$title.ForeColor = [System.Drawing.Color]::FromArgb(245, 247, 251)",
      "$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 16)",
      '$title.AutoSize = $true',
      '$title.Location = New-Object System.Drawing.Point(22, 18)',
      '$form.Controls.Add($title)',
      '$status = New-Object System.Windows.Forms.Label',
      "$status.Text = 'Preparing the update...'",
      "$status.ForeColor = [System.Drawing.Color]::FromArgb(198, 205, 216)",
      "$status.Font = New-Object System.Drawing.Font('Segoe UI', 10)",
      '$status.AutoSize = $false',
      '$status.Size = New-Object System.Drawing.Size(382, 38)',
      '$status.Location = New-Object System.Drawing.Point(24, 54)',
      '$form.Controls.Add($status)',
      '$progress = New-Object System.Windows.Forms.ProgressBar',
      '$progress.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous',
      '$progress.Minimum = 0',
      '$progress.Maximum = 100',
      '$progress.Value = 92',
      '$progress.Size = New-Object System.Drawing.Size(382, 14)',
      '$progress.Location = New-Object System.Drawing.Point(24, 104)',
      '$form.Controls.Add($progress)',
      '$meta = New-Object System.Windows.Forms.Label',
      "$meta.Text = 'Web Title Pro will restart automatically.'",
      "$meta.ForeColor = [System.Drawing.Color]::FromArgb(158, 167, 182)",
      "$meta.Font = New-Object System.Drawing.Font('Segoe UI', 8.75)",
      '$meta.AutoSize = $false',
      '$meta.Size = New-Object System.Drawing.Size(382, 18)',
      '$meta.Location = New-Object System.Drawing.Point(24, 124)',
      '$form.Controls.Add($meta)',
      '$openedAt = [DateTime]::Now',
      '$lastStateSignature = $null',
      '$lastStateChangeAt = $openedAt',
      '$closeAt = $null',
      '$timer = New-Object System.Windows.Forms.Timer',
      '$timer.Interval = 200',
      '$timer.Add_Tick({',
      '  try {',
      '    if (Test-Path -LiteralPath $StatePath) {',
      '      $raw = Get-Content -LiteralPath $StatePath -Raw',
      '      if ($raw) {',
      '        $signature = [string]$raw',
      '        if ($signature -ne $lastStateSignature) {',
      '          $lastStateSignature = $signature',
      '          $lastStateChangeAt = [DateTime]::Now',
      '        }',
      '        $state = $raw | ConvertFrom-Json',
      '        if ($state.message) { $status.Text = [string]$state.message }',
      '        if ($state.percent -ge 0 -and $state.percent -le 100) {',
      '          $progress.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous',
      '          $progress.Value = [Math]::Max(0, [Math]::Min(100, [int]$state.percent))',
      '        } else {',
      '          $progress.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee',
      '        }',
      "        if ($state.status -eq 'done') {",
      "          $meta.Text = 'The updated version is starting now.'",
      '          if (-not $closeAt) { $closeAt = [DateTime]::Now.AddSeconds(1.5) }',
      "        } elseif ($state.status -eq 'error') {",
      "          $form.Text = 'Web Title Pro update failed'",
      "          $meta.Text = 'Please reopen Web Title Pro manually if it does not restart.'",
      '          $form.ControlBox = $true',
      '          if (-not $closeAt) { $closeAt = [DateTime]::Now.AddSeconds(8) }',
      '        }',
      '    }',
      '      }',
      '    }',
      '    $stalledFor = ([DateTime]::Now - $lastStateChangeAt).TotalSeconds',
      "    if (-not $closeAt -and $lastStateSignature -and $stalledFor -ge 30) {",
      "      $form.Text = 'Web Title Pro update status timed out'",
      "      $status.Text = 'The updater stopped reporting progress.'",
      "      $meta.Text = 'Please check whether the new version has already started.'",
      '      $form.ControlBox = $true',
      '      $closeAt = [DateTime]::Now.AddSeconds(10)',
      '    }',
      "    if (-not $closeAt -and ([DateTime]::Now - $openedAt).TotalSeconds -ge 90) {",
      "      $form.Text = 'Web Title Pro update status timed out'",
      "      $meta.Text = 'The updater window stayed open too long and will close automatically.'",
      '      $form.ControlBox = $true',
      '      $closeAt = [DateTime]::Now.AddSeconds(6)',
      '    }',
      '    if ($closeAt -and [DateTime]::Now -ge $closeAt) {',
      '      $timer.Stop()',
      '      $form.Close()',
      '    }',
      '  } catch {}',
      '})',
      '$timer.Start()',
      "[void]$form.ShowDialog()",
      '',
    ].join('\r\n');

    const escapeVbsValue = (value) => String(value).replace(/"/g, '""');
    const launchCommand = [
      'powershell.exe',
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      `"${escapeVbsValue(scriptPath)}"`,
      '-Source',
      `"${escapeVbsValue(sourcePath)}"`,
      '-Target',
      `"${escapeVbsValue(targetPath)}"`,
      '-PidToWait',
      String(process.pid),
      '-LogPath',
      `"${escapeVbsValue(logPath)}"`,
      '-StatePath',
      `"${escapeVbsValue(statePath)}"`,
      '-TaskName',
      `"${escapeVbsValue(taskName)}"`,
    ].join(' ');
    const launchStatusCommand = [
      'powershell.exe',
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-STA',
      '-WindowStyle',
      'Hidden',
      '-File',
      `"${escapeVbsValue(statusScriptPath)}"`,
      '-StatePath',
      `"${escapeVbsValue(statePath)}"`,
    ].join(' ');
    const launcherScript = [
      'Set WshShell = CreateObject("WScript.Shell")',
      `WshShell.Run "${escapeVbsValue(launchStatusCommand)}", 0, False`,
      `WshShell.Run "${escapeVbsValue(launchCommand)}", 0, False`,
    ].join('\r\n');

    await fsp.writeFile(
      statePath,
      JSON.stringify({
        status: 'handoff',
        message: 'Closing Web Title Pro to start the update...',
        percent: 97,
      }),
      'utf8',
    );
    await fsp.writeFile(scriptPath, script, 'utf8');
    await fsp.writeFile(statusScriptPath, statusScript, 'utf8');
    await fsp.writeFile(launcherPath, launcherScript, 'ascii');
    return { scriptPath, statusScriptPath, launcherPath, logPath, statePath };
  };

  const quoteTaskArgument = (value) => `"${String(value).replace(/"/g, '""')}"`;

  const scheduleUpdateHelper = async ({
    launcherPath,
    logPath,
    taskName,
  }) => {
    const startAt = new Date(Date.now() + 60 * 1000);
    const startTime = startAt.toTimeString().slice(0, 5);
    const runAsUser = process.env.USERNAME || undefined;
    const taskRun = `wscript.exe ${quoteTaskArgument(launcherPath)}`;
    const createArgs = [
      '/create',
      '/tn',
      taskName,
      '/sc',
      'once',
      '/st',
      startTime,
      '/tr',
      taskRun,
      '/f',
    ];

    if (runAsUser) {
      createArgs.push('/ru', runAsUser);
    }

    await runProcess('schtasks.exe', createArgs);
    await runProcess('schtasks.exe', ['/run', '/tn', taskName]);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const logText = await fsp.readFile(logPath, 'utf8');
        if (logText.includes('Update helper started.')) {
          return;
        }
      } catch {}

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    try {
      await runProcess('schtasks.exe', ['/delete', '/tn', taskName, '/f']);
    } catch {}

    throw new Error('The updater helper could not be started in the background.');
  };

  const applyDownloadedUpdate = async (downloadPath) => {
    const targetPath = resolveStablePortableExePath();
    log(
      `updates:apply target=${targetPath} exec=${process.execPath} portableFile=${process.env.PORTABLE_EXECUTABLE_FILE || ''} portableDir=${process.env.PORTABLE_EXECUTABLE_DIR || ''}`,
    );
    const taskName = `WebTitlePro-Update-${Date.now()}`;
    const { launcherPath, logPath } = await createUpdateScript({
      sourcePath: downloadPath,
      targetPath,
      taskName,
    });
    await scheduleUpdateHelper({
      launcherPath,
      logPath,
      taskName,
    });
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
      await setWindowProgress(progressWindow, 'Closing Web Title Pro to finish the update...', 99);
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
      scheduleUpdateHelper,
    },
  };
};

module.exports = {
  createUpdaterIntegration,
};
