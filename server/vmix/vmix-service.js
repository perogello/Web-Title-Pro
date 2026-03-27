import { EventEmitter } from 'node:events';
import { JSDOM } from 'jsdom';

const sanitizeHost = (value = '') => value.trim().replace(/\/+$/, '');

const isProbablyTimerInput = (input) => {
  const title = `${input.title} ${input.shortTitle}`.toLowerCase();
  const type = (input.type || '').toLowerCase();
  return (
    Number(input.duration) > 0 ||
    title.includes('timer') ||
    title.includes('countdown') ||
    title.includes('count up') ||
    type.includes('video') ||
    type.includes('title')
  );
};

const parseInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const extractText = (node) => (node?.textContent || '').trim();
const extractInputTextFields = (node) =>
  [...node.querySelectorAll('text')].map((textNode, index) => ({
    index: textNode.getAttribute('index') || String(index),
    name: textNode.getAttribute('name') || extractText(textNode) || `Text ${index + 1}`,
    value: extractText(textNode),
  }));

export class VmixService extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.state = {
      connected: false,
      host: store.getVmixConfig().host,
      lastUpdatedAt: null,
      error: '',
      inputs: [],
      selectedInput: null,
    };
    this.pollTimer = null;
    this.refreshInFlight = null;
    this.syncTimer = null;
    this.pendingTimers = [];
  }

  start() {
    if (this.pollTimer) {
      return;
    }

    this.refresh().catch(() => {});
    this.pollTimer = setInterval(() => {
      this.refresh().catch(() => {});
    }, 1000);
  }

  stop() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async refresh() {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const config = this.store.getVmixConfig();
    const host = sanitizeHost(config.host || 'http://127.0.0.1:8088');

    this.state.host = host;

    this.refreshInFlight = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 800);
        const response = await fetch(`${host}/api`, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`vMix API returned ${response.status}`);
        }

        const xmlText = await response.text();
        const dom = new JSDOM(xmlText, { contentType: 'text/xml' });
        const { document } = dom.window;
        const inputs = [...document.querySelectorAll('vmix > inputs > input')].map((node) => ({
          key: node.getAttribute('key') || '',
          number: node.getAttribute('number') || '',
          type: node.getAttribute('type') || '',
          title: extractText(node),
          shortTitle: node.getAttribute('shortTitle') || '',
          state: node.getAttribute('state') || '',
          duration: parseInteger(node.getAttribute('duration')),
          position: parseInteger(node.getAttribute('position')),
          loop: node.getAttribute('loop') || '',
          muted: node.getAttribute('muted') || '',
          timerCandidate: false,
          textFields: extractInputTextFields(node),
        }));

        const enrichedInputs = inputs.map((input) => ({
          ...input,
          timerCandidate: isProbablyTimerInput(input),
        }));
        const selectedInput =
          enrichedInputs.find((input) => input.key === config.selectedTimerInputKey) ||
          enrichedInputs.find((input) => input.number === config.selectedTimerInputKey) ||
          null;

        this.state = {
          connected: true,
          host,
          lastUpdatedAt: new Date().toISOString(),
          error: '',
          inputs: enrichedInputs,
          selectedInput,
        };
        this.emit('change', this.getState());
        return this.getState();
      } catch (error) {
        this.state = {
          ...this.state,
          connected: false,
          host,
          error: error.name === 'AbortError' ? 'vMix API timeout' : error.message,
          lastUpdatedAt: new Date().toISOString(),
        };
        this.emit('change', this.getState());
        return this.getState();
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async setHost(host) {
    this.store.updateVmixConfig({
      host: sanitizeHost(host || 'http://127.0.0.1:8088'),
    });
    return this.refresh();
  }

  async selectTimerInput(inputKey) {
    this.store.updateVmixConfig({
      selectedTimerInputKey: inputKey || null,
    });
    return this.refresh();
  }

  async executeTimerAction(action, inputKey = '') {
    const config = this.store.getVmixConfig();
    const host = sanitizeHost(config.host || this.state.host);
    const resolvedInputKey = inputKey || config.selectedTimerInputKey;

    if (!resolvedInputKey) {
      throw new Error('No vMix timer input selected.');
    }

    const actionMap = {
      start: 'Play',
      pause: 'Pause',
      stop: 'Stop',
      reset: 'Restart',
      restart: 'Restart',
    };
    const functionName = actionMap[action];

    if (!functionName) {
      throw new Error('Unsupported vMix timer action.');
    }

    const url = new URL(`${host}/api/`);
    url.searchParams.set('Function', functionName);
    url.searchParams.set('Input', resolvedInputKey);
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`vMix action failed with ${response.status}`);
    }

    return this.refresh();
  }

  async setInputText({ inputKey, value, fieldName = 'Text' }) {
    const config = this.store.getVmixConfig();
    const host = sanitizeHost(config.host || this.state.host);

    if (!inputKey) {
      throw new Error('No vMix input selected.');
    }

    const url = new URL(`${host}/api/`);
    url.searchParams.set('Function', 'SetText');
    url.searchParams.set('Input', inputKey);
    url.searchParams.set('SelectedName', fieldName || 'Text');
    url.searchParams.set('Value', value ?? '');
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`vMix text update failed with ${response.status}`);
    }

    return true;
  }

  async callFunction(functionName, params = {}) {
    const config = this.store.getVmixConfig();
    const host = sanitizeHost(config.host || this.state.host);
    const url = new URL(`${host}/api/`);
    url.searchParams.set('Function', functionName);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      url.searchParams.set(key, value);
    }

    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`vMix ${functionName} failed with ${response.status}`);
    }

    return true;
  }

  async setInputTexts({ inputKey, values = [] }) {
    if (!inputKey) {
      throw new Error('No vMix input selected.');
    }

    for (const item of values) {
      await this.setInputText({
        inputKey,
        fieldName: item.fieldName || 'Text',
        value: item.value ?? '',
      });
    }

    return true;
  }

  async applyTitleEntry(entry, action = 'update') {
    if (!entry?.vmixInputKey) {
      throw new Error('vMix title input is not configured.');
    }

    const fieldMap = Array.isArray(entry.vmixFieldMap) ? entry.vmixFieldMap : [];
    const values = fieldMap.map((item) => ({
      fieldName: item.vmixFieldName || item.label || item.name,
      value: entry.fields?.[item.name] ?? '',
    }));

    if (values.length) {
      await this.callFunction('PauseRender', { Input: entry.vmixInputKey }).catch(() => {});
      await this.setInputTexts({ inputKey: entry.vmixInputKey, values });
      await this.callFunction('ResumeRender', { Input: entry.vmixInputKey }).catch(() => {});
    }

    if (action === 'show') {
      await this.callFunction('TitleBeginAnimation', { Input: entry.vmixInputKey }).catch(() => {});
    }

    if (action === 'hide') {
      await this.callFunction('TitleEndAnimation', { Input: entry.vmixInputKey }).catch(() => {});
    }

    return true;
  }

  async syncTimers(timers = []) {
    const vmixTimers = timers.filter((timer) => timer.sourceType === 'vmix' && timer.vmixInputKey);

    if (!this.state.connected || !vmixTimers.length) {
      return;
    }

    for (const timer of vmixTimers) {
      try {
        await this.setInputText({
          inputKey: timer.vmixInputKey,
          value: timer.display,
          fieldName: timer.vmixTextField || 'Text',
        });
      } catch {}
    }
  }

  scheduleSyncTimers(timers = []) {
    this.pendingTimers = timers;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimers(this.pendingTimers).catch(() => {});
    }, 80);
  }

  getState() {
    return {
      ...this.state,
      config: this.store.getVmixConfig(),
    };
  }
}
