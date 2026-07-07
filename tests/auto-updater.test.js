import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  parseVersion,
  isNewer,
  describeNetworkError,
  isNoReleaseError,
  isLegacyScratchFile,
  cleanupLegacyPortableScratch,
} = require('../desktop/integrations/auto-updater-utils.cjs');

test('parseVersion: strips v prefix, coerces junk to 0', () => {
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion('0.5.0'), [0, 5, 0]);
  assert.deepEqual(parseVersion(''), [0]);
  assert.deepEqual(parseVersion('1.x.3'), [1, 0, 3]);
});

test('isNewer: numeric compare, not lexical (0.5.10 > 0.5.9)', () => {
  assert.equal(isNewer('0.5.10', '0.5.9'), true); // lexical would say false
  assert.equal(isNewer('0.5.0', '0.5.10'), false);
  assert.equal(isNewer('1.0.0', '0.9.9'), true);
  assert.equal(isNewer('0.5.0', '0.5.0'), false); // equal is not newer
  assert.equal(isNewer('v0.6.0', '0.5.11'), true);
  assert.equal(isNewer('0.5', '0.5.0'), false); // shorter, equal
});

test('describeNetworkError: classifies the common failures', () => {
  assert.match(describeNetworkError(new TypeError('fetch failed')), /could not be reached/i);
  assert.match(describeNetworkError(new Error('GitHub returned 403')), /hourly limit/i);
  assert.match(describeNetworkError(new Error('unable to verify the first certificate')), /proxy is intercepting/i);
  const abort = new Error('aborted');
  abort.name = 'AbortError';
  assert.match(describeNetworkError(abort), /timed out/i);
});

test('describeNetworkError: reads DNS code from error.cause and falls back to raw', () => {
  const dns = new TypeError('fetch failed');
  dns.cause = { code: 'ENOTFOUND' };
  assert.match(describeNetworkError(dns), /could not be reached/i);
  assert.equal(describeNetworkError(new Error('something odd')), 'something odd');
});

test('describeNetworkError: a release-download URL in a 404 is NOT read as a network failure', () => {
  // Regression: the bare "download" needle matched "/releases/download/" in the
  // URL and mislabeled a missing-manifest 404 as "GitHub could not be reached".
  const err = new Error(
    'Cannot find latest.yml in the latest release artifacts (https://github.com/o/r/releases/download/v1/latest.yml): HttpError: 404',
  );
  assert.doesNotMatch(describeNetworkError(err), /could not be reached/i);
  // A genuine download failure is still classified as a reachability problem.
  assert.match(describeNetworkError(new Error('Download failed with 500')), /could not be reached/i);
});

test('isNoReleaseError: recognizes a missing/unpublished update manifest', () => {
  assert.equal(
    isNoReleaseError(new Error('Cannot find latest.yml in the latest release artifacts (...): HttpError: 404')),
    true,
  );
  assert.equal(isNoReleaseError(new Error('No published versions on GitHub')), true);
  assert.equal(isNoReleaseError(new TypeError('fetch failed')), false);
  assert.equal(isNoReleaseError(new Error('ECONNREFUSED')), false);
});

test('isLegacyScratchFile: matches only old portable helper files', () => {
  assert.equal(isLegacyScratchFile('web-title-pro-apply-update-1712345678.ps1'), true);
  assert.equal(isLegacyScratchFile('web-title-pro-update-status-9.vbs'), true);
  assert.equal(isLegacyScratchFile('web-title-pro-apply-update-1.json'), true);
  assert.equal(isLegacyScratchFile('web-title-pro-cleanup-1.ps1'), false); // different prefix
  assert.equal(isLegacyScratchFile('random.ps1'), false);
  assert.equal(isLegacyScratchFile(''), false);
});

test('cleanupLegacyPortableScratch: removes *.download + scratch files, keeps the rest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wtp-cleanup-'));
  const userDataDir = path.join(root, 'userData');
  const tempDir = path.join(root, 'temp');
  fs.mkdirSync(path.join(userDataDir, 'updates'), { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  fs.writeFileSync(path.join(userDataDir, 'updates', 'WebTitlePro-0.4.10.exe.download'), 'x');
  fs.writeFileSync(path.join(userDataDir, 'updates', 'keep.txt'), 'x');
  fs.writeFileSync(path.join(tempDir, 'web-title-pro-apply-update-42.ps1'), 'x');
  fs.writeFileSync(path.join(tempDir, 'unrelated.tmp'), 'x');

  cleanupLegacyPortableScratch({ userDataDir, tempDir });

  assert.equal(fs.existsSync(path.join(userDataDir, 'updates', 'WebTitlePro-0.4.10.exe.download')), false);
  assert.equal(fs.existsSync(path.join(userDataDir, 'updates', 'keep.txt')), true);
  assert.equal(fs.existsSync(path.join(tempDir, 'web-title-pro-apply-update-42.ps1')), false);
  assert.equal(fs.existsSync(path.join(tempDir, 'unrelated.tmp')), true);

  fs.rmSync(root, { recursive: true, force: true });
});

test('cleanupLegacyPortableScratch: tolerates missing dirs', () => {
  assert.doesNotThrow(() =>
    cleanupLegacyPortableScratch({ userDataDir: path.join(os.tmpdir(), 'nope-xyz'), tempDir: path.join(os.tmpdir(), 'nope-abc') }),
  );
});
