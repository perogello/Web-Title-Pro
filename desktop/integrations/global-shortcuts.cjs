// Convert Web Title Pro shortcut format ('Ctrl+Shift+Arrow Up', 'F5',
// 'Mouse Back') into the Electron Accelerator format the globalShortcut
// module expects ('CommandOrControl+Shift+Up', 'F5', null). Mouse buttons
// cannot be registered as global shortcuts and return null.

const TOKEN_MAP = {
  Ctrl: 'CommandOrControl',
  Meta: 'Super',
  'Arrow Up': 'Up',
  'Arrow Down': 'Down',
  'Arrow Left': 'Left',
  'Arrow Right': 'Right',
};

const isMouseToken = (token) => /^Mouse(\s|$)/i.test(token || '');

const translateToken = (token = '') => {
  const trimmed = token.trim();
  if (!trimmed) return '';
  if (TOKEN_MAP[trimmed]) return TOKEN_MAP[trimmed];
  if (trimmed.length === 1) return trimmed.toUpperCase();
  return trimmed;
};

const toElectronAccelerator = (shortcut = '') => {
  if (!shortcut || typeof shortcut !== 'string') return null;
  const tokens = shortcut.split('+').map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return null;
  if (tokens.some((token) => isMouseToken(token))) {
    // Mouse buttons can't be global; skip silently.
    return null;
  }
  return tokens.map(translateToken).join('+');
};

// Command keys per target — must mirror client/src/control-shell/shortcut-model.js.
const OUTPUT_COMMAND_KEYS = [
  'titleIn',
  'titleOut',
  'previewIn',
  'previewOut',
  'rowPrev',
  'rowNext',
  'timerStart',
  'timerStop',
  'timerReset',
];
const TIMER_COMMAND_KEYS = ['start', 'stop', 'reset'];
const GLOBAL_COMMAND_KEYS = ['allOutputsOut'];

// Walk shortcutBindings (model v2) and produce {accelerator, action, raw}
// for every binding the operator flagged as OS-global. `action` is the
// canonical action id ('output:<id>:titleIn', 'timer:<id>:start',
// 'global:allOutputsOut') the renderer's dispatchAction understands.
const collectGlobalAccelerators = (shortcutBindings = {}) => {
  const globalActions = shortcutBindings.globalActions || {};
  const results = [];
  const push = (action, raw) => {
    const accel = toElectronAccelerator(raw);
    if (!accel || !globalActions[action]) return;
    results.push({ action, accelerator: accel, raw });
  };

  for (const [outputId, commands] of Object.entries(shortcutBindings.outputs || {})) {
    for (const key of OUTPUT_COMMAND_KEYS) {
      push(`output:${outputId}:${key}`, commands?.[key]);
    }
  }
  for (const [timerId, commands] of Object.entries(shortcutBindings.timers || {})) {
    for (const key of TIMER_COMMAND_KEYS) {
      push(`timer:${timerId}:${key}`, commands?.[key]);
    }
  }
  for (const key of GLOBAL_COMMAND_KEYS) {
    push(`global:${key}`, shortcutBindings.global?.[key]);
  }

  return results;
};

const createGlobalShortcutManager = ({ globalShortcut, getMainWindow, log }) => {
  let registered = new Map(); // accelerator -> action

  const unregisterAll = () => {
    for (const accel of registered.keys()) {
      try { globalShortcut.unregister(accel); } catch {}
    }
    registered = new Map();
  };

  const sync = (shortcutBindings = {}) => {
    const desired = collectGlobalAccelerators(shortcutBindings);
    const desiredByAccel = new Map(desired.map((d) => [d.accelerator, d.action]));

    // Unregister no-longer-needed
    for (const accel of [...registered.keys()]) {
      if (!desiredByAccel.has(accel) || desiredByAccel.get(accel) !== registered.get(accel)) {
        try { globalShortcut.unregister(accel); } catch {}
        registered.delete(accel);
      }
    }

    // Register new. Failed registrations (key already taken by another app)
    // are reported as {accelerator, raw, action} so the renderer can match
    // them back to binding rows and warn the operator.
    const conflicts = [];
    for (const { accelerator, action, raw } of desired) {
      if (registered.has(accelerator)) continue;
      try {
        const ok = globalShortcut.register(accelerator, () => {
          const window = getMainWindow?.();
          if (window && !window.isDestroyed()) {
            try {
              window.webContents.send('global-shortcut-fired', { action, accelerator });
            } catch (error) {
              log?.(`global-shortcut:send-failed ${accelerator} ${error.message}`);
            }
          }
        });
        if (!ok) {
          conflicts.push({ accelerator, raw, action });
          log?.(`global-shortcut:register-failed ${accelerator} (taken by another app)`);
        } else {
          registered.set(accelerator, action);
        }
      } catch (error) {
        log?.(`global-shortcut:register-error ${accelerator} ${error.message}`);
      }
    }

    return { registered: [...registered.keys()], conflicts };
  };

  return { sync, unregisterAll };
};

module.exports = {
  toElectronAccelerator,
  collectGlobalAccelerators,
  createGlobalShortcutManager,
};
