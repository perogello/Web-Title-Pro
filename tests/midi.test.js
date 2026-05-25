import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMidiMessage,
  normalizeMidiBindings,
  normalizeMidiActionForDispatch,
} from '../server/midi/midi-service.js';

test('parseMidiMessage: note on with velocity > 0', () => {
  const result = parseMidiMessage([0x90, 60, 127]);
  assert.deepEqual(result, { type: 'noteon', note: 60, velocity: 127 });
});

test('parseMidiMessage: note on with velocity 0 is treated as note off', () => {
  const result = parseMidiMessage([0x90, 60, 0]);
  assert.equal(result.type, 'noteoff');
});

test('parseMidiMessage: explicit note off', () => {
  const result = parseMidiMessage([0x80, 60, 64]);
  assert.equal(result.type, 'noteoff');
});

test('parseMidiMessage: control change', () => {
  const result = parseMidiMessage([0xB0, 7, 100]);
  assert.deepEqual(result, { type: 'cc', controller: 7, value: 100 });
});

test('parseMidiMessage: program change is unsupported', () => {
  assert.equal(parseMidiMessage([0xC0, 1, 0]), null);
});

test('normalizeMidiBindings: empty input has no preassigned bindings', () => {
  const result = normalizeMidiBindings([]);
  assert.deepEqual(result, []);
});

test('normalizeMidiBindings: filters out unsupported actions', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteon', note: 60, action: 'show' },
    { device: 'any', type: 'noteon', note: 61, action: 'ghost-action' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].action, 'show');
});

test('normalizeMidiBindings: accepts select-output:<id> action', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteon', note: 50, action: 'select-output:output-main' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].action, 'select-output:output-main');
});

test('normalizeMidiBindings: accepts entry-select / timer-toggle / timer-reset', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteon', note: 51, action: 'entry-select:abc-123' },
    { device: 'any', type: 'noteon', note: 52, action: 'timer-toggle:main' },
    { device: 'any', type: 'noteon', note: 53, action: 'timer-reset:main' },
  ]);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((b) => b.action), ['entry-select:abc-123', 'timer-toggle:main', 'timer-reset:main']);
});

test('normalizeMidiBindings: accepts current UI action ids', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteon', note: 54, action: 'previousTitle' },
    { device: 'any', type: 'noteon', note: 55, action: 'selectOutput:output-main' },
    { device: 'any', type: 'noteon', note: 56, action: 'selectEntry:title-1' },
    { device: 'any', type: 'noteon', note: 57, action: 'timerToggle:main' },
    { device: 'any', type: 'noteon', note: 58, action: 'timerReset:main' },
  ]);
  assert.equal(result.length, 5);
  assert.deepEqual(result.map((b) => b.action), [
    'previousTitle',
    'selectOutput:output-main',
    'selectEntry:title-1',
    'timerToggle:main',
    'timerReset:main',
  ]);
});

test('normalizeMidiActionForDispatch maps UI ids to command ids', () => {
  assert.equal(normalizeMidiActionForDispatch('previousTitle'), 'previous-title');
  assert.equal(normalizeMidiActionForDispatch('selectOutput:output-main'), 'select-output:output-main');
  assert.equal(normalizeMidiActionForDispatch('selectEntry:title-1'), 'entry-select:title-1');
  assert.equal(normalizeMidiActionForDispatch('timerToggle:main'), 'timer-toggle:main');
  assert.equal(normalizeMidiActionForDispatch('timerReset:main'), 'timer-reset:main');
});

test('normalizeMidiBindings: rejects select-output without id', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteon', note: 50, action: 'select-output:' },
  ]);
  assert.equal(result.length, 0);
});

test('normalizeMidiBindings: normalizes type to noteon when invalid', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteoff', note: 60, action: 'show' },
  ]);
  assert.equal(result[0].type, 'noteon');
});

test('normalizeMidiBindings: keeps numeric note + controller', () => {
  const result = normalizeMidiBindings([
    { device: 'APC', type: 'cc', controller: 7, action: 'live' },
  ]);
  assert.equal(result[0].controller, 7);
  assert.equal(result[0].type, 'cc');
});
