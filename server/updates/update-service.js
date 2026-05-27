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
      const isAbort = error?.name === 'AbortError';
      return this.updateConfig({
        lastCheckAt: checkedAt,
        latestVersion: null,
        available: false,
        status: 'error',
        notes: isAbort ? 'Update check timed out.' : (error.message || 'Update check failed.'),
        releaseUrl: null,
        assetName: null,
        assetUrl: null,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
