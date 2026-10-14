// Web Title Pro — Bitfocus Companion connection module.
//
// Live state comes from the same WebSocket the WTP control panel uses
// (ws://host:port/ws: full snapshots on change + 10x/s timer ticks); commands go
// through the unified POST /api/command (see docs/BITFOCUS.md). Built into a
// single file with @companion-module/base by scripts/build-companion-module.mjs.
import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base';
import WebSocket from 'ws';
import {
  ACTION_NAMES,
  OUTPUT_COMMANDS,
  PANIC_ACTION_ID,
  TIMER_COMMANDS,
  buildTimerVariableValues,
  buildVariableDefinitions,
  buildVariableValues,
  diffValues,
  entryChoices,
  findOutput,
  findTimer,
  getOutputs,
  isOnAir,
  isPreviewOn,
  mergeTimerTick,
  outputActionId,
  outputChoices,
  outputToggleCommand,
  parseHexColor,
  structureSignature,
  timerActionId,
  timerChoices,
  timerToggleCommand,
} from './model.js';
import { buildPresets } from './presets.js';

// Injected by scripts/build-companion-module.mjs (unit tests import model.js only).
const MODULE_VERSION = typeof __WTP_MODULE_VERSION__ === 'string' ? __WTP_MODULE_VERSION__ : '0.0.0';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10000;

const choiceDefault = (choices) => choices[0]?.id ?? '';

class WebTitleProInstance extends InstanceBase {
  constructor(internal) {
    super(internal);
    this.config = {};
    this.snapshot = null;
    this.catalog = [];
    this.socket = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.reconnectDelay = RECONNECT_MIN_MS;
    this.signature = '';
    this.lastValues = {};
    this.destroyed = false;
    this.bundledVersion = null;
  }

  getConfigFields() {
    return [
      {
        type: 'static-text',
        id: 'info',
        width: 12,
        label: 'Web Title Pro',
        value:
          'Enter the address of the computer running Web Title Pro. Same computer: 127.0.0.1. ' +
          'Another computer: its IP address (Web Title Pro listens on port 4000).',
      },
      { type: 'textinput', id: 'host', label: 'Host', width: 8, default: '127.0.0.1' },
      { type: 'number', id: 'port', label: 'Port', width: 4, default: 4000, min: 1, max: 65535 },
    ];
  }

  async init(config) {
    this.config = config;
    this.applyDefinitions();
    this.connect();
  }

  async configUpdated(config) {
    this.config = config;
    this.disconnect();
    this.snapshot = null;
    this.signature = '';
    this.applyDefinitions();
    this.connect();
  }

  async destroy() {
    this.destroyed = true;
    this.disconnect();
  }

  // ---------------------------------------------------------------- network

  get baseUrl() {
    const host = String(this.config.host || '127.0.0.1').trim();
    const port = Number(this.config.port) || 4000;
    return `http://${host}:${port}`;
  }

