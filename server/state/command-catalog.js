// Versioned command contract. The published surface plugins / Companion / any
// external client program against: the API version, the canonical action-id
// grammar, the command vocabulary (with human descriptions), and — resolved
// against the live store — the concrete action ids you can send right now.
//
// This is the single source of truth for "what can POST /api/command take".
// The dispatcher (command-bus.js) implements it; this module describes it.

// Bump the MAJOR when a change is backwards-incompatible (an action id or its
// meaning changes / is removed). Bump MINOR when action ids are only added.
// Plugins should refuse to run against a higher MAJOR than they were built for.
export const COMMAND_API_VERSION = { major: 1, minor: 0 };

export const COMMAND_API_VERSION_STRING = `${COMMAND_API_VERSION.major}.${COMMAND_API_VERSION.minor}`;

// kind -> { command: description }. Descriptions are stable, user-facing labels
// safe to render in a plugin's UI.
export const COMMAND_VOCABULARY = {
  output: {
    titleIn: "Show the output's selected title on air",
    titleOut: 'Hide the on-air title for the output',
    previewIn: "Show the output's selected title on the preview bus",
    previewOut: 'Hide the preview-bus title for the output',
    rowPrev: 'Step the applied data row up (previous / higher)',
    rowNext: 'Step the applied data row down (next / further)',
    timerStart: "Start the timer of the output's current data row",
    timerStop: "Stop the timer of the output's current data row",
    timerReset: "Reset the timer of the output's current data row",
  },
  timer: {
    start: 'Start this timer',
    stop: 'Stop this timer',
    reset: 'Reset this timer',
  },
  global: {
    allOutputsOut: 'Panic — hide every on-air output',
  },
};

// The action-id grammar, published so a client can construct ids itself.
export const COMMAND_ID_GRAMMAR = {
  output: 'output:<outputId>:<command>',
  timer: 'timer:<timerId>:<command>',
  global: 'global:<command>',
};

const commandList = (kind) =>
  Object.entries(COMMAND_VOCABULARY[kind]).map(([command, description]) => ({ command, description }));

// Build the catalogue resolved against the current store: the static grammar
// plus every concrete action id that is valid right now (one per live output /
// timer / global command), each with a label a plugin can show in a picker.
export const buildCommandCatalog = (store) => {
  const snapshot = store.getSnapshot();
  const outputs = snapshot.outputs || [];
  const timers = store.getTimers ? store.getTimers() : snapshot.timers || [];

  const actions = [];

  for (const output of outputs) {
    for (const { command, description } of commandList('output')) {
      actions.push({
        actionId: `output:${output.id}:${command}`,
        kind: 'output',
        targetId: output.id,
        targetName: output.name || output.id,
        command,
        description,
      });
    }
  }

  for (const timer of timers) {
    for (const { command, description } of commandList('timer')) {
      actions.push({
        actionId: `timer:${timer.id}:${command}`,
        kind: 'timer',
        targetId: timer.id,
        targetName: timer.name || timer.id,
        command,
        description,
      });
    }
  }

  for (const { command, description } of commandList('global')) {
    actions.push({
      actionId: `global:${command}`,
      kind: 'global',
      targetId: null,
      targetName: null,
      command,
      description,
    });
  }

  return {
    apiVersion: COMMAND_API_VERSION,
    apiVersionString: COMMAND_API_VERSION_STRING,
    grammar: COMMAND_ID_GRAMMAR,
    vocabulary: COMMAND_VOCABULARY,
    actions,
  };
};
