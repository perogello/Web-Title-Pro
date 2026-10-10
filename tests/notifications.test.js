import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowFeedback } from '../client/src/control-shell/lib/use-feedback.js';

test('shouldShowFeedback: all / errors only / none', () => {
  assert.equal(shouldShowFeedback('all', 'info'), true);
  assert.equal(shouldShowFeedback('all', 'error'), true);
  assert.equal(shouldShowFeedback('errors', 'info'), false);
  assert.equal(shouldShowFeedback('errors', 'error'), true);
  assert.equal(shouldShowFeedback('none', 'info'), false);
  assert.equal(shouldShowFeedback('none', 'error'), false);
});
