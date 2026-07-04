import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MidiService,
  parseMidiMessage,
  normalizeMidiBindings,
  normalizeMidiActionForDispatch,
} from '../server/midi/midi-service.js';

const createFakeJzz = ({
  inputNames = ['AKAI MPK mini'],
  inputInfos,
  passPortToAnd = false,
  failTargets = [],
  pendingTargets = [],
} = {}) => {
  const ports = [];
  const watchers = [];
  const failures = new Set(failTargets);
  const pending = new Set(pendingTargets);
  const inputs = inputInfos || inputNames.map((name) => ({ name }));
  const jzzFactory = () => () => ({
    info: () => ({
      inputs,
    }),
    openMidiIn: (target) => {
      const shouldFail = failures.has(target);
      const shouldStayPending = pending.has(target);
      const port = {
        inputName: target,
        handler: null,
        closed: false,
        connect(handler) {
          this.handler = handler;
          return this;
        },
        disconnect() {
          this.handler = null;
          return this;
        },
        close() {
          this.closed = true;
          return this;
        },
        or() {
          if (shouldFail && typeof arguments[0] === 'function') {
            arguments[0](new Error('failed to open'));
          }
          return this;
        },
        and(handler) {
          if (!shouldFail && !shouldStayPending) {
            handler.call(this, passPortToAnd ? this : undefined);
          }
          return this;
        },
        emit(bytes) {
          this.handler?.(bytes);
        },
      };
      ports.push(port);
      return port;
    },
    onChange(handler) {
      watchers.push(handler);
      return {
        disconnect(disconnectHandler) {
          const index = watchers.indexOf(disconnectHandler || handler);
          if (index >= 0) watchers.splice(index, 1);
          return this;
        },
      };
    },
  });

  return { jzzFactory, ports, inputs, watchers };
};

test('parseMidiMessage: note on with velocity > 0', () => {
  const result = parseMidiMessage([0x90, 60, 127]);
  assert.deepEqual(result, { type: 'noteon', channel: 1, note: 60, velocity: 127 });
});

test('parseMidiMessage: note on with velocity 0 is treated as note off', () => {
  const result = parseMidiMessage([0x90, 60, 0]);
  assert.equal(result.type, 'noteoff');
  assert.equal(result.channel, 1);
});

test('parseMidiMessage: explicit note off', () => {
  const result = parseMidiMessage([0x80, 60, 64]);
  assert.equal(result.type, 'noteoff');
});

test('parseMidiMessage: control change', () => {
  const result = parseMidiMessage([0xB0, 7, 100]);
  assert.deepEqual(result, { type: 'cc', channel: 1, controller: 7, value: 100 });
});

test('parseMidiMessage: channel is decoded from status byte', () => {
  const result = parseMidiMessage([0x92, 64, 100]);
  assert.equal(result.channel, 3);
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
    { device: 'any', type: 'noteon', note: 60, action: 'output:main:titleIn' },
    { device: 'any', type: 'noteon', note: 61, action: 'ghost-action' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].action, 'output:main:titleIn');
});

test('normalizeMidiBindings: accepts all per-output command ids', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteon', note: 50, action: 'output:main:titleOut' },
    { device: 'any', type: 'noteon', note: 51, action: 'output:aux:previewIn' },
    { device: 'any', type: 'noteon', note: 52, action: 'output:main:rowNext' },
    { device: 'any', type: 'noteon', note: 53, action: 'output:main:timerStart' },
  ]);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map((b) => b.action), [
    'output:main:titleOut',
    'output:aux:previewIn',
    'output:main:rowNext',
    'output:main:timerStart',
  ]);
});

test('normalizeMidiBindings: accepts per-timer and global command ids', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteon', note: 54, action: 'timer:main:start' },
    { device: 'any', type: 'noteon', note: 55, action: 'timer:main:stop' },
    { device: 'any', type: 'noteon', note: 56, action: 'timer:main:reset' },
    { device: 'any', type: 'noteon', note: 57, action: 'global:allOutputsOut' },
  ]);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map((b) => b.action), [
    'timer:main:start',
    'timer:main:stop',
    'timer:main:reset',
    'global:allOutputsOut',
  ]);
});

test('normalizeMidiActionForDispatch is a passthrough (v2 ids are canonical)', () => {
  assert.equal(normalizeMidiActionForDispatch('output:main:titleIn'), 'output:main:titleIn');
  assert.equal(normalizeMidiActionForDispatch('timer:abc:start'), 'timer:abc:start');
  assert.equal(normalizeMidiActionForDispatch('global:allOutputsOut'), 'global:allOutputsOut');
});

test('normalizeMidiBindings: rejects an unknown command on a valid target', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteon', note: 50, action: 'output:main:bogus' },
  ]);
  assert.equal(result.length, 0);
});

