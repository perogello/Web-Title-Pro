import { useState } from 'react';
import { EditIcon, GripIcon, SaveIcon, TrashIcon } from '../icons.jsx';
import {
  REMOTE_SOURCE_TYPE_OPTIONS,
  REMOTE_SOURCE_TYPES,
  getRemoteSourceHelp,
  getRemoteSourceTypeLabel,
} from '../../remote-sources/index.js';

export default function SourcesTab({
  sourceName,
  sourceFileName,
  sourcePayload,
  remoteSourceName,
  remoteSourceUrl,
  remoteSourceAutoRefresh,
  remoteSourceRefreshIntervalSec,
  remoteSourceBusy,
  sourceLibrary,
  selectedSourceId,
  selectedSource,
  selectedSourceRefreshing,
  yandexConnected,
  yandexConnecting,
  activeSourceBinding,
  editingSourceRows,
  sourceRowDrafts,
  manualRowColumns,
  manualRowValues,
  onSourceNameChange,
  onSourceFilePicked,
  onSourcePayloadChange,
  onImportSourceDataset,
  onRemoteSourceNameChange,
  onRemoteSourceUrlChange,
  onRemoteSourceTypeChange,
  onRemoteSourceAutoRefreshChange,
  onRemoteSourceRefreshIntervalChange,
  onImportRemoteSourceDataset,
  onConnectYandex,
  onSelectSource,
  manageSources,
  draggedSourceId,
  onToggleManageSources,
  onDragStartSource,
  onDropSource,
  onDragEndSource,
  onRenameSource,
  onDeleteSource,
  onDeleteSelectedSource,
  onRefreshSelectedSource,
  onUpdateSelectedSourceRemote,
  onReplaceSelectedSourceFile,
  onUpdateSourceColumnLabel,
  getSourceRowEditKey,
  onApplySourceRow,
  onUpdateSourceRowCell,
  onSaveSourceRowEdit,
  onStartSourceRowEdit,
  onDeleteSourceRow,
  onManualRowValueChange,
  onAddManualSourceRow,
}) {
  const [sourceImportMode, setSourceImportMode] = useState('manual-text');
  const isRemoteMode = REMOTE_SOURCE_TYPES.has(sourceImportMode);
  const isYandexMode = sourceImportMode === 'yandex-disk-public';

  const getImportModeLabel = (mode) => {
    if (mode === 'manual-file') return 'TXT / CSV File';
    if (!REMOTE_SOURCE_TYPES.has(mode)) return 'Text';
    return getRemoteSourceTypeLabel(mode);
  };

  const handleImportModeChange = (nextMode) => {
    setSourceImportMode(nextMode);
    if (REMOTE_SOURCE_TYPES.has(nextMode)) {
      onRemoteSourceTypeChange(nextMode);
    }
  };

  const handleAddSource = () => {
    if (isRemoteMode) {
      onImportRemoteSourceDataset();
      return;
    }

    onImportSourceDataset();
  };

  return (
    <section className="card source-table-card standalone-tab">
      <div className="source-layout">
        <aside className="source-sidebar">
          <div className="source-list">
            <div className="source-list-head">
              <strong>Sources</strong>
              <button className={`ghost-button compact-button ${manageSources ? 'is-active-manage' : ''}`} onClick={onToggleManageSources}>
                Manage
              </button>
            </div>
            {sourceLibrary.map((item) => (
              manageSources ? (
                <div
                  key={item.id}
                  className={`source-list-item source-manage-item ${item.id === selectedSourceId ? 'is-selected' : ''} ${draggedSourceId === item.id ? 'is-dragging' : ''}`}
                  draggable
                  onDragStart={() => onDragStartSource(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onDropSource(item.id)}
                  onDragEnd={onDragEndSource}
                >
                  <span className="source-manage-handle" title="Move source"><GripIcon /></span>
                  <button className="source-manage-main" onClick={() => onSelectSource(item.id)}>
                    <strong>{item.name}</strong>
                    <span>{item.remote?.url ? `Remote - ${item.rows.length} rows` : `${item.rows.length} rows`}</span>
                  </button>
                  <div className="source-manage-actions">
                    <button className="ghost-button compact-button icon-button danger-button" onClick={() => onDeleteSource(item.id)} title="Delete source" aria-label="Delete source">
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ) : (
                <button key={item.id} className={`source-list-item ${item.id === selectedSourceId ? 'is-selected' : ''}`} onClick={() => onSelectSource(item.id)}>
                  <strong>{item.name}</strong>
                  <span>{item.remote?.url ? `Remote - ${item.rows.length} rows` : `${item.rows.length} rows`}</span>
                </button>
              )
            ))}
            {!sourceLibrary.length && <div className="empty-state">Import a TXT/CSV source and it will appear here.</div>}
          </div>

          <div className="source-import-card">
            <div className="source-import-head">
              <strong>Add Source</strong>
              <span className="output-note">Choose how you want to feed data into the current project.</span>
            </div>
            <label className="input-block">
              <span>Input Type</span>
              <select value={sourceImportMode} onChange={(event) => handleImportModeChange(event.target.value)}>
                <option value="manual-text">Text</option>
                <option value="manual-file">TXT / CSV File</option>
                {REMOTE_SOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === 'yandex-disk-public' ? 'Yandex Disk' : option.label}
                  </option>
                ))}
              </select>
            </label>

            {isRemoteMode ? (
              <>
                {isYandexMode && !yandexConnected && (
                  <div className="source-yandex-connect-card">
                    <strong>Yandex authorization required</strong>
                    <span className="output-note">Connect Yandex once, then paste the public file link here.</span>
                    <button className="yandex-auth-button" onClick={onConnectYandex} disabled={yandexConnecting}>
                      <span className="yandex-auth-button__mark">Y</span>
                      <span>{yandexConnecting ? 'Connecting...' : 'Sign in with Yandex ID'}</span>
                    </button>
                  </div>
                )}
                {isYandexMode && yandexConnected && (
                  <div className="source-yandex-connect-card">
                    <strong>Yandex connected</strong>
                    <span className="output-note">Paste the public Yandex Disk file link below and add the source when ready.</span>
                  </div>
                )}
                {(!isYandexMode || yandexConnected) && (
                  <>
                    <label className="input-block">
                      <span>Source Name</span>
                      <input
                        value={remoteSourceName}
                        onChange={(event) => onRemoteSourceNameChange(event.target.value)}
                        placeholder={`${getImportModeLabel(sourceImportMode)} Source`}
                      />
                    </label>
                    <label className="input-block">
                      <span>Remote URL</span>
                      <input value={remoteSourceUrl} onChange={(event) => onRemoteSourceUrlChange(event.target.value)} placeholder="https://..." />
                    </label>
                    <span className="output-note">{getRemoteSourceHelp(sourceImportMode)}</span>
                  </>
                )}
                {(!isYandexMode || yandexConnected) && (
                  <div className="source-remote-row">
                    <label className="toggle-pill">
                      <input type="checkbox" checked={remoteSourceAutoRefresh} onChange={(event) => onRemoteSourceAutoRefreshChange(event.target.checked)} />
                      <span>Auto-refresh</span>
                    </label>
                    <label className="input-block compact-inline-block">
                      <span>Interval, sec</span>
                      <input
                        type="number"
                        min="10"
                        step="5"
                        value={remoteSourceRefreshIntervalSec}
                        onChange={(event) => onRemoteSourceRefreshIntervalChange(event.target.value)}
                      />
                    </label>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="input-block">
                  <span>Source Name</span>
                  <input value={sourceName} onChange={(event) => onSourceNameChange(event.target.value)} placeholder="Guests / Speakers / News List" />
                </label>
                {sourceImportMode === 'manual-file' ? (
                  <>
                    <label className="input-block">
                      <span>TXT / CSV file</span>
                      <input type="file" accept=".txt,.csv" onChange={(event) => onSourceFilePicked(event.target.files?.[0])} />
                    </label>
                    {sourceFileName && <div className="file-chip">File: {sourceFileName}</div>}
                  </>
                ) : (
                  <label className="input-block">
                    <span>Source Rows</span>
                    <textarea
                      value={sourcePayload}
                      onChange={(event) => onSourcePayloadChange(event.target.value)}
                      placeholder="Ivan Petrov|Presenter&#10;Maria Sokolova|Reporter"
                    />
                  </label>
                )}
              </>
            )}

            {remoteSourceBusy && (
              <div className="source-loading-note">Loading source data...</div>
            )}

            {(!isYandexMode || yandexConnected) && (
              <button
                className="primary-button full-width"
                onClick={handleAddSource}
                disabled={remoteSourceBusy}
              >
                {remoteSourceBusy ? 'Loading...' : `Add ${getImportModeLabel(sourceImportMode)} Source`}
              </button>
            )}
          </div>
        </aside>
        <section className="source-table-card inner-source-card">
          <div className="card-head">
            <div>
              <span className="panel-kicker">Current Source</span>
              <h3>{selectedSource?.name || 'No source selected'}</h3>
            </div>
            <div className="topbar-actions source-current-actions">
              {selectedSource?.remote?.url && (
                <button className="ghost-button" onClick={onRefreshSelectedSource} disabled={selectedSourceRefreshing}>
                  {selectedSourceRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              )}
              <button className="ghost-button compact-button icon-button danger-button" onClick={onDeleteSelectedSource} disabled={!selectedSource || selectedSourceRefreshing} title="Delete source" aria-label="Delete source">
                <TrashIcon />
              </button>
            </div>
          </div>
          {selectedSource && (
            <div className="source-remote-settings">
              <div className="source-name-row">
                <label className="input-block">
                  <span>Source Name</span>
                  <input
                    value={selectedSource.name || ''}
                    onChange={(event) => onRenameSource(selectedSource.id, event.target.value)}
                    placeholder="Source name"
                    disabled={selectedSourceRefreshing}
                  />
                </label>
              </div>
            </div>
          )}
          {selectedSource?.remote?.url && (
            <div className="source-remote-settings">
              <label className="input-block">
                <span>Remote Type</span>
                <select
                  value={selectedSource.remote.type || 'csv-url'}
                  onChange={(event) => onUpdateSelectedSourceRemote({ type: event.target.value })}
                  disabled={selectedSourceRefreshing}
                >
                  {REMOTE_SOURCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              {selectedSource.remote.type === 'yandex-disk-public' && (
                <div className="input-block">
                  <span>Access</span>
                  <span className="output-note">This source uses the public Yandex Disk file link mode.</span>
                </div>
              )}
              {selectedSource.remote.sheetNames?.length > 1 && (
                <div className="input-block">
                  <span>Sheet</span>
                  <div className="mode-toggle source-sheet-toggle" role="tablist" aria-label={`Workbook sheets for ${selectedSource.name}`}>
                    {selectedSource.remote.sheetNames.map((sheetName) => (
                      <button
                        key={sheetName}
                        type="button"
                        className={`mode-toggle-button ${(selectedSource.remote.sheetName || selectedSource.remote.sheetNames[0] || '') === sheetName ? 'is-active' : ''}`}
                        onClick={() => onUpdateSelectedSourceRemote({ sheetName })}
                        disabled={selectedSourceRefreshing}
                      >
                        {sheetName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <label className="input-block">
                <span>Remote URL</span>
                <input
                  value={selectedSource.remote.url || ''}
                  onChange={(event) => onUpdateSelectedSourceRemote({ url: event.target.value })}
                  placeholder="https://..."
                  disabled={selectedSourceRefreshing}
                />
              </label>
              <div className="source-remote-row">
                <label className="toggle-pill">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedSource.remote.autoRefresh)}
                    onChange={(event) => onUpdateSelectedSourceRemote({ autoRefresh: event.target.checked })}
                  />
                  <span>Auto-refresh</span>
                </label>
                <label className="input-block compact-inline-block">
                  <span>Interval, sec</span>
                  <input
                    type="number"
                    min="10"
                    step="5"
                    value={selectedSource.remote.refreshIntervalSec || 30}
                    onChange={(event) => onUpdateSelectedSourceRemote({ refreshIntervalSec: event.target.value })}
                  />
                </label>
              </div>
              <div className="source-remote-meta">
                <span className="output-note">
                  {selectedSourceRefreshing
                    ? 'Loading source data...'
                    : `Last sync: ${selectedSource.remote.lastFetchedAt || 'Not yet synced'}`}
                </span>
                {selectedSource.remote.lastError && <span className="danger-note">{selectedSource.remote.lastError}</span>}
              </div>
            </div>
          )}
          {selectedSource && !selectedSource.remote?.url && (
            <div className="source-remote-settings">
              <div className="source-replace-card">
                <label className="input-block">
                  <span>Replace with TXT / CSV file</span>
                  <input type="file" accept=".txt,.csv" onChange={(event) => onReplaceSelectedSourceFile(event.target.files?.[0])} />
                </label>
              </div>
            </div>
          )}
          {selectedSource ? (
            <div className="source-table-wrapper">
              <table className="source-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {selectedSource.columns.map((column) => (
                      <th key={column.id}>
                        <input
                          className="source-column-name-input"
                          value={column.label}
                          onChange={(event) => onUpdateSourceColumnLabel(selectedSource.id, column.id, event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          placeholder="Column name"
                        />
                      </th>
                    ))}
                    <th className="source-column-actions-head" />
                  </tr>
                </thead>
                <tbody>
                  {selectedSource.rows.map((row) => {
                    const rowKey = getSourceRowEditKey(selectedSource.id, row.id);
                    const isEditing = Boolean(editingSourceRows[rowKey]);
                    const rowValues = isEditing ? sourceRowDrafts[rowKey] || row.values : row.values;

                    return (
                      <tr
                        key={row.id}
                        className={activeSourceBinding?.sourceId === selectedSource.id && activeSourceBinding?.rowId === row.id ? 'is-active-source-row' : ''}
                        onClick={() => !isEditing && onApplySourceRow(row)}
                      >
                        <td>{row.index}</td>
                        {selectedSource.columns.map((column, index) => (
                          <td key={column.id}>
                            {isEditing ? (
                              <input
                                className="source-table-input"
                                value={rowValues[index] || ''}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => onUpdateSourceRowCell(selectedSource.id, row.id, index, event.target.value)}
                              />
                            ) : (
                              <span className="source-table-value">{row.values[index] || ''}</span>
                            )}
                          </td>
                        ))}
                        <td>
                          <div className="source-row-actions" onClick={(event) => event.stopPropagation()}>
                            <button
                              className="ghost-button compact-button icon-button"
                              onClick={() => (isEditing ? onSaveSourceRowEdit(selectedSource.id, row.id) : onStartSourceRowEdit(selectedSource.id, row))}
                              title={isEditing ? 'Save row' : 'Edit row'}
                              aria-label={isEditing ? 'Save row' : 'Edit row'}
                            >
                              {isEditing ? <SaveIcon /> : <EditIcon />}
                            </button>
                            <button className="ghost-button compact-button danger-button" onClick={() => onDeleteSourceRow(selectedSource.id, row.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state source-empty">Load a source on the left, then use a row here to feed the current title.</div>
          )}
          <div className="manual-row-card">
            <div className="card-head">
              <div>
                <h3>Add Row</h3>
              </div>
              <span className="output-note">The fields below come from the selected title. If the title has 4 variables, this form will show 4 fields too.</span>
            </div>
            <div className="manual-row-grid">
              {manualRowColumns.map((column, index) => (
                <label className="input-block" key={column.id}>
                  <span>{column.label}</span>
                  <input
                    value={manualRowValues[index] || ''}
                    onChange={(event) => onManualRowValueChange(index, event.target.value)}
                    placeholder={`Value ${index + 1}`}
                  />
                </label>
              ))}
              {!manualRowColumns.length && <div className="empty-state">Select a title or a source first so the row fields can be generated.</div>}
            </div>
            <div className="manual-row-actions">
              <button className="primary-button" onClick={onAddManualSourceRow}>+ Add Row</button>
              <span className="output-note">{selectedSource ? 'The row will be added into the selected source table.' : 'If no table exists yet, a new Manual Source will be created.'}</span>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
