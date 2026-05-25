import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { TitleStore } from '../server/state/store.js';

const createStubTemplateService = () => ({
  scanTemplates: async () => {},
  getTemplates: () => [
    {
      id: 'builtin:test',
      name: 'Test Template',
      source: 'builtin',
      fields: [{ name: 'title', label: 'Title', defaultValue: '' }],
      timers: [],
      assetUrls: { html: '', css: [], js: [] },
    },
  ],
  getTemplate: (id) => (id === 'builtin:test' ? this.getTemplates?.()[0] : null),
});

const makeStore = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-store-'));
  const stateFile = path.join(dir, 'state.json');
  const templateService = createStubTemplateService();
  templateService.getTemplate = (id) =>
    templateService.getTemplates().find((tpl) => tpl.id === id) || null;
  const store = new TitleStore({ stateFile, templateService });
  await store.init();
  return { store, dir, stateFile };
};

test('program state: vMix entry ON AIR / OFF tracks last command, not reset by reconcile', async () => {
  const { store, dir } = await makeStore();
  try {
    const vmixEntry = store.addEntry({
      entryType: 'vmix',
      templateId: 'vmix',
      name: 'TEST VMIX',
      vmixInputKey: 'test-key',
      vmixInputTitle: 'Test',
      vmixFieldMap: [],
      fields: {},
    });

    store.selectEntry(vmixEntry.id);

    let program = store.getProgram();
    assert.equal(program.visible, false);
    assert.equal(program.lastAction, 'LOAD');
    assert.equal(program.templateId, null, 'vMix entries legitimately have null templateId');

    store.showSelected(vmixEntry.id);
    program = store.getProgram();
    assert.equal(program.visible, true, 'showSelected must set visible=true for vMix entry');
    assert.equal(program.lastAction, 'SHOW');

    // Force another reconcile; previously this rewrote program to visible=false / LOAD
    // because templateId was null and the consistency check used that as 'unloaded' signal.
    store.ensureOutputsConsistent();
    program = store.getProgram();
    assert.equal(program.visible, true, 'reconcile must not flip visible for vMix entry');
    assert.equal(program.lastAction, 'SHOW');

    store.hideProgram();
    program = store.getProgram();
    assert.equal(program.visible, false);
    assert.equal(program.lastAction, 'HIDE');

    store.showSelected(vmixEntry.id);
    program = store.getProgram();
    assert.equal(program.visible, true);
    assert.equal(program.lastAction, 'SHOW');
  } finally {
    await store.close();
    await fs.remove(dir);
  }
});

test('program state: local entry SHOW / HIDE still works after the fix', async () => {
  const { store, dir } = await makeStore();
  try {
    const localEntry = store.addEntry({ templateId: 'builtin:test', name: 'Local' });
    store.selectEntry(localEntry.id);
    store.showSelected(localEntry.id);

    let program = store.getProgram();
    assert.equal(program.visible, true);
    assert.equal(program.lastAction, 'SHOW');
    assert.equal(program.templateId, 'builtin:test');

    store.hideProgram();
    program = store.getProgram();
    assert.equal(program.visible, false);
    assert.equal(program.lastAction, 'HIDE');
  } finally {
    await store.close();
    await fs.remove(dir);
  }
});

test('program state: entry order survives project reload', async () => {
  const { store, dir } = await makeStore();
  try {
    const firstEntry = store.getEntries()[0];
    const secondEntry = store.addEntry({ templateId: 'builtin:test', name: 'Second' });
    const exported = store.exportProjectState();
    const firstPersisted = exported.entries.find((entry) => entry.id === firstEntry.id);
    const secondPersisted = exported.entries.find((entry) => entry.id === secondEntry.id);

    await store.loadProjectState({
      ...exported,
      entries: [
        { ...secondPersisted, createdAt: '2026-01-02T00:00:00.000Z' },
        { ...firstPersisted, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });

    assert.deepEqual(
      store.getEntries().map((entry) => entry.id).slice(0, 2),
      [secondEntry.id, firstEntry.id],
    );
  } finally {
    await store.close();
    await fs.remove(dir);
  }
});

test('program state: hidden entry flag is ignored and not persisted', async () => {
  const { store, dir } = await makeStore();
  try {
    const firstEntry = store.getEntries()[0];
    const secondEntry = store.addEntry({ templateId: 'builtin:test', name: 'Second' });

    store.updateEntry(secondEntry.id, { hidden: true });
    store.selectEntry(firstEntry.id);
    store.selectAdjacentEntry('next');

    assert.equal(store.getSelectedEntry().id, secondEntry.id);

    const exported = store.exportProjectState();
    assert.equal(
      Object.hasOwn(exported.entries.find((entry) => entry.id === secondEntry.id), 'hidden'),
      false,
    );

    await store.loadProjectState({
      ...exported,
      entries: exported.entries.map((entry) => ({ ...entry, hidden: true })),
    });

    assert.equal(
      store.getEntries().some((entry) => Object.hasOwn(entry, 'hidden')),
      false,
    );
  } finally {
    await store.close();
    await fs.remove(dir);
  }
});
