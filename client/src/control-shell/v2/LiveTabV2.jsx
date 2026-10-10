import { useEffect, useRef, useState } from 'react';
import SyncPopover from './SyncPopover.jsx';
import SegmentedTimerInput from './SegmentedTimerInput.jsx';
import LiveNotesPanel from './LiveNotesPanel.jsx';
import { PauseIcon, PlayIcon, ResetIcon } from '../icons.jsx';

const DEFAULT_COL_WIDTH = 200;
const MIN_COL_WIDTH = 40;
const IDX_COL_WIDTH = 50;
const TIMER_COL_WIDTH = 200;

const NOTES_OPEN_STORAGE_KEY = 'web-title-pro.liveNotesOpen';
const NOTES_WIDTH_STORAGE_KEY = 'web-title-pro.liveNotesWidth';
const NOTES_MIN_WIDTH = 260;
const NOTES_MAX_WIDTH = 620;
const NOTES_DEFAULT_WIDTH = 340;

const clampNotesWidth = (value) => Math.min(NOTES_MAX_WIDTH, Math.max(NOTES_MIN_WIDTH, value));

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
      const next = Math.max(MIN_COL_WIDTH, startWidth + moveEvent.clientX - startX);
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

  // table-layout: fixed only honours the <col> widths when the table itself has
  // a definite width — with `width: max-content` the browser sized columns from
  // their content again, so a column could never be dragged narrower than its
  // longest text. Pin the table to the exact sum of its columns instead.
  const tableWidth = IDX_COL_WIDTH
    + selectedSourceDisplayColumns.reduce((sum, column) => sum + (getColumnWidth(column) || DEFAULT_COL_WIDTH), 0)
    + (selectedLinkedTimerId ? TIMER_COL_WIDTH : 0);

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

        {/* Notes live beside the table but don't depend on it: they stay
            available when no data source is loaded. */}
        <div
          className={`live-source-body-v2 ${notesOpen ? 'has-notes' : ''}`}
          style={{ '--notes-width': `${notesWidth}px` }}
        >
          {selectedSource ? (
            <div className="table-wrap-v2">
              <table
                className={`source-v2 ${selectedLinkedTimerId ? 'has-timer' : ''}`}
                ref={tableRef}
                style={{ width: `${tableWidth}px` }}
              >
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
                        <span className="col-label">{column.label}</span>
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
                          <div className="cell-text">{row.values[index] || ''}</div>
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
          ) : (
            <div className="table-wrap-v2">
              <div className="hint-card-v2" style={{ margin: 14 }}>
                <strong>{sourceName}</strong>
                {sourceLibrary.length === 0
                  ? 'Add a data source in the Data tab — TXT/CSV file or remote sheet.'
                  : 'Pick a source from the dropdown in the top-right.'}
              </div>
            </div>
          )}
          {notesOpen && (
            <>
              <div
                className={`notes-splitter-v2 ${notesDragging ? 'is-dragging' : ''}`}
                onMouseDown={startNotesResize}
                role="separator"
                aria-label="Resize notes"
                aria-orientation="vertical"
              />
              <LiveNotesPanel />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
