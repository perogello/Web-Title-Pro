import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareVersions,
  parseGithubRepo,
  normalizeRepoUrl,
  selectGithubRelease,
  describeUpdateError,
  UpdateService,
} from '../server/updates/update-service.js';

test('compareVersions: numeric comparison', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.2.3', '1.2.4'), -1);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
});

test('compareVersions: handles v prefix', () => {
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
});

test('compareVersions: handles unequal segment counts', () => {
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.1', '1.0'), 1);
});

test('compareVersions: 0.2.12 vs 0.2.9', () => {
  assert.equal(compareVersions('0.2.12', '0.2.9'), 1);
});

test('parseGithubRepo: typical URL', () => {
  assert.deepEqual(parseGithubRepo('https://github.com/perogello/Web-Title-Pro'), {
    owner: 'perogello',
    repo: 'Web-Title-Pro',
  });
});

test('parseGithubRepo: trailing slash and .git suffix', () => {
  assert.deepEqual(parseGithubRepo('https://github.com/foo/bar.git/'), {
    owner: 'foo',
    repo: 'bar',
  });
});

test('parseGithubRepo: rejects non-github urls', () => {
  assert.equal(parseGithubRepo('https://gitlab.com/foo/bar'), null);
  assert.equal(parseGithubRepo('not-a-url'), null);
});

test('normalizeRepoUrl: trims and strips trailing slash', () => {
  assert.equal(normalizeRepoUrl('  https://github.com/foo/bar/  '), 'https://github.com/foo/bar');
});

test('selectGithubRelease: stable ignores newer prerelease', () => {
  const releases = [
    { tag_name: 'v0.4.4-beta', prerelease: true, draft: false },
    { tag_name: 'v0.4.3', prerelease: false, draft: false },
    { tag_name: 'v0.4.2', prerelease: true, draft: false },
  ];

  assert.equal(selectGithubRelease(releases, 'stable').tag_name, 'v0.4.3');
});

test('selectGithubRelease: prerelease channel can use newest prerelease', () => {
  const releases = [
    { tag_name: 'v0.4.4-beta', prerelease: true, draft: false },
    { tag_name: 'v0.4.3', prerelease: false, draft: false },
  ];

  assert.equal(selectGithubRelease(releases, 'prerelease').tag_name, 'v0.4.4-beta');
});

test('selectGithubRelease: ignores drafts', () => {
  const releases = [
    { tag_name: 'v9.9.9', prerelease: false, draft: true },
    { tag_name: 'v0.4.3', prerelease: false, draft: false },
  ];

  assert.equal(selectGithubRelease(releases, 'stable').tag_name, 'v0.4.3');
});

