// Shortcut model v2 — one keypress = one concrete command.
//
// Bindings are stored per target:
//   outputs[<outputId>] = { titleIn, titleOut, previewIn, previewOut,
//                           rowPrev, rowNext, timerStart, timerStop, timerReset }
//   timers[<timerId>]   = { start, stop, reset }
//   global              = { allOutputsOut }
//
// Every command also has a canonical *action id* used by the dispatcher, the
// OS-global registration (globalActions), MIDI and Companion:
//   output:<id>:<command>   e.g. output:main:titleIn
//   timer:<id>:<command>    e.g. timer:abc:start
//   global:<command>        e.g. global:allOutputsOut

export const OUTPUT_COMMANDS = [
  { key: 'titleIn', label: 'Title IN', hint: 'Show the title on air' },
  { key: 'titleOut', label: 'Title OUT', hint: 'Hide the on-air title' },
  { key: 'previewIn', label: 'PVW IN', hint: 'Show on the preview bus' },
  { key: 'previewOut', label: 'PVW OUT', hint: 'Hide the preview bus' },
  { key: 'rowPrev', label: 'Row ↑ (previous)', hint: 'Apply the previous data row' },
  { key: 'rowNext', label: 'Row ↓ (next)', hint: 'Apply the next data row' },
  { key: 'timerStart', label: 'Timer Start', hint: 'Start this output’s current timer' },
  { key: 'timerStop', label: 'Timer Stop', hint: 'Stop this output’s current timer' },
  { key: 'timerReset', label: 'Timer Reset', hint: 'Reset this output’s current timer' },
];

export const TIMER_COMMANDS = [
  { key: 'start', label: 'Start' },
  { key: 'stop', label: 'Stop' },
  { key: 'reset', label: 'Reset' },
];

export const GLOBAL_COMMANDS = [
  { key: 'allOutputsOut', label: 'All outputs OUT (panic)', hint: 'Hide every title on every output' },
];

export const outputActionId = (outputId, command) => `output:${outputId}:${command}`;
export const timerActionId = (timerId, command) => `timer:${timerId}:${command}`;
export const globalActionId = (command) => `global:${command}`;

// Parse a canonical action id back into its parts. Returns null for unknown
// shapes. Command ids never contain ':' so the split is unambiguous.
export const parseActionId = (actionId = '') => {
  const str = String(actionId || '');
  if (str.startsWith('output:')) {
    const rest = str.slice('output:'.length);
    const idx = rest.lastIndexOf(':');
    if (idx === -1) return null;
    return { kind: 'output', id: rest.slice(0, idx), command: rest.slice(idx + 1) };
  }
  if (str.startsWith('timer:')) {
    const rest = str.slice('timer:'.length);
    const idx = rest.lastIndexOf(':');
    if (idx === -1) return null;
    return { kind: 'timer', id: rest.slice(0, idx), command: rest.slice(idx + 1) };
  }
  if (str.startsWith('global:')) {
    return { kind: 'global', id: null, command: str.slice('global:'.length) };
  }
  // plugin:<pluginId>:<command> — pluginId itself contains a ':'
  // (e.g. builtin:rundown-remote), but the command never does, so lastIndexOf
  // splits unambiguously.
  if (str.startsWith('plugin:')) {
    const rest = str.slice('plugin:'.length);
    const idx = rest.lastIndexOf(':');
    if (idx === -1) return null;
    return { kind: 'plugin', id: rest.slice(0, idx), command: rest.slice(idx + 1) };
  }
  return null;
};

export const pluginActionId = (pluginId, command) => `plugin:${pluginId}:${command}`;

const readCommand = (bindings, actionId) => {
  const parsed = parseActionId(actionId);
  if (!parsed) return '';
  if (parsed.kind === 'output') return bindings?.outputs?.[parsed.id]?.[parsed.command] || '';
  if (parsed.kind === 'timer') return bindings?.timers?.[parsed.id]?.[parsed.command] || '';
  if (parsed.kind === 'global') return bindings?.global?.[parsed.command] || '';
  if (parsed.kind === 'plugin') return bindings?.plugins?.[parsed.id]?.[parsed.command] || '';
  return '';
};

// Walk every stored binding and yield { actionId, value } for non-empty ones.
export const forEachBinding = (bindings = {}, callback) => {
  for (const [outputId, commands] of Object.entries(bindings.outputs || {})) {
    for (const { key } of OUTPUT_COMMANDS) {
      const value = commands?.[key];
      if (value) callback(outputActionId(outputId, key), value);
    }
  }
  for (const [timerId, commands] of Object.entries(bindings.timers || {})) {
    for (const { key } of TIMER_COMMANDS) {
      const value = commands?.[key];
      if (value) callback(timerActionId(timerId, key), value);
    }
  }
  for (const { key } of GLOBAL_COMMANDS) {
    const value = bindings.global?.[key];
    if (value) callback(globalActionId(key), value);
  }
  // Plugin commands have dynamic ids, so iterate whatever is stored.
  for (const [pluginId, commands] of Object.entries(bindings.plugins || {})) {
    for (const [command, value] of Object.entries(commands || {})) {
      if (value) callback(pluginActionId(pluginId, command), value);
    }
  }
};

// The action id currently bound to `value`, or null. Used to detect and move
// conflicting assignments (a combination may only trigger one command).
export const findActionForShortcut = (bindings = {}, value) => {
  if (!value) return null;
  let found = null;
  forEachBinding(bindings, (actionId, bound) => {
    if (!found && bound === value) found = actionId;
  });
  return found;
};

// Build the minimal PUT patch that assigns `value` to `actionId`.
export const buildBindingPatch = (actionId, value) => {
  const parsed = parseActionId(actionId);
  if (!parsed) return {};
  if (parsed.kind === 'output') {
    return { outputs: { [parsed.id]: { [parsed.command]: value } } };
  }
  if (parsed.kind === 'timer') {
    return { timers: { [parsed.id]: { [parsed.command]: value } } };
  }
  if (parsed.kind === 'plugin') {
    return { plugins: { [parsed.id]: { [parsed.command]: value } } };
  }
  return { global: { [parsed.command]: value } };
};

// Deep-merge two PUT patches (used to clear a previous owner and set a new
// binding in one request).
export const mergeBindingPatches = (a = {}, b = {}) => {
  const out = {};
  for (const field of ['outputs', 'timers', 'plugins']) {
    if (a[field] || b[field]) {
      out[field] = { ...(a[field] || {}) };
      for (const [id, commands] of Object.entries(b[field] || {})) {
        out[field][id] = { ...(out[field][id] || {}), ...commands };
      }
    }
  }
  for (const field of ['global', 'globalActions']) {
    if (a[field] || b[field]) {
      out[field] = { ...(a[field] || {}), ...(b[field] || {}) };
    }
  }
  return out;
};

export { readCommand };
