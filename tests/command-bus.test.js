import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { TitleStore } from '../server/state/store.js';
import { dispatchCommand, parseCommandActionId } from '../server/state/command-bus.js';

const makeTemplateService = () => {
  const template = {
    id: 'builtin:test',
    name: 'Test Template',
    source: 'builtin',
    fields: [
      { name: 'name', label: 'Name', defaultValue: '' },
      { name: 'role', label: 'Role', defaultValue: '' },
    ],
    timers: [],
    assetUrls: { html: '', css: [], js: [] },
  };
  return {
    scanTemplates: async () => {},
    getTemplates: () => [template],
    getTemplate: (id) => (id === 'builtin:test' ? template : null),
  };
};

const makeStore = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wtp-cmd-'));
  const store = new TitleStore({ stateFile: path.join(dir, 'state.json'), templateService: makeTemplateService() });
  await store.init();
  return { store, dir };
};

// A local title on the main output, plus a 2-row source. Returns ids.
const seedRundown = (store) => {
  const outputId = store.getSnapshot().outputs[0].id;
  const entry = store.addEntry({ templateId: 'builtin:test', name: 'Lower Third' });
  store.selectEntry(entry.id, outputId);
  store.replaceSources([
    {
      id: 'src',
      name: 'Guests',
      columns: [{ label: 'Name' }, { label: 'Role' }],
      linkedTimerId: 'main',
      rows: [
        { id: 'r1', values: ['Alice', 'Host'] },
        { id: 'r2', values: ['Bob', 'Guest'] },
      ],
    },
  ]);
  return { outputId, entryId: entry.id };
};

test('parseCommandActionId parses the three kinds', () => {
  assert.deepEqual(parseCommandActionId('output:main:titleIn'), { kind: 'output', id: 'main', command: 'titleIn' });
  assert.deepEqual(parseCommandActionId('timer:t1:reset'), { kind: 'timer', id: 't1', command: 'reset' });
  assert.deepEqual(parseCommandActionId('global:allOutputsOut'), { kind: 'global', id: null, command: 'allOutputsOut' });
  assert.equal(parseCommandActionId('bogus'), null);
});

test('dispatchCommand: titleIn shows the selected title on the output', async () => {
  const { store, dir } = await makeStore();
  try {
    const { outputId } = seedRundown(store);
    await dispatchCommand(store, `output:${outputId}:titleIn`);
    const out = store.getSnapshot().outputs.find((o) => o.id === outputId);
    assert.equal(out.program.visible, true);
    assert.equal(out.program.lastAction, 'SHOW');
    await dispatchCommand(store, `output:${outputId}:titleOut`);
    assert.equal(store.getSnapshot().outputs.find((o) => o.id === outputId).program.visible, false);
  } finally {
    await fs.remove(dir);
  }
});

test('dispatchCommand: rowNext/rowPrev map the data row onto the title fields', async () => {
  const { store, dir } = await makeStore();
  try {
    const { outputId, entryId } = seedRundown(store);
    // An initial applied row gives the server the source context.
    store.setOutputAppliedRow(outputId, { sourceId: 'src', rowId: 'r1' });

    await dispatchCommand(store, `output:${outputId}:rowNext`);
    let entry = store.getEntry(entryId);
    assert.equal(entry.fields.name, 'Bob');
    assert.equal(entry.fields.role, 'Guest');
    assert.deepEqual(store.getSnapshot().outputs.find((o) => o.id === outputId).appliedRow, {
      sourceId: 'src',
      rowId: 'r2',
    });

    await dispatchCommand(store, `output:${outputId}:rowPrev`);
    entry = store.getEntry(entryId);
    assert.equal(entry.fields.name, 'Alice');
    assert.equal(entry.fields.role, 'Host');
  } finally {
    await fs.remove(dir);
  }
});

test('dispatchCommand: rowNext fans out to synced outputs, each with its own mapping', async () => {
  const { store, dir } = await makeStore();
  try {
    const primary = store.getSnapshot().outputs[0];
    // A second output synced into the same group.
    const second = store.createOutput({ name: 'OUTPUT 2' });
    store.updateOutput(second.id, { syncGroupId: primary.syncGroupId });

    // Both outputs carry the same local title so the row maps on each.
    const e1 = store.addEntry({ templateId: 'builtin:test', name: 'T1' });
    const e2 = store.addEntry({ templateId: 'builtin:test', name: 'T2' });
    store.selectEntry(e1.id, primary.id);
    store.selectEntry(e2.id, second.id);

    store.replaceSources([
      {
        id: 'src',
        name: 'G',
        columns: [{ label: 'Name' }, { label: 'Role' }],
        rows: [
          { id: 'r1', values: ['Alice', 'Host'] },
          { id: 'r2', values: ['Bob', 'Guest'] },
        ],
      },
    ]);
    store.setOutputAppliedRow(primary.id, { sourceId: 'src', rowId: 'r1' });

    await dispatchCommand(store, `output:${primary.id}:rowNext`);

    // Both synced outputs advanced to r2 and got the mapped fields.
    assert.equal(store.getEntry(e1.id).fields.name, 'Bob');
    assert.equal(store.getEntry(e2.id).fields.name, 'Bob');
    const outs = store.getSnapshot().outputs;
    assert.deepEqual(outs.find((o) => o.id === primary.id).appliedRow, { sourceId: 'src', rowId: 'r2' });
    assert.deepEqual(outs.find((o) => o.id === second.id).appliedRow, { sourceId: 'src', rowId: 'r2' });
  } finally {
    await fs.remove(dir);
  }
});

test('dispatchCommand: rowNext clamps at the last row', async () => {
  const { store, dir } = await makeStore();
  try {
    const { outputId, entryId } = seedRundown(store);
    store.setOutputAppliedRow(outputId, { sourceId: 'src', rowId: 'r2' });
    await dispatchCommand(store, `output:${outputId}:rowNext`);
    assert.equal(store.getEntry(entryId).fields.name, 'Bob'); // stayed on last
  } finally {
    await fs.remove(dir);
  }
});

test('dispatchCommand: per-output timer command resolves the applied row timer', async () => {
  const { store, dir } = await makeStore();
  try {
    const { outputId } = seedRundown(store);
    store.setOutputAppliedRow(outputId, { sourceId: 'src', rowId: 'r1' }); // src.linkedTimerId = 'main'
    assert.equal(store.getTimers().find((t) => t.id === 'main').running, false);
    await dispatchCommand(store, `output:${outputId}:timerStart`);
    assert.equal(store.getTimers().find((t) => t.id === 'main').running, true);
    await dispatchCommand(store, `output:${outputId}:timerStop`);
    assert.equal(store.getTimers().find((t) => t.id === 'main').running, false);
  } finally {
    await fs.remove(dir);
  }
});

test('dispatchCommand: global panic hides every visible output', async () => {
  const { store, dir } = await makeStore();
  try {
    const { outputId } = seedRundown(store);
    await dispatchCommand(store, `output:${outputId}:titleIn`);
    assert.equal(store.getSnapshot().outputs[0].program.visible, true);
    await dispatchCommand(store, 'global:allOutputsOut');
    assert.equal(store.getSnapshot().outputs[0].program.visible, false);
  } finally {
    await fs.remove(dir);
  }
});

test('dispatchCommand: unknown action throws', async () => {
  const { store, dir } = await makeStore();
  try {
    await assert.rejects(() => dispatchCommand(store, 'nope'), /Unknown command/);
  } finally {
    await fs.remove(dir);
  }
});
