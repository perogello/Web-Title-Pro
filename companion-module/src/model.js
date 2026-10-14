// Pure helpers for the Web Title Pro Companion module: turn a WTP snapshot into
// dropdown choices, variable definitions/values and feedback answers. No
// Companion or network code here, so it is unit-tested directly
// (tests/companion-module.test.js).
//
// Outputs and timers are addressed by their WTP id in actions/feedbacks (stable
// across renames and reordering) and by position (#1, #2 … — the same numbers
// the WTP Config tab shows) in variable names, which must be short and stable.

export const OUTPUT_COMMANDS = [
  { id: 'titleIn', label: 'Title IN (show on air)' },
  { id: 'titleOut', label: 'Title OUT (hide)' },
  { id: 'previewIn', label: 'Preview IN' },
  { id: 'previewOut', label: 'Preview OUT' },
  { id: 'rowPrev', label: 'Row ▲ (previous)' },
  { id: 'rowNext', label: 'Row ▼ (next)' },
  { id: 'timerStart', label: 'Row timer start' },
  { id: 'timerStop', label: 'Row timer stop' },
  { id: 'timerReset', label: 'Row timer reset' },
];

export const TIMER_COMMANDS = [
  { id: 'start', label: 'Start' },
  { id: 'stop', label: 'Stop' },
  { id: 'reset', label: 'Reset' },
];

// Action names as Companion shows them ("<connection label>: <name>"). Also
// used by the WTP control panel to tell the operator exactly what to pick.
export const ACTION_NAMES = {
  output_command: 'Output: command',
  output_toggle: 'Output: toggle title on/off air',
  select_title: 'Output: select title',
  timer_command: 'Timer: start / stop / reset',
  timer_toggle: 'Timer: start / stop toggle',
  panic: 'Panic: hide every output',
  command: 'Any Web Title Pro command (incl. plugins)',
};

export const outputActionId = (outputId, command) => `output:${outputId}:${command}`;
export const timerActionId = (timerId, command) => `timer:${timerId}:${command}`;
export const PANIC_ACTION_ID = 'global:allOutputsOut';

const list = (value) => (Array.isArray(value) ? value : []);

export const getOutputs = (snapshot) => list(snapshot?.outputs);
export const getEntries = (snapshot) => list(snapshot?.entries);
export const getTimers = (snapshot) => list(snapshot?.timers);

export const findOutput = (snapshot, outputId) => getOutputs(snapshot).find((output) => output.id === outputId) || null;
export const findTimer = (snapshot, timerId) => getTimers(snapshot).find((timer) => timer.id === timerId) || null;
export const findEntry = (snapshot, entryId) => getEntries(snapshot).find((entry) => entry.id === entryId) || null;

export const outputLabel = (output, index) => `#${index + 1} ${output?.name || output?.id || 'Output'}`;

export const outputChoices = (snapshot) =>
  getOutputs(snapshot).map((output, index) => ({ id: output.id, label: outputLabel(output, index) }));

export const entryChoices = (snapshot) =>
  getEntries(snapshot).map((entry) => ({ id: entry.id, label: entry.name || entry.id }));

export const timerChoices = (snapshot) =>
  getTimers(snapshot).map((timer) => ({ id: timer.id, label: timer.name || timer.id }));

// Ids + names of everything that appears in choices / presets / variable
// definitions. Definitions are re-sent to Companion only when this changes,
// not on every snapshot (WTP broadcasts on every edit and 10x/s for timers).
export const structureSignature = (snapshot, catalogIds = []) =>
  JSON.stringify({
    outputs: getOutputs(snapshot).map((output) => [output.id, output.name]),
    entries: getEntries(snapshot).map((entry) => [entry.id, entry.name, (entry.templateFields || []).length]),
    timers: getTimers(snapshot).map((timer) => [timer.id, timer.name]),
    catalog: catalogIds,
  });

export const isOnAir = (output) => Boolean(output?.program?.visible);
export const isPreviewOn = (output) => Boolean(output?.previewProgram?.visible);

// Field values of the title selected on an output, in template-field order —
// what TITLE IN would put on air. Used to label buttons.
export const selectedEntryValues = (snapshot, output) => {
  const entry = findEntry(snapshot, output?.selectedEntryId);
  if (!entry) return [];
  const fields = entry.fields || {};
  const order = list(entry.templateFields).map((field) => field?.name).filter(Boolean);
  const names = order.length ? order : Object.keys(fields);
  return names.map((name) => String(fields[name] ?? '')).filter((value) => value !== '');
};

