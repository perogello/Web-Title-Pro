import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketHub } from '../server/ws/hub.js';

const createClient = () => {
  const messages = [];
  return {
    messages,
    client: {
      readyState: 1,
      send: (message) => messages.push(JSON.parse(message)),
    },
  };
};

test('WebSocketHub: snapshot broadcasts the full store snapshot', () => {
  const { client, messages } = createClient();
  const hub = new WebSocketHub({
    server: { clients: new Set([client]) },
    store: {
      getSnapshot: () => ({ entries: [{ id: 'entry-1' }], timers: [] }),
      getTimerUpdate: () => {
        throw new Error('timer payload should not be used for snapshots');
      },
    },
  });

  hub.broadcast('snapshot');

  assert.deepEqual(messages, [
    {
      type: 'snapshot',
      payload: { entries: [{ id: 'entry-1' }], timers: [] },
    },
  ]);
});

test('WebSocketHub: timer-tick broadcasts only the timer slice', () => {
  const { client, messages } = createClient();
  const hub = new WebSocketHub({
    server: { clients: new Set([client]) },
    store: {
      getSnapshot: () => {
        throw new Error('full snapshot should not be used for timer ticks');
      },
      getTimerUpdate: () => ({ serverTime: 123, timers: [{ id: 'main', currentMs: 1000 }] }),
    },
  });

  hub.broadcast('timer-tick');

  assert.deepEqual(messages, [
    {
      type: 'timer-tick',
      payload: { serverTime: 123, timers: [{ id: 'main', currentMs: 1000 }] },
    },
  ]);
});

test('WebSocketHub: timer-tick can reuse a precomputed timer payload', () => {
  const { client, messages } = createClient();
  const payload = { serverTime: 456, timers: [{ id: 'main', currentMs: 500 }] };
  const hub = new WebSocketHub({
    server: { clients: new Set([client]) },
    store: {
      getSnapshot: () => {
        throw new Error('full snapshot should not be used for timer ticks');
      },
      getTimerUpdate: () => {
        throw new Error('timer payload should not be recomputed when supplied');
      },
    },
  });

  hub.broadcast('timer-tick', payload);

  assert.deepEqual(messages, [
    {
      type: 'timer-tick',
      payload,
    },
  ]);
});
