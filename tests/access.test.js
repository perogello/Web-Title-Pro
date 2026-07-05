import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { TitleStore } from '../server/state/store.js';
import {
  normalizeCapabilities,
  normalizeGrant,
  hasCapability,
  publicGrant,
} from '../server/state/access.js';

const makeTemplateService = () => ({
  scanTemplates: async () => {},
  getTemplates: () => [],
  getTemplate: () => null,
});

const makeStore = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-acc-'));
  const stateFile = path.join(dir, 'state.json');
  const store = new TitleStore({ stateFile, templateService: makeTemplateService() });
  await store.init();
  return { store, dir, stateFile };
};

test('normalizeCapabilities keeps only known caps, deduped', () => {
  assert.deepEqual(
    normalizeCapabilities(['state:read', 'bogus', 'command:send', 'state:read']),
    ['state:read', 'command:send'],
  );
  assert.deepEqual(normalizeCapabilities('nope'), []);
});

test('normalizeGrant fills id/token/createdAt and filters caps', () => {
  const g = normalizeGrant({ name: '  Scores  ', capabilities: ['command:send', 'x'] });
  assert.equal(g.name, 'Scores');
  assert.ok(g.id);
  assert.ok(g.token.startsWith('wtp_'));
  assert.deepEqual(g.capabilities, ['command:send']);
  assert.equal(typeof g.createdAt, 'number');
});

test('publicGrant hides the raw token', () => {
  const g = normalizeGrant({ name: 'x', capabilities: [] });
  const pub = publicGrant(g);
  assert.equal(pub.token, undefined);
  assert.ok(pub.tokenPreview.endsWith('…'));
});

test('store: create → list (no token) → resolve → capability → revoke', async () => {
  const { store, dir } = await makeStore();
  try {
    const created = store.createAccessGrant({ name: 'Sports', capabilities: ['state:read', 'command:send'] });
    assert.ok(created.token);

    const listed = store.listAccessGrants();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].token, undefined, 'listing must not leak the token');

    assert.ok(store.grantHasCapability(created.token, 'command:send'));
    assert.equal(store.grantHasCapability('wtp_wrong', 'command:send'), false);
    assert.equal(store.grantHasCapability(created.token, 'nope'), false);

    store.revokeAccessGrant(created.id);
    assert.equal(store.listAccessGrants().length, 0);
    assert.equal(store.resolveGrantByToken(created.token), null);
  } finally {
    await fs.remove(dir);
  }
});

test('store: grants persist across reload but never appear in the WS snapshot', async () => {
  const { store, dir, stateFile } = await makeStore();
  try {
    const created = store.createAccessGrant({ name: 'Panel', capabilities: ['state:read'] });
    // Snapshot (broadcast to everyone) must not carry access/tokens.
    assert.equal(store.getSnapshot().access, undefined);

    await store.persist?.();
    const reopened = new TitleStore({ stateFile, templateService: makeTemplateService() });
    await reopened.init();
    assert.ok(reopened.grantHasCapability(created.token, 'state:read'));
  } finally {
    await fs.remove(dir);
  }
});

test('store: project export strips access; project import does not adopt grants', async () => {
  const { store, dir } = await makeStore();
  try {
    store.createAccessGrant({ name: 'Secret', capabilities: ['command:send'] });
    const exported = store.exportProjectState();
    assert.equal(exported.access, undefined, 'exported project must not contain grants');

    // A crafted project trying to inject a grant is ignored on import.
    await store.loadProjectState({ access: { grants: [{ name: 'Injected', token: 'wtp_evil', capabilities: ['command:send'] }] } });
    assert.equal(store.grantHasCapability('wtp_evil', 'command:send'), false);
    assert.equal(store.listAccessGrants().length, 0);
  } finally {
    await fs.remove(dir);
  }
});
