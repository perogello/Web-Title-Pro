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

test('init: corrupt state.json is quarantined to a .corrupt-*.bak, not silently lost', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-corrupt-'));
  const stateFile = path.join(dir, 'state.json');
  await fs.writeFile(stateFile, '{ this is not : json !!!', 'utf8');

  const templateService = createStubTemplateService();
  templateService.getTemplate = (id) =>
    templateService.getTemplates().find((tpl) => tpl.id === id) || null;
  const store = new TitleStore({ stateFile, templateService });

  try {
    await store.init();
    // The store must fall back to a working default state...
    assert.ok(Array.isArray(store.getSnapshot().entries));
    // ...and preserve the unreadable original next to it.
    const backups = (await fs.readdir(dir)).filter((name) => /state\.json\.corrupt-\d+\.bak/.test(name));
    assert.equal(backups.length, 1);
    const preserved = await fs.readFile(path.join(dir, backups[0]), 'utf8');
    assert.equal(preserved, '{ this is not : json !!!');
  } finally {
    await store.close?.();
    await fs.remove(dir);
  }
});

test('init: empty state.json (fresh install) does not create a corrupt backup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-fresh-'));
  const stateFile = path.join(dir, 'state.json');

  const templateService = createStubTemplateService();
  templateService.getTemplate = (id) =>
    templateService.getTemplates().find((tpl) => tpl.id === id) || null;
  const store = new TitleStore({ stateFile, templateService });

  try {
    await store.init();
    const backups = (await fs.readdir(dir)).filter((name) => name.includes('.corrupt-'));
    assert.equal(backups.length, 0);
  } finally {
    await store.close?.();
    await fs.remove(dir);
  }
});

test('shortcuts v2: nested per-output/per-timer patches merge without clobbering', async () => {
  const { store, dir } = await makeStore();
  try {
    store.updateNavigationShortcuts({ outputs: { main: { titleIn: 'F5' } } });
    store.updateNavigationShortcuts({ outputs: { main: { titleOut: 'F6' } } });
    store.updateNavigationShortcuts({ outputs: { aux: { titleIn: 'F7' } } });
    store.updateNavigationShortcuts({ timers: { t1: { start: 'Space' } } });
    store.updateNavigationShortcuts({ global: { allOutputsOut: 'Escape' } });
    store.updateNavigationShortcuts({ globalActions: { 'output:main:titleIn': true } });

    const s = store.getNavigationShortcuts();
    // Setting titleOut must NOT wipe titleIn on the same output.
    assert.equal(s.outputs.main.titleIn, 'F5');
    assert.equal(s.outputs.main.titleOut, 'F6');
    // A different output is untouched.
    assert.equal(s.outputs.aux.titleIn, 'F7');
    assert.equal(s.timers.t1.start, 'Space');
    assert.equal(s.global.allOutputsOut, 'Escape');
    assert.equal(s.globalActions['output:main:titleIn'], true);
    // All command keys are present and normalized to strings.
    assert.equal(s.outputs.main.previewIn, '');
    assert.equal(s.timers.t1.reset, '');
  } finally {
    await fs.remove(dir);
  }
});

test('shortcuts v2: legacy flat bindings load without crashing and reset to empty', async () => {
  const { store, dir } = await makeStore();
  try {
    // Simulate a project saved by the old flat model.
    store.updateNavigationShortcuts({});
    store.state.integrations.shortcuts = {
      show: 'Ctrl+S',
      hide: 'Ctrl+H',
      outputSelectById: { 'output-1': 'Ctrl+1' },
      timerToggleById: { main: 'Space' },
      globalActions: { show: true },
    };
    const s = store.getNavigationShortcuts();
    // New shape is always present; unknown legacy keys are dropped.
    assert.deepEqual(Object.keys(s).sort(), ['global', 'globalActions', 'outputs', 'timers']);
    assert.equal(s.show, undefined);
    assert.deepEqual(s.outputs, {});
    assert.deepEqual(s.timers, {});
  } finally {
    await fs.remove(dir);
  }
});