// 1-based position of the applied data row on the output, or '' when none.
export const appliedRowNumber = (snapshot, output) => {
  const applied = output?.appliedRow;
  if (!applied?.sourceId || !applied?.rowId) return '';
  const source = list(snapshot?.sources).find((item) => item.id === applied.sourceId);
  const index = list(source?.rows).findIndex((row) => row.id === applied.rowId);
  return index >= 0 ? String(index + 1) : '';
};

export const buildVariableDefinitions = (snapshot) => {
  const definitions = [
    { variableId: 'connected', name: 'Connected to Web Title Pro (YES/NO)' },
    { variableId: 'on_air_count', name: 'Number of outputs on air' },
  ];

  getOutputs(snapshot).forEach((output, index) => {
    const n = index + 1;
    const label = outputLabel(output, index);
    definitions.push(
      { variableId: `o${n}_name`, name: `${label}: output name` },
      { variableId: `o${n}_title`, name: `${label}: selected title` },
      { variableId: `o${n}_value1`, name: `${label}: first field of the selected title` },
      { variableId: `o${n}_value2`, name: `${label}: second field of the selected title` },
      { variableId: `o${n}_on_air`, name: `${label}: on air (ON/OFF)` },
      { variableId: `o${n}_preview`, name: `${label}: preview bus (ON/OFF)` },
      { variableId: `o${n}_row`, name: `${label}: applied data row number` },
    );
  });

  getTimers(snapshot).forEach((timer, index) => {
    const n = index + 1;
    const label = `Timer ${n} ${timer.name || timer.id}`;
    definitions.push(
      { variableId: `t${n}_name`, name: `${label}: name` },
      { variableId: `t${n}_time`, name: `${label}: current time` },
      { variableId: `t${n}_running`, name: `${label}: running (ON/OFF)` },
    );
  });

  return definitions;
};

export const buildTimerVariableValues = (snapshot) => {
  const values = {};
  getTimers(snapshot).forEach((timer, index) => {
    const n = index + 1;
    values[`t${n}_name`] = timer.name || timer.id;
    values[`t${n}_time`] = timer.display ?? '';
    values[`t${n}_running`] = timer.running ? 'ON' : 'OFF';
  });
  return values;
};

export const buildVariableValues = (snapshot, connected) => {
  const outputs = getOutputs(snapshot);
  const values = {
    connected: connected ? 'YES' : 'NO',
    on_air_count: String(outputs.filter(isOnAir).length),
  };

  outputs.forEach((output, index) => {
    const n = index + 1;
    const entry = findEntry(snapshot, output.selectedEntryId);
    const fieldValues = selectedEntryValues(snapshot, output);
    values[`o${n}_name`] = output.name || output.id;
    values[`o${n}_title`] = entry?.name || '';
    values[`o${n}_value1`] = fieldValues[0] || '';
    values[`o${n}_value2`] = fieldValues[1] || '';
    values[`o${n}_on_air`] = isOnAir(output) ? 'ON' : 'OFF';
    values[`o${n}_preview`] = isPreviewOn(output) ? 'ON' : 'OFF';
    values[`o${n}_row`] = appliedRowNumber(snapshot, output);
  });

  return { ...values, ...buildTimerVariableValues(snapshot) };
};

// Only the values that changed since the last push — keeps the 10x/s timer
// ticks cheap on the Companion IPC channel.
export const diffValues = (previous, next) => {
  const changed = {};
  for (const [key, value] of Object.entries(next)) {
    if (previous[key] !== value) changed[key] = value;
  }
  return changed;
};

// "#rrggbb" / "#rgb" -> [r, g, b]; anything else -> null.
export const parseHexColor = (value) => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || '').trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].replace(/./g, (c) => c + c) : match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
};

// WTP timer snapshot -> the command that toggles it.
export const timerToggleCommand = (timer) => (timer?.running ? 'stop' : 'start');
export const outputToggleCommand = (output) => (isOnAir(output) ? 'titleOut' : 'titleIn');

// Merge a timer-tick payload ({ timers }) into a snapshot without touching the rest.
export const mergeTimerTick = (snapshot, tick) => {
  if (!snapshot || !Array.isArray(tick?.timers)) return snapshot;
  const byId = new Map(tick.timers.map((timer) => [timer.id, timer]));
  return {
    ...snapshot,
    timers: getTimers(snapshot).map((timer) => (byId.has(timer.id) ? { ...timer, ...byId.get(timer.id) } : timer)),
  };
};
