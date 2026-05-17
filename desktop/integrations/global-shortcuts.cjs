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

const ACTION_KEY_MAP_DIRECT = {
  show: 'show',
  live: 'live',
  hide: 'hide',
  nextTitle: 'nextTitle',
  previousTitle: 'previousTitle',
};

// Walk shortcutBindings and produce {accelerator, action} pairs that
// the caller asked to be made global. `action` is the canonical action key
// in the format ControlShell already understands ('show', 'selectOutput:id',
// 'timerToggle:id', etc).
const collectGlobalAccelerators = (shortcutBindings = {}) => {
  const globalActions = shortcutBindings.globalActions || {};
  const results = [];
  const push = (action, raw) => {
    const accel = toElectronAccelerator(raw);
    if (!accel || !globalActions[action]) return;
    results.push({ action, accelerator: accel, raw });
  };

  for (const [field, action] of Object.entries(ACTION_KEY_MAP_DIRECT)) {
    push(action, shortcutBindings[field]);
  }

  for (const [outputId, raw] of Object.entries(shortcutBindings.outputSelectById || {})) {
    push(`selectOutput:${outputId}`, raw);
  }
  for (const [entryId, raw] of Object.entries(shortcutBindings.entrySelectById || {})) {
    push(`selectEntry:${entryId}`, raw);
  }
  for (const [timerId, raw] of Object.entries(shortcutBindings.timerToggleById || {})) {
    push(`timerToggle:${timerId}`, raw);
  }
  for (const [timerId, raw] of Object.entries(shortcutBindings.timerResetById || {})) {
    push(`timerReset:${timerId}`, raw);
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

    // Register new
    const conflicts = [];
    for (const { accelerator, action } of desired) {
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
          conflicts.push(accelerator);
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
