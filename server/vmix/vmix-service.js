import { EventEmitter } from 'node:events';

let JSDOM = null;
const loadJSDOM = async () => {
  if (!JSDOM) {
    ({ JSDOM } = await import('jsdom'));
  }
  return JSDOM;
};

const sanitizeHost = (value = '') => value.trim().replace(/\/+$/, '');
const normalizeTitleAnimation = (value, fallback) => {
  const normalizedValue = value === 'TitleBeginAnimation' ? 'TransitionIn' : value === 'TitleEndAnimation' ? 'TransitionOut' : value;
  const normalizedFallback = fallback === 'TitleBeginAnimation' ? 'TransitionIn' : fallback === 'TitleEndAnimation' ? 'TransitionOut' : fallback;
  return ['TransitionIn', 'TransitionOut', 'none'].includes(normalizedValue) ? normalizedValue : normalizedFallback;
};

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
const extractOwnText = (node) =>
  [...(node?.childNodes || [])]
    .filter((childNode) => childNode.nodeType === 3)
    .map((childNode) => childNode.textContent || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
const extractInputTextFields = (node) =>
  [...node.querySelectorAll('text')].map((textNode, index) => ({
    index: textNode.getAttribute('index') || String(index),
    name: textNode.getAttribute('name') || extractText(textNode) || `Text ${index + 1}`,
    value: extractText(textNode),
  }));

/**
 * fetch wrapper with a hard timeout — vMix is typically on the same LAN
 * but operators sometimes pull cables mid-show; without a timeout one
 * one-shot call (SetText, SetTextColour, TransitionIn, …) can stall the
 * whole sync loop until the OS TCP keepalive kicks in minutes later.
 * The 2 s budget is enough for a healthy vMix on the same machine while
 * still freeing the loop quickly when the host is unreachable.
 */
const fetchWithTimeout = async (url, options = {}, timeoutMs = 2000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

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
    this.consecutiveFailures = 0;
    this.stopped = true;
    this.lastTimerColorByKey = new Map();
  }

  async setInputTextColour({ inputKey, fieldName = 'Text', color }) {
    if (!inputKey || !color) {
      return false;
    }

    const config = this.store.getVmixConfig();
    const host = sanitizeHost(config.host || this.state.host);
    const url = new URL(`${host}/api/`);
    url.searchParams.set('Function', 'SetTextColour');
    url.searchParams.set('Input', inputKey);
    url.searchParams.set('SelectedName', fieldName || 'Text');
    url.searchParams.set('Value', color);
    const response = await fetchWithTimeout(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`vMix text colour update failed with ${response.status}`);
    }

    return true;
  }

  computePollDelay() {
    if (this.consecutiveFailures <= 0) {
      return 1000;
    }
    return Math.min(15000, 1000 * Math.pow(2, Math.min(this.consecutiveFailures - 1, 4)));
  }

  schedulePoll() {
    if (this.stopped) {
      return;
    }

    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      this.refresh()
        .catch(() => {})
        .finally(() => this.schedulePoll());
    }, this.computePollDelay());
  }

  start() {
    if (!this.stopped) {
      return;
    }

    this.stopped = false;
    this.refresh().catch(() => {});
    this.schedulePoll();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
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
        const JSDOMCtor = await loadJSDOM();
        const dom = new JSDOMCtor(xmlText, { contentType: 'text/xml' });
        const { document } = dom.window;
        const inputs = [...document.querySelectorAll('vmix > inputs > input')].map((node) => ({
          key: node.getAttribute('key') || '',
          number: node.getAttribute('number') || '',
          type: node.getAttribute('type') || '',
          title: extractOwnText(node) || node.getAttribute('title') || '',
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

        this.consecutiveFailures = 0;
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
        this.consecutiveFailures += 1;
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
    const response = await fetchWithTimeout(url, { method: 'GET' });

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
    const response = await fetchWithTimeout(url, { method: 'GET' });

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

    const response = await fetchWithTimeout(url, { method: 'GET' });

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
      const showAction = normalizeTitleAnimation(entry.vmixShowAction, 'TransitionIn');
      if (showAction !== 'none') {
        await this.callFunction('TitleBeginAnimation', {
          Input: entry.vmixInputKey,
          Value: showAction,
        }).catch(() => {});
      }
    }

    if (action === 'hide') {
      const hideAction = normalizeTitleAnimation(entry.vmixHideAction, 'TransitionOut');
      if (hideAction !== 'none') {
        await this.callFunction('TitleBeginAnimation', {
          Input: entry.vmixInputKey,
          Value: hideAction,
        }).catch(() => {});
      }
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

      const desiredColor = typeof timer.color === 'string' ? timer.color : '';
      const colorKey = `${timer.vmixInputKey}::${timer.vmixTextField || 'Text'}`;
      const lastColor = this.lastTimerColorByKey.get(colorKey);

      if (desiredColor && desiredColor !== lastColor) {
        try {
          await this.setInputTextColour({
            inputKey: timer.vmixInputKey,
            fieldName: timer.vmixTextField || 'Text',
            color: desiredColor,
          });
          this.lastTimerColorByKey.set(colorKey, desiredColor);
        } catch {}
      } else if (!desiredColor && lastColor) {
        this.lastTimerColorByKey.delete(colorKey);
      }
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
