import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeMouseButton,
  formatShortcutFromEvent,
  isTypingTarget,
  normalizeKeyName,
} from '../client/src/control-shell/shortcut-utils.js';

test('normalizeKeyName: single letter uppercased', () => {
  assert.equal(normalizeKeyName('a'), 'A');
  assert.equal(normalizeKeyName('1'), '1');
});

test('normalizeKeyName: maps special keys', () => {
  assert.equal(normalizeKeyName(' '), 'Space');
  assert.equal(normalizeKeyName('Escape'), 'Escape');
  assert.equal(normalizeKeyName('Esc'), 'Escape');
  assert.equal(normalizeKeyName('ArrowUp'), 'Arrow Up');
  assert.equal(normalizeKeyName('Tab'), 'Tab');
});

test('normalizeKeyName: passes through unknown multi-char keys (F-keys etc)', () => {
  assert.equal(normalizeKeyName('F5'), 'F5');
  assert.equal(normalizeKeyName('PageUp'), 'PageUp');
});

test('describeMouseButton: known buttons', () => {
  assert.equal(describeMouseButton(0), 'Mouse Left');
  assert.equal(describeMouseButton(1), 'Mouse Middle');
  assert.equal(describeMouseButton(2), 'Mouse Right');
  assert.equal(describeMouseButton(3), 'Mouse Back');
  assert.equal(describeMouseButton(4), 'Mouse Forward');
});

test('describeMouseButton: unknown button falls back', () => {
  assert.equal(describeMouseButton(7), 'Mouse 7');
});

test('formatShortcutFromEvent: keydown, plain letter', () => {
  const event = { type: 'keydown', key: 'a', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
  assert.equal(formatShortcutFromEvent(event), 'A');
});

test('formatShortcutFromEvent: keydown with modifiers preserves order Ctrl+Alt+Shift+Meta+Key', () => {
  const event = { type: 'keydown', key: 'k', ctrlKey: true, altKey: true, shiftKey: true, metaKey: true };
  assert.equal(formatShortcutFromEvent(event), 'Ctrl+Alt+Shift+Meta+K');
});

test('formatShortcutFromEvent: Ctrl+Shift+ArrowUp', () => {
  const event = { type: 'keydown', key: 'ArrowUp', ctrlKey: true, shiftKey: true };
  assert.equal(formatShortcutFromEvent(event), 'Ctrl+Shift+Arrow Up');
});

test('formatShortcutFromEvent: bare modifier press yields no shortcut', () => {
  const event = { type: 'keydown', key: 'Control', ctrlKey: true };
  assert.equal(formatShortcutFromEvent(event), '');
});

test('formatShortcutFromEvent: mousedown left without modifier yields shortcut', () => {
  const event = { type: 'mousedown', button: 0 };
  assert.equal(formatShortcutFromEvent(event), 'Mouse Left');
});

test('formatShortcutFromEvent: mousedown right with Ctrl', () => {
  const event = { type: 'mousedown', button: 2, ctrlKey: true };
  assert.equal(formatShortcutFromEvent(event), 'Ctrl+Mouse Right');
});

test('formatShortcutFromEvent: empty event key without modifier => empty', () => {
  const event = { type: 'keydown', key: '' };
  assert.equal(formatShortcutFromEvent(event), '');
});

test('formatShortcutFromEvent: null event returns empty string', () => {
  assert.equal(formatShortcutFromEvent(null), '');
});

test('isTypingTarget: input/textarea/select are typing targets', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
});

test('isTypingTarget: contentEditable element', () => {
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
});

test('isTypingTarget: button is not a typing target', () => {
  assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
});

test('isTypingTarget: null is safe', () => {
  assert.equal(isTypingTarget(null), false);
});
