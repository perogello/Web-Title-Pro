import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { toElectronAccelerator, collectGlobalAccelerators, createGlobalShortcutManager } =
  require('../desktop/integrations/global-shortcuts.cjs');

test('toElectronAccelerator: single key passthrough', () => {
  assert.equal(toElectronAccelerator('F5'), 'F5');
  assert.equal(toElectronAccelerator('A'), 'A');
});

test('toElectronAccelerator: Ctrl maps to CommandOrControl', () => {
  assert.equal(toElectronAccelerator('Ctrl+F5'), 'CommandOrControl+F5');
  assert.equal(toElectronAccelerator('Ctrl+Shift+A'), 'CommandOrControl+Shift+A');
});

test('toElectronAccelerator: arrow keys lose the Arrow prefix', () => {
  assert.equal(toElectronAccelerator('Shift+Arrow Right'), 'Shift+Right');
  assert.equal(toElectronAccelerator('Ctrl+Arrow Up'), 'CommandOrControl+Up');
});

test('toElectronAccelerator: Mouse buttons return null', () => {
  assert.equal(toElectronAccelerator('Mouse Back'), null);
  assert.equal(toElectronAccelerator('Ctrl+Mouse Right'), null);
});

test('toElectronAccelerator: Meta maps to Super', () => {
  assert.equal(toElectronAccelerator('Meta+K'), 'Super+K');
});

test('toElectronAccelerator: empty/invalid input returns null', () => {
  assert.equal(toElectronAccelerator(''), null);
  assert.equal(toElectronAccelerator(null), null);
  assert.equal(toElectronAccelerator(undefined), null);
});

test('collectGlobalAccelerators: returns only globally-flagged bindings', () => {
  const result = collectGlobalAccelerators({
    show: 'F5',
    live: 'F6',
    hide: 'F7',
    globalActions: { show: true, hide: true },
  });
  const actions = result.map((r) => r.action);
  assert.ok(actions.includes('show'));
  assert.ok(actions.includes('hide'));
  assert.ok(!actions.includes('live'), 'live is not flagged global');
  assert.equal(result.find((r) => r.action === 'show').accelerator, 'F5');
});

test('collectGlobalAccelerators: skips mouse bindings even when flagged', () => {
  const result = collectGlobalAccelerators({
    show: 'Mouse Back',
    globalActions: { show: true },
  });
  assert.equal(result.length, 0);
});

test('collectGlobalAccelerators: outputs/entries/timers id-maps', () => {
  const result = collectGlobalAccelerators({
    outputSelectById: { 'output-1': 'F8' },
    entrySelectById: { 'entry-1': 'F9' },
    timerToggleById: { main: 'F10' },
    timerResetById: { main: 'F11' },
    globalActions: {
      'selectOutput:output-1': true,
      'selectEntry:entry-1': true,
      'timerToggle:main': true,
      'timerReset:main': true,
    },
  });
  const map = Object.fromEntries(result.map((r) => [r.action, r.accelerator]));
  assert.equal(map['selectOutput:output-1'], 'F8');
  assert.equal(map['selectEntry:entry-1'], 'F9');
  assert.equal(map['timerToggle:main'], 'F10');
  assert.equal(map['timerReset:main'], 'F11');
});

test('createGlobalShortcutManager: register / sync / unregister flow', () => {
  const registered = new Set();
  const calls = [];
  const fakeGlobalShortcut = {
    register: (accel) => {
      registered.add(accel);
      calls.push(`register:${accel}`);
      return true;
    },
    unregister: (accel) => {
      registered.delete(accel);
      calls.push(`unregister:${accel}`);
    },
  };
  const mgr = createGlobalShortcutManager({
    globalShortcut: fakeGlobalShortcut,
    getMainWindow: () => null,
    log: () => {},
  });

  mgr.sync({ show: 'F5', globalActions: { show: true } });
  assert.ok(registered.has('F5'));

  // change binding
  mgr.sync({ show: 'F6', globalActions: { show: true } });
  assert.ok(!registered.has('F5'), 'F5 should be unregistered after rebind');
  assert.ok(registered.has('F6'));

  // turn off global
  mgr.sync({ show: 'F6', globalActions: {} });
  assert.ok(!registered.has('F6'), 'F6 should be unregistered after unflagging');
});

test('createGlobalShortcutManager: register failure ends up in conflicts', () => {
  const fakeGlobalShortcut = {
    register: () => false,
    unregister: () => {},
  };
  const mgr = createGlobalShortcutManager({
    globalShortcut: fakeGlobalShortcut,
    getMainWindow: () => null,
    log: () => {},
  });
  const result = mgr.sync({ show: 'F5', globalActions: { show: true } });
  assert.deepEqual(result.conflicts, ['F5']);
  assert.deepEqual(result.registered, []);
});
