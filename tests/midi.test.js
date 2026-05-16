import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidiMessage, normalizeMidiBindings, SUPPORTED_MIDI_ACTIONS } from '../server/midi/midi-service.js';

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

test('normalizeMidiBindings: returns defaults for empty input', () => {
  const result = normalizeMidiBindings([]);
  assert.ok(result.length > 0);
  assert.ok(result.every((b) => SUPPORTED_MIDI_ACTIONS.includes(b.action)));
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
