import { useEffect, useRef } from 'react';
import { formatShortcutFromEvent, isTypingTarget } from './shortcut-utils.js';

/**
 * Global keyboard/mouse-shortcut listener.
 *
 * Reads bindings from the snapshot's `shortcuts` map and dispatches the
 * appropriate API call. Learn mode (when `learningShortcut` is set) intercepts
 * the next captured combination and saves it via `onSaveShortcut`.
 *
 * Also runs a click-outside watcher that closes any compact-mode dropdowns
 * by invoking the supplied `onCloseFloatingMenus` callback.
 *
 * Internally uses a single ref so that the window event listeners are attached
 * exactly once for the lifetime of the component. Without this pattern, the
 * `snapshot` / `shortcutBindings` deps would cause React to detach + reattach
 * three window listeners on every WebSocket timer-tick (10×/sec).
 */
export const useGlobalShortcuts = ({
  api,
  shortcutBindings,
  learningShortcut,
  outputs,
  snapshot,
  selectedOutput,
  setLearningShortcut,
  setLocalSelectedOutputId,
  saveGlobalShortcut,
  triggerGlobalShortcut,
  triggerNavigationShortcut,
  commandTimer,
  pushFeedback,
  onCloseFloatingMenus,
}) => {
  const stateRef = useRef({});
  stateRef.current = {
    api,
    shortcutBindings,
    learningShortcut,
    outputs,
    snapshot,
    selectedOutput,
    setLearningShortcut,
    setLocalSelectedOutputId,
    saveGlobalShortcut,
    triggerGlobalShortcut,
    triggerNavigationShortcut,
    commandTimer,
    pushFeedback,
    onCloseFloatingMenus,
  };

  useEffect(() => {
    const onShortcutInput = (event) => {
      const s = stateRef.current;
      if (isTypingTarget(event.target)) {
        return;
      }

      // Bare left-mouse without modifiers should never trigger shortcuts.
      if (
        event.type === 'mousedown' &&
        event.button === 0 &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.metaKey
      ) {
        return;
      }

      const shortcutValue = formatShortcutFromEvent(event);

      if (!shortcutValue) {
        return;
      }

      if (s.learningShortcut) {
        event.preventDefault();
        event.stopPropagation();
        void s.saveGlobalShortcut(s.learningShortcut.action, shortcutValue);
        s.setLearningShortcut(null);
        return;
      }

      const bindings = s.shortcutBindings || {};

      if (
        bindings.show === shortcutValue ||
        bindings.live === shortcutValue ||
        bindings.hide === shortcutValue
      ) {
        event.preventDefault();
        const action =
          bindings.show === shortcutValue
            ? 'show'
            : bindings.live === shortcutValue
              ? 'live'
              : 'hide';
        void s.triggerGlobalShortcut(action);
        return;
      }

      if (bindings.nextTitle === shortcutValue || bindings.previousTitle === shortcutValue) {
        event.preventDefault();
        void s.triggerNavigationShortcut(
          bindings.nextTitle === shortcutValue ? 'nextTitle' : 'previousTitle',
        );
        return;
      }

      const outputShortcutEntry = Object.entries(bindings.outputSelectById || {})
        .find(([, value]) => value === shortcutValue);
      if (outputShortcutEntry) {
        event.preventDefault();
        s.setLocalSelectedOutputId(outputShortcutEntry[0]);
        s.pushFeedback(
          `Output switched to ${
            (s.outputs || []).find((output) => output.id === outputShortcutEntry[0])?.name ||
            'selected output'
          }`,
        );
        return;
      }

      const entryShortcutEntry = Object.entries(bindings.entrySelectById || {})
        .find(([, value]) => value === shortcutValue);
      if (entryShortcutEntry) {
        event.preventDefault();
        void s.api(`/api/entries/${entryShortcutEntry[0]}/select`, {
          method: 'POST',
          body: { outputId: s.selectedOutput?.id },
        }).catch(() => {});
        return;
      }

      const timerToggleEntry = Object.entries(bindings.timerToggleById || {})
        .find(([, value]) => value === shortcutValue);
      if (timerToggleEntry) {
        event.preventDefault();
        const timer = s.snapshot?.timers?.find((item) => item.id === timerToggleEntry[0]);
        const nextAction = timer?.running ? 'stop' : 'start';
        void s.commandTimer(timerToggleEntry[0], nextAction);
        return;
      }

      const timerResetEntry = Object.entries(bindings.timerResetById || {})
        .find(([, value]) => value === shortcutValue);
      if (timerResetEntry) {
        event.preventDefault();
        void s.commandTimer(timerResetEntry[0], 'reset');
      }
    };

    const onAnyClick = (event) => {
      stateRef.current.onCloseFloatingMenus?.(event);
    };

    window.addEventListener('keydown', onShortcutInput, true);
    window.addEventListener('mousedown', onShortcutInput, true);
    window.addEventListener('click', onAnyClick);
    return () => {
      window.removeEventListener('keydown', onShortcutInput, true);
      window.removeEventListener('mousedown', onShortcutInput, true);
      window.removeEventListener('click', onAnyClick);
    };
  }, []);
};
