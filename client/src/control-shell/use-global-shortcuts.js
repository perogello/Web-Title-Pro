import { useEffect } from 'react';
import { formatShortcutFromEvent, isTypingTarget } from './shortcut-utils.js';

/**
 * Global keyboard/mouse-shortcut listener.
 *
 * Reads bindings from the snapshot's `shortcuts` map and dispatches the
 * appropriate API call. Learn mode (when `learningShortcut` is set) intercepts
 * the next captured combination and saves it via `onSaveShortcut`.
 *
 * Also runs a click-outside watcher that closes any compact-mode dropdowns
 * (`.tab-toolbar-menu`, `.outputs-selector`) by invoking the supplied
 * `onCloseFloatingMenus` callback.
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
  useEffect(() => {
    const onShortcutInput = (event) => {
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

      if (learningShortcut) {
        event.preventDefault();
        event.stopPropagation();
        void saveGlobalShortcut(learningShortcut.action, shortcutValue);
        setLearningShortcut(null);
        return;
      }

      if (
        shortcutBindings?.show === shortcutValue ||
        shortcutBindings?.live === shortcutValue ||
        shortcutBindings?.hide === shortcutValue
      ) {
        event.preventDefault();
        const action =
          shortcutBindings?.show === shortcutValue
            ? 'show'
            : shortcutBindings?.live === shortcutValue
              ? 'live'
              : 'hide';
        void triggerGlobalShortcut(action);
        return;
      }

      if (
        shortcutBindings?.nextTitle === shortcutValue ||
        shortcutBindings?.previousTitle === shortcutValue
      ) {
        event.preventDefault();
        void triggerNavigationShortcut(
          shortcutBindings?.nextTitle === shortcutValue ? 'nextTitle' : 'previousTitle',
        );
        return;
      }

      const outputShortcutEntry = Object.entries(shortcutBindings?.outputSelectById || {})
        .find(([, value]) => value === shortcutValue);
      if (outputShortcutEntry) {
        event.preventDefault();
        setLocalSelectedOutputId(outputShortcutEntry[0]);
        pushFeedback(
          `Output switched to ${
            outputs.find((output) => output.id === outputShortcutEntry[0])?.name || 'selected output'
          }`,
        );
        return;
      }

      const entryShortcutEntry = Object.entries(shortcutBindings?.entrySelectById || {})
        .find(([, value]) => value === shortcutValue);
      if (entryShortcutEntry) {
        event.preventDefault();
        void api(`/api/entries/${entryShortcutEntry[0]}/select`, {
          method: 'POST',
          body: { outputId: selectedOutput?.id },
        }).catch(() => {});
        return;
      }

      const timerToggleEntry = Object.entries(shortcutBindings?.timerToggleById || {})
        .find(([, value]) => value === shortcutValue);
      if (timerToggleEntry) {
        event.preventDefault();
        const timer = snapshot?.timers?.find((item) => item.id === timerToggleEntry[0]);
        const nextAction = timer?.running ? 'stop' : 'start';
        void commandTimer(timerToggleEntry[0], nextAction);
        return;
      }

      const timerResetEntry = Object.entries(shortcutBindings?.timerResetById || {})
        .find(([, value]) => value === shortcutValue);
      if (timerResetEntry) {
        event.preventDefault();
        void commandTimer(timerResetEntry[0], 'reset');
      }
    };

    const onAnyClick = (event) => {
      onCloseFloatingMenus?.(event);
    };

    window.addEventListener('keydown', onShortcutInput, true);
    window.addEventListener('mousedown', onShortcutInput, true);
    window.addEventListener('click', onAnyClick);
    return () => {
      window.removeEventListener('keydown', onShortcutInput, true);
      window.removeEventListener('mousedown', onShortcutInput, true);
      window.removeEventListener('click', onAnyClick);
    };
  }, [
    api,
    learningShortcut,
    selectedOutput?.id,
    shortcutBindings?.show,
    shortcutBindings?.live,
    shortcutBindings?.hide,
    shortcutBindings?.nextTitle,
    shortcutBindings?.previousTitle,
    outputs,
    JSON.stringify(shortcutBindings?.outputSelectById || {}),
    JSON.stringify(shortcutBindings?.entrySelectById || {}),
    JSON.stringify(shortcutBindings?.timerToggleById || {}),
    JSON.stringify(shortcutBindings?.timerResetById || {}),
    snapshot?.timers?.map((t) => `${t.id}:${t.running}`).join('|'),
    setLearningShortcut,
    setLocalSelectedOutputId,
    saveGlobalShortcut,
    triggerGlobalShortcut,
    triggerNavigationShortcut,
    commandTimer,
    pushFeedback,
    onCloseFloatingMenus,
  ]);
};
