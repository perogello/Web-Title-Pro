// Pure, electron-free helpers for the auto-updater. Kept in their own module so
// they can be unit-tested without loading electron-updater (which touches the
// Electron `app` at require time and can't run under plain `node --test`).

const fs = require('node:fs');
const path = require('node:path');

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

// Turn undici/electron-updater network failures into an actionable sentence
// instead of the useless "fetch failed".
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

// Leftover helper files the OLD portable updater wrote to %TEMP% (its detached
// PowerShell/VBS apply-update helpers). electron-updater manages its own cache,
// so these only ever linger for someone migrating off the portable build.
const isLegacyScratchFile = (name = '') =>
  /^web-title-pro-(apply-update|update-status)-\d+\.(ps1|vbs|log|json)$/i.test(name);

// Remove stale portable-updater leftovers so a portable->NSIS migration does not
// keep orphaned ~91 MB *.download blobs and helper scripts forever. Best-effort.
const cleanupLegacyPortableScratch = ({ userDataDir, tempDir }) => {
  try {
    const updatesDir = path.join(userDataDir, 'updates');
    for (const name of fs.readdirSync(updatesDir)) {
      if (name.endsWith('.download')) {
        try { fs.rmSync(path.join(updatesDir, name), { force: true }); } catch {}
      }
    }
  } catch {}
  try {
    for (const name of fs.readdirSync(tempDir)) {
      if (isLegacyScratchFile(name)) {
        try { fs.rmSync(path.join(tempDir, name), { force: true }); } catch {}
      }
    }
  } catch {}
};

module.exports = {
  parseVersion,
  isNewer,
  describeNetworkError,
  isLegacyScratchFile,
  cleanupLegacyPortableScratch,
};
