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
    {
      device: 'APC',
      deviceName: 'APC Mini',
      type: 'cc',
      channel: 2,
      controller: 7,
      valueMode: 'gte',
      value: 100,
      action: 'live',
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
    { device: 'any', type: 'noteon', channel: 99, note: 'bad', controller: -1, action: 'show' },
  ]);
  assert.deepEqual(result[0], { device: 'any', type: 'noteon', action: 'show' });
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

test('MidiService auto-refreshes when JZZ reports a MIDI device change', async () => {
  const fake = createFakeJzz({ inputNames: [] });
  const service = new MidiService({ jzzFactory: fake.jzzFactory, openTimeoutMs: 20 });

  const initial = await service.refresh();
  assert.equal(initial.enabled, false);
  assert.equal(fake.watchers.length, 1);

  fake.inputs.push({ name: 'AKAI MPK mini' });
  fake.watchers[0]({ inputs: { added: [{ name: 'AKAI MPK mini' }], removed: [] } });

  await new Promise((resolve) => setTimeout(resolve, 350));

  const next = service.getState();
  assert.equal(next.enabled, true);
  assert.equal(next.inputs[0].name, 'AKAI MPK mini');

  await service.close();
  assert.equal(fake.watchers.length, 0);
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
  service.startLearn('selectEntry:title-1');
  fake.ports[0].emit([0x91, 64, 100]);

  assert.equal(firedActions.length, 0);
  assert.equal(savedBindings.length, 1);
  assert.deepEqual(savedBindings[0][0], {
    device: 'any',
    deviceName: 'AKAI MPK mini',
    type: 'noteon',
    action: 'selectEntry:title-1',
    channel: 2,
    note: 64,
  });
});

test('MidiService dispatches learned bindings on later MIDI press', async () => {
  const fake = createFakeJzz();
  const firedActions = [];
  const service = new MidiService({
    jzzFactory: fake.jzzFactory,
    bindings: [{ device: 'any', type: 'noteon', channel: 2, note: 64, action: 'selectEntry:title-1' }],
  });
  service.on('action', (event) => firedActions.push(event.action));

  await service.refresh();
  fake.ports[0].emit([0x91, 64, 100]);

  assert.deepEqual(firedActions, ['selectEntry:title-1']);
});

test('MidiService learn stores CC value rule for faders', async () => {
  const fake = createFakeJzz();
  const savedBindings = [];
  const service = new MidiService({
    jzzFactory: fake.jzzFactory,
    onBindingsChange: (bindings) => savedBindings.push(bindings),
  });

  await service.refresh();
  service.startLearn('live');
  fake.ports[0].emit([0xB0, 7, 96]);

  assert.equal(savedBindings.length, 1);
  assert.deepEqual(savedBindings[0][0], {
    device: 'any',
    deviceName: 'AKAI MPK mini',
    type: 'cc',
    action: 'live',
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
    bindings: [{ device: 'any', type: 'cc', channel: 1, controller: 7, valueMode: 'gte', value: 100, action: 'live' }],
  });
  service.on('action', (event) => firedActions.push(event.action));

  await service.refresh();
  fake.ports[0].emit([0xB0, 7, 99]);
  fake.ports[0].emit([0xB0, 7, 100]);

  assert.deepEqual(firedActions, ['live']);
});

test('MidiService can update CC value rule', async () => {
  const fake = createFakeJzz();
  let savedBindings = [];
  const service = new MidiService({
    jzzFactory: fake.jzzFactory,
    bindings: [{ device: 'any', type: 'cc', channel: 1, controller: 7, valueMode: 'eq', value: 64, action: 'live' }],
    onBindingsChange: (bindings) => {
      savedBindings = bindings;
    },
  });

  await service.refresh();
  const state = service.updateBinding('live', { valueMode: 'lte', value: 10 });

  assert.equal(state.bindings[0].valueMode, 'lte');
  assert.equal(state.bindings[0].value, 10);
  assert.equal(savedBindings[0].valueMode, 'lte');
});

test('MidiService updateBinding can create a CC binding', async () => {
  const fake = createFakeJzz();
  const service = new MidiService({ jzzFactory: fake.jzzFactory });

  await service.refresh();
  const state = service.updateBinding('live', {
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
    action: 'live',
  });
});
