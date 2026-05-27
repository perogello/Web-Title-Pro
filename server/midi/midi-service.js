import { EventEmitter } from 'node:events';

let JZZ = null;
const loadJZZ = async () => {
  if (!JZZ) {
    const mod = await import('jzz');
    JZZ = mod.default || mod;
  }
  return JZZ;
};

const toMidiNumber = (value, { min = 0, max = 127 } = {}) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : undefined;
};

const normalizeBinding = (binding = {}) => {
  const note = toMidiNumber(binding.note);
  const controller = toMidiNumber(binding.controller);
  const channel = toMidiNumber(binding.channel, { min: 1, max: 16 });
  const value = toMidiNumber(binding.value);
  const rawValueMode = typeof binding.valueMode === 'string' ? binding.valueMode : '';
  const valueMode = ['any', 'eq', 'gte', 'lte'].includes(rawValueMode) ? rawValueMode : 'any';

  return {
    device: typeof binding.device === 'string' && binding.device ? binding.device : 'any',
    ...(typeof binding.deviceName === 'string' && binding.deviceName ? { deviceName: binding.deviceName } : {}),
    type: ['noteon', 'cc'].includes(binding.type) ? binding.type : 'noteon',
    ...(note !== undefined ? { note } : {}),
    ...(controller !== undefined ? { controller } : {}),
    ...(channel !== undefined ? { channel } : {}),
    ...(binding.type === 'cc' && valueMode !== 'any' && value !== undefined ? { valueMode, value } : {}),
    action: typeof binding.action === 'string' ? binding.action : '',
  };
};

export const normalizeMidiBindings = (bindings = []) =>
  (Array.isArray(bindings) ? bindings : [])
    .map((binding) => normalizeBinding(binding))
    .filter((binding) => isSupportedAction(binding.action));

export const SUPPORTED_MIDI_ACTIONS = ['show', 'live', 'hide', 'next-title', 'previous-title'];

export const normalizeMidiActionForDispatch = (action = '') => {
  if (action === 'nextTitle') return 'next-title';
  if (action === 'previousTitle') return 'previous-title';
  if (action.startsWith('selectOutput:')) return `select-output:${action.slice('selectOutput:'.length)}`;
  if (action.startsWith('selectEntry:')) return `entry-select:${action.slice('selectEntry:'.length)}`;
  if (action.startsWith('timerToggle:')) return `timer-toggle:${action.slice('timerToggle:'.length)}`;
  if (action.startsWith('timerReset:')) return `timer-reset:${action.slice('timerReset:'.length)}`;
  return action;
};

export const parseMidiMessage = (data = []) => {
  const [status, data1, data2] = data;
  if (typeof status !== 'number') {
    return null;
  }

  const command = status >> 4;
  const channel = (status & 0x0f) + 1;

  if (command === 9 && data2 > 0) {
    return { type: 'noteon', channel, note: data1, velocity: data2 };
  }

  if (command === 8 || (command === 9 && data2 === 0)) {
    return { type: 'noteoff', channel, note: data1, velocity: data2 };
  }

  if (command === 11) {
    return { type: 'cc', channel, controller: data1, value: data2 };
  }

  return null;
};

const isSupportedAction = (action = '') =>
  ['show', 'live', 'hide', 'next-title', 'previous-title'].includes(normalizeMidiActionForDispatch(action)) ||
  /^select-output:[\w-]+$/.test(normalizeMidiActionForDispatch(action)) ||
  /^entry-select:[\w-]+$/.test(normalizeMidiActionForDispatch(action)) ||
  /^timer-toggle:[\w-]+$/.test(normalizeMidiActionForDispatch(action)) ||
  /^timer-reset:[\w-]+$/.test(normalizeMidiActionForDispatch(action));

const isPressTrigger = (parsed = {}) => {
  if (parsed.type === 'noteon') {
    return true;
  }

  if (parsed.type === 'cc') {
    return Number(parsed.value || 0) > 0;
  }

  return false;
};

const matchesValueRule = (binding = {}, parsed = {}) => {
  if (binding.type !== 'cc' || binding.valueMode === undefined || binding.valueMode === 'any') {
    return true;
  }

  const bindingValue = toMidiNumber(binding.value);
  const parsedValue = toMidiNumber(parsed.value);
  if (bindingValue === undefined || parsedValue === undefined) {
    return false;
  }

  if (binding.valueMode === 'eq') {
    return parsedValue === bindingValue;
  }

  if (binding.valueMode === 'gte') {
    return parsedValue >= bindingValue;
  }

  if (binding.valueMode === 'lte') {
    return parsedValue <= bindingValue;
  }

  return true;
};

const normalizeTextKey = (value) => String(value ?? '').trim().toLowerCase();

const compactUniqueMessages = (messages = []) => {
  const seen = new Set();
  const result = [];

  for (const message of messages) {
    const clean = String(message || '').replace(/\s+/g, ' ').trim();
    const key = normalizeTextKey(clean);
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }

  return result;
};