test('normalizeMidiBindings: normalizes type to noteon when invalid', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteoff', note: 60, action: 'output:main:titleIn' },
  ]);
  assert.equal(result[0].type, 'noteon');
});

test('normalizeMidiBindings: keeps numeric note + controller', () => {
  const result = normalizeMidiBindings([
    {
      device: 'APC',
      deviceName: 'APC Mini',
      type: 'cc',
      channel: 2,
      controller: 7,
      valueMode: 'gte',
      value: 100,
      action: 'timer:main:start',
    },
  ]);
  assert.equal(result[0].controller, 7);
  assert.equal(result[0].channel, 2);
  assert.equal(result[0].valueMode, 'gte');
  assert.equal(result[0].value, 100);
  assert.equal(result[0].deviceName, 'APC Mini');
  assert.equal(result[0].type, 'cc');
});

test('normalizeMidiBindings: drops invalid numeric fields', () => {
  const result = normalizeMidiBindings([
    { device: 'any', type: 'noteon', channel: 99, note: 'bad', controller: -1, action: 'output:main:titleIn' },
  ]);
  assert.deepEqual(result[0], { device: 'any', type: 'noteon', action: 'output:main:titleIn' });
});

test('MidiService.refresh opens JZZ input even when and() does not pass a port argument', async () => {
  const fake = createFakeJzz({ passPortToAnd: false });
  const service = new MidiService({ jzzFactory: fake.jzzFactory });

  const state = await service.refresh();

  assert.equal(state.enabled, true);
  assert.equal(state.inputs[0].name, 'AKAI MPK mini');
  assert.equal(fake.ports.length, 1);
  assert.equal(service.ports.length, 1);
});

test('MidiService.refresh falls back to MIDI input id when display name fails', async () => {
  const fake = createFakeJzz({
    inputInfos: [{ id: 'akai-port-1', name: 'AKAI MPK mini' }],
    failTargets: ['AKAI MPK mini'],
  });
  const service = new MidiService({ jzzFactory: fake.jzzFactory });

  const state = await service.refresh();

  assert.equal(state.enabled, true);
  assert.equal(service.ports.length, 1);
  assert.equal(service.ports[0].inputName, 'akai-port-1');
  assert.equal(state.error, null);
});

test('MidiService.refresh reports offline when no MIDI inputs are detected', async () => {
  const fake = createFakeJzz({ inputNames: [] });
  const service = new MidiService({ jzzFactory: fake.jzzFactory });

  const state = await service.refresh();

  assert.equal(state.enabled, false);
  assert.deepEqual(state.inputs, []);
  assert.equal(state.error, 'No MIDI inputs detected.');
});

test('MidiService.refresh times out a MIDI input that never resolves', async () => {
  const fake = createFakeJzz({ pendingTargets: ['AKAI MPK mini', 0] });
  const service = new MidiService({ jzzFactory: fake.jzzFactory, openTimeoutMs: 5 });

  const state = await service.refresh();

  assert.equal(state.enabled, false);
  assert.match(state.error, /AKAI MPK mini \(AKAI MPK mini\): open timed out/);
  assert.equal(fake.ports[0].closed, true);
});

test('MidiService.refresh closes failed open attempts and compacts offline error', async () => {
  const fake = createFakeJzz({
    inputInfos: [{ id: 'akai-apc-id', name: 'AKAI APC mini' }],
    failTargets: ['AKAI APC mini', 'akai-apc-id', 0],
  });
  const service = new MidiService({ jzzFactory: fake.jzzFactory });

  const state = await service.refresh();

  assert.equal(state.enabled, false);
  assert.equal(state.inputs[0].open, false);
  assert.match(state.error, /1 MIDI input\(s\) detected, but no input port could be opened/);
  assert.match(state.error, /vMix/);
  assert.match(state.error, /virtual MIDI splitter/);
  assert.match(state.error, /\+1 more/);
  assert.equal(fake.ports.length, 3);
  assert.equal(fake.ports.every((port) => port.closed), true);
});

test('MidiService auto-refreshes when JZZ reports a MIDI device change', async () => {
  const fake = createFakeJzz({ inputNames: [] });
  const service = new MidiService({ jzzFactory: fake.jzzFactory, openTimeoutMs: 20 });

  const initial = await service.refresh();
  assert.equal(initial.enabled, false);
  assert.equal(fake.watchers.length, 1);

  fake.inputs.push({ name: 'AKAI MPK mini' });
  fake.watchers[0]({ inputs: { added: [{ name: 'AKAI MPK mini' }], removed: [] } });

  await new Promise((resolve) => setTimeout(resolve, 650));

  const next = service.getState();
  assert.equal(next.enabled, true);
  assert.equal(next.inputs[0].name, 'AKAI MPK mini');

  await service.close();
  assert.equal(fake.watchers.length, 0);
});

