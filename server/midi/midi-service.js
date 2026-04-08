import { EventEmitter } from 'node:events';
import JZZ from 'jzz';

const defaultBindings = [
  { device: 'any', type: 'noteon', note: 60, action: 'show' },
  { device: 'any', type: 'noteon', note: 61, action: 'live' },
  { device: 'any', type: 'noteon', note: 62, action: 'hide' },
  { device: 'any', type: 'noteon', note: 63, action: 'previous-title' },
  { device: 'any', type: 'noteon', note: 64, action: 'next-title' },
];

const parseMidiMessage = (data = []) => {
  const [status, data1, data2] = data;
  const command = status >> 4;

  if (command === 9 && data2 > 0) {
    return { type: 'noteon', note: data1, velocity: data2 };
  }

  if (command === 8 || (command === 9 && data2 === 0)) {
    return { type: 'noteoff', note: data1, velocity: data2 };
  }

  if (command === 11) {
    return { type: 'cc', controller: data1, value: data2 };
  }

  return null;
};

export class MidiService extends EventEmitter {
  constructor() {
    super();
    this.enabled = false;
    this.inputs = [];
    this.bindings = [...defaultBindings];
    this.error = null;
    this.engine = null;
    this.ports = [];
    this.learningAction = null;
    this.lastMessage = null;
  }

  async init() {
    await this.refresh();
  }

  async closePorts() {
    for (const port of this.ports) {
      try {
        port.disconnect();
      } catch {}

      try {
        if (typeof port.close === 'function') {
          port.close();
        }
      } catch {}
    }

    this.ports = [];
  }

  handleParsedMessage(inputName, parsed) {
    this.lastMessage = {
      ...parsed,
      device: inputName,
      receivedAt: new Date().toISOString(),
    };

    if (this.learningAction) {
      const nextBinding = {
        device: inputName,
        type: parsed.type,
        action: this.learningAction,
      };

      if (parsed.note !== undefined) {
        nextBinding.note = parsed.note;
      }

      if (parsed.controller !== undefined) {
        nextBinding.controller = parsed.controller;
      }

      this.bindings = [
        ...this.bindings.filter((binding) => binding.action !== this.learningAction),
        nextBinding,
      ];
      this.learningAction = null;
      this.emit('state', this.getState());
    }

    for (const binding of this.bindings) {
      const deviceMatches = binding.device === 'any' || binding.device === inputName;
      const typeMatches = binding.type === parsed.type;
      const noteMatches = binding.note === undefined || binding.note === parsed.note;
      const controllerMatches = binding.controller === undefined || binding.controller === parsed.controller;

      if (deviceMatches && typeMatches && noteMatches && controllerMatches) {
        this.emit('action', { action: binding.action, device: inputName, message: parsed });
      }
    }
  }

  async refresh() {
    try {
      await this.closePorts();

      this.engine = JZZ();
      const info = this.engine.info?.() || {};
      this.inputs = info.inputs || [];
      this.error = null;

      for (const input of this.inputs) {
        await new Promise((resolve) => {
          this.engine
            .openMidiIn(input.name)
            .or(() => resolve())
            .and((port) => {
              this.ports.push(port);

              port.connect((message) => {
                const parsed = parseMidiMessage(Array.from(message));

                if (!parsed) {
                  return;
                }

                this.handleParsedMessage(input.name, parsed);
              });

              resolve();
            });
        });
      }

      this.enabled = true;
      this.emit('state', this.getState());
      return this.getState();
    } catch (error) {
      this.error = error.message;
      this.enabled = false;
      this.emit('state', this.getState());
      return this.getState();
    }
  }

  startLearn(action) {
    if (!['show', 'live', 'hide', 'next-title', 'previous-title'].includes(action)) {
      throw new Error('Unsupported MIDI learn action.');
    }

    this.learningAction = action;
    this.emit('state', this.getState());
    return this.getState();
  }

  stopLearn() {
    this.learningAction = null;
    this.emit('state', this.getState());
    return this.getState();
  }

  clearBinding(action) {
    if (!['show', 'live', 'hide', 'next-title', 'previous-title'].includes(action)) {
      throw new Error('Unsupported MIDI binding action.');
    }

    this.bindings = this.bindings.filter((binding) => binding.action !== action);
    if (this.learningAction === action) {
      this.learningAction = null;
    }
    this.emit('state', this.getState());
    return this.getState();
  }

  getState() {
    return {
      enabled: this.enabled,
      inputs: this.inputs,
      bindings: this.bindings,
      error: this.error,
      learningAction: this.learningAction,
      lastMessage: this.lastMessage,
    };
  }
}
