import { ChevronDownIcon, ChevronUpIcon, PauseIcon, PlayIcon, ResetIcon } from '../icons.jsx';

export default function LiveTab({
  selectedSource,
  selectedSourceId,
  sourceLibrary,
  selectedLinkedTimerId,
  timers,
  showSourceSyncMenu,
  outputs,
  selectedOutput,
  selectedSyncGroupId,
  syncedOutputIds,
  selectedSourceDisplayColumns,
  activeSourceBinding,
  activeTimerBinding,
  linkedSourceTimer,
  normalizeLinkedTimerId,
  getSourceRowTimerState,
  getTimerSegments,
  onSelectSource,
  onSetSelectedSourceLinkedTimer,
  onToggleShowSourceSyncMenu,
  onToggleSourceSyncOutput,
  onApplySourceRow,
  onControlSourceRowTimer,
  onAdjustSourceRowTimerSegment,
}) {
  return (
    <section className="card live-source-card">
      <div className="card-head">
        <div>
          <span className="panel-kicker">Live Data Source</span>
          <h3>{selectedSource?.name || 'No source selected'}</h3>
        </div>
        <div className="topbar-actions">
          <label className="input-block compact live-source-selector">
            <span>Source</span>
            <select value={selectedSourceId} onChange={(event) => onSelectSource(event.target.value)}>
              {sourceLibrary.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
          </label>
          <label className="input-block compact live-source-selector">
            <span>Timer</span>
            <select value={selectedLinkedTimerId || ''} onChange={(event) => onSetSelectedSourceLinkedTimer(event.target.value)}>
              <option value="">No timer link</option>
              {timers.map((timer) => (
                <option key={timer.id} value={normalizeLinkedTimerId(timer.id) || ''}>{timer.name}</option>
              ))}
            </select>
          </label>
          <div className="live-source-selector sync-menu-control">
            <span className="sync-menu-label">Sync</span>
            <button className="ghost-button compact-button sync-menu-button" onClick={onToggleShowSourceSyncMenu}>
              <span className={`preview-toggle-icon ${showSourceSyncMenu ? 'is-open' : ''}`}><ChevronDownIcon /></span>
            </button>
          </div>
        </div>
      </div>
      <div className="live-source-toolbar">
        <span className="output-note">
          {linkedSourceTimer
            ? `Linked timer: ${linkedSourceTimer.name}`
            : 'Choose a timer for this data source if you want time and display format to stay in sync.'}
        </span>
      </div>
      {showSourceSyncMenu && (
        <div className="sync-output-strip">
          {outputs.map((output) => (
            <button
              key={output.id}
              className={`output-chip sync-chip ${output.syncGroupId === selectedSyncGroupId ? 'is-active' : ''}`}
              onClick={() => onToggleSourceSyncOutput(output.id)}
              disabled={output.id === selectedOutput?.id && syncedOutputIds.length <= 1}
            >
              <strong>{output.name}</strong>
              <span>
                {output.id === selectedOutput?.id
                  ? 'CURRENT'
                  : output.syncGroupId === selectedSyncGroupId
                    ? 'SYNC ON'
                    : 'SYNC OFF'}
              </span>
            </button>
          ))}
        </div>
      )}
      {selectedSource ? (
        <div className="source-table-wrapper live-source-wrapper">
          <table className="source-table live-source-table">
            <thead>
              <tr>
                <th>#</th>
                {selectedSourceDisplayColumns.map((column) => (
                  <th key={column.id}>
                    <div className="source-column-head" title={column.binding ? `${column.label} -> ${column.binding}` : column.label}>
                      <span>{column.label}</span>
                      {column.binding && <small>{column.binding}</small>}
                    </div>
                  </th>
                ))}
                {selectedLinkedTimerId && <th>Timer</th>}
              </tr>
            </thead>
            <tbody>
              {selectedSource.rows.map((row) => {
                const isActiveRow =
                  activeSourceBinding?.sourceId === selectedSource.id && activeSourceBinding?.rowId === row.id;
                const isTimerRow =
                  activeTimerBinding?.sourceId === selectedSource.id &&
                  activeTimerBinding?.rowId === row.id &&
                  normalizeLinkedTimerId(activeTimerBinding?.timerId) === selectedLinkedTimerId;
                const timerState = getSourceRowTimerState(selectedSource.id, row, linkedSourceTimer, isTimerRow);
                const displayedTimerMs = Number(timerState.currentMs ?? (row.timer?.baseMs || 0));
                const timerFormat = linkedSourceTimer?.displayFormat || row.timer?.format || 'mm:ss';
                const timerSegments = getTimerSegments(displayedTimerMs, timerFormat);

                return (
                  <tr
                    key={row.id}
                    className={isActiveRow ? 'is-active-source-row' : ''}
                    onClick={() => onApplySourceRow(row)}
                  >
                    <td>{row.index}</td>
                    {selectedSourceDisplayColumns.map((column, index) => (
                      <td key={column.id}>
                        <span className="source-table-value">{row.values[index] || ''}</span>
                      </td>
                    ))}
                    {selectedLinkedTimerId && <td>
                      <div className="row-timer-cell" onClick={(event) => event.stopPropagation()}>
                        <div className="row-timer-actions">
                          <button
                            className={`ghost-button compact-button icon-button timer-state-button is-${timerState.status}`}
                            onClick={() => onControlSourceRowTimer(selectedSource.id, row, 'toggle', {
                              syncTimerId: selectedLinkedTimerId,
                              linkedTimerId: selectedLinkedTimerId,
                              linkedTimer: linkedSourceTimer || null,
                              isTimerRow,
                            })}
                            title={timerState.status === 'running' ? 'Pause timer' : 'Start timer'}
                          >
                            {timerState.status === 'running' ? <PauseIcon /> : <PlayIcon />}
                          </button>
                          <button
                            className="ghost-button compact-button icon-button"
                            onClick={() => onControlSourceRowTimer(selectedSource.id, row, 'reset', {
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
                        <div className="row-timer-segments">
                          {timerSegments.map((segment, index) => (
                            <div className="row-timer-segment-group" key={`${row.id}-${segment.key}`}>
                              {index > 0 && <span className="row-timer-colon">:</span>}
                              <div className="row-timer-segment">
                                <button
                                  className="row-timer-arrow"
                                  onClick={() => onAdjustSourceRowTimerSegment(selectedSource.id, row, segment.key, 1, {
                                    currentMs: displayedTimerMs,
                                    syncTimerId: selectedLinkedTimerId,
                                    linkedTimerId: selectedLinkedTimerId,
                                    linkedTimer: linkedSourceTimer || null,
                                  })}
                                >
                                  <ChevronUpIcon />
                                </button>
                                <strong>{segment.value}</strong>
                                <button
                                  className="row-timer-arrow"
                                  onClick={() => onAdjustSourceRowTimerSegment(selectedSource.id, row, segment.key, -1, {
                                    currentMs: displayedTimerMs,
                                    syncTimerId: selectedLinkedTimerId,
                                    linkedTimerId: selectedLinkedTimerId,
                                    linkedTimer: linkedSourceTimer || null,
                                  })}
                                >
                                  <ChevronDownIcon />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state source-empty">Choose a source table and click a row to load it into the current output.</div>
      )}
    </section>
  );
}
