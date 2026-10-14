import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appliedRowNumber,
  buildVariableDefinitions,
  buildVariableValues,
  diffValues,
  mergeTimerTick,
  outputChoices,
  outputToggleCommand,
  parseHexColor,
  selectedEntryValues,
  structureSignature,
  timerToggleCommand,
} from '../companion-module/src/model.js';
import { buildPresets } from '../companion-module/src/presets.js';

const snapshot = {
  outputs: [
    { id: 'output-main', name: 'PIP', selectedEntryId: 'e1', program: { visible: true }, appliedRow: { sourceId: 's1', rowId: 'r2' } },
    { id: 'abc', name: 'OVERLAY', selectedEntryId: null, program: { visible: false }, previewProgram: { visible: true } },
  ],
  entries: [
    {
      id: 'e1',
      name: 'Lower Third 01',
      templateFields: [{ name: 'fullName' }, { name: 'position' }],
      fields: { position: 'Host', fullName: 'Alice' },
    },
  ],
  timers: [{ id: 't1', name: 'Countdown', running: true, display: '01:30', color: '#ff0000' }],
  sources: [{ id: 's1', rows: [{ id: 'r1' }, { id: 'r2' }] }],
};

test('companion model: choices are numbered like the Config tab', () => {
  assert.deepEqual(outputChoices(snapshot), [
    { id: 'output-main', label: '#1 PIP' },
    { id: 'abc', label: '#2 OVERLAY' },
  ]);
});

test('companion model: selected title values follow template field order', () => {
  assert.deepEqual(selectedEntryValues(snapshot, snapshot.outputs[0]), ['Alice', 'Host']);
  assert.deepEqual(selectedEntryValues(snapshot, snapshot.outputs[1]), []);
  assert.equal(appliedRowNumber(snapshot, snapshot.outputs[0]), '2');
  assert.equal(appliedRowNumber(snapshot, snapshot.outputs[1]), '');
});

test('companion model: variable values and definitions line up', () => {
  const values = buildVariableValues(snapshot, true);
  assert.equal(values.connected, 'YES');
  assert.equal(values.on_air_count, '1');
  assert.equal(values.o1_name, 'PIP');
  assert.equal(values.o1_title, 'Lower Third 01');
  assert.equal(values.o1_value1, 'Alice');
  assert.equal(values.o1_on_air, 'ON');
  assert.equal(values.o2_preview, 'ON');
  assert.equal(values.t1_time, '01:30');
  assert.equal(values.t1_running, 'ON');
  const defined = new Set(buildVariableDefinitions(snapshot).map((item) => item.variableId));
  for (const key of Object.keys(values)) assert.ok(defined.has(key), `variable ${key} is defined`);
  assert.equal(buildVariableValues(null, false).connected, 'NO');
});

test('companion model: toggles, diffs, colours and timer ticks', () => {
  assert.equal(outputToggleCommand(snapshot.outputs[0]), 'titleOut');
  assert.equal(outputToggleCommand(snapshot.outputs[1]), 'titleIn');
  assert.equal(timerToggleCommand({ running: true }), 'stop');
  assert.equal(timerToggleCommand(null), 'start');
  assert.deepEqual(diffValues({ a: '1', b: '2' }, { a: '1', b: '3', c: 'x' }), { b: '3', c: 'x' });
  assert.deepEqual(parseHexColor('#f00'), [255, 0, 0]);
  assert.deepEqual(parseHexColor('00ff80'), [0, 255, 128]);
  assert.equal(parseHexColor('red'), null);
  const ticked = mergeTimerTick(snapshot, { timers: [{ id: 't1', display: '01:29' }] });
  assert.equal(ticked.timers[0].display, '01:29');
  assert.equal(ticked.timers[0].name, 'Countdown');
  assert.equal(ticked.outputs, snapshot.outputs);
});

test('companion model: structure signature ignores live values', () => {
  const live = { ...snapshot, outputs: snapshot.outputs.map((output) => ({ ...output, program: { visible: false } })) };
  assert.equal(structureSignature(snapshot), structureSignature(live));
  const renamed = { ...snapshot, outputs: [{ ...snapshot.outputs[0], name: 'MAIN' }, snapshot.outputs[1]] };
  assert.notEqual(structureSignature(snapshot), structureSignature(renamed));
});

test('companion presets: per output, per title, per timer and global', () => {
  const presets = buildPresets(snapshot, 'wtp');
  assert.ok(presets.o1_toggle && presets.o2_toggle);
  assert.equal(presets.o1_toggle.steps[0].down[0].actionId, 'output_toggle');
  assert.equal(presets.o1_toggle.feedbacks[0].feedbackId, 'output_on_air');
  assert.match(presets.o1_toggle.style.text, /\$\(wtp:o1_name\)/);
  assert.ok(presets.o1_titleIn && presets.o1_rowNext);
  assert.equal(presets['o2_select_e1'].steps[0].down[0].options.output, 'abc');
  assert.ok(presets.t1_toggle && presets.t1_reset && presets.panic);
  assert.ok(Object.values(presets).every((preset) => preset.type === 'button' && Array.isArray(preset.steps)));
});
