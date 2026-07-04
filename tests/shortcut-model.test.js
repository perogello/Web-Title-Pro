import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBindingPatch,
  findActionForShortcut,
  forEachBinding,
  mergeBindingPatches,
  outputActionId,
  parseActionId,
  readCommand,
  timerActionId,
  globalActionId,
} from '../client/src/control-shell/shortcut-model.js';

test('action id builders + parseActionId round-trip', () => {
  assert.equal(outputActionId('main', 'titleIn'), 'output:main:titleIn');
  assert.deepEqual(parseActionId('output:main:titleIn'), {
    kind: 'output',
    id: 'main',
    command: 'titleIn',
  });
  assert.deepEqual(parseActionId('timer:abc:start'), { kind: 'timer', id: 'abc', command: 'start' });
  assert.deepEqual(parseActionId('global:allOutputsOut'), {
    kind: 'global',
    id: null,
    command: 'allOutputsOut',
  });
  assert.equal(parseActionId('nonsense'), null);
});

test('parseActionId tolerates ids containing colons (uses last colon)', () => {
  // Output ids from nanoid never contain ':', but be defensive.
  assert.deepEqual(parseActionId('output:out:1:titleOut'), {
    kind: 'output',
    id: 'out:1',
    command: 'titleOut',
  });
});

test('readCommand reads from the right nested map', () => {
  const bindings = {
    outputs: { main: { titleIn: 'F5' } },
    timers: { abc: { start: 'Space' } },
    global: { allOutputsOut: 'Escape' },
  };
  assert.equal(readCommand(bindings, 'output:main:titleIn'), 'F5');
  assert.equal(readCommand(bindings, 'timer:abc:start'), 'Space');
  assert.equal(readCommand(bindings, 'global:allOutputsOut'), 'Escape');
  assert.equal(readCommand(bindings, 'output:main:titleOut'), '');
});

test('forEachBinding yields only non-empty bindings', () => {
  const bindings = {
    outputs: { main: { titleIn: 'F5', titleOut: '' } },
    timers: { abc: { start: 'Space', stop: '', reset: '' } },
    global: { allOutputsOut: 'Escape' },
  };
  const seen = [];
  forEachBinding(bindings, (actionId, value) => seen.push([actionId, value]));
  assert.deepEqual(seen.sort(), [
    ['global:allOutputsOut', 'Escape'],
    ['output:main:titleIn', 'F5'],
    ['timer:abc:start', 'Space'],
  ]);
});

test('findActionForShortcut locates the owning action, or null', () => {
  const bindings = {
    outputs: { main: { titleIn: 'F5' }, aux: { previewIn: 'Ctrl+P' } },
    timers: { abc: { start: 'Space' } },
  };
  assert.equal(findActionForShortcut(bindings, 'F5'), 'output:main:titleIn');
  assert.equal(findActionForShortcut(bindings, 'Ctrl+P'), 'output:aux:previewIn');
  assert.equal(findActionForShortcut(bindings, 'Space'), 'timer:abc:start');
  assert.equal(findActionForShortcut(bindings, 'F9'), null);
  assert.equal(findActionForShortcut(bindings, ''), null);
});

test('buildBindingPatch produces a minimal nested patch', () => {
  assert.deepEqual(buildBindingPatch('output:main:titleIn', 'F5'), {
    outputs: { main: { titleIn: 'F5' } },
  });
  assert.deepEqual(buildBindingPatch('timer:abc:reset', 'F1'), {
    timers: { abc: { reset: 'F1' } },
  });
  assert.deepEqual(buildBindingPatch('global:allOutputsOut', 'Escape'), {
    global: { allOutputsOut: 'Escape' },
  });
});

test('mergeBindingPatches deep-merges clear-old + set-new into one body', () => {
  const clearOld = buildBindingPatch('output:aux:titleIn', '');
  const setNew = buildBindingPatch('output:main:titleIn', 'F5');
  assert.deepEqual(mergeBindingPatches(clearOld, setNew), {
    outputs: { aux: { titleIn: '' }, main: { titleIn: 'F5' } },
  });

  // Same output, different command must not clobber each other.
  const a = buildBindingPatch('output:main:titleOut', '');
  const b = buildBindingPatch('output:main:titleIn', 'F5');
  assert.deepEqual(mergeBindingPatches(a, b), {
    outputs: { main: { titleOut: '', titleIn: 'F5' } },
  });
});
