export default function MappingTab({
  selectedEntry,
  selectedSource,
  selectedTemplate,
  selectedVmixInput,
  sourceColumnChoices,
  selectedEntryFields,
  effectiveSelectedEntryFieldMap,
  showVmixFieldBinding,
  selectedVmixTextFields,
  onSourceColumnMappingChange,
  onVmixFieldBindingChange,
}) {
  return (
    <section className="card source-table-card standalone-tab">
      <div className="integration-grid">
        {!selectedEntry ? (
          <div className="empty-state">Select a title first, then configure its mapping here.</div>
        ) : !selectedSource ? (
          <div className="empty-state">Select a source table first, then map its columns to the title.</div>
        ) : (
          <>
            <div className="mapping-card is-flat">
              <div className="card-head">
                <div>
                  <span className="panel-kicker">Source To Title</span>
                  <h3>
                    {selectedEntry.entryType === 'vmix'
                      ? (selectedVmixInput?.title || selectedEntry?.vmixInputTitle || 'vMix Title')
                      : (selectedTemplate?.name || selectedEntry?.templateName || 'Local Title')}
                  </h3>
                </div>
              </div>
              <div className="mapping-list">
                {sourceColumnChoices.map((column) => {
                  const mappedField = effectiveSelectedEntryFieldMap.find((field) => field.sourceColumnIndex === column.index) || null;

                  return (
                    <div className="mapping-row" key={`source-column-map-${column.index}`}>
                      <div className="mapping-source">
                        <strong>{column.label}</strong>
                        <span>{`Column ${column.index + 1}`}</span>
                      </div>
                      <label className="input-block compact mapping-target">
                        <select
                          value={mappedField?.name || ''}
                          onChange={(event) => onSourceColumnMappingChange(column.index, event.target.value)}
                        >
                          <option value="">Not used</option>
                          {selectedEntryFields.map((field) => (
                            <option key={`target-${column.index}-${field.name}`} value={field.name}>
                              {field.label || field.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
            {selectedEntry.entryType === 'vmix' && showVmixFieldBinding && (
              <div className="mapping-card">
                <div className="card-head">
                  <div>
                    <span className="panel-kicker">vMix Fields</span>
                    <h3>{selectedVmixInput?.title || selectedEntry?.vmixInputTitle || 'vMix Title'}</h3>
                  </div>
                </div>
                <div className="mapping-list">
                  {effectiveSelectedEntryFieldMap.map((field) => (
                    <div className="mapping-row" key={`vmix-field-map-${field.name}`}>
                      <div className="mapping-source">
                        <strong>{field.label || field.name}</strong>
                        <span>{field.name}</span>
                      </div>
                      <label className="input-block compact mapping-target">
                        <select
                          value={field.vmixFieldName || selectedVmixTextFields[0]?.name || 'Text'}
                          onChange={(event) => onVmixFieldBindingChange(field.name, event.target.value)}
                        >
                          {selectedVmixTextFields.map((vmixField) => (
                            <option key={`${field.name}-${vmixField.index}-${vmixField.name}-bind`} value={vmixField.name}>
                              {vmixField.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