test('sources: replaceSources normalizes rows/columns and appears in snapshot', async () => {
  const { store, dir } = await makeStore();
  try {
    const result = store.replaceSources([
      {
        name: 'Guests',
        delimiter: '|',
        columns: [{ label: 'Name' }, { label: 'Role' }],
        linkedTimerByOutput: { 'output-main': 'main', '': 'ignored' },
        rows: [
          { values: ['Alice', 'Host'] },
          { id: 'r2', index: 2, values: ['Bob', 'Guest'], timer: { baseMs: 5000, format: 'mm:ss' } },
        ],
      },
    ]);
    // Returned + snapshot copies are normalized and consistent.
    const snap = store.getSnapshot();
    assert.equal(snap.sources.length, 1);
    const src = snap.sources[0];
    assert.ok(src.id, 'source gets an id');
    assert.equal(src.name, 'Guests');
    assert.equal(src.columns.length, 2);
    assert.equal(src.rows.length, 2);
    // Auto id + auto label for the first row.
    assert.ok(src.rows[0].id);
    assert.equal(src.rows[0].label, 'Alice | Host');
    assert.equal(src.rows[0].index, 1);
    // Explicit row fields preserved; timer normalized.
    assert.equal(src.rows[1].id, 'r2');
    assert.equal(src.rows[1].timer.baseMs, 5000);
    // Empty-key linked-timer entries are dropped.
    assert.deepEqual(src.linkedTimerByOutput, { 'output-main': 'main' });
    assert.equal(result.length, 1);
  } finally {
    await fs.remove(dir);
  }
});

test('sources: survive a store reload (persisted in state.json)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-src-'));
  const stateFile = path.join(dir, 'state.json');
  const templateService = createStubTemplateService();
  templateService.getTemplate = (id) =>
    templateService.getTemplates().find((tpl) => tpl.id === id) || null;

  try {
    const store1 = new TitleStore({ stateFile, templateService });
    await store1.init();
    store1.replaceSources([{ name: 'S1', columns: [{ label: 'A' }], rows: [{ values: ['x'] }] }]);
    await store1.persist();
    await store1.close?.();

    const store2 = new TitleStore({ stateFile, templateService });
    await store2.init();
    const sources = store2.getSources();
    assert.equal(sources.length, 1);
    assert.equal(sources[0].name, 'S1');
    assert.equal(sources[0].rows[0].values[0], 'x');
    await store2.close?.();
  } finally {
    await fs.remove(dir);
  }
});

test('appliedRow: setOutputAppliedRow records the row and getOutputCurrentTimerId resolves via source', async () => {
  const { store, dir } = await makeStore();
  try {
    const outputId = store.getSnapshot().outputs[0].id;
    store.replaceSources([
      {
        id: 'src-1',
        name: 'Guests',
        columns: [{ label: 'Name' }],
        linkedTimerId: 'main',
        linkedTimerByOutput: { [outputId]: 'per-out-timer' },
        rows: [{ id: 'row-a', values: ['Alice'] }],
      },
    ]);

    // No applied row yet -> no current timer.
    assert.equal(store.getOutputCurrentTimerId(outputId), null);

    store.setOutputAppliedRow(outputId, { sourceId: 'src-1', rowId: 'row-a' });

    // Snapshot carries the applied row.
    const out = store.getSnapshot().outputs.find((o) => o.id === outputId);
    assert.deepEqual(out.appliedRow, { sourceId: 'src-1', rowId: 'row-a' });

    // Per-output link wins over the source default.
    assert.equal(store.getOutputCurrentTimerId(outputId), 'per-out-timer');
  } finally {
    await fs.remove(dir);
  }
});

test('appliedRow: falls back to source default link, and rejects malformed input', async () => {
  const { store, dir } = await makeStore();
  try {
    const outputId = store.getSnapshot().outputs[0].id;
    store.replaceSources([
      { id: 'src-2', name: 'S', columns: [{ label: 'N' }], linkedTimerId: 'default-timer', rows: [{ id: 'r1', values: ['x'] }] },
    ]);
    store.setOutputAppliedRow(outputId, { sourceId: 'src-2', rowId: 'r1' });
    assert.equal(store.getOutputCurrentTimerId(outputId), 'default-timer');

    // Malformed applied row clears it.
    store.setOutputAppliedRow(outputId, { sourceId: 'src-2' });
    const out = store.getSnapshot().outputs.find((o) => o.id === outputId);
    assert.equal(out.appliedRow, null);
    assert.equal(store.getOutputCurrentTimerId(outputId), null);
  } finally {
    await fs.remove(dir);
  }
});
