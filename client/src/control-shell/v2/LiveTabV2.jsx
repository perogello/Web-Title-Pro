import { useRef } from 'react';
import SyncPopover from './SyncPopover.jsx';
import SegmentedTimerInput from './SegmentedTimerInput.jsx';
import { PauseIcon, PlayIcon, ResetIcon } from '../icons.jsx';

const DEFAULT_COL_WIDTH = 200;
const IDX_COL_WIDTH = 50;
const TIMER_COL_WIDTH = 200;

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
          </div>
        </div>

        {selectedSource ? (
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
