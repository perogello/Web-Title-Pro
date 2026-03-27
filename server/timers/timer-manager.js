import { EventEmitter } from 'node:events';

export class TimerManager extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.interval = null;
  }

  start() {
    if (this.interval) {
      return;
    }

    this.interval = setInterval(() => {
      if (!this.store.hasRunningTimers()) {
        return;
      }

      this.store.normalizeRunningTimers();
      this.emit('tick', this.store.getSnapshot());
    }, 100);
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
  }
}
