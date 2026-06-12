import { useEffect, useRef, useState } from 'react';
import SyncPopover from './SyncPopover.jsx';
import SegmentedTimerInput from './SegmentedTimerInput.jsx';
import { PauseIcon, PlayIcon, ResetIcon } from '../icons.jsx';

const DEFAULT_COL_WIDTH = 200;
const IDX_COL_WIDTH = 50;
const TIMER_COL_WIDTH = 200;

const NOTE_DEFAULT_TEXT_COLOR = '#f5f5f7';
const NOTE_DEFAULT_FILL_COLOR = '#15151a';
const NOTE_FONT_SIZES = [12, 14, 16, 18, 22, 28, 36];
const NOTES_OPEN_STORAGE_KEY = 'web-title-pro.liveNotesOpen';
const NOTES_WIDTH_STORAGE_KEY = 'web-title-pro.liveNotesWidth';
const NOTES_STORAGE_KEY = 'web-title-pro.liveNotes';
const NOTES_MIN_WIDTH = 260;
const NOTES_MAX_WIDTH = 620;
const NOTES_DEFAULT_WIDTH = 340;

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const textToNotesHtml = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>');
const textToDefaultNotesHtml = (value) =>
  `<span style="font-size: 16px; color: ${NOTE_DEFAULT_TEXT_COLOR}; font-weight: 400; font-style: normal; background: transparent;">${textToNotesHtml(value)}</span>`;

const clampNotesWidth = (value) => Math.min(NOTES_MAX_WIDTH, Math.max(NOTES_MIN_WIDTH, value));

const stripNodeBackground = (node, { unwrapEmpty = false } = {}) => {
  if (!node?.style) return;

  node.style.background = '';
  node.style.backgroundColor = '';
  if (unwrapEmpty && !node.getAttribute('style')) {
    node.replaceWith(...node.childNodes);
  }
};

const stripBackgroundStyles = (root) => {
  if (root?.matches?.('span[style], mark[style]')) {
    stripNodeBackground(root, { unwrapEmpty: true });
  }

  root.querySelectorAll('span[style], mark[style]').forEach((node) => {
    stripNodeBackground(node, { unwrapEmpty: true });
  });
};

const loadStoredNotesWidth = () => {
  try {
    const value = Number(window.localStorage.getItem(NOTES_WIDTH_STORAGE_KEY));
    return Number.isFinite(value) ? clampNotesWidth(value) : NOTES_DEFAULT_WIDTH;
  } catch {
    return NOTES_DEFAULT_WIDTH;
  }
};

