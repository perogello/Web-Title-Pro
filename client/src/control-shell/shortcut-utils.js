const MOUSE_BUTTON_LABELS = {
  0: 'Mouse Left',
  1: 'Mouse Middle',
  2: 'Mouse Right',
  3: 'Mouse Back',
  4: 'Mouse Forward',
};

const KEY_NAME_MAP = {
  ' ': 'Space',
  Escape: 'Escape',
  Esc: 'Escape',
  Enter: 'Enter',
  ArrowUp: 'Arrow Up',
  ArrowDown: 'Arrow Down',
  ArrowLeft: 'Arrow Left',
  ArrowRight: 'Arrow Right',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Tab: 'Tab',
};

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

export const isTypingTarget = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return Boolean(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable);
};

export const describeMouseButton = (button) =>
  MOUSE_BUTTON_LABELS[button] || `Mouse ${button}`;

export const normalizeKeyName = (key = '') => {
  if (KEY_NAME_MAP[key]) {
    return KEY_NAME_MAP[key];
  }

  if (typeof key === 'string' && key.length === 1) {
    return key.toUpperCase();
  }

  return key;
};

export const formatShortcutFromEvent = (event) => {
  if (!event) return '';

  const parts = [];

  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');

  const base =
    event.type === 'mousedown'
      ? describeMouseButton(event.button)
      : normalizeKeyName(event.key || '');

  if (!base || MODIFIER_KEYS.has(base)) {
    return '';
  }

  return [...parts, base].join('+');
};