  connect() {
    if (this.destroyed) return;
    const host = String(this.config.host || '').trim();
    if (!host) {
      this.updateStatus(InstanceStatus.BadConfig, 'Host is empty');
      return;
    }

    this.updateStatus(InstanceStatus.Connecting);
    const socket = new WebSocket(`${this.baseUrl.replace(/^http/, 'ws')}/ws`);
    this.socket = socket;

    socket.on('open', () => {
      this.connected = true;
      this.reconnectDelay = RECONNECT_MIN_MS;
      this.updateStatus(InstanceStatus.Ok);
      this.log('info', `Connected to Web Title Pro at ${this.baseUrl}`);
      void this.refreshCatalog();
      void this.checkModuleVersion();
    });

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (message.type === 'snapshot') this.onSnapshot(message.payload);
      else if (message.type === 'timer-tick') this.onTimerTick(message.payload);
    });

    socket.on('error', (error) => {
      this.log('debug', `WebSocket error: ${error?.message || error}`);
    });

    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.connected) this.log('warn', 'Disconnected from Web Title Pro');
      this.connected = false;
      this.pushValues();
      this.checkFeedbacks();
      if (this.destroyed) return;
      this.updateStatus(InstanceStatus.ConnectionFailure, `Cannot reach ${this.baseUrl}`);
      this.scheduleReconnect();
    });
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    if (socket) {
      socket.removeAllListeners();
      socket.on('error', () => {});
      try {
        socket.terminate();
      } catch {}
    }
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(RECONNECT_MAX_MS, this.reconnectDelay * 2);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  async request(path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }
    return payload;
  }

  async sendCommand(actionId) {
    try {
      await this.request('/api/command', { actionId });
    } catch (error) {
      this.log('warn', `Command ${actionId} failed: ${error.message}`);
    }
  }

  // The WTP app ships its own copy of this module. A different version means
  // this copy is stale (or newer than the app): say so on the connection.
  async checkModuleVersion() {
    this.bundledVersion = null;
    try {
      const info = await this.request('/api/companion-module');
      this.bundledVersion = info?.available ? info.version : null;
    } catch {
      // Older Web Title Pro without the endpoint — nothing to compare.
    }
    const mismatch = Boolean(this.bundledVersion && this.bundledVersion !== MODULE_VERSION);
    this.pushValues();
    if (mismatch && this.connected) {
      const message = `Module v${MODULE_VERSION}, Web Title Pro ships v${this.bundledVersion} — update: Web Title Pro › Settings › Integrations`;
      this.log('warn', message);
      this.updateStatus(InstanceStatus.UnknownWarning, message);
    }
  }

  // Command catalogue for the generic "Any command" action (covers plugin
  // commands and overlays too). Optional — older WTP builds still work.
  async refreshCatalog() {
    try {
      const catalog = await this.request('/api/command/catalog');
      this.catalog = (catalog.actions || []).map((action) => ({
        id: action.actionId,
        label: [action.targetName, action.description].filter(Boolean).join(' — ') || action.actionId,
      }));
    } catch {
      this.catalog = [];
    }
    this.applyDefinitions();
  }

  // ---------------------------------------------------------------- state

  onSnapshot(snapshot) {
    const before = this.snapshot;
    this.snapshot = snapshot;
    const signature = structureSignature(snapshot, this.catalog.map((item) => item.id));
    if (signature !== this.signature) {
      // Outputs / timers / titles / plugins changed: the catalogue may have too.
      if (before) void this.refreshCatalog();
      else this.applyDefinitions();
    }
    this.pushValues();
    this.checkFeedbacks();
  }

  onTimerTick(tick) {
    if (!this.snapshot) return;
    this.snapshot = mergeTimerTick(this.snapshot, tick);
    const changed = diffValues(this.lastValues, buildTimerVariableValues(this.snapshot));
    if (Object.keys(changed).length) {
      Object.assign(this.lastValues, changed);
      this.setVariableValues(changed);
    }
    this.checkFeedbacks('timer_running', 'timer_color');
  }

  pushValues() {
    const next = {
      ...buildVariableValues(this.snapshot, this.connected),
      module_version: MODULE_VERSION,
      module_update: this.bundledVersion && this.bundledVersion !== MODULE_VERSION ? `v${this.bundledVersion}` : '',
    };
    const changed = diffValues(this.lastValues, next);
    if (Object.keys(changed).length) {
      this.lastValues = { ...this.lastValues, ...changed };
      this.setVariableValues(changed);
    }
  }

  applyDefinitions() {
    const snapshot = this.snapshot;
    this.signature = structureSignature(snapshot, this.catalog.map((item) => item.id));
    this.lastValues = {};
    this.setActionDefinitions(this.buildActions());
    this.setFeedbackDefinitions(this.buildFeedbacks());
    this.setVariableDefinitions([
      ...buildVariableDefinitions(snapshot),
      { variableId: 'module_version', name: 'This Companion module version' },
      { variableId: 'module_update', name: 'Newer module shipped with Web Title Pro (empty = up to date)' },
    ]);
    this.setPresetDefinitions(buildPresets(snapshot, this.label));
    this.pushValues();
  }

  // ---------------------------------------------------------------- definitions

  outputOption(choices) {
    return { type: 'dropdown', id: 'output', label: 'Output', choices, default: choiceDefault(choices) };
  }

  timerOption(choices) {
    return { type: 'dropdown', id: 'timer', label: 'Timer', choices, default: choiceDefault(choices) };
  }

  buildActions() {
    const outputs = outputChoices(this.snapshot);
    const timers = timerChoices(this.snapshot);
    const entries = entryChoices(this.snapshot);

    return {
      output_command: {
        name: ACTION_NAMES.output_command,
        options: [
          this.outputOption(outputs),
          {
            type: 'dropdown',
            id: 'command',
            label: 'Command',
            choices: OUTPUT_COMMANDS,
            default: 'titleIn',
          },
        ],
        callback: async ({ options }) => this.sendCommand(outputActionId(options.output, options.command)),
      },
      output_toggle: {
        name: ACTION_NAMES.output_toggle,
        options: [this.outputOption(outputs)],
        callback: async ({ options }) => {
          const output = findOutput(this.snapshot, options.output);
          await this.sendCommand(outputActionId(options.output, outputToggleCommand(output)));
        },
      },
      select_title: {
        name: ACTION_NAMES.select_title,
        options: [
          this.outputOption(outputs),
          { type: 'dropdown', id: 'entry', label: 'Title', choices: entries, default: choiceDefault(entries) },
          { type: 'checkbox', id: 'take', label: 'Show it on air right away', default: false },
        ],
        callback: async ({ options }) => {
          try {
            await this.request(`/api/entries/${encodeURIComponent(options.entry)}/select`, { outputId: options.output });
            if (options.take) await this.sendCommand(outputActionId(options.output, 'titleIn'));
          } catch (error) {
            this.log('warn', `Select title failed: ${error.message}`);
          }
        },
      },
      timer_command: {
        name: ACTION_NAMES.timer_command,
        options: [
          this.timerOption(timers),
          { type: 'dropdown', id: 'command', label: 'Command', choices: TIMER_COMMANDS, default: 'start' },
        ],
        callback: async ({ options }) => this.sendCommand(timerActionId(options.timer, options.command)),
      },
      timer_toggle: {
        name: ACTION_NAMES.timer_toggle,
        options: [this.timerOption(timers)],
        callback: async ({ options }) => {
          const timer = findTimer(this.snapshot, options.timer);
          await this.sendCommand(timerActionId(options.timer, timerToggleCommand(timer)));
        },
      },
      panic: {
        name: ACTION_NAMES.panic,
        options: [],
        callback: async () => this.sendCommand(PANIC_ACTION_ID),
      },
      command: {
        name: ACTION_NAMES.command,
        options: [
          {
            type: 'dropdown',
            id: 'actionId',
            label: 'Command',
            choices: this.catalog,
            default: choiceDefault(this.catalog),
            allowCustom: true,
            minChoicesForSearch: 8,
          },
        ],
        callback: async ({ options }) => this.sendCommand(String(options.actionId || '')),
      },
    };
  }

  buildFeedbacks() {
    const outputs = outputChoices(this.snapshot);
    const timers = timerChoices(this.snapshot);
    const entries = entryChoices(this.snapshot);
    const red = { bgcolor: 0xcc1616, color: 0xffffff };

    return {
      output_on_air: {
        type: 'boolean',
        name: 'Output: title is on air',
        defaultStyle: red,
        options: [this.outputOption(outputs)],
        callback: ({ options }) => isOnAir(findOutput(this.snapshot, options.output)),
      },
      output_preview: {
        type: 'boolean',
        name: 'Output: title is on the preview bus',
        defaultStyle: { bgcolor: 0x006e3c, color: 0xffffff },
        options: [this.outputOption(outputs)],
        callback: ({ options }) => isPreviewOn(findOutput(this.snapshot, options.output)),
      },
      output_title_selected: {
        type: 'boolean',
        name: 'Output: this title is selected',
        defaultStyle: { bgcolor: 0x1e50aa, color: 0xffffff },
        options: [
          this.outputOption(outputs),
          { type: 'dropdown', id: 'entry', label: 'Title', choices: entries, default: choiceDefault(entries) },
        ],
        callback: ({ options }) => findOutput(this.snapshot, options.output)?.selectedEntryId === options.entry,
      },
      any_on_air: {
        type: 'boolean',
        name: 'Any output is on air',
        defaultStyle: red,
        options: [],
        callback: () => getOutputs(this.snapshot).some(isOnAir),
      },
      timer_running: {
        type: 'boolean',
        name: 'Timer: running',
        defaultStyle: { bgcolor: 0x008c46, color: 0xffffff },
        options: [this.timerOption(timers)],
        callback: ({ options }) => Boolean(findTimer(this.snapshot, options.timer)?.running),
      },
      timer_color: {
        type: 'advanced',
        name: 'Timer: text colour from Web Title Pro (colour rules)',
        options: [this.timerOption(timers)],
        callback: ({ options }) => {
          const color = parseHexColor(findTimer(this.snapshot, options.timer)?.color);
          return color ? { color: (color[0] << 16) | (color[1] << 8) | color[2] } : {};
        },
      },
      connected: {
        type: 'boolean',
        name: 'Connected to Web Title Pro',
        defaultStyle: { bgcolor: 0x008c46, color: 0xffffff },
        options: [],
        callback: () => this.connected,
      },
    };
  }
}

runEntrypoint(WebTitleProInstance, []);