const loadStoredNotesOpen = () => {
  try {
    return window.localStorage.getItem(NOTES_OPEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

function LiveNotesPanel({ storageKey }) {
  const editorRef = useRef(null);
  const textColorInputRef = useRef(null);
  const fillColorInputRef = useRef(null);
  const fillMenuRef = useRef(null);
  const savedRangeRef = useRef(null);
  const textColorApplyTimerRef = useRef(null);
  const fillColorApplyTimerRef = useRef(null);
  const [textColor, setTextColor] = useState(NOTE_DEFAULT_TEXT_COLOR);
  const [fillColor, setFillColor] = useState('#ffd166');
  const [fillMenuOpen, setFillMenuOpen] = useState(false);
  const [formatState, setFormatState] = useState({ bold: false, italic: false });

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

    window.localStorage.setItem(storageKey, JSON.stringify({
      html: editor.innerHTML,
      text: editor.innerText,
    }));
  };

  const refreshFormatState = () => {
    try {
      setFormatState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
      });
    } catch {
      setFormatState({ bold: false, italic: false });
    }
  };

  const saveSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
      refreshFormatState();
    }
  };

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

  const normalizeEditorNodes = ({ fontSize = null } = {}) => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    let selectedReplacement = null;

    editor.querySelectorAll('font[size="7"], font[color]').forEach((fontNode) => {
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
      if (activeRange?.intersectsNode?.(fontNode)) {
        selectedReplacement = span;
      }
      fontNode.replaceWith(span);
    });

    if (selectedReplacement && selection) {
      const nextRange = document.createRange();
      nextRange.selectNodeContents(selectedReplacement);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    }
  };

  const extractSelectedHtml = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const container = document.createElement('div');
    container.appendChild(selection.getRangeAt(0).cloneContents());
    return container.innerHTML;
  };

  const stripBackgroundStylesInRange = (range) => {
    const editor = editorRef.current;
    if (!editor || !range) return;

    editor.querySelectorAll('span[style], mark[style]').forEach((node) => {
      if (range.intersectsNode(node)) {
        stripNodeBackground(node);
      }
    });
  };

  const runEditorCommand = (command, value = null, afterCommand = null) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    afterCommand?.();
    saveSelection();
    saveNotes();
  };

  const pastePlainText = (event) => {
    const editor = editorRef.current;
    if (!editor) return;

    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text) return;

    event.preventDefault();
    editor.focus();
    restoreSelection();
    document.execCommand('insertHTML', false, textToDefaultNotesHtml(text));
    normalizeEditorNodes();
    saveSelection();
    refreshFormatState();
    saveNotes();
  };

  const clearSelectedBackground = () => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    if (!restoreSelection()) return;
    const selectedHtml = extractSelectedHtml();
    if (!selectedHtml) return;

    const wrapper = document.createElement('span');
    wrapper.innerHTML = selectedHtml;
    stripBackgroundStyles(wrapper);

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    stripBackgroundStylesInRange(range);
    const fragment = document.createDocumentFragment();
    while (wrapper.firstChild) {
      fragment.appendChild(wrapper.firstChild);
    }

    const firstNode = fragment.firstChild;
    const lastNode = fragment.lastChild;
    if (!firstNode || !lastNode) return;

    range.deleteContents();
    range.insertNode(fragment);

    const nextRange = document.createRange();
    nextRange.setStartBefore(firstNode);
    nextRange.setEndAfter(lastNode);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedRangeRef.current = nextRange.cloneRange();
    refreshFormatState();
    saveNotes();
  };

  const clearColorApplyTimer = (timerRef) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleColorCommand = (timerRef, applyCommand) => {
    clearColorApplyTimer(timerRef);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      applyCommand();
    }, 120);
  };

  const flushColorCommand = (timerRef, applyCommand) => {
    clearColorApplyTimer(timerRef);
    applyCommand();
  };

  useEffect(() => {
    const textInput = textColorInputRef.current;
    if (!textInput) return undefined;

    const applyTextColor = (value) => {
      setTextColor(value);
      runEditorCommand('foreColor', value, () => normalizeEditorNodes());
    };
    const scheduleTextColor = (event) => {
      const value = event.target.value;
      setTextColor(value);
      scheduleColorCommand(textColorApplyTimerRef, () => applyTextColor(value));
    };
    const flushTextColor = (event) => {
      flushColorCommand(textColorApplyTimerRef, () => applyTextColor(event.target.value));
    };

    textInput.addEventListener('input', scheduleTextColor);
    textInput.addEventListener('change', flushTextColor);
    return () => {
      textInput.removeEventListener('input', scheduleTextColor);
      textInput.removeEventListener('change', flushTextColor);
    };
  });

  useEffect(() => {
    const fillInput = fillColorInputRef.current;
    if (!fillInput) return undefined;

    const applyFillColor = (value) => {
      setFillColor(value);
      runEditorCommand('hiliteColor', value);
    };
    const scheduleFillColor = (event) => {
      const value = event.target.value;
      setFillColor(value);
      scheduleColorCommand(fillColorApplyTimerRef, () => applyFillColor(value));
    };
    const flushFillColor = (event) => {
      flushColorCommand(fillColorApplyTimerRef, () => applyFillColor(event.target.value));
    };

    fillInput.addEventListener('input', scheduleFillColor);
    fillInput.addEventListener('change', flushFillColor);
    return () => {
      fillInput.removeEventListener('input', scheduleFillColor);
      fillInput.removeEventListener('change', flushFillColor);
    };
  });

  useEffect(() => () => {
    clearColorApplyTimer(textColorApplyTimerRef);
    clearColorApplyTimer(fillColorApplyTimerRef);
  }, []);

  const openColorPicker = (inputRef) => {
    restoreSelection();
    inputRef.current?.click();
  };

  useEffect(() => {
    if (!fillMenuOpen) return undefined;

    const closeOnOutside = (event) => {
      if (!fillMenuRef.current?.contains(event.target)) {
        setFillMenuOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setFillMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [fillMenuOpen]);

  return (
    <aside className="live-notes-v2" aria-label="Live notes">
      <div className="live-notes-toolbar">
        <button
          type="button"
          className={`note-tool-btn ${formatState.bold ? 'is-active' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runEditorCommand('bold')}
          title="Bold"
          aria-label="Bold"
        >
          B
        </button>
        <button
          type="button"
          className={`note-tool-btn is-italic ${formatState.italic ? 'is-active' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runEditorCommand('italic')}
          title="Italic"
          aria-label="Italic"
        >
          K
        </button>
        <select
          defaultValue={16}
          onMouseDown={saveSelection}
          onChange={(event) => {
            const fontSize = Number(event.target.value);
            runEditorCommand('fontSize', '7', () => normalizeEditorNodes({ fontSize }));
          }}
          title="Font size"
          aria-label="Font size"
        >
          {NOTE_FONT_SIZES.map((size) => (
            <option key={size} value={size}>{size}px</option>
          ))}
        </select>
        <button
          type="button"
          className="note-color-btn"
          style={{ '--swatch': textColor }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => openColorPicker(textColorInputRef)}
          title="Text color"
          aria-label="Text color"
        >
          <span className="note-color-chip" />
          <span>Text</span>
        </button>
        <div ref={fillMenuRef} className="note-fill-control" aria-label="Fill controls">
          <button
            type="button"
            className={`note-color-btn note-fill-trigger ${fillMenuOpen ? 'is-open' : ''}`}
            style={{ '--swatch': fillColor }}
            tabIndex={-1}
            aria-hidden="true"
            title="Background color"
            aria-haspopup="menu"
            aria-expanded={fillMenuOpen}
          >
            <span className="note-color-chip" />
            <span>Fill</span>
          </button>
          <input
            ref={fillColorInputRef}
            className="note-fill-native-color"
            type="color"
            value={fillColor}
            onMouseDown={saveSelection}
            onClick={() => setFillMenuOpen(true)}
            onChange={(event) => setFillColor(event.currentTarget.value)}
            title="Background color"
            aria-label="Background color"
          />
          {fillMenuOpen && (
            <div className="note-fill-menu" role="menu" aria-label="Fill menu">
              <button
                type="button"
                className="note-clear-fill-btn"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  clearSelectedBackground();
                  setFillMenuOpen(false);
                }}
                title="Clear background"
                aria-label="Clear background"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        <input
          ref={textColorInputRef}
          className="note-hidden-color"
          type="color"
          value={textColor}
          onChange={(event) => setTextColor(event.currentTarget.value)}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
      <div
        ref={editorRef}
        className="live-notes-editor"
        contentEditable
        role="textbox"
        aria-label="Notes editor"
        data-placeholder="Notes..."
        spellCheck
        onInput={() => {
          saveNotes();
          refreshFormatState();
        }}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onFocus={saveSelection}
        onPaste={pastePlainText}
        suppressContentEditableWarning
      />
    </aside>
  );
}

export default function LiveTabV2({
  selectedOutput,
  selectedSource,
  selectedSourceId,
  sourceLibrary,
  selectedLinkedTimerId,
  timers,
  outputs,
  syncedOutputIds,
  selectedSourceDisplayColumns,
  activeSourceBinding,
  activeTimerBinding,
  linkedSourceTimer,
  liveSourceColumnWidths,
  normalizeLinkedTimerId,
  getSourceRowTimerState,
  getTimerSegments,
  onSelectSource,
  onSetSelectedSourceLinkedTimer,
  onToggleSourceSyncOutput,
  onApplySourceRow,
  onControlSourceRowTimer,
  onAdjustSourceRowTimerSegment,
  onSetSourceRowTimerBase,
  onResizeSourceColumn,
  onTogglePreview,
  previewOpen,
}) {
  const tableRef = useRef(null);
  const [notesOpen, setNotesOpen] = useState(loadStoredNotesOpen);
  const [notesWidth, setNotesWidth] = useState(loadStoredNotesWidth);
  const [notesDragging, setNotesDragging] = useState(false);
  const notesResizeStartRef = useRef({ x: 0, width: notesWidth });

  useEffect(() => {
    try {
      window.localStorage.setItem(NOTES_OPEN_STORAGE_KEY, notesOpen ? 'true' : 'false');
    } catch {}
  }, [notesOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NOTES_WIDTH_STORAGE_KEY, String(notesWidth));
    } catch {}
  }, [notesWidth]);

  useEffect(() => {
    if (!notesDragging) return undefined;

    const onMove = (event) => {
      const delta = event.clientX - notesResizeStartRef.current.x;
      setNotesWidth(clampNotesWidth(notesResizeStartRef.current.width - delta));
    };
    const onUp = () => setNotesDragging(false);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [notesDragging]);

  const getColumnWidth = (column) => {
    if (!selectedSource?.id || !column?.id) return null;
    return liveSourceColumnWidths?.[`${selectedSource.id}:${column.id}`] || null;
  };

  // Excel-style column resize — only the dragged column changes width.
  // table-layout: fixed + explicit width on the <col>; siblings keep their declared widths,
  // and any column without a stored width keeps its initial rendered px snapshot taken once.
  const startColumnResize = (event, column) => {
    if (!selectedSource?.id || !column?.id) return;
    event.preventDefault();
    event.stopPropagation();

    const colEl = tableRef.current?.querySelector(`col[data-col-id="${column.id}"]`);
    const startX = event.clientX;
    const startWidth = colEl?.offsetWidth || getColumnWidth(column) || DEFAULT_COL_WIDTH;

    // Snapshot all other columns once so they don't reflow when fixed layout pins them.
    const allCols = tableRef.current?.querySelectorAll('col[data-col-id]') || [];
    allCols.forEach((c) => {
      const otherId = c.getAttribute('data-col-id');
      if (otherId && otherId !== column.id && !getColumnWidth({ id: otherId })) {
        onResizeSourceColumn?.(selectedSource.id, otherId, c.offsetWidth);
      }
    });

    const onMove = (moveEvent) => {
      const next = Math.max(48, startWidth + moveEvent.clientX - startX);
      onResizeSourceColumn?.(selectedSource.id, column.id, next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };

    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startNotesResize = (event) => {
    event.preventDefault();
    notesResizeStartRef.current = { x: event.clientX, width: notesWidth };
    setNotesDragging(true);
  };

  const outputName = selectedOutput?.name || 'No output selected';
  const sourceName = selectedSource?.name || 'No source';
  const rowCount = selectedSource?.rows?.length || 0;

  return (
    <div className="tab-content-v2 is-active">
      <section className="source-card-v2">
        <div className="source-card-v2-head">
          <div className="title-block">
            <span className="kicker">Live data source</span>
            <h3 title={outputName}>{outputName}</h3>
          </div>
          <div className="tools">
            <select
              className="compact-select-v2"
              value={selectedSourceId || ''}
              onChange={(event) => onSelectSource?.(event.target.value)}
              title="Data source"
            >
              {sourceLibrary.length === 0 && <option value="">No sources</option>}
              {sourceLibrary.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
            <select
              className="compact-select-v2"
              value={selectedLinkedTimerId || ''}
              onChange={(event) => onSetSelectedSourceLinkedTimer?.(event.target.value)}
              title="Linked timer"
            >
              <option value="">No timer</option>
              {timers.map((timer) => (
                <option key={timer.id} value={normalizeLinkedTimerId(timer.id) || ''}>{timer.name}</option>
              ))}
            </select>
            <SyncPopover
              outputs={outputs}
              selectedOutputId={selectedOutput?.id}
              syncedOutputIds={syncedOutputIds}
              onToggleOutput={onToggleSourceSyncOutput}
            />
            <button
              type="button"
              className={`compact-btn-v2 preview-toggle-btn-v2 ${previewOpen ? 'is-open' : ''}`}
              onClick={onTogglePreview}
              title="Preview"
            >
              <span>Preview</span>
              <span className="chev">{'▾'}</span>
            </button>
            <button
              type="button"
              className={`compact-btn-v2 notes-toggle-btn-v2 ${notesOpen ? 'is-open' : ''}`}
              onClick={() => setNotesOpen((value) => !value)}
              title="Notes"
            >
              <span>Notes</span>
              <span className="chev">{'▾'}</span>
            </button>
          </div>
        </div>

        {selectedSource ? (
          <div
            className={`live-source-body-v2 ${notesOpen ? 'has-notes' : ''}`}
            style={{ '--notes-width': `${notesWidth}px` }}
          >
            <div className="table-wrap-v2">
              <table className="source-v2" ref={tableRef}>
              <colgroup>
                <col data-col-id="__idx" style={{ width: `${IDX_COL_WIDTH}px` }} />
                {selectedSourceDisplayColumns.map((column) => {
                  const w = getColumnWidth(column) || DEFAULT_COL_WIDTH;
                  return (
                    <col key={column.id} data-col-id={column.id} style={{ width: `${w}px` }} />
                  );
                })}
                {selectedLinkedTimerId && <col data-col-id="__timer" style={{ width: `${TIMER_COL_WIDTH}px` }} />}
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  {selectedSourceDisplayColumns.map((column) => (
                    <th key={column.id}>
                      <div className="col-head" title={column.binding ? `${column.label} → ${column.binding}` : column.label}>
                        <span>{column.label}</span>
                        {column.binding && <small className="col-binding">{column.binding}</small>}
                      </div>
                      <span
                        className="col-resizer"
                        onMouseDown={(event) => startColumnResize(event, column)}
                        aria-label={`Resize ${column.label}`}
                      />
                    </th>
                  ))}
                  {selectedLinkedTimerId && <th>Timer</th>}
                </tr>
              </thead>
              <tbody>
                {selectedSource.rows.map((row) => {
                  const isActiveRow =
                    activeSourceBinding?.sourceId === selectedSource.id &&
                    activeSourceBinding?.rowId === row.id;
                  const isTimerRow =
                    activeTimerBinding?.sourceId === selectedSource.id &&
                    activeTimerBinding?.rowId === row.id &&
                    normalizeLinkedTimerId(activeTimerBinding?.timerId) === selectedLinkedTimerId;
                  const timerState = selectedLinkedTimerId
                    ? getSourceRowTimerState?.(selectedSource.id, row, linkedSourceTimer, isTimerRow)
                    : null;
                  const displayedTimerMs = Number(timerState?.currentMs ?? (row.timer?.baseMs || 0));
                  const timerFormat = linkedSourceTimer?.displayFormat || row.timer?.format || 'mm:ss';
                  const timerSegments = selectedLinkedTimerId
                    ? getTimerSegments?.(displayedTimerMs, timerFormat) || []
                    : [];

                  return (
                    <tr
                      key={row.id}
                      className={isActiveRow ? 'is-applied' : ''}
                      onClick={() => onApplySourceRow?.(row)}
                    >
                      <td className="idx">{row.index}</td>
                      {selectedSourceDisplayColumns.map((column, index) => (
                        <td key={column.id} title={row.values[index] || ''}>
                          {row.values[index] || ''}
                        </td>
                      ))}
                      {selectedLinkedTimerId && (
                        <td className="row-timer-td" onClick={(event) => event.stopPropagation()}>
                          <div className="row-timer-cell-v3">
                            <div className="row-timer-actions-v3">
                              <button
                                className={`row-timer-icon-btn is-${timerState?.status || 'idle'}`}
                                onClick={() => onControlSourceRowTimer?.(selectedSource.id, row, 'toggle', {
                                  syncTimerId: selectedLinkedTimerId,
                                  linkedTimerId: selectedLinkedTimerId,
                                  linkedTimer: linkedSourceTimer || null,
                                  isTimerRow,
                                })}
                                title={timerState?.status === 'running' ? 'Pause' : 'Start'}
                              >
                                {timerState?.status === 'running' ? <PauseIcon /> : <PlayIcon />}
                              </button>
                              <button
                                className="row-timer-icon-btn is-reset"
                                onClick={() => onControlSourceRowTimer?.(selectedSource.id, row, 'reset', {
                                  syncTimerId: selectedLinkedTimerId,
                                  linkedTimerId: selectedLinkedTimerId,
                                  linkedTimer: linkedSourceTimer || null,
                                  isTimerRow,
                                })}
                                title="Reset timer"
                              >
                                <ResetIcon />
                              </button>
                            </div>
                            <SegmentedTimerInput
                              value={displayedTimerMs}
                              format={timerFormat}
                              size="lg"
                              withArrows
                              onCommit={(nextMs) => onSetSourceRowTimerBase?.(selectedSource.id, row.id, nextMs, {
                                syncTimerId: selectedLinkedTimerId,
                                linkedTimerId: selectedLinkedTimerId,
                                linkedTimer: linkedSourceTimer || null,
                              })}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            {notesOpen && (
              <>
                <div
                  className={`notes-splitter-v2 ${notesDragging ? 'is-dragging' : ''}`}
                  onMouseDown={startNotesResize}
                  role="separator"
                  aria-label="Resize notes"
                  aria-orientation="vertical"
                />
                <LiveNotesPanel storageKey={NOTES_STORAGE_KEY} />
              </>
            )}
          </div>
        ) : (
          <div className="hint-card-v2" style={{ margin: 14 }}>
            <strong>{sourceName}</strong>
            {sourceLibrary.length === 0
              ? 'Add a data source in the Data tab — TXT/CSV file or remote sheet.'
              : 'Pick a source from the dropdown in the top-right.'}
          </div>
        )}
      </section>
    </div>
  );
}
