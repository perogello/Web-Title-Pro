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

test('collectGlobalAccelerators: returns only globally-flagged per-output bindings', () => {
  const result = collectGlobalAccelerators({
    outputs: {
      main: { titleIn: 'F5', titleOut: 'F6', previewIn: 'F7' },
    },
    globalActions: { 'output:main:titleIn': true, 'output:main:previewIn': true },
  });
  const actions = result.map((r) => r.action);
  assert.ok(actions.includes('output:main:titleIn'));
  assert.ok(actions.includes('output:main:previewIn'));
  assert.ok(!actions.includes('output:main:titleOut'), 'titleOut is not flagged global');
  assert.equal(result.find((r) => r.action === 'output:main:titleIn').accelerator, 'F5');
});

test('collectGlobalAccelerators: skips mouse bindings even when flagged', () => {
  const result = collectGlobalAccelerators({
    outputs: { main: { titleIn: 'Mouse Back' } },
    globalActions: { 'output:main:titleIn': true },
  });
  assert.equal(result.length, 0);
});

test('collectGlobalAccelerators: timers and global commands', () => {
  const result = collectGlobalAccelerators({
    timers: { abc: { start: 'F10', reset: 'F11' } },
    global: { allOutputsOut: 'Escape' },
    globalActions: {
      'timer:abc:start': true,
      'timer:abc:reset': true,
      'global:allOutputsOut': true,
    },
  });
  const map = Object.fromEntries(result.map((r) => [r.action, r.accelerator]));
  assert.equal(map['timer:abc:start'], 'F10');
  assert.equal(map['timer:abc:reset'], 'F11');
  assert.equal(map['global:allOutputsOut'], 'Escape');
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

  mgr.sync({ outputs: { main: { titleIn: 'F5' } }, globalActions: { 'output:main:titleIn': true } });
  assert.ok(registered.has('F5'));

  // change binding
  mgr.sync({ outputs: { main: { titleIn: 'F6' } }, globalActions: { 'output:main:titleIn': true } });
  assert.ok(!registered.has('F5'), 'F5 should be unregistered after rebind');
  assert.ok(registered.has('F6'));

  // turn off global
  mgr.sync({ outputs: { main: { titleIn: 'F6' } }, globalActions: {} });
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
  const result = mgr.sync({
    outputs: { main: { titleIn: 'F5' } },
    globalActions: { 'output:main:titleIn': true },
  });
  assert.deepEqual(result.conflicts, [
    { accelerator: 'F5', raw: 'F5', action: 'output:main:titleIn' },
  ]);
  assert.deepEqual(result.registered, []);
});
