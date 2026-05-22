export default function ConfigTab({
  outputs,
  entries,
  selectedOutputId,
  selectedEntry,
  selectedEntryFieldMap,
  sourceColumnChoices,
  busyAction,
  onSelectOutput,
  onSelectEntry,
  onUpdateOutput,
  onDeleteOutput,
  onRemoveEntry,
  onManageEntryAppearance,
  canManageEntryAppearance,
  onSourceColumnMappingChange,
  onOpenAddTitle,
  onOpenAddOutput,
  onOpenTemplateFolders,
}) {
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
              return (
                <div
                  key={output.id}
                  className={`config-item-v2 ${output.id === selectedOutputId ? 'is-selected' : ''}`}
                >
                  <span className="grip" title="Output">⋮⋮</span>
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
                    <button type="button" onClick={() => handleRenameOutput(output)} title="Rename">✎</button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleDeleteOutput(output)}
                      disabled={outputs.length <= 1}
                      title="Delete output"
                    >
                      ×
                    </button>
                  </div>
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
              const subline = isVmix
                ? `VMIX · Input #${entry.vmixInputKey || '?'}${assignedOutputs.length ? ' · → ' + assignedOutputs.join(', ') : ''}`
                : `LOCAL · ${entry.templateName || entry.name || 'untitled'}${assignedOutputs.length ? ' · → ' + assignedOutputs.join(', ') : ''}`;
              const isSelected = entry.id === selectedEntry?.id;
              return (
                <div
                  key={entry.id}
                  className={`config-item-v2 ${isSelected ? 'is-selected' : ''}`}
                >
                  <span className="grip">⋮⋮</span>
                  <button
                    type="button"
                    className="main"
                    onClick={() => onSelectEntry?.(entry.id)}
                    style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', textAlign: 'left' }}
                  >
                    <strong>{entry.name}</strong>
                    <span>{subline}</span>
                  </button>
                  <div className="actions">
                    {canManageEntryAppearance?.(entry) && (
                      <button type="button" onClick={() => onManageEntryAppearance?.(entry)} title="Edit appearance">✎</button>
                    )}
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleDeleteEntry(entry)}
                      disabled={busyAction === `remove-entry-${entry.id}`}
                      title="Delete title"
                    >
                      ×
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
