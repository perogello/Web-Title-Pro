import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, parseGithubRepo, normalizeRepoUrl } from '../server/updates/update-service.js';

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
