import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTimerColor } from '../server/state/store.js';

test('resolveTimerColor: no triggers -> default color', () => {
  const timer = { mode: 'countdown', defaultColor: '#abcdef', colorTriggers: [] };
  assert.equal(resolveTimerColor(timer, 0), '#abcdef');
  assert.equal(resolveTimerColor(timer, 99999), '#abcdef');
});

test('resolveTimerColor: empty default + no triggers -> empty string', () => {
  assert.equal(resolveTimerColor({ mode: 'countdown', defaultColor: '', colorTriggers: [] }, 0), '');
});

test('resolveTimerColor: countdown above all atMs -> default', () => {
  const timer = {
    mode: 'countdown',
    defaultColor: '#ffffff',
    colorTriggers: [
      { id: 'a', atMs: 0, color: '#ff0000' },
      { id: 'b', atMs: 10000, color: '#ffff00' },
      { id: 'c', atMs: 60000, color: '#ffaa00' },
    ],
  };
  assert.equal(resolveTimerColor(timer, 70000), '#ffffff');
});

test('resolveTimerColor: countdown between thresholds picks lowest reached', () => {
  const timer = {
    mode: 'countdown',
    defaultColor: '#ffffff',
    colorTriggers: [
      { id: 'a', atMs: 0, color: '#ff0000' },
      { id: 'b', atMs: 10000, color: '#ffff00' },
      { id: 'c', atMs: 60000, color: '#ffaa00' },
    ],
  };
  assert.equal(resolveTimerColor(timer, 30000), '#ffaa00');
  assert.equal(resolveTimerColor(timer, 60000), '#ffaa00');
  assert.equal(resolveTimerColor(timer, 5000), '#ffff00');
  assert.equal(resolveTimerColor(timer, 0), '#ff0000');
});

test('resolveTimerColor: countup picks highest threshold reached', () => {
  const timer = {
    mode: 'countup',
    defaultColor: '#ffffff',
    colorTriggers: [
      { id: 'a', atMs: 60000, color: '#ffaa00' },
      { id: 'b', atMs: 120000, color: '#ff0000' },
    ],
  };
  assert.equal(resolveTimerColor(timer, 0), '#ffffff');
  assert.equal(resolveTimerColor(timer, 60000), '#ffaa00');
  assert.equal(resolveTimerColor(timer, 90000), '#ffaa00');
  assert.equal(resolveTimerColor(timer, 120000), '#ff0000');
  assert.equal(resolveTimerColor(timer, 999999), '#ff0000');
});

test('resolveTimerColor: handles unsorted triggers', () => {
  const timer = {
    mode: 'countdown',
    defaultColor: '#ffffff',
    colorTriggers: [
      { id: 'a', atMs: 60000, color: '#ffaa00' },
      { id: 'b', atMs: 0, color: '#ff0000' },
      { id: 'c', atMs: 10000, color: '#ffff00' },
    ],
  };
  assert.equal(resolveTimerColor(timer, 5000), '#ffff00');
});
