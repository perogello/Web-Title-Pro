export class WebSocketHub {
  constructor({ server, store }) {
    this.server = server;
    this.store = store;
  }

  start() {
    this.server.on('connection', (socket) => {
      // Per-socket error handler so one broken renderer doesn't tear down
      // the whole process via an unhandled 'error' event. ws emits 'error'
      // before 'close' and a missing listener is treated as fatal by Node.
      socket.on('error', () => {});
      try {
        socket.send(JSON.stringify({ type: 'snapshot', payload: this.store.getSnapshot() }));
      } catch {
        // Client disconnected between the upgrade and the initial send —
        // nothing to do, the close handler will clean up.
      }
    });
  }

  broadcast(type = 'snapshot', payload = null) {
    const resolvedPayload =
      payload || (type === 'timer-tick' ? this.store.getTimerUpdate() : this.store.getSnapshot());
    const message = JSON.stringify({ type, payload: resolvedPayload });

    for (const client of this.server.clients) {
      if (client.readyState === 1) {
        // Wrap individual sends — a single thrown send (e.g. socket in a
        // half-closed state under load) should not abort the whole fan-out.
        try {
          client.send(message);
        } catch {
          // ignore: ws library will mark the socket and emit 'close'
        }
      }
    }
  }
}
