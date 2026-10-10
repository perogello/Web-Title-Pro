import { useEffect, useRef } from 'react';
import { formatShortcutFromEvent } from '../shortcut-utils.js';
import { findActionForShortcut } from '../shortcut-model.js';
import { isAppDialogOpen } from '../app-dialog.jsx';

// File-menu keyboard shortcuts (Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S).
// The File menu has always advertised them, but nothing listened. They work
// while typing too (Ctrl+S in a field should still save), except when the
// operator bound the same combination to a control action, or is in
// shortcut Learn mode — those keep priority.
const PROJECT_SHORTCUTS = {
  'Ctrl+N': 'new',
  'Ctrl+O': 'open',
  'Ctrl+S': 'save',
  'Ctrl+Shift+S': 'saveAs',
};

export const useProjectShortcuts = ({
  shortcutBindings,
  learningShortcut,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onSaveAsProject,
}) => {
  const stateRef = useRef({});
  stateRef.current = {
    shortcutBindings,
    learningShortcut,
    handlers: {
      new: onNewProject,
      open: onOpenProject,
      save: onSaveProject,
      saveAs: onSaveAsProject,
    },
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const s = stateRef.current;
      if (s.learningShortcut || isAppDialogOpen()) return;

      // Match the physical key (event.code), so Ctrl+S also works with the
      // Russian layout, where event.key is "ы".
      const letter = /^Key([A-Z])$/.exec(event.code || '')?.[1];
      if (!letter) return;
      const command = PROJECT_SHORTCUTS[`Ctrl+${event.shiftKey ? 'Shift+' : ''}${letter}`];
      if (!command) return;
      if (findActionForShortcut(s.shortcutBindings || {}, formatShortcutFromEvent(event))) return;

      event.preventDefault();
      event.stopPropagation();
      void s.handlers[command]?.();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
};