const summarizeMessages = (messages = [], limit = 2) => {
  const unique = compactUniqueMessages(messages);
  if (unique.length <= limit) {
    return unique.join('; ');
  }

  return `${unique.slice(0, limit).join('; ')}; +${unique.length - limit} more`;
};

const closeMidiPort = (port) => {
  if (!port) return;

  try {
    if (typeof port.disconnect === 'function') {
      port.disconnect();
    }
  } catch {}

  try {
    if (typeof port.close === 'function') {
      port.close();
    }
  } catch {}
};

export class MidiService extends EventEmitter {
  constructor({ bindings, onBindingsChange, jzzFactory, openTimeoutMs = 2500 } = {}) {
    super();
    this.enabled = false;
    this.inputs = [];
    this.bindings = normalizeMidiBindings(bindings);
    this.onBindingsChange = typeof onBindingsChange === 'function' ? onBindingsChange : null;
    this.jzzFactory = typeof jzzFactory === 'function' ? jzzFactory : null;
    this.error = null;
    this.engine = null;
    this.ports = [];
    this.refreshPromise = null;
    this.learningAction = null;
    this.lastMessage = null;
    this.lastActionKeys = new Map();
    this.recentMessages = [];
    this.recentMessagesLimit = 50;
    this.openTimeoutMs = openTimeoutMs;
    this.changeWatcher = null;
    this.changeWatcherHandler = null;
    this.changeRefreshTimer = null;
    this.inputSignature = '';
  }

  recordRawMessage(inputName, rawBytes, parsed) {
    const entry = {
      at: new Date().toISOString(),
      device: inputName,
      raw: Array.isArray(rawBytes) ? rawBytes : [...(rawBytes || [])],
      parsed: parsed || null,
    };
    this.recentMessages = [entry, ...this.recentMessages].slice(0, this.recentMessagesLimit);
    return entry;
  }

  async init() {
    await this.refresh();
  }

  setupChangeWatcher() {
    if (this.changeWatcher || !this.engine || typeof this.engine.onChange !== 'function') {
      return;
    }

    this.changeWatcherHandler = () => {
      if (this.changeRefreshTimer) {
        clearTimeout(this.changeRefreshTimer);
      }

      this.changeRefreshTimer = setTimeout(() => {
        this.changeRefreshTimer = null;
        const nextSignature = this.getCurrentInputSignature();
        if (nextSignature && nextSignature === this.inputSignature) {
          return;
        }
        this.refresh().catch(() => {});
      }, 500);
    };

    try {
      this.changeWatcher = this.engine.onChange(this.changeWatcherHandler);
    } catch {}
  }

  async closePorts() {
    for (const port of this.ports) {
      closeMidiPort(port);
    }

    this.ports = [];
  }

  async close() {
    if (this.changeRefreshTimer) {
      clearTimeout(this.changeRefreshTimer);
      this.changeRefreshTimer = null;
    }

    if (this.changeWatcher) {
      try {
        if (typeof this.changeWatcher.disconnect === 'function') {
          this.changeWatcher.disconnect(this.changeWatcherHandler);
        }
      } catch {}
    }

    this.changeWatcher = null;
    this.changeWatcherHandler = null;
    await this.closePorts();
  }

  normalizeInputInfo(input, index) {
    if (typeof input === 'string') {
      return { id: input, name: input, index };
    }

    const name = input?.name || input?.id || `MIDI Input ${index + 1}`;
    return {
      id: input?.id || name,
      name,
      index,
      manufacturer: input?.manufacturer || '',
      version: input?.version || '',
    };
  }

  getInputOpenTargets(input) {
    return [input.name, input.id, input.index].filter((target, index, list) =>
      target !== undefined && target !== null && target !== '' && list.indexOf(target) === index,
    );
  }

  getInputSignature(inputs = this.inputs) {
    return (Array.isArray(inputs) ? inputs : [])
      .map((input) => [
        normalizeTextKey(input?.id),
        normalizeTextKey(input?.name),
        normalizeTextKey(input?.manufacturer),
        normalizeTextKey(input?.version),
      ].join('|'))
      .sort()
      .join('||');
  }

  getCurrentInputSignature() {
    try {
      const info = this.engine?.info?.() || {};
      const inputs = (Array.isArray(info.inputs) ? info.inputs : []).map((input, index) =>
        this.normalizeInputInfo(input, index),
      );
      return this.getInputSignature(inputs);
    } catch {
      return '';
    }
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
        device: 'any',
        deviceName: inputName,
        type: parsed.type,
        action: this.learningAction,
      };

      if (parsed.channel !== undefined) {
        nextBinding.channel = parsed.channel;
      }

      if (parsed.note !== undefined) {
        nextBinding.note = parsed.note;
      }

      if (parsed.controller !== undefined) {
        nextBinding.controller = parsed.controller;
      }

      if (parsed.type === 'cc' && parsed.value !== undefined) {
        nextBinding.valueMode = 'eq';
        nextBinding.value = parsed.value;
      }