test('MidiService ignores noisy MIDI change events when the input list is unchanged', async () => {
  const fake = createFakeJzz();
  const service = new MidiService({ jzzFactory: fake.jzzFactory, openTimeoutMs: 20 });

  await service.refresh();
  assert.equal(fake.ports.length, 1);
  assert.equal(fake.watchers.length, 1);

  fake.watchers[0]({ inputs: { added: [], removed: [] } });
  await new Promise((resolve) => setTimeout(resolve, 650));

  assert.equal(fake.ports.length, 1);
});

test('MidiService learn stores portable binding and does not fire action immediately', async () => {
  const fake = createFakeJzz();
  const savedBindings = [];
  const firedActions = [];
  const service = new MidiService({
    jzzFactory: fake.jzzFactory,
    onBindingsChange: (bindings) => savedBindings.push(bindings),
  });
  service.on('action', (event) => firedActions.push(event.action));

  await service.refresh();
  service.startLearn('output:main:previewIn');
  fake.ports[0].emit([0x91, 64, 100]);

  assert.equal(firedActions.length, 0);
  assert.equal(savedBindings.length, 1);
  assert.deepEqual(savedBindings[0][0], {
    device: 'any',
    deviceName: 'AKAI MPK mini',
    type: 'noteon',
    action: 'output:main:previewIn',
    channel: 2,
    note: 64,
  });
});

test('MidiService dispatches learned bindings on later MIDI press', async () => {
  const fake = createFakeJzz();
  const firedActions = [];
  const service = new MidiService({
    jzzFactory: fake.jzzFactory,
    bindings: [{ device: 'any', type: 'noteon', channel: 2, note: 64, action: 'output:main:previewIn' }],
  });
  service.on('action', (event) => firedActions.push(event.action));

  await service.refresh();
  fake.ports[0].emit([0x91, 64, 100]);

  assert.deepEqual(firedActions, ['output:main:previewIn']);
});

test('MidiService learn stores CC value rule for faders', async () => {
  const fake = createFakeJzz();
  const savedBindings = [];
  const service = new MidiService({
    jzzFactory: fake.jzzFactory,
    onBindingsChange: (bindings) => savedBindings.push(bindings),
  });

  await service.refresh();
  service.startLearn('timer:main:start');
  fake.ports[0].emit([0xB0, 7, 96]);

  assert.equal(savedBindings.length, 1);
  assert.deepEqual(savedBindings[0][0], {
    device: 'any',
    deviceName: 'AKAI MPK mini',
    type: 'cc',
    action: 'timer:main:start',
    channel: 1,
    controller: 7,
    valueMode: 'eq',
    value: 96,
  });
});

test('MidiService CC binding can require value at or above threshold', async () => {
  const fake = createFakeJzz();
  const firedActions = [];
  const service = new MidiService({
    jzzFactory: fake.jzzFactory,
    bindings: [{ device: 'any', type: 'cc', channel: 1, controller: 7, valueMode: 'gte', value: 100, action: 'timer:main:start' }],
  });
  service.on('action', (event) => firedActions.push(event.action));

  await service.refresh();
  fake.ports[0].emit([0xB0, 7, 99]);
  fake.ports[0].emit([0xB0, 7, 100]);

  assert.deepEqual(firedActions, ['timer:main:start']);
});

test('MidiService can update CC value rule', async () => {
  const fake = createFakeJzz();
  let savedBindings = [];
  const service = new MidiService({
    jzzFactory: fake.jzzFactory,
    bindings: [{ device: 'any', type: 'cc', channel: 1, controller: 7, valueMode: 'eq', value: 64, action: 'timer:main:start' }],
    onBindingsChange: (bindings) => {
      savedBindings = bindings;
    },
  });

  await service.refresh();
  const state = service.updateBinding('timer:main:start', { valueMode: 'lte', value: 10 });

  assert.equal(state.bindings[0].valueMode, 'lte');
  assert.equal(state.bindings[0].value, 10);
  assert.equal(savedBindings[0].valueMode, 'lte');
});

test('MidiService updateBinding can create a CC binding', async () => {
  const fake = createFakeJzz();
  const service = new MidiService({ jzzFactory: fake.jzzFactory });

  await service.refresh();
  const state = service.updateBinding('timer:main:start', {
    type: 'cc',
    channel: 1,
    controller: 7,
    valueMode: 'gte',
    value: 100,
  });

  assert.deepEqual(state.bindings[0], {
    device: 'any',
    type: 'cc',
    controller: 7,
    channel: 1,
    valueMode: 'gte',
    value: 100,
    action: 'timer:main:start',
  });
});
