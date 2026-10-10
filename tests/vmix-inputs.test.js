import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isVmixGtInput } from '../client/src/control-shell/lib/entry-utils.js';

test('isVmixGtInput: GT titles by type or .gtzip name', () => {
  assert.equal(isVmixGtInput({ type: 'GT', title: 'Lower Third' }), true);
  assert.equal(isVmixGtInput({ type: 'gt', title: 'Anything' }), true);
  assert.equal(isVmixGtInput({ type: 'Xaml', title: 'Score.gtzip' }), true);
});

test('isVmixGtInput: rejects non-title inputs', () => {
  for (const input of [
    { type: 'Capture', title: 'Camera 1' },
    { type: 'Video', title: 'Opener.mp4' },
    { type: 'Colour', title: 'Black' },
    { type: 'Browser', title: 'http://127.0.0.1:4000/render.html' },
    { type: 'Xaml', title: 'Old title.xaml' },
    { type: '', title: '' },
    null,
  ]) {
    assert.equal(isVmixGtInput(input), false, JSON.stringify(input));
  }
});