test('UpdateService.checkForUpdates: 0.4.2 sees 0.4.3 stable asset', async () => {
  const originalFetch = globalThis.fetch;
  const store = {
    config: { channel: 'stable' },
    getUpdateConfig() {
      return { ...this.config };
    },
    updateUpdateConfig(patch) {
      this.config = { ...this.config, ...patch };
      return { ...this.config };
    },
  };

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [
      {
        tag_name: 'v0.4.3',
        name: 'Web Title Pro v0.4.3',
        prerelease: false,
        draft: false,
        html_url: 'https://github.com/perogello/Web-Title-Pro/releases/tag/v0.4.3',
        published_at: '2026-05-26T13:35:59Z',
        assets: [
          {
            name: 'WebTitlePro-0.4.3.exe',
            browser_download_url: 'https://example.test/WebTitlePro-0.4.3.exe',
            size: 95150798,
          },
        ],
      },
      { tag_name: 'v0.4.2', prerelease: true, draft: false, assets: [] },
    ],
  });

  try {
    const service = new UpdateService({ store, rootDir: process.cwd() });
    await service.init();
    service.packageVersion = '0.4.2';
    const result = await service.checkForUpdates();

    assert.equal(result.latestVersion, 'v0.4.3');
    assert.equal(result.available, true);
    assert.equal(result.status, 'available');
    assert.equal(result.prerelease, false);
    assert.equal(result.assetName, 'WebTitlePro-0.4.3.exe');
    assert.equal(result.assetSize, 95150798);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('UpdateService.checkForUpdates: 0.4.3 is up to date', async () => {
  const originalFetch = globalThis.fetch;
  const store = {
    config: { channel: 'stable' },
    getUpdateConfig() {
      return { ...this.config };
    },
    updateUpdateConfig(patch) {
      this.config = { ...this.config, ...patch };
      return { ...this.config };
    },
  };

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [
      {
        tag_name: 'v0.4.3',
        name: 'Web Title Pro v0.4.3',
        prerelease: false,
        draft: false,
        assets: [{ name: 'WebTitlePro-0.4.3.exe', browser_download_url: 'https://example.test/app.exe' }],
      },
    ],
  });

  try {
    const service = new UpdateService({ store, rootDir: process.cwd() });
    await service.init();
    service.packageVersion = '0.4.3';
    const result = await service.checkForUpdates();

    assert.equal(result.latestVersion, 'v0.4.3');
    assert.equal(result.available, false);
    assert.equal(result.status, 'up-to-date');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('UpdateService.getState: stale available flag is normalized after app update', () => {
  const store = {
    config: {
      channel: 'stable',
      latestVersion: 'v0.4.6',
      available: true,
      status: 'available',
    },
    getUpdateConfig() {
      return { ...this.config };
    },
    updateUpdateConfig(patch) {
      this.config = { ...this.config, ...patch };
      return { ...this.config };
    },
  };

  const service = new UpdateService({ store, rootDir: process.cwd() });
  service.packageVersion = '0.4.6';
  const result = service.getState();

  assert.equal(result.currentVersion, '0.4.6');
  assert.equal(result.latestVersion, 'v0.4.6');
  assert.equal(result.available, false);
  assert.equal(result.status, 'up-to-date');
});

test('describeUpdateError: classifies undici "fetch failed" as network', () => {
  const network = describeUpdateError(new TypeError('fetch failed'));
  assert.equal(network.kind, 'network');
  assert.match(network.message, /could not be reached/i);
});

test('describeUpdateError: classifies rate limit, timeout and TLS', () => {
  assert.equal(describeUpdateError(new Error('GitHub returned 403')).kind, 'rate-limit');

  const abort = new Error('aborted');
  abort.name = 'AbortError';
  assert.equal(describeUpdateError(abort).kind, 'timeout');

  assert.equal(
    describeUpdateError(new Error('unable to verify the first certificate')).kind,
    'tls',
  );
});

test('describeUpdateError: reads DNS failure from error.cause.code', () => {
  const err = new TypeError('fetch failed');
  err.cause = { code: 'ENOTFOUND' };
  assert.equal(describeUpdateError(err).kind, 'network');
});

test('describeUpdateError: unknown falls back to raw message', () => {
  const result = describeUpdateError(new Error('something odd happened'));
  assert.equal(result.kind, 'unknown');
  assert.equal(result.message, 'something odd happened');
});

test('UpdateService.checkForUpdates: network failure yields friendly error + release fallback', async () => {
  const originalFetch = globalThis.fetch;
  const store = {
    config: { channel: 'stable' },
    getUpdateConfig() {
      return { ...this.config };
    },
    updateUpdateConfig(patch) {
      this.config = { ...this.config, ...patch };
      return { ...this.config };
    },
  };

  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };

  try {
    const service = new UpdateService({ store, rootDir: process.cwd() });
    await service.init();
    service.packageVersion = '0.4.11';
    const result = await service.checkForUpdates();

    assert.equal(result.status, 'error');
    assert.equal(result.errorKind, 'network');
    assert.equal(result.available, false);
    assert.match(result.notes, /could not be reached/i);
    // The UI needs a working "download manually" target even on failure.
    assert.equal(result.releaseUrl, 'https://github.com/perogello/Web-Title-Pro/releases');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
