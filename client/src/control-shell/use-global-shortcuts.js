import { useEffect, useRef } from 'react';
import { formatShortcutFromEvent, isTypingTarget } from './shortcut-utils.js';
import { findActionForShortcut } from './shortcut-model.js';

/**
 * Global keyboard/mouse-shortcut listener (model v2).
 *
 * Every binding maps a key combination to exactly one canonical action id
 * (output:<id>:<cmd> / timer:<id>:<cmd> / global:<cmd>). This hook only does
 * capture + match + dispatch — all command semantics live in `dispatchAction`
 * (in ControlShell), so the OS-global path and the in-window path run through
 * the same code.
 *
 * Learn mode (when `learningShortcut` is set) intercepts the next captured
 * combination and saves it via `saveGlobalShortcut(actionId, value)`.
 *
 * A single ref keeps the window listeners attached exactly once for the
 * component lifetime, so WebSocket timer-ticks (10x/sec) don't thrash them.
 */
export const useGlobalShortcuts = ({
  shortcutBindings,
  learningShortcut,
  setLearningShortcut,
  saveGlobalShortcut,
  dispatchAction,
  onCloseFloatingMenus,
}) => {
  const stateRef = useRef({});
  stateRef.current = {
    shortcutBindings,
    learningShortcut,
    setLearningShortcut,
    saveGlobalShortcut,
    dispatchAction,
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

      const actionId = findActionForShortcut(s.shortcutBindings || {}, shortcutValue);
      if (actionId) {
        event.preventDefault();
        void s.dispatchAction(actionId);
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
