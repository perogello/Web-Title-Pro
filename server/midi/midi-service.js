import { EventEmitter } from 'node:events';

let JZZ = null;
const loadJZZ = async () => {
  if (!JZZ) {
    const mod = await import('jzz');
    JZZ = mod.default || mod;
  }
  return JZZ;
};

const defaultBindings = [
  { device: 'any', type: 'noteon', note: 60, action: 'show' },
  { device: 'any', type: 'noteon', note: 61, action: 'live' },
  { device: 'any', type: 'noteon', note: 62, action: 'hide' },
  { device: 'any', type: 'noteon', note: 63, action: 'previous-title' },
  { device: 'any', type: 'noteon', note: 64, action: 'next-title' },
];

const normalizeBinding = (binding = {}) => ({
  device: typeof binding.device === 'string' && binding.device ? binding.device : 'any',
  type: ['noteon', 'cc'].includes(binding.type) ? binding.type : 'noteon',
  ...(binding.note !== undefined ? { note: Number(binding.note) } : {}),
  ...(binding.controller !== undefined ? { controller: Number(binding.controller) } : {}),
  action: typeof binding.action === 'string' ? binding.action : '',
});

export const normalizeMidiBindings = (bindings = defaultBindings) =>
  (Array.isArray(bindings) && bindings.length ? bindings : defaultBindings)
    .map((binding) => normalizeBinding(binding))
    .filter((binding) => isSupportedAction(binding.action));

export const SUPPORTED_MIDI_ACTIONS = ['show', 'live', 'hide', 'next-title', 'previous-title'];

export const parseMidiMessage = (data = []) => {
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

const isSupportedAction = (action = '') =>
  ['show', 'live', 'hide', 'next-title', 'previous-title'].includes(action) ||
  /^select-output:[\w-]+$/.test(action) ||
  /^entry-select:[\w-]+$/.test(action) ||
  /^timer-toggle:[\w-]+$/.test(action) ||
  /^timer-reset:[\w-]+$/.test(action);

const isPressTrigger = (parsed = {}) => {
  if (parsed.type === 'noteon') {
    return true;
  }

  if (parsed.type === 'cc') {
    return Number(parsed.value || 0) > 0;
  }

  return false;
};

export class MidiService extends EventEmitter {
  constructor({ bindings, onBindingsChange } = {}) {
    super();
    this.enabled = false;
    this.inputs = [];
    this.bindings = normalizeMidiBindings(bindings);
    this.onBindingsChange = typeof onBindingsChange === 'function' ? onBindingsChange : null;
    this.error = null;
    this.engine = null;
    this.ports = [];
    this.learningAction = null;
    this.lastMessage = null;
    this.lastActionKeys = new Map();
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

    const canTriggerAction = isPressTrigger(parsed);

    if (this.learningAction && canTriggerAction) {
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
      this.onBindingsChange?.(this.bindings);
      this.learningAction = null;
      this.emit('state', this.getState());
    }

    if (!canTriggerAction) {
      this.emit('state', this.getState());
      return;
    }

    for (const binding of this.bindings) {
      const deviceMatches = binding.device === 'any' || binding.device === inputName;
      const typeMatches = binding.type === parsed.type;
      const noteMatches = binding.note === undefined || binding.note === parsed.note;
      const controllerMatches = binding.controller === undefined || binding.controller === parsed.controller;

      if (deviceMatches && typeMatches && noteMatches && controllerMatches) {
        const actionKey = `${binding.action}:${inputName}:${parsed.type}:${parsed.note ?? parsed.controller ?? ''}`;
        const now = Date.now();
        const previousAt = this.lastActionKeys.get(actionKey) || 0;
        if (now - previousAt < 140) {
          continue;
        }
        this.lastActionKeys.set(actionKey, now);
        this.emit('action', { action: binding.action, device: inputName, message: parsed });
      }
    }
  }

  async refresh() {
    try {
      await this.closePorts();

      const JZZCtor = await loadJZZ();
      this.engine = JZZCtor();
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
    if (!isSupportedAction(action)) {
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
    if (!isSupportedAction(action)) {
      throw new Error('Unsupported MIDI binding action.');
    }

    this.bindings = this.bindings.filter((binding) => binding.action !== action);
    this.onBindingsChange?.(this.bindings);
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
