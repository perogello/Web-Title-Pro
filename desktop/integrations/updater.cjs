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
    // Two-tier timeouts:
    //  - connectController (30 s) only covers establishing the TCP/TLS
    //    session and getting response headers from GitHub CDN. If GitHub
    //    is unreachable, we fail fast instead of waiting forever.
    //  - stallController is rearmed every chunk; it only fires if no
    //    bytes arrived for 60 s in a row, so long but healthy downloads
    //    on a slow link finish fine, while a frozen socket bails out.
    const connectController = new AbortController();
    const connectTimeout = setTimeout(() => connectController.abort(), 30 * 1000);
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': 'Web-Title-Pro-Updater',
        },
        signal: connectController.signal,
      });
    } finally {
      clearTimeout(connectTimeout);
    }

    if (!response.ok || !response.body) {
      throw new Error(`Download failed with ${response.status}`);
    }

    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });

    const contentLength = Number(response.headers.get('content-length') || 0);
    const reader = response.body.getReader();
    const fileHandle = await fsp.open(destinationPath, 'w');
    let received = 0;

    const STALL_TIMEOUT_MS = 60 * 1000;
    let stallTimer = null;
    let stalled = false;
    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        // Abort the underlying body reader so the await read() rejects
        // instead of hanging forever on a dead socket.
        try { reader.cancel(new Error('stall')); } catch {}
      }, STALL_TIMEOUT_MS);
    };
    const disarmStallTimer = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    try {
      armStallTimer();
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = Buffer.from(value);
        await fileHandle.write(chunk);
        armStallTimer();
        received += chunk.length;

        if (typeof onProgress === 'function') {
          const percent = contentLength > 0 ? Math.round((received / contentLength) * 100) : null;
          onProgress({ received, total: contentLength, percent });
        }
      }

      if (stalled) {
        throw new Error('Download stalled — no data received for 60 seconds.');
      }
      if (contentLength > 0 && received !== contentLength) {
        throw new Error(`Downloaded update is incomplete: received ${received} of ${contentLength} bytes.`);
      }
    } finally {
      disarmStallTimer();
      await fileHandle.close();
    }
  };

  const validatePortableUpdatePackage = async (filePath, expectedSize = 0) => {
    const stat = await fsp.stat(filePath);
    const safeExpectedSize = Number(expectedSize) || 0;

    if (safeExpectedSize > 0 && stat.size !== safeExpectedSize) {
      throw new Error(`Downloaded update size mismatch: expected ${safeExpectedSize} bytes, got ${stat.size}.`);
    }

    const fileHandle = await fsp.open(filePath, 'r');
    const signature = Buffer.alloc(2);

    try {
      await fileHandle.read(signature, 0, 2, 0);
    } finally {
      await fileHandle.close();
    }

    if (signature[0] !== 0x4d || signature[1] !== 0x5a) {
      throw new Error('Downloaded update is not a valid Windows executable.');
    }
  };

  const isWebTitlePortableExe = (value = '') => /^WebTitlePro(-[\w.-]+)?\.exe$/i.test(path.basename(value));

  const normalizePortablePath = (value = '') => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed && /\.exe$/i.test(trimmed) ? path.normalize(trimmed) : '';
  };

  const resolveLaunchedPortableExePath = () => {
    const fileFromEnv = normalizePortablePath(process.env.PORTABLE_EXECUTABLE_FILE);

    if (fileFromEnv && isWebTitlePortableExe(fileFromEnv)) {
      return fileFromEnv;
    }

    const currentPath = normalizePortablePath(process.execPath);
    return currentPath && isWebTitlePortableExe(currentPath) ? currentPath : '';
  };

  /**
   * Update target should ALWAYS be the stable launcher (`WebTitlePro.exe`),
   * regardless of which file the operator actually clicked to launch.
   *
   * Previously this function returned `PORTABLE_EXECUTABLE_FILE` directly,
   * which made the updater replace whatever versioned launcher the
   * operator started — `WebTitlePro-0.4.0.exe` got rewritten to the new
   * payload but kept the old filename, while the stable
   * `WebTitlePro.exe` sitting in the same folder stayed frozen at the
   * old version. The next click on the stable shortcut then launched
   * the OLD app, producing the "update didn't apply" report.
   *
   * Now we always update and restart the stable `WebTitlePro.exe`.
   * If the user launched a versioned portable file such as
   * `WebTitlePro-0.4.4.exe`, the helper also updates that launcher as a
   * secondary target so a later manual click does not reopen the old app.
   *
   * Stable target resolution order:
   *   1. PORTABLE_EXECUTABLE_DIR — set by electron-builder portable target
   *      to the folder containing the launcher.
   *   2. dirname(PORTABLE_EXECUTABLE_FILE) — fallback for builds that
   *      only expose the full path.
   *   3. dirname(process.execPath) when the running exe matches our
   *      portable naming pattern (dev / unpackaged).
   *   4. process.execPath as a final fallback (untested platforms,
   *      `npm run desktop`, etc.).
   */
  const resolveStablePortableExePath = () => {
    const dirFromEnv =
      typeof process.env.PORTABLE_EXECUTABLE_DIR === 'string'
        ? process.env.PORTABLE_EXECUTABLE_DIR.trim()
        : '';

    if (dirFromEnv) {
      return path.normalize(path.join(dirFromEnv, stablePortableExeName));
    }

    const fileFromEnv =
      typeof process.env.PORTABLE_EXECUTABLE_FILE === 'string'
        ? process.env.PORTABLE_EXECUTABLE_FILE.trim()
        : '';

    if (fileFromEnv && /\.exe$/i.test(fileFromEnv)) {
      return path.normalize(path.join(path.dirname(fileFromEnv), stablePortableExeName));
    }

    const currentPath = process.execPath;
    const currentDir = path.dirname(currentPath);
    const currentBase = path.basename(currentPath);

    if (isWebTitlePortableExe(currentBase)) {
      return path.join(currentDir, stablePortableExeName);
    }

    return currentPath;
  };

  const resolvePortableUpdateTargets = () => {
    const primaryTarget = resolveStablePortableExePath();
    const launchedTarget = resolveLaunchedPortableExePath();
    const sameTarget =
      launchedTarget &&
      path.normalize(launchedTarget).toLowerCase() === path.normalize(primaryTarget).toLowerCase();

    return {
      primaryTarget,
      secondaryTarget: launchedTarget && !sameTarget ? launchedTarget : '',
    };
  };

  const createUpdateScript = async ({
    sourcePath,
    targetPath,
    secondaryTargetPath = '',
    taskName,
    expectedSize = 0,
  }) => {
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
      '  [string]$TaskName,',
      '  [long]$ExpectedSize,',
      '  [string]$SecondaryTarget',
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
      '$sourceSize = (Get-Item -LiteralPath $Source).Length',
      'if ($ExpectedSize -gt 0 -and $sourceSize -ne $ExpectedSize) {',
      '  Write-UpdateLog "Update package size mismatch before copy. Expected=$ExpectedSize Actual=$sourceSize"',
      "  Write-UpdateState 'error' 'The downloaded update package is incomplete.' 100",
      '  if ($TaskName) { try { schtasks /delete /tn $TaskName /f | Out-Null } catch {} }',
      '  exit 1',
      '}',
      '$stream = [System.IO.File]::OpenRead($Source)',
      '$header = New-Object byte[] 2',
      'try { [void]$stream.Read($header, 0, 2) } finally { $stream.Dispose() }',
      'if ($header[0] -ne 0x4D -or $header[1] -ne 0x5A) {',
      "  Write-UpdateLog 'Update package is not a Windows executable.'",
      "  Write-UpdateState 'error' 'The downloaded update package is not a valid executable.' 100",
      '  if ($TaskName) { try { schtasks /delete /tn $TaskName /f | Out-Null } catch {} }',
      '  exit 1',
      '}',
      "Write-UpdateState 'copying' 'Applying the update package...' 99",
      'function Copy-UpdatePackage([string]$Destination, [string]$Label, [bool]$Required) {',
      '  if (-not $Destination) { return $true }',
      '  $destinationDir = Split-Path -Parent $Destination',
      '  if ($destinationDir) { New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null }',
      '  for ($i = 0; $i -lt 240; $i++) {',
      '    try {',
      '      Copy-Item -LiteralPath $Source -Destination $Destination -Force',
      '      $copiedSize = (Get-Item -LiteralPath $Destination).Length',
      '      if ($ExpectedSize -gt 0 -and $copiedSize -ne $ExpectedSize) { throw "Copied executable size mismatch. Expected=$ExpectedSize Actual=$copiedSize" }',
      '      Write-UpdateLog "Copied update package to ${Label}: $Destination"',
      '      return $true',
      '    } catch {',
      '      Write-UpdateLog ("Copy attempt failed for " + $Label + ": " + $_.Exception.Message)',
      '      Start-Sleep -Milliseconds 500',
      '    }',
      '  }',
      '  if ($Required) {',
      '    Write-UpdateLog "Update helper timed out before replacing required executable: $Destination"',
      "    Write-UpdateState 'error' 'The update package could not replace Web Title Pro.' 100",
      '    if ($TaskName) { try { schtasks /delete /tn $TaskName /f | Out-Null } catch {} }',
      '    exit 1',
      '  }',
      '  Write-UpdateLog "Optional launcher was not updated: $Destination"',
      '  return $false',
      '}',
      '[void](Copy-UpdatePackage $Target "stable launcher" $true)',
      'if ($SecondaryTarget -and $SecondaryTarget -ne $Target) { [void](Copy-UpdatePackage $SecondaryTarget "launched launcher" $false) }',
      'Remove-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue',
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
      // Palette matches client/src/styles/01-base.css :shell-v2 — neutral
      // black canvas (#050507) with soft #f2f3f5 text. Keeps the helper
      // visually consistent with the rest of the app's new palette.
      "$form.BackColor = [System.Drawing.Color]::FromArgb(5, 5, 7)",
      '$title = New-Object System.Windows.Forms.Label',
      "$title.Text = 'Web Title Pro update'",
      "$title.ForeColor = [System.Drawing.Color]::FromArgb(242, 243, 245)",
      "$title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 16)",
      '$title.AutoSize = $true',
      '$title.Location = New-Object System.Drawing.Point(22, 18)',
      '$form.Controls.Add($title)',
      '$status = New-Object System.Windows.Forms.Label',
      "$status.Text = 'Preparing the update...'",
      "$status.ForeColor = [System.Drawing.Color]::FromArgb(200, 202, 210)",
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
      "$meta.ForeColor = [System.Drawing.Color]::FromArgb(154, 154, 160)",
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
      '-ExpectedSize',
      String(Number(expectedSize) || 0),
      '-SecondaryTarget',
      `"${escapeVbsValue(secondaryTargetPath)}"`,
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

  const applyDownloadedUpdate = async (downloadPath, expectedSize = 0) => {
    const { primaryTarget: targetPath, secondaryTarget } = resolvePortableUpdateTargets();
    log(
      `updates:apply target=${targetPath} secondary=${secondaryTarget || ''} exec=${process.execPath} portableFile=${process.env.PORTABLE_EXECUTABLE_FILE || ''} portableDir=${process.env.PORTABLE_EXECUTABLE_DIR || ''}`,
    );
    const taskName = `WebTitlePro-Update-${Date.now()}`;
    const { launcherPath, logPath } = await createUpdateScript({
      sourcePath: downloadPath,
      targetPath,
      secondaryTargetPath: secondaryTarget,
      taskName,
      expectedSize,
    });
    await scheduleUpdateHelper({
      launcherPath,
      logPath,
      taskName,
    });
    await requestQuitForUpdate();
  };

  const installUpdateFromRelease = async (updateState) => {
    log(
      `updates:install-start latest=${updateState?.latestVersion || ''} asset=${updateState?.assetName || ''} size=${updateState?.assetSize || 0}`,
    );

    if (!updateState?.assetUrl || !updateState?.assetName) {
      log('updates:install-no-asset — opening release page in browser');
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
    log(`updates:install-paths updatesDir=${updatesDir} download=${tempDownloadPath}`);

    // Clear stale .download files from previous aborted attempts before
    // starting a new one. Without this, every cancelled / network-failed
    // update leaves a ~91 MB orphan in userData/updates/ forever.
    try {
      const existing = await fsp.readdir(updatesDir).catch(() => []);
      await Promise.all(
        existing
          .filter((name) => name.endsWith('.download'))
          .map((name) => fsp.unlink(path.join(updatesDir, name)).catch(() => {})),
      );
    } catch {
      // ignore: directory may not exist yet, download step recreates it
    }

    try {
      log(`updates:download-start url=${updateState.assetUrl}`);
      await downloadFileWithProgress(updateState.assetUrl, tempDownloadPath, ({ percent }) => {
        const safePercent = percent === null ? 50 : Math.max(12, Math.min(92, percent));
        void setWindowProgress(progressWindow, 'Downloading update package...', safePercent);
      });
      log(`updates:download-complete size=${updateState.assetSize || 0}`);

      await validatePortableUpdatePackage(tempDownloadPath, updateState.assetSize);
      log('updates:download-validated');
      await setWindowProgress(progressWindow, 'Preparing update handoff...', 96);
      await setWindowProgress(progressWindow, 'Closing Web Title Pro to finish the update...', 99);
      await applyDownloadedUpdate(tempDownloadPath, updateState.assetSize);
      log('updates:install-helper-scheduled');
    } catch (error) {
      log(`updates:install-error ${error.stack || error.message}`);
      // Drop the half-written .download AND clean up any leftover scratch
      // so a retry starts on a clean slate. Without the broader cleanup
      // the user reported "works once, then fails silently" — orphaned
      // helper scripts and partial downloads were piling up.
      await fsp.unlink(tempDownloadPath).catch(() => {});
      await cleanupUpdaterScratch().catch(() => {});
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

  /**
   * Remove stale updater scratch files that survived a previous run:
   *   - userData/updates/*.download   (interrupted downloads, ~91 MB each)
   *   - %TEMP%/web-title-pro-apply-update-*.{ps1,vbs,log,json}
   *   - %TEMP%/web-title-pro-update-status-*.ps1
   * Each apply attempt creates one of each in TEMP and they were never
   * cleaned, so power users who triggered the updater repeatedly ended up
   * with hundreds of MB of orphan helper scripts and download blobs.
   *
   * Called on every cold start AND after a failed install so the disk
   * doesn't slowly fill up.
   */
  const cleanupUpdaterScratch = async () => {
    const cleaned = { downloads: 0, scripts: 0, errors: [] };

    const updatesDir = path.join(app.getPath('userData'), 'updates');
    try {
      const entries = await fsp.readdir(updatesDir);
      await Promise.all(
        entries
          .filter((name) => name.endsWith('.download'))
          .map(async (name) => {
            try {
              await fsp.unlink(path.join(updatesDir, name));
              cleaned.downloads += 1;
            } catch (error) {
              cleaned.errors.push(`${name}: ${error.message}`);
            }
          }),
      );
    } catch {
      // directory may not exist yet, that's fine
    }

    const tempDir = app.getPath('temp');
    try {
      const entries = await fsp.readdir(tempDir);
      const ours = entries.filter((name) =>
        /^web-title-pro-(apply-update|update-status)-\d+\.(ps1|vbs|log|json)$/i.test(name),
      );
      await Promise.all(
        ours.map(async (name) => {
          try {
            await fsp.unlink(path.join(tempDir, name));
            cleaned.scripts += 1;
          } catch (error) {
            cleaned.errors.push(`${name}: ${error.message}`);
          }
        }),
      );
    } catch {
      // ignore
    }

    log(
      `updates:scratch-cleanup downloads=${cleaned.downloads} scripts=${cleaned.scripts}` +
        (cleaned.errors.length ? ` errors=${cleaned.errors.length}` : ''),
    );

    return cleaned;
  };

  const runStartupUpdateCheck = async () => {
    if (startupUpdateCheckStarted || !app.isPackaged) {
      return;
    }

    startupUpdateCheckStarted = true;

    // Always clean up leftover updater scratch from previous runs at the
    // very start — even if we're about to be told there's no update.
    await cleanupUpdaterScratch().catch((error) => {
      log(`updates:scratch-cleanup-error ${error.message || error}`);
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const meta = await getAppMeta();
      const updateState = await checkForUpdates();

      if (updateState?.status === 'error' || updateState?.status === 'unsupported' || updateState?.status === 'no-releases') {
        // Don't interrupt the operator with a dialog on every cold start when
        // the network is flaky or GitHub rate-limits us. Log it silently —
        // the user can manually re-check from Settings → Updates.
        log(`updates:startup-check-skipped status=${updateState?.status} notes=${updateState?.notes || ''}`);
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
    cleanupUpdaterScratch,
    __private: {
      cleanupUpdaterScratch,
      resolveStablePortableExePath,
      resolveLaunchedPortableExePath,
      resolvePortableUpdateTargets,
      createUpdateScript,
      downloadFileWithProgress,
      validatePortableUpdatePackage,
      scheduleUpdateHelper,
    },
  };
};

module.exports = {
  createUpdaterIntegration,
};