      this.bindings = [
        ...this.bindings.filter((binding) => binding.action !== this.learningAction),
        nextBinding,
      ];
      this.onBindingsChange?.(this.bindings);
      this.learningAction = null;
      this.emit('state', this.getState());
      return;
    }

    if (!canTriggerAction) {
      this.emit('state', this.getState());
      return;
    }

    for (const binding of this.bindings) {
      const deviceMatches = binding.device === 'any' || binding.device === inputName;
      const typeMatches = binding.type === parsed.type;
      const channelMatches = binding.channel === undefined || binding.channel === parsed.channel;
      const noteMatches = binding.note === undefined || binding.note === parsed.note;
      const controllerMatches = binding.controller === undefined || binding.controller === parsed.controller;
      const valueMatches = matchesValueRule(binding, parsed);

      if (deviceMatches && typeMatches && channelMatches && noteMatches && controllerMatches && valueMatches) {
        const actionKey = `${binding.action}:${inputName}:${parsed.type}:${parsed.channel ?? ''}:${parsed.note ?? parsed.controller ?? ''}:${binding.valueMode ?? ''}:${binding.value ?? ''}`;
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
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  async performRefresh() {
    try {
      await this.closePorts();

      const JZZCtor = this.jzzFactory ? await this.jzzFactory() : await loadJZZ();
      this.engine = JZZCtor();
      this.setupChangeWatcher();
      const info = this.engine.info?.() || {};
      const detectedInputs = (Array.isArray(info.inputs) ? info.inputs : []).map((input, index) =>
        this.normalizeInputInfo(input, index),
      );
      this.inputSignature = this.getInputSignature(detectedInputs);
      const nextInputs = [];
      const openErrors = [];

      for (const input of detectedInputs) {
        const { port, errors } = await this.openInputPort(input);
        openErrors.push(...errors);
        if (port) {
          this.ports.push(port);
          nextInputs.push({ ...input, open: true });
        } else {
          nextInputs.push({ ...input, open: false, error: summarizeMessages(errors) });
        }
      }

      this.inputs = nextInputs;
      this.enabled = this.ports.length > 0;
      this.error = this.inputs.length === 0
          ? 'No MIDI inputs detected.'
          : this.ports.length === 0
            ? [
                `${this.inputs.length} MIDI input(s) detected, but no input port could be opened.`,
                'Another app, for example vMix, may already be using this controller through an exclusive Windows MIDI driver.',
                'Close the other MIDI owner or route the controller through a virtual MIDI splitter, reconnect it, then press Refresh MIDI.',
                summarizeMessages(openErrors) ? `Last error: ${summarizeMessages(openErrors)}` : '',
              ].filter(Boolean).join(' ')
            : null;
      this.emit('state', this.getState());
      return this.getState();
    } catch (error) {
      this.error = error.message;
      this.enabled = false;
      this.emit('state', this.getState());
      return this.getState();
    }
  }

  async openInputPort(input) {
    const errors = [];

    for (const target of this.getInputOpenTargets(input)) {
      const result = await new Promise((resolve) => {
        let timeout = null;
        try {
          const port = this.engine.openMidiIn(target);
          if (!port || typeof port.connect !== 'function') {
            closeMidiPort(port);
            resolve({ port: null, error: `${input.name} (${target}): input port unavailable` });
            return;
          }

          port.connect((message) => {
            const raw = Array.from(message);
            const parsed = parseMidiMessage(raw);
            this.recordRawMessage(input.name, raw, parsed);

            if (!parsed) {
              this.emit('state', this.getState());
              return;
            }

            this.handleParsedMessage(input.name, parsed);
          });

          let settled = false;
          const finish = (payload) => {
            if (!settled) {
              settled = true;
              if (timeout) {
                clearTimeout(timeout);
              }
              resolve(payload);
            }
          };

          timeout = setTimeout(() => {
            closeMidiPort(port);
            finish({ port: null, error: `${input.name} (${target}): open timed out` });
          }, this.openTimeoutMs);

          if (typeof port.or === 'function') {
            port.or((error) => {
              closeMidiPort(port);
              finish({ port: null, error: `${input.name} (${target}): ${error?.message || 'failed to open'}` });
            });
          }

          if (typeof port.and === 'function') {
            port.and(() => {
              finish({ port, error: null });
            });
          } else {
            finish({ port, error: null });
          }
        } catch (error) {
          resolve({ port: null, error: `${input.name} (${target}): ${error.message}` });
        }
      });

      if (result.port) {
        return { port: result.port, errors: [] };
      }

      if (result.error) {
        errors.push(result.error);
      }
    }

    return { port: null, errors };
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

  updateBinding(action, patch = {}) {
    if (!isSupportedAction(action)) {
      throw new Error('Unsupported MIDI binding action.');
    }

    const current = this.bindings.find((binding) => binding.action === action);

    const nextBinding = normalizeBinding({
      ...(current || { device: 'any', type: patch?.type || 'noteon' }),
      ...patch,
      action,
    });

    this.bindings = current
      ? this.bindings.map((binding) => (binding.action === action ? nextBinding : binding))
      : [...this.bindings, nextBinding];
    this.onBindingsChange?.(this.bindings);
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
      recentMessages: this.recentMessages,
    };
  }
}
