import fs from 'fs-extra';
import path from 'node:path';

export const BUILTIN_REPO_URL = 'https://github.com/perogello/Web-Title-Pro';
const DEFAULT_UPDATE_CHANNEL = 'stable';

export const normalizeRepoUrl = (value = '') => value.trim().replace(/\/+$/, '');

export const parseGithubRepo = (url) => {
  const match = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i.exec(normalizeRepoUrl(url));
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, ''),
  };
};

/**
 * Turn a raw update-check failure into an operator-facing explanation.
 *
 * The GitHub API is called without a token from an in-process fetch, so the
 * failure the operator actually hits is almost never "the release is broken" —
 * it is the network in front of them: a studio proxy, a firewall whitelist,
 * TLS interception, an offline machine, or GitHub's 60 req/h unauthenticated
 * rate limit. Node/undici surfaces all of the connection-level ones as the
 * unhelpful `TypeError: fetch failed`, which is exactly the "update fetch…"
 * string operators reported. Classify it so the UI can say something true and
 * offer the manual-download fallback instead of echoing `fetch failed`.
 *
 * Returns { kind, message } — kind is a stable machine tag, message is the
 * human sentence shown in Settings → Updates and the desktop dialog.
 */
export const describeUpdateError = (error) => {
  const rawMessage = error?.message || String(error || '');
  const causeCode = error?.cause?.code || error?.code || '';
  const haystack = `${rawMessage} ${causeCode} ${error?.name || ''}`.toLowerCase();

  const has = (...needles) => needles.some((needle) => haystack.includes(needle));

  if (error?.name === 'AbortError' || has('timed out', 'etimedout', 'timeout')) {
    return {
      kind: 'timeout',
      message: 'The update check timed out. The network is slow or is blocking GitHub.',
    };
  }

  if (has('403', 'rate limit', 'api rate')) {
    return {
      kind: 'rate-limit',
      message:
        'GitHub temporarily limited update checks from this network (hourly limit). ' +
        'Try again later, or download the release manually.',
    };
  }

  if (has('certificate', 'self-signed', 'self signed', 'unable to verify', 'altnames', 'cert_')) {
    return {
      kind: 'tls',
      message:
        'A network proxy is intercepting the secure connection to GitHub, so the update ' +
        'check could not be trusted. Download the release manually, or check with IT.',
    };
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
    )
  ) {
    return {
      kind: 'network',
      message:
        'GitHub could not be reached from this network. A proxy or firewall may be ' +
        'blocking github.com, or the machine is offline. Download the release manually, ' +
        'or try again on a network that allows GitHub.',
    };
  }

  return {
    kind: 'unknown',
    message: rawMessage || 'The update check failed for an unknown reason.',
  };
};

export const compareVersions = (left = '', right = '') => {
  const normalize = (value) =>
    String(value)
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);

  const leftParts = normalize(left);
  const rightParts = normalize(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index] || 0;
    const b = rightParts[index] || 0;

    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
};

export const selectGithubRelease = (releases = [], channel = DEFAULT_UPDATE_CHANNEL) => {
  const published = Array.isArray(releases) ? releases.filter((release) => !release.draft) : [];
  return channel === 'prerelease'
    ? published[0] || null
    : published.find((release) => !release.prerelease) || null;
};

export class UpdateService {
  constructor({ store, rootDir }) {
    this.store = store;
    this.rootDir = rootDir;
    this.packageVersion = '0.0.0';
  }

  async init() {
    try {
      const packageJson = await fs.readJson(path.join(this.rootDir, 'package.json'));
      this.packageVersion = packageJson.version || '0.0.0';
    } catch {
      this.packageVersion = '0.0.0';
    }

    this.store.updateUpdateConfig({
      repoUrl: BUILTIN_REPO_URL,
      channel: DEFAULT_UPDATE_CHANNEL,
      fixedRepo: true,
      notes: 'Automatic update checks are linked to the built-in GitHub repository.',
    });
  }

  getState() {
    const stored = this.store.getUpdateConfig();
    const hasCurrentOrOlderLatest =
      stored.latestVersion && compareVersions(stored.latestVersion, this.packageVersion) <= 0;
    const normalized = hasCurrentOrOlderLatest && stored.available
      ? { ...stored, available: false, status: 'up-to-date' }
      : stored;

    return {
      currentVersion: this.packageVersion,
      repoUrl: BUILTIN_REPO_URL,
      fixedRepo: true,
      ...normalized,
    };
  }

  updateConfig(patch = {}) {
    const next = this.store.updateUpdateConfig({
      ...patch,
      repoUrl: BUILTIN_REPO_URL,
      fixedRepo: true,
      channel: patch.channel || this.store.getUpdateConfig().channel || DEFAULT_UPDATE_CHANNEL,
    });

    return {
      currentVersion: this.packageVersion,
      repoUrl: BUILTIN_REPO_URL,
      fixedRepo: true,
      ...next,
    };
  }

  async checkForUpdates() {
    const current = this.store.getUpdateConfig();
    const repoUrl = normalizeRepoUrl(BUILTIN_REPO_URL);
    const channel = current.channel || DEFAULT_UPDATE_CHANNEL;
    const checkedAt = new Date().toISOString();

    const repo = parseGithubRepo(repoUrl);

    if (!repo) {
      return this.updateConfig({
        lastCheckAt: checkedAt,
        latestVersion: null,
        available: false,
        status: 'unsupported',
        notes: 'Only GitHub repository URLs are supported in this version.',
        releaseUrl: null,
        assetName: null,
        assetUrl: null,
      });
    }

    // 15s is generous for the GitHub API; without a timeout a hung fetch
    // would silently stall the Settings → Updates check forever.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Web-Title-Pro-Updater',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}`);
      }

      const payload = await response.json();
      const selectedRelease = selectGithubRelease(payload, channel);

      if (!selectedRelease) {
        return this.updateConfig({
          lastCheckAt: checkedAt,
          latestVersion: null,
          available: false,
          status: 'no-releases',
          notes: 'No published releases were found in the update channel.',
          releaseUrl: null,
          assetName: null,
          assetUrl: null,
        });
      }

      const latestVersion = selectedRelease.tag_name || selectedRelease.name || this.packageVersion;
      const available = compareVersions(latestVersion, this.packageVersion) > 0;
      const portableAsset =
        (selectedRelease.assets || []).find((asset) => /WebTitlePro-.*\.exe$/i.test(asset.name || '')) ||
        (selectedRelease.assets || []).find((asset) => /\.exe$/i.test(asset.name || '')) ||
        null;

      return this.updateConfig({
        lastCheckAt: checkedAt,
        latestVersion,
        available,
        status: available ? 'available' : 'up-to-date',
        errorKind: null,
        notes: selectedRelease.html_url || 'Latest release checked successfully.',
        releaseName: selectedRelease.name || latestVersion,
        releaseUrl: selectedRelease.html_url || null,
        prerelease: Boolean(selectedRelease.prerelease),
        publishedAt: selectedRelease.published_at || null,
        assetName: portableAsset?.name || null,
        assetUrl: portableAsset?.browser_download_url || null,
        assetSize: portableAsset?.size || null,
      });
    } catch (error) {
      const described = describeUpdateError(error);
      return this.updateConfig({
        lastCheckAt: checkedAt,
        latestVersion: null,
        available: false,
        status: 'error',
        errorKind: described.kind,
        notes: described.message,
        // Even when the API call failed, point the UI at the releases page so
        // the operator has a working "download manually" fallback target.
        releaseUrl: `${BUILTIN_REPO_URL}/releases`,
        assetName: null,
        assetUrl: null,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
