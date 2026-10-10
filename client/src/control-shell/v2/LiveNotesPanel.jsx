import { useEffect, useRef, useState } from 'react';

// Operator notes: a small rich-text pad (bold / italic / size / text colour /
// fill) persisted to localStorage. Formatting goes through execCommand, which
// needs the editor focused with the right selection — so the editor's last
// selection is tracked continuously (selectionchange) and every toolbar control
// keeps focus in the editor (mousedown preventDefault) instead of relying on a
// native colour picker's input/change events.

export const NOTES_STORAGE_KEY = 'web-title-pro.liveNotes';

const NOTE_DEFAULT_TEXT_COLOR = '#f5f5f7';
const NOTE_DEFAULT_FILL_COLOR = '#ffd166';
const NOTE_FONT_SIZES = [12, 14, 16, 18, 22, 28, 36];
const NOTE_TEXT_COLORS = [
  '#f5f5f7', '#9aa0a6', '#ff4d4f', '#ff9f1a', '#ffd166',
  '#3ddc84', '#4dabf7', '#b197fc', '#ff6bcb', '#111114',
];
const NOTE_FILL_COLORS = [
  '#ffd166', '#ff9f1a', '#ff4d4f', '#3ddc84', '#4dabf7',
  '#b197fc', '#ff6bcb', '#5c5c66', '#2b2b33', '#f5f5f7',
];

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const textToNotesHtml = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>');

const unwrapIfBare = (node) => {
  if (node.tagName === 'SPAN' && !node.getAttribute('style')) {
    node.replaceWith(...node.childNodes);
  }
};

// Remove one inline CSS property from every styled descendant, so a freshly
// applied size/colour/fill isn't overridden by older nested spans.
const stripDescendantStyle = (root, property) => {
  root.querySelectorAll('[style]').forEach((node) => {
    node.style.removeProperty(property);
    unwrapIfBare(node);
  });
};

const stripNodeBackground = (node, { unwrapEmpty = false } = {}) => {
  if (!node?.style) return;

  node.style.background = '';
  node.style.backgroundColor = '';
  if (unwrapEmpty) {
    unwrapIfBare(node);
  }
};

const toRgb = (color) => {
  const probe = document.createElement('span');
  probe.style.color = color;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
};

const rangeTextNodes = (editor, range) => {
  const nodes = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.data.trim() && range.intersectsNode(node)) nodes.push(node);
  }
  return nodes;
};

// A selection as plain-text character offsets within the editor. execCommand
// splits/merges spans freely and Chrome then often leaves the selection
// covering a whole ancestor; offsets survive any restyling (the text itself
// never changes), so the same characters can be reselected afterwards.
const rangeToOffsets = (editor, range) => {
  if (!range || range.collapsed || !editor.contains(range.commonAncestorContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(editor);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length };
};

const offsetsToRange = (editor, { start, end }) => {
  const range = document.createRange();
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let position = 0;
  let startSet = false;
  let lastNode = null;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.data.length;
    if (!startSet && start < position + length) {
      range.setStart(node, start - position);
      startSet = true;
    }
    if (startSet && end <= position + length) {
      range.setEnd(node, end - position);
      return range;
    }
    position += length;
    lastNode = node;
  }
  if (!startSet || !lastNode) return null;
  range.setEnd(lastNode, lastNode.data.length);
  return range;
};

const ColorMenu =({ label, colors, current, allowNone, onPick, onNone, onCustom, onClose }) => {
  const menuRef = useRef(null);
  const customRef = useRef(null);

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (!menuRef.current?.contains(event.target) && !menuRef.current?.parentElement?.contains(event.target)) {
        onClose();
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  // Native `change` fires once, when the system picker is closed — applying
  // only then avoids stealing focus from the picker while the user drags.
  useEffect(() => {
    const input = customRef.current;
    if (!input) return undefined;
    const onChange = (event) => onCustom(event.target.value);
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, [onCustom]);

  return (
    <div ref={menuRef} className="note-color-menu" role="menu" aria-label={label}>
      <div className="note-swatch-grid">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            className={`note-swatch-v2 ${current?.toLowerCase() === color ? 'is-current' : ''}`}
            style={{ '--swatch': color }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(color)}
            title={color}
            aria-label={color}
          />
        ))}
      </div>
      <div className="note-color-menu-row">
        <label className="note-custom-color" title="Custom colour">
          <input ref={customRef} type="color" defaultValue={current} aria-label={`${label}: custom colour`} />
          <span>Custom…</span>
        </label>
        {allowNone && (
          <button
            type="button"
            className="note-clear-fill-btn"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onNone}
            aria-label="Clear background"
            title="Clear background"
          >
            None
          </button>
        )}
      </div>
    </div>
  );
};

