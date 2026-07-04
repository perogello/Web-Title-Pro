// App maintenance: reset (wipe userData and restart clean) and full
// uninstall (wipe userData + portable exe). A running exe cannot delete its
// own files, so both actions write a detached PowerShell cleanup script to
// %TEMP% that waits for the app process to exit and then removes everything.
// Same detached-helper pattern the updater uses.

const path = require('node:path');

const UPDATE_LEFTOVER_PREFIX = 'web-title-pro-apply-update-';

// Everything the app leaves on the machine, in delete order. The portable
// unpack dir is only known when electron-builder sets unpackDirName (see
// package.json build.portable); random legacy unpack dirs are not touched —
// we never delete folders we cannot positively identify as ours.
const collectCleanupTargets = ({ userDataDir, tempDir, unpackDirName = 'WebTitlePro' }) => {
  const targets = [];
  if (userDataDir) targets.push(path.normalize(userDataDir));
  if (tempDir && unpackDirName) targets.push(path.normalize(path.join(tempDir, unpackDirName)));
  return targets;
};

const escapePs = (value = '') => String(value).replace(/'/g, "''");

/**
 * Build the PowerShell cleanup script.
 *
 * mode 'reset'      — remove targets, relaunch relaunchExePath (if given).
 * mode 'uninstall'  — remove targets AND exePaths, show a farewell message.
 *
 * The script always: waits for `pid` to exit (max 60s), retries locked
 * deletes, cleans updater leftovers in tempDir, and deletes itself last.
 */
const buildCleanupScript = ({
  mode = 'reset',
  pid,
  targets = [],
  exePaths = [],
  relaunchExePath = '',
  tempDir = '',
}) => {
  const lines = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '',
    '# Wait for the app process to exit before touching its files.',
    `$appPid = ${Number(pid) || 0}`,
    '$deadline = (Get-Date).AddSeconds(60)',
    'while ((Get-Date) -lt $deadline) {',
    '  $proc = Get-Process -Id $appPid -ErrorAction SilentlyContinue',
    '  if (-not $proc) { break }',
    '  Start-Sleep -Milliseconds 300',
    '}',
    'Start-Sleep -Milliseconds 500',
    '',
    'function Remove-WithRetry([string]$TargetPath) {',
    '  for ($i = 0; $i -lt 6; $i++) {',
    '    if (-not (Test-Path -LiteralPath $TargetPath)) { return }',
    '    try {',
    '      Remove-Item -LiteralPath $TargetPath -Recurse -Force -ErrorAction Stop',
    '      return',
    '    } catch {',
    '      Start-Sleep -Milliseconds 700',
    '    }',
    '  }',
    '}',
    '',
  ];

  for (const target of targets) {
    lines.push(`Remove-WithRetry '${escapePs(target)}'`);
  }

  if (tempDir) {
    lines.push(
      '',
      '# Updater leftovers (.ps1/.vbs/.log/.json helper files).',
      `Get-ChildItem -LiteralPath '${escapePs(tempDir)}' -Filter '${UPDATE_LEFTOVER_PREFIX}*' -ErrorAction SilentlyContinue | ForEach-Object { Remove-WithRetry $_.FullName }`,
    );
  }

  if (mode === 'uninstall') {
    lines.push('', '# Remove the portable launcher(s).');
    for (const exePath of exePaths.filter(Boolean)) {
      lines.push(`Remove-WithRetry '${escapePs(exePath)}'`);
    }
    lines.push(
      '',
      'Add-Type -AssemblyName System.Windows.Forms',
      "[System.Windows.Forms.MessageBox]::Show('Web Title Pro has been removed from this computer. Saved project files (.json) were not touched.', 'Web Title Pro') | Out-Null",
    );
  }

  if (mode === 'reset' && relaunchExePath) {
    lines.push(
      '',
      '# Relaunch the app for a clean first run.',
      `if (Test-Path -LiteralPath '${escapePs(relaunchExePath)}') { Start-Process -FilePath '${escapePs(relaunchExePath)}' }`,
    );
  }

  lines.push('', '# Self-delete.', 'Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force');
  return lines.join('\r\n');
};

module.exports = {
  UPDATE_LEFTOVER_PREFIX,
  collectCleanupTargets,
  buildCleanupScript,
};
