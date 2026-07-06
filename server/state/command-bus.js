// Unified command dispatch. One canonical action id -> one store operation,
// shared by the REST command endpoint (plugins / Companion), MIDI and anything
// else. Action ids mirror the client shortcut model:
//   output:<id>:<cmd>  timer:<id>:<cmd>  global:<cmd>
//
// `vmixSync(entry, action)` is an optional async hook so callers that can drive
// vMix (the HTTP route) trigger transitions; callers that can't (MIDI) pass
// nothing, matching the previous MIDI behaviour.

export const parseCommandActionId = (actionId = '') => {
  const str = String(actionId || '');
  if (str.startsWith('output:')) {
    const rest = str.slice('output:'.length);
    const i = rest.lastIndexOf(':');
    return i === -1 ? null : { kind: 'output', id: rest.slice(0, i), command: rest.slice(i + 1) };
  }
  if (str.startsWith('timer:')) {
    const rest = str.slice('timer:'.length);
    const i = rest.lastIndexOf(':');
    return i === -1 ? null : { kind: 'timer', id: rest.slice(0, i), command: rest.slice(i + 1) };
  }
  if (str.startsWith('global:')) {
    return { kind: 'global', id: null, command: str.slice('global:'.length) };
  }
  // overlay:<pluginId>:<in|out> — toggles a plugin's on-air render overlay.
  // pluginId contains a ':' (builtin:bingo); command never does.
  if (str.startsWith('overlay:')) {
    const rest = str.slice('overlay:'.length);
    const i = rest.lastIndexOf(':');
    return i === -1 ? null : { kind: 'overlay', id: rest.slice(0, i), command: rest.slice(i + 1) };
  }
  return null;
};

export const dispatchCommand = async (store, actionId, { vmixSync, pluginService } = {}) => {
  const parsed = parseCommandActionId(actionId);
  if (!parsed) {
    throw new Error(`Unknown command: ${actionId}`);
  }
  const sync = typeof vmixSync === 'function' ? vmixSync : async () => {};

  if (parsed.kind === 'overlay') {
    if (parsed.command === 'in') {
      const url = pluginService?.getPlugin?.(parsed.id)?.overlayUrl || null;
      if (!url) throw new Error(`Plugin "${parsed.id}" has no overlay.`);
      if (!store.getPluginState?.(parsed.id)?.enabled) throw new Error(`Plugin "${parsed.id}" is not enabled.`);
      store.setOverlayOnAir(parsed.id, url);
    } else if (parsed.command === 'out') {
      store.setOverlayOnAir(parsed.id, null);
    } else {
      throw new Error(`Unknown overlay command: ${parsed.command}`);
    }
    return { ok: true, action: actionId };
  }

  if (parsed.kind === 'global') {
    if (parsed.command === 'allOutputsOut') {
      for (const output of store.getSnapshot().outputs || []) {
        if (output.program?.visible) {
          const entry = store.getEntry(store.getProgram(output.id).entryId);
          store.hideProgram(output.id);
          await sync(entry, 'hide');
        }
      }
      return { ok: true, action: actionId };
    }
    throw new Error(`Unknown global command: ${parsed.command}`);
  }

  const runTimer = (timerId, command) => {
    if (!timerId) return;
    if (command === 'start') store.startTimer(timerId);
    else if (command === 'stop') store.stopTimer(timerId);
    else if (command === 'reset') store.resetTimer(timerId);
  };

  if (parsed.kind === 'timer') {
    runTimer(parsed.id, parsed.command);
    return { ok: true, action: actionId };
  }

  // output commands
  const outputId = parsed.id;
  switch (parsed.command) {
    case 'titleIn': {
      store.showSelected(null, outputId);
      await sync(store.getEntry(store.getOutputByRef(outputId)?.selectedEntryId), 'show');
      break;
    }
    case 'titleOut': {
      const entry = store.getEntry(store.getProgram(outputId).entryId);
      store.hideProgram(outputId);
      await sync(entry, 'hide');
      break;
    }
    case 'previewIn':
      store.showPreview(null, outputId);
      break;
    case 'previewOut':
      store.hidePreview(outputId);
      break;
    case 'rowPrev':
      store.stepOutputRow(outputId, 'previous');
      await sync(store.getEntry(store.getOutputByRef(outputId)?.selectedEntryId), 'update');
      break;
    case 'rowNext':
      store.stepOutputRow(outputId, 'next');
      await sync(store.getEntry(store.getOutputByRef(outputId)?.selectedEntryId), 'update');
      break;
    case 'timerStart':
    case 'timerStop':
    case 'timerReset': {
      const timerId =
        store.getOutputCurrentTimerId(outputId) ||
        store.getTimers().find((t) => t.targetOutputId === outputId)?.id;
      runTimer(
        timerId,
        parsed.command === 'timerStart' ? 'start' : parsed.command === 'timerStop' ? 'stop' : 'reset',
      );
      break;
    }
    default:
      throw new Error(`Unknown output command: ${parsed.command}`);
  }
  return { ok: true, action: actionId };
};
