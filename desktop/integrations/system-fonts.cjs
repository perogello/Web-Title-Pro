const { spawn } = require('node:child_process');

const FONT_QUERY_SCRIPT = [
  '$ErrorActionPreference = \'Stop\'',
  '$OutputEncoding = [System.Text.Encoding]::UTF8',
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  '$fontNames = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)',
  '$fontFiles = @{}',
  'function Add-FontName($value) {',
  '  $name = [string]$value',
  '  if ([string]::IsNullOrWhiteSpace($name)) { return }',
  '  $normalized = ($name -replace \'\\s*\\(.*?\\)\\s*$\', \'\').Trim()',
  '  if ([string]::IsNullOrWhiteSpace($normalized)) { return }',
  '  [void]$fontNames.Add($normalized)',
  '}',
  'function Add-FontFile($name, $filePath) {',
  '  Add-FontName $name',
  '  $normalized = (($name -replace \'\\s*\\(.*?\\)\\s*$\', \'\').Trim())',
  '  if ([string]::IsNullOrWhiteSpace($normalized) -or [string]::IsNullOrWhiteSpace([string]$filePath)) { return }',
  '  if (-not $fontFiles.ContainsKey($normalized)) { $fontFiles[$normalized] = New-Object System.Collections.Generic.List[string] }',
  '  if (-not $fontFiles[$normalized].Contains($filePath)) { [void]$fontFiles[$normalized].Add($filePath) }',
  '}',
  '$fontDirectories = @((Join-Path $env:WINDIR \'Fonts\'), (Join-Path $env:LOCALAPPDATA \'Microsoft\\Windows\\Fonts\'))',
  'function Resolve-FontPath($value) {',
  '  $raw = [string]$value',
  '  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }',
  '  if (Test-Path $raw) { return (Resolve-Path $raw).Path }',
  '  foreach ($fontDirectory in $fontDirectories) {',
  '    if ([string]::IsNullOrWhiteSpace($fontDirectory) -or -not (Test-Path $fontDirectory)) { continue }',
  '    $candidate = Join-Path $fontDirectory $raw',
  '    if (Test-Path $candidate) { return (Resolve-Path $candidate).Path }',
  '  }',
  '  return $null',
  '}',
  'function Add-FontNamesFromFile($filePath) {',
  '  try {',
  '    if (-not (Test-Path $filePath)) { return }',
  '    $privateFonts = New-Object System.Drawing.Text.PrivateFontCollection',
  '    $privateFonts.AddFontFile($filePath)',
  '    $privateFonts.Families | Select-Object -ExpandProperty Name | ForEach-Object { Add-FontFile $_ $filePath }',
  '  } catch {}',
  '}',
  'Add-Type -AssemblyName System.Drawing',
  '$fonts = New-Object System.Drawing.Text.InstalledFontCollection',
  '$fonts.Families | Select-Object -ExpandProperty Name | ForEach-Object { Add-FontName $_ }',
  '$fontRegistryPaths = @(\'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\', \'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts\')',
  'foreach ($path in $fontRegistryPaths) {',
  '  if (-not (Test-Path $path)) { continue }',
  '  $properties = (Get-ItemProperty $path).PSObject.Properties | Where-Object { $_.Name -notmatch \'^PS\' }',
  '  foreach ($property in $properties) {',
  '    Add-FontName $property.Name',
  '    $resolvedFontPath = Resolve-FontPath $property.Value',
  '    if ($resolvedFontPath) { Add-FontFile $property.Name $resolvedFontPath }',
  '  }',
  '}',
  'foreach ($fontDirectory in $fontDirectories) {',
  '  if (-not (Test-Path $fontDirectory)) { continue }',
  '  foreach ($fontFile in (Get-ChildItem $fontDirectory -File -ErrorAction SilentlyContinue)) {',
  '    if ($fontFile.Extension -match \'^\\.(ttf|otf|ttc|otc)$\') { Add-FontNamesFromFile $fontFile.FullName }',
  '  }',
  '}',
  '$fontFileMap = @{}',
  'foreach ($entry in $fontFiles.GetEnumerator()) { $fontFileMap[$entry.Key] = @($entry.Value | Select-Object -Unique) }',
  '@{ fonts = @($fontNames | Sort-Object -Unique); fontFiles = $fontFileMap } | ConvertTo-Json -Compress -Depth 6',
].join('; ');

const DEFAULT_FONTS = [
  'Arial',
  'Arial Black',
  'Bahnschrift',
  'Calibri',
  'Cambria',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Georgia',
  'Impact',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Verdana',
];

const normalizeFontList = (value) =>
  [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

const normalizeFontFiles = (value = {}) =>
  Object.fromEntries(
    Object.entries(value && typeof value === 'object' ? value : {})
      .map(([fontName, filePaths]) => [
        String(fontName || '').trim(),
        [...new Set((Array.isArray(filePaths) ? filePaths : [])
          .map((item) => String(item || '').trim())
          .filter(Boolean))],
      ])
      .filter(([fontName, filePaths]) => fontName && filePaths.length),
  );

const runPowerShell = (command, timeoutMs = 12000) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) {
        return;
      }
      finished = true;
      child.kill();
      reject(new Error('System font query timed out.'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);

      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}.`));
        return;
      }

      resolve(stdout.trim());
    });
  });

const createSystemFontsIntegration = () => {
  let cachedFonts = null;
  let cachedFontFiles = null;
  let cachedAt = 0;
  let inflightPromise = null;

  const queryFonts = async () => {
    const raw = await runPowerShell(FONT_QUERY_SCRIPT);
    const parsed = JSON.parse(raw || '{}');
    return {
      fonts: normalizeFontList(Array.isArray(parsed?.fonts) ? parsed.fonts : []),
      fontFiles: normalizeFontFiles(parsed?.fontFiles || {}),
    };
  };

  const getFonts = async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && cachedFonts && now - cachedAt < 10 * 60 * 1000) {
      return { fonts: cachedFonts, fontFiles: cachedFontFiles || {}, fallback: false };
    }

    if (!force && inflightPromise) {
      return inflightPromise;
    }

    inflightPromise = queryFonts()
      .then(({ fonts, fontFiles }) => {
        const nextFonts = fonts.length ? fonts : DEFAULT_FONTS;
        cachedFonts = nextFonts;
        cachedFontFiles = fontFiles;
        cachedAt = Date.now();
        return { fonts: nextFonts, fontFiles, fallback: fonts.length === 0 };
      })
      .catch(() => ({
        fonts: cachedFonts?.length ? cachedFonts : DEFAULT_FONTS,
        fontFiles: cachedFontFiles || {},
        fallback: true,
      }))
      .finally(() => {
        inflightPromise = null;
      });

    return inflightPromise;
  };

  return {
    getFonts,
  };
};

module.exports = {
  createSystemFontsIntegration,
};