export default function LiveNotesPanel({ storageKey = NOTES_STORAGE_KEY }) {
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [textColor, setTextColor] = useState(NOTE_DEFAULT_TEXT_COLOR);
  const [fillColor, setFillColor] = useState(NOTE_DEFAULT_FILL_COLOR);
  const [openMenu, setOpenMenu] = useState(null);
  const [formatState, setFormatState] = useState({ bold: false, italic: false, fontSize: '' });

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      editor.innerHTML = saved?.html || textToNotesHtml(saved?.text || '');
    } catch {
      editor.innerHTML = '';
    }
  }, [storageKey]);

  const saveNotes = () => {
    const editor = editorRef.current;
    if (!editor) return;

    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        html: editor.innerHTML,
        text: editor.innerText,
      }));
    } catch {}
  };

  const readFontSize = (range) => {
    const editor = editorRef.current;
    if (!editor || !range) return '';
    const nodes = range.collapsed
      ? [range.startContainer]
      : rangeTextNodes(editor, range);
    const sizes = new Set(nodes.map((node) => {
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      return Math.round(parseFloat(getComputedStyle(element).fontSize));
    }));
    if (sizes.size !== 1) return '';
    const [size] = sizes;
    return NOTE_FONT_SIZES.includes(size) ? String(size) : '';
  };

  const refreshFormatState = (range = savedRangeRef.current) => {
    try {
      setFormatState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        fontSize: readFontSize(range),
      });
    } catch {
      setFormatState({ bold: false, italic: false, fontSize: '' });
    }
  };

  // Track the editor's selection wherever the mouse is released (a drag that
  // ends outside the editor, Shift+click, keyboard) — not only on mouseup/keyup
  // inside it. Selections outside the editor are ignored, so clicking a
  // toolbar control never loses the range we're about to format.
  useEffect(() => {
    const onSelectionChange = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;
      savedRangeRef.current = range.cloneRange();
      refreshFormatState(range);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const restoreSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = savedRangeRef.current;
    if (!editor || !selection || !range || !editor.contains(range.commonAncestorContainer)) return false;

    try {
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch {
      savedRangeRef.current = null;
      return false;
    }
  };

  const selectRange = (range) => {
    const selection = window.getSelection();
    if (!selection || !range) return;
    selection.removeAllRanges();
    selection.addRange(range);
    savedRangeRef.current = range.cloneRange();
  };

  // execCommand('fontSize'/'foreColor') emits legacy <font> tags; turn them
  // into styled spans and drop the same property from nested spans so the new
  // value wins over older formatting inside the selection.
  const normalizeFontNodes = ({ fontSize = null } = {}) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.querySelectorAll('font').forEach((fontNode) => {
      const span = document.createElement('span');
      if (fontSize && fontNode.getAttribute('size') === '7') {
        span.style.fontSize = `${fontSize}px`;
      }
      const color = fontNode.getAttribute('color');
      if (color) {
        span.style.color = color;
      }
      while (fontNode.firstChild) {
        span.appendChild(fontNode.firstChild);
      }
      if (span.style.fontSize) stripDescendantStyle(span, 'font-size');
      if (span.style.color) stripDescendantStyle(span, 'color');
      fontNode.replaceWith(span);
      unwrapIfBare(span);
    });
  };

  // Runs a formatting command on the saved selection. `afterCommand` gets the
  // range of the originally selected characters (null for a caret), and that
  // same text stays selected afterwards so the next command applies to it.
  const runEditorCommand = (command, value = null, afterCommand = null) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    restoreSelection();
    const offsets = rangeToOffsets(editor, savedRangeRef.current);
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(command, false, value);
    afterCommand?.(offsets ? offsetsToRange(editor, offsets) : null);
    if (offsets) {
      selectRange(offsetsToRange(editor, offsets));
    } else {
      const selection = window.getSelection();
      if (selection?.rangeCount) savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    refreshFormatState();
    saveNotes();
  };

  const applyTextColor = (color) => {
    setTextColor(color);
    setOpenMenu(null);
    runEditorCommand('foreColor', color, () => normalizeFontNodes());
  };

  const applyFontSize = (fontSize) => {
    if (!fontSize) return;
    runEditorCommand('fontSize', '7', () => normalizeFontNodes({ fontSize }));
  };

  const applyFillColor = (color) => {
    setFillColor(color);
    setOpenMenu(null);
    runEditorCommand('hiliteColor', color, (range) => {
      const editor = editorRef.current;
      if (!editor || !range) return;
      const target = toRgb(color);
      editor.querySelectorAll('span[style]').forEach((node) => {
        if (rangeContainsNode(range, node) && getComputedStyle(node).backgroundColor === target) {
          node.querySelectorAll('[style]').forEach((inner) => stripNodeBackground(inner, { unwrapEmpty: true }));
        }
      });
    });
  };

  const pastePlainText = (event) => {
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text) return;

    // Paste as plain text that takes the formatting at the caret — the old
    // wrapper span carried `background: transparent`, which then blocked any
    // later Fill on the pasted text.
    event.preventDefault();
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand('insertText', false, text);
    saveNotes();
  };

  // "None" fill: let the browser split any partially-selected highlight at the
  // selection edges (hiliteColor transparent), then drop the background from
  // every span that now lies entirely inside the selection.
  const clearSelectedBackground = () => {
    setOpenMenu(null);
    runEditorCommand('hiliteColor', 'transparent', (range) => {
      const editor = editorRef.current;
      if (!editor || !range) return;
      editor.querySelectorAll('span[style], mark[style]').forEach((node) => {
        if (rangeContainsNode(range, node)) stripNodeBackground(node, { unwrapEmpty: true });
      });
    });
  };

  const clearFormatting = () => {
    // removeFormat leaves our styled spans alone; strip the ones that lie
    // entirely inside the selection (never touch text outside it).
    runEditorCommand('removeFormat', null, (range) => {
      const editor = editorRef.current;
      if (!editor || !range) return;
      editor.querySelectorAll('span[style], mark[style]').forEach((node) => {
        if (rangeContainsNode(range, node)) {
          node.removeAttribute('style');
          unwrapIfBare(node);
        }
      });
    });
  };

  const keepEditorFocus = (event) => event.preventDefault();
  const toggleMenu = (menu) => setOpenMenu((current) => (current === menu ? null : menu));
  const closeMenu = () => setOpenMenu(null);

  return (
    <aside className="live-notes-v2" aria-label="Live notes">
      <div className="live-notes-toolbar">
        <button
          type="button"
          className={`note-tool-btn ${formatState.bold ? 'is-active' : ''}`}
          onMouseDown={keepEditorFocus}
          onClick={() => runEditorCommand('bold')}
          title="Bold (Ctrl+B)"
          aria-label="Bold"
        >
          B
        </button>
        <button
          type="button"
          className={`note-tool-btn is-italic ${formatState.italic ? 'is-active' : ''}`}
          onMouseDown={keepEditorFocus}
          onClick={() => runEditorCommand('italic')}
          title="Italic (Ctrl+I)"
          aria-label="Italic"
        >
          K
        </button>
        <select
          value={formatState.fontSize}
          onChange={(event) => applyFontSize(Number(event.target.value))}
          title="Font size"
          aria-label="Font size"
        >
          <option value="" disabled hidden>Size</option>
          {NOTE_FONT_SIZES.map((size) => (
            <option key={size} value={size}>{size}px</option>
          ))}
        </select>

        <div className="note-color-control">
          <button
            type="button"
            className="note-color-btn note-color-apply"
            style={{ '--swatch': textColor }}
            onMouseDown={keepEditorFocus}
            onClick={() => applyTextColor(textColor)}
            title="Text colour — apply the current colour"
            aria-label="Apply text colour"
          >
            <span className="note-color-chip" />
            <span>Text</span>
          </button>
          <button
            type="button"
            className={`note-color-btn note-color-caret-v2 ${openMenu === 'text' ? 'is-open' : ''}`}
            onMouseDown={keepEditorFocus}
            onClick={() => toggleMenu('text')}
            title="Choose text colour"
            aria-label="Choose text colour"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'text'}
          >
            {'▾'}
          </button>
          {openMenu === 'text' && (
            <ColorMenu
              label="Text colour menu"
              colors={NOTE_TEXT_COLORS}
              current={textColor}
              onPick={applyTextColor}
              onCustom={applyTextColor}
              onClose={closeMenu}
            />
          )}
        </div>

        <div className="note-color-control">
          <button
            type="button"
            className="note-color-btn note-color-apply"
            style={{ '--swatch': fillColor }}
            onMouseDown={keepEditorFocus}
            onClick={() => applyFillColor(fillColor)}
            title="Fill — apply the current background colour"
            aria-label="Apply fill colour"
          >
            <span className="note-color-chip" />
            <span>Fill</span>
          </button>
          <button
            type="button"
            className={`note-color-btn note-color-caret-v2 ${openMenu === 'fill' ? 'is-open' : ''}`}
            onMouseDown={keepEditorFocus}
            onClick={() => toggleMenu('fill')}
            title="Choose fill colour"
            aria-label="Choose fill colour"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'fill'}
          >
            {'▾'}
          </button>
          {openMenu === 'fill' && (
            <ColorMenu
              label="Fill menu"
              colors={NOTE_FILL_COLORS}
              current={fillColor}
              allowNone
              onPick={applyFillColor}
              onCustom={applyFillColor}
              onNone={clearSelectedBackground}
              onClose={closeMenu}
            />
          )}
        </div>

        <button
          type="button"
          className="note-tool-btn note-clear-format-btn"
          onMouseDown={keepEditorFocus}
          onClick={clearFormatting}
          title="Clear formatting"
          aria-label="Clear formatting"
        >
          T<sub>x</sub>
        </button>
      </div>
      <div
        ref={editorRef}
        className="live-notes-editor"
        contentEditable
        role="textbox"
        aria-label="Notes editor"
        data-placeholder="Notes..."
        spellCheck
        onInput={saveNotes}
        onPaste={pastePlainText}
        suppressContentEditableWarning
      />
    </aside>
  );
}
