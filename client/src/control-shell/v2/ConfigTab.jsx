import { useState } from 'react';
import { EditIcon, TrashIcon } from '../icons.jsx';

export default function ConfigTab({
  outputs,
  entries,
  selectedOutputId,
  selectedEntry,
  selectedEntryFieldMap,
  sourceColumnChoices,
  busyAction,
  outputRenderTargets,
  onSelectOutput,
  onSelectEntry,
  onUpdateOutput,
  onDeleteOutput,
  onRemoveEntry,
  onManageEntryAppearance,
  canManageEntryAppearance,
  onSourceColumnMappingChange,
  onCopyRenderUrl,
  onCopyPreviewUrl,
  onOpenAddTitle,
  onOpenAddOutput,
  onOpenTemplateFolders,
  onReorderOutputs,
  onReorderEntries,
}) {
  const renderTargetById = new Map((outputRenderTargets || []).map((target) => [target.id, target]));
  const [draggingOutputId, setDraggingOutputId] = useState(null);
  const [draggingEntryId, setDraggingEntryId] = useState(null);
  const [dropTarget, setDropTarget] = useState({ kind: null, id: null });

  const handleRenameOutput = (output) => {
    const next = window.prompt('Output name', output.name);
    if (next !== null && next.trim()) {
      onUpdateOutput?.(output.id, { name: next.trim() });
    }
  };
  const handleDeleteOutput = (output) => {
    if (outputs.length <= 1) {
      window.alert('At least one output is required.');
      return;
    }
    if (window.confirm(`Delete output «${output.name}»?`)) {
      onDeleteOutput?.(output.id);
    }
  };
  const handleDeleteEntry = (entry) => {
    if (window.confirm(`Delete title «${entry.name}»?`)) {
      onRemoveEntry?.(entry);
    }
  };

  // Generic re-order: build a new id sequence by moving `draggingId` to the
  // position of `targetId`, then hand it to the parent callback.
  const reorderIds = (items, draggingId, targetId) => {
    const ids = items.map((item) => item.id);
    const fromIndex = ids.indexOf(draggingId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;
    const next = [...ids];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, draggingId);
    return next;
  };

  const onOutputDragStart = (output) => (event) => {
    setDraggingOutputId(output.id);
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', `output:${output.id}`); } catch {}
  };
  const onOutputDragOver = (output) => (event) => {
    if (!draggingOutputId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropTarget.kind !== 'output' || dropTarget.id !== output.id) {
      setDropTarget({ kind: 'output', id: output.id });
    }
  };
  const onOutputDrop = (output) => (event) => {
    event.preventDefault();
    if (!draggingOutputId) return;
    const next = reorderIds(outputs, draggingOutputId, output.id);
    if (next) onReorderOutputs?.(next);
    setDraggingOutputId(null);
    setDropTarget({ kind: null, id: null });
  };
  const onOutputDragEnd = () => {
    setDraggingOutputId(null);
    setDropTarget({ kind: null, id: null });
  };

  const onEntryDragStart = (entry) => (event) => {
    setDraggingEntryId(entry.id);
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', `entry:${entry.id}`); } catch {}
  };
  const onEntryDragOver = (entry) => (event) => {
    if (!draggingEntryId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropTarget.kind !== 'entry' || dropTarget.id !== entry.id) {
      setDropTarget({ kind: 'entry', id: entry.id });
    }
  };
  const onEntryDrop = (entry) => (event) => {
    event.preventDefault();
    if (!draggingEntryId) return;
    const next = reorderIds(entries, draggingEntryId, entry.id);
    if (next) onReorderEntries?.(next);
    setDraggingEntryId(null);
    setDropTarget({ kind: null, id: null });
  };
  const onEntryDragEnd = () => {
    setDraggingEntryId(null);
    setDropTarget({ kind: null, id: null });
  };

  return (
    <div className="tab-content-v2 is-active">
      <div className="content-head-v2">
        <div className="breadcrumb">
          <strong>Project setup</strong> — outputs, titles, mapping
        </div>
        <div className="tools">
          <button type="button" className="ghost-v2" onClick={onOpenTemplateFolders} title="Open templates folder">
            Templates folder
          </button>
          <button type="button" className="ghost-v2" onClick={onOpenAddOutput}>+ Add Output</button>
          <button type="button" className="primary-v2" onClick={onOpenAddTitle}>+ Add Title</button>
        </div>
      </div>

      <div className="config-layout-v2">
        <div className="config-card-v2">
          <h3>
            Outputs
            <small>{outputs.length} channel{outputs.length === 1 ? '' : 's'}</small>
          </h3>
          <div className="config-list-v2">
            {outputs.map((output) => {
              const currentEntry = entries.find((entry) => entry.id === output.selectedEntryId);
              const isVmix = currentEntry?.entryType === 'vmix';
              const subline = isVmix
                ? `VMIX · Input #${currentEntry?.vmixInputKey || '?'} · ${currentEntry?.vmixInputTitle || ''}`
                : currentEntry
                  ? `LOCAL · ${currentEntry.templateName || currentEntry.name}`
                  : 'No title assigned';
              const target = renderTargetById.get(output.id);
              const isSelected = output.id === selectedOutputId;
              const isDragging = output.id === draggingOutputId;
              const isDropTarget =
                dropTarget.kind === 'output' && dropTarget.id === output.id && draggingOutputId && draggingOutputId !== output.id;
              return (
                <div
                  key={output.id}
                  className={`config-item-v2 ${isSelected ? 'is-selected has-urls' : ''} ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
                  draggable
                  onDragStart={onOutputDragStart(output)}
                  onDragOver={onOutputDragOver(output)}
                  onDrop={onOutputDrop(output)}
                  onDragEnd={onOutputDragEnd}
                  onDragLeave={() => {
                    if (dropTarget.kind === 'output' && dropTarget.id === output.id) {
                      setDropTarget({ kind: null, id: null });
                    }
                  }}
                >
                  <span className="grip" aria-hidden title="Drag to reorder">⋮⋮</span>
                  <button
                    type="button"
                    className="main"
                    onClick={() => onSelectOutput?.(output.id)}
                    style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', textAlign: 'left' }}
                  >
                    <strong>{output.name}</strong>
                    <span>{subline}</span>
                  </button>
                  <div className="actions">
                    <button type="button" className="cfg-icon-btn-v2" onClick={() => handleRenameOutput(output)} title="Rename" aria-label="Rename output">
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      className="cfg-icon-btn-v2 is-danger"
                      onClick={() => handleDeleteOutput(output)}
                      disabled={outputs.length <= 1}
                      title="Delete output"
                      aria-label="Delete output"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  {isSelected && target && (
                    <div className="config-item-urls">
                      <div className="url-chip">
                        <span className="url-label">Render</span>
                        <code title={target.renderUrl}>{target.renderUrl}</code>
                        <button type="button" onClick={() => onCopyRenderUrl?.(target)} title="Copy render URL">Copy</button>
                      </div>
                      <div className="url-chip">
                        <span className="url-label">Preview</span>
                        <code title={target.previewUrl}>{target.previewUrl}</code>
                        <button type="button" onClick={() => onCopyPreviewUrl?.(target)} title="Copy preview URL">Copy</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {outputs.length === 0 && (
              <div className="hint-card-v2"><strong>No outputs</strong>Add one with the + Add Output button.</div>
            )}
          </div>
        </div>

        <div className="config-card-v2">
          <h3>
            Titles
            <small>{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</small>
          </h3>
          <div className="config-list-v2">
            {entries.map((entry) => {
              const isVmix = entry.entryType === 'vmix';
              const assignedOutputs = outputs
                .filter((output) => output.selectedEntryId === entry.id)
                .map((output) => output.name);
              // Subline is type info only; the output binding is now shown as
              // chips next to the entry name so director can scan a column
              // of titles and see "this one's on OUTPUT 1" in one glance.
              const subline = isVmix
                ? `VMIX · Input #${entry.vmixInputKey || '?'}`
                : `LOCAL · ${entry.templateName || entry.name || 'untitled'}`;
              const isSelected = entry.id === selectedEntry?.id;
              const isDragging = entry.id === draggingEntryId;
              const isDropTarget =
                dropTarget.kind === 'entry' && dropTarget.id === entry.id && draggingEntryId && draggingEntryId !== entry.id;
              return (
                <div
                  key={entry.id}
                  className={`config-item-v2 ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
                  draggable
                  onDragStart={onEntryDragStart(entry)}
                  onDragOver={onEntryDragOver(entry)}
                  onDrop={onEntryDrop(entry)}
                  onDragEnd={onEntryDragEnd}
                  onDragLeave={() => {
                    if (dropTarget.kind === 'entry' && dropTarget.id === entry.id) {
                      setDropTarget({ kind: null, id: null });
                    }
                  }}
                >
                  <span className="grip" title="Drag to reorder">⋮⋮</span>
                  <button
                    type="button"
                    className="main"
                    onClick={() => onSelectEntry?.(entry.id)}
                    style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', textAlign: 'left' }}
                  >
                    <div className="config-entry-title-row">
                      <strong>{entry.name}</strong>
                      {assignedOutputs.length > 0 && (
                        <span className="config-entry-output-chips" aria-label={`Active on ${assignedOutputs.join(', ')}`}>
                          {assignedOutputs.map((name) => (
                            <span key={name} className="config-entry-output-chip" title={`Currently bound to ${name}`}>
                              {name}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    <span>{subline}</span>
                  </button>
                  <div className="actions">
                    {canManageEntryAppearance?.(entry) && (
                      <button type="button" className="cfg-icon-btn-v2" onClick={() => onManageEntryAppearance?.(entry)} title="Edit appearance" aria-label="Edit appearance">
                        <EditIcon />
                      </button>
                    )}
                    <button
                      type="button"
                      className="cfg-icon-btn-v2 is-danger"
                      onClick={() => handleDeleteEntry(entry)}
                      disabled={busyAction === `remove-entry-${entry.id}`}
                      title="Delete title"
                      aria-label="Delete title"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              );
            })}
            {entries.length === 0 && (
              <div className="hint-card-v2"><strong>No titles</strong>Add one with the + Add Title button.</div>
            )}
          </div>
        </div>

        {selectedEntry && (
          <div className="config-card-v2 mapping-card-v2">
            <h3>
              Mapping — {selectedEntry.name}
              <small>data source column → title field</small>
            </h3>
            <div className="config-list-v2">
              {(selectedEntryFieldMap || []).map((field) => {
                const selectedColumnIndex = Number.isInteger(field.sourceColumnIndex) ? field.sourceColumnIndex : -1;
                return (
                  <div key={`map-${field.name}`} className="mapping-row-v2">
                    <div className="from">
                      <strong>{field.label || field.name}</strong>
                      <span>{field.name}</span>
                    </div>
                    <select
                      value={selectedColumnIndex >= 0 ? String(selectedColumnIndex) : ''}
                      onChange={(event) => onSourceColumnMappingChange?.(event.target.value, field.name)}
                    >
                      <option value="">Not used</option>
                      {(sourceColumnChoices || []).map((column) => (
                        <option key={`map-col-${field.name}-${column.index}`} value={column.index}>
                          {column.label || `Column ${column.index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              {(!selectedEntryFieldMap || selectedEntryFieldMap.length === 0) && (
                <div className="hint-card-v2">No fields to map for this title.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
