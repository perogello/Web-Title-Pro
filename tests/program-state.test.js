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

test('program state: editing fields never mutates the VISIBLE program (no live leak)', async () => {
  const { store, dir } = await makeStore();
  try {
    const entry = store.addEntry({ templateId: 'builtin:test', name: 'On Air', fields: { title: 'ORIGINAL' } });
    store.selectEntry(entry.id);
    store.showSelected(entry.id);

    let program = store.getProgram();
    assert.equal(program.visible, true);
    assert.equal(program.fields.title, 'ORIGINAL');

    // Edit the entry's fields while it is ON AIR. The visible program must NOT change.
    store.updateEntry(entry.id, { fields: { title: 'EDITED' } });

    program = store.getProgram();
    assert.equal(program.visible, true, 'program stays on air');
    assert.equal(program.fields.title, 'ORIGINAL', 'visible program fields must not change from an edit');

    // The entry itself does hold the new value (so an explicit Update/Live can take it).
    assert.equal(store.getEntry(entry.id).fields.title, 'EDITED');

    // Once hidden, editing loads the new value into the (hidden) program for the next show.
    store.hideProgram();
    store.updateEntry(entry.id, { fields: { title: 'NEXT' } });
    program = store.getProgram();
    assert.equal(program.visible, false);
    assert.equal(program.fields.title, 'NEXT', 'hidden program may stage edits for the next show');
  } finally {
    await store.close();
    await fs.remove(dir);
  }
});

test('program state: duplicateEntry clones fields/styles, resets shortcuts, inserts after original', async () => {
  const { store, dir } = await makeStore();
  try {
    const original = store.addEntry({
      templateId: 'builtin:test',
      name: 'Original',
      fields: { title: 'Hello' },
      shortcuts: { show: 'F1', live: 'F2', hide: 'F3' },
    });
    store.addEntry({ templateId: 'builtin:test', name: 'After' });

    const clone = store.duplicateEntry(original.id);

    assert.notEqual(clone.id, original.id);
    assert.equal(clone.name, 'Original copy');
    assert.deepEqual(clone.fields, { title: 'Hello' });
    assert.deepEqual(clone.shortcuts, { show: '', live: '', hide: '' }, 'duplicate must not inherit per-entry shortcuts');

    const ids = store.getEntries().map((entry) => entry.id);
    assert.equal(ids[ids.indexOf(original.id) + 1], clone.id, 'duplicate is inserted right after the original');

    // Mutating the clone's fields must not affect the original (deep clone, not a shared reference).
    store.updateEntry(clone.id, { fields: { title: 'Changed' } });
    assert.equal(store.getEntry(original.id).fields.title, 'Hello');
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

test('program state: adding titles and outputs does not rewrite existing output assignments', async () => {
  const { store, dir } = await makeStore();
  try {
    const firstEntry = store.getEntries()[0];
    const secondEntry = store.addEntry({ templateId: 'builtin:test', name: 'Second' });
    const output1 = store.getSnapshot().outputs[0];

    store.selectEntry(firstEntry.id, output1.id);
    assert.equal(store.getOutputByRef(output1.id).selectedEntryId, firstEntry.id);

    const output2 = store.createOutput({ name: 'OUTPUT 2' });
    assert.equal(store.getOutputByRef(output1.id).selectedEntryId, firstEntry.id);
    assert.equal(output2.selectedEntryId, null);

    const thirdEntry = store.addEntry({ templateId: 'builtin:test', name: 'Third' });
    assert.equal(store.getOutputByRef(output1.id).selectedEntryId, firstEntry.id);
    assert.equal(store.getOutputByRef(output2.id).selectedEntryId, null);
    assert.equal(store.getEntries().some((entry) => entry.id === secondEntry.id), true);
    assert.equal(store.getEntries().some((entry) => entry.id === thirdEntry.id), true);

    store.selectEntry(secondEntry.id, output2.id);
    assert.equal(store.getOutputByRef(output1.id).selectedEntryId, firstEntry.id);
    assert.equal(store.getOutputByRef(output2.id).selectedEntryId, secondEntry.id);
  } finally {
    await store.close();
    await fs.remove(dir);
  }
});
