export class WebSocketHub {
  constructor({ server, store }) {
    this.server = server;
    this.store = store;
  }

  start() {
    this.server.on('connection', (socket) => {
      socket.send(JSON.stringify({ type: 'snapshot', payload: this.store.getSnapshot() }));
    });
  }

  broadcast(type = 'snapshot') {
    const message = JSON.stringify({ type, payload: this.store.getSnapshot() });

    for (const client of this.server.clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }
}
