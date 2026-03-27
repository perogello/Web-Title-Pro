import fs from 'fs-extra';
import path from 'node:path';

const PLACEHOLDER_REPO = 'https://github.com/your-org/web-title-pro';

const normalizeRepoUrl = (value = '') => value.trim().replace(/\/+$/, '');

const parseGithubRepo = (url) => {
  const match = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i.exec(normalizeRepoUrl(url));
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/i, ''),
  };
};

const compareVersions = (left = '', right = '') => {
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
  }

  getState() {
    return {
      currentVersion: this.packageVersion,
      ...this.store.getUpdateConfig(),
    };
  }

  updateConfig(patch = {}) {
    const nextRepoUrl = patch.repoUrl !== undefined ? normalizeRepoUrl(patch.repoUrl) : undefined;

    const next = this.store.updateUpdateConfig({
      ...patch,
      ...(nextRepoUrl !== undefined ? { repoUrl: nextRepoUrl || PLACEHOLDER_REPO } : {}),
    });

    return {
      currentVersion: this.packageVersion,
      ...next,
    };
  }

  async checkForUpdates() {
    const current = this.store.getUpdateConfig();
    const repoUrl = normalizeRepoUrl(current.repoUrl || '');
    const checkedAt = new Date().toISOString();

    if (!repoUrl || repoUrl === PLACEHOLDER_REPO) {
      return this.updateConfig({
        lastCheckAt: checkedAt,
        latestVersion: null,
        available: false,
        status: 'not-configured',
        notes: 'Set the GitHub repository URL to enable update checks.',
      });
    }

    const repo = parseGithubRepo(repoUrl);

    if (!repo) {
      return this.updateConfig({
        lastCheckAt: checkedAt,
        latestVersion: null,
        available: false,
        status: 'unsupported',
        notes: 'Only GitHub repository URLs are supported in this version.',
      });
    }

    try {
      const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Web-Title-Pro-Updater',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}`);
      }

      const payload = await response.json();
      const latestVersion = payload.tag_name || payload.name || this.packageVersion;
      const available = compareVersions(latestVersion, this.packageVersion) > 0;

      return this.updateConfig({
        lastCheckAt: checkedAt,
        latestVersion,
        available,
        status: available ? 'available' : 'up-to-date',
        notes: payload.html_url || 'Latest release checked successfully.',
      });
    } catch (error) {
      return this.updateConfig({
        lastCheckAt: checkedAt,
        latestVersion: null,
        available: false,
        status: 'error',
        notes: error.message || 'Update check failed.',
      });
    }
  }
}
