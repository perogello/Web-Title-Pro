import { ChevronDownIcon, ZoomIcon } from './icons.jsx';

export default function PreviewTitlePanel({
  showPreviewPanel,
  selectedEntry,
  selectedVmixInput,
  autoUpdate,
  draftName,
  draftFields,
  selectedEntryFields,
  selectedOutput,
  snapshot,
  program,
  embeddedPreviewUrl,
  embeddedRenderUrl,
  feedback,
  error,
  vmixTitleActions,
  normalizeVmixTitleAction,
  onToggleShowPreviewPanel,
  onRunPreviewAction,
  onSetAutoUpdate,
  onUpdateSelectedVmixEntry,
  onDraftNameChange,
  onDraftFieldChange,
  onSetExpandedRender,
}) {
  return (
    <div className="outputs-preview-shell">
      <button
        className="preview-toggle-button"
        aria-label={showPreviewPanel ? 'Скрыть preview title' : 'Открыть preview title'}
        onClick={onToggleShowPreviewPanel}
      >
        <span className={`preview-toggle-icon ${showPreviewPanel ? 'is-open' : ''}`}><ChevronDownIcon /></span>
      </button>
      {showPreviewPanel && (
        <div className="preview-title-card">
          <div className="preview-title-actions">
            <button className="ghost-button compact-button" onClick={() => onRunPreviewAction('show', selectedEntry?.id)} disabled={!selectedEntry || selectedEntry?.entryType === 'vmix'}>
              Preview Show
            </button>
            <button className="ghost-button compact-button" onClick={() => onRunPreviewAction('hide')} disabled={selectedEntry?.entryType === 'vmix'}>
              Preview Hide
            </button>
          </div>
          <div className="preview-title-grid">
            <section className="active-panel preview-input-panel">
              <div className="panel-title-row">
                <div>
                  <span className="panel-kicker">Active Input</span>
                  <h2>{selectedEntry?.name || 'No title selected'}</h2>
                </div>
                <div className="topbar-actions">
                  <label className="toggle">
                    <input type="checkbox" checked={autoUpdate} onChange={(event) => onSetAutoUpdate(event.target.checked)} />
                    <span>{selectedEntry?.entryType === 'vmix' ? 'Auto-send fields' : 'Live update'}</span>
                  </label>
                </div>
              </div>
              {selectedEntry?.entryType === 'vmix' && (
                <div className="vmix-external-card">
                  <div className="meta-card">
                    <strong className="vmix-input-title">
                      {selectedVmixInput?.number ? `${selectedVmixInput.number}. ` : ''}
                      {selectedVmixInput?.title || selectedEntry?.vmixInputTitle || 'vMix Title Input'}
                    </strong>
                  </div>
                  <div className="vmix-entry-grid">
                    <label className="input-block compact">
                      <span>SHOW Action</span>
                      <select
                        value={normalizeVmixTitleAction(selectedEntry?.vmixShowAction, 'TransitionIn')}
                        onChange={(event) => onUpdateSelectedVmixEntry({ vmixShowAction: event.target.value })}
                      >
                        {vmixTitleActions.map((action) => (
                          <option key={`show-${action.value}`} value={action.value}>{action.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="input-block compact">
                      <span>HIDE Action</span>
                      <select
                        value={normalizeVmixTitleAction(selectedEntry?.vmixHideAction, 'TransitionOut')}
                        onChange={(event) => onUpdateSelectedVmixEntry({ vmixHideAction: event.target.value })}
                      >
                        {vmixTitleActions.map((action) => (
                          <option key={`hide-${action.value}`} value={action.value}>{action.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}
              {selectedEntry && selectedEntry.entryType !== 'vmix' && (
                <div className="output-note">
                  Remove only takes this title out of rundown. Template files stay in the templates folder and can be added again later.
                </div>
              )}
              {selectedEntry ? (
                <div className={`preview-editor-fields ${selectedEntry?.entryType === 'vmix' ? 'is-vmix' : 'is-local'}`}>
                  <label className="input-block compact entry-name-field">
                    {selectedEntry?.entryType !== 'vmix' ? <span>Entry Name</span> : null}
                    <input
                      value={draftName}
                      placeholder={selectedEntry?.entryType === 'vmix' ? 'Rundown name' : ''}
                      onChange={(event) => onDraftNameChange(event.target.value)}
                    />
                  </label>
                  {selectedEntryFields.map((field) => (
                    selectedEntry?.entryType === 'vmix' ? (
                      <label className="input-block compact" key={field.name}>
                        <input
                          value={draftFields[field.name] ?? ''}
                          placeholder={field.label || field.placeholder || field.defaultValue || ''}
                          onChange={(event) => onDraftFieldChange(field.name, event.target.value)}
                        />
                      </label>
                    ) : (
                      <label className="input-block compact" key={field.name}>
                        <span>{field.label}</span>
                        <input
                          value={draftFields[field.name] ?? ''}
                          placeholder={field.placeholder || field.defaultValue || ''}
                          onChange={(event) => onDraftFieldChange(field.name, event.target.value)}
                        />
                      </label>
                    )
                  ))}
                </div>
              ) : (
                <div className="empty-state">Выберите титр в rundown, затем редактируйте поля и отправляйте его в preview или live.</div>
              )}
            </section>
            <section className="preview-render-pane">
              <div className="preview-dual-grid">
                <div className="preview-block">
                  <div className="preview-block-head">
                    <span className={`preview-state ${(snapshot?.previewProgram?.visible) ? 'is-on' : 'is-off'}`}>{snapshot?.previewProgram?.visible ? 'PREVIEW ON' : 'PREVIEW OFF'}</span>
                    <strong>{snapshot?.previewProgram?.entryName || 'No preview title'}</strong>
                    <button className="ghost-button compact-button icon-button preview-zoom-button" onClick={() => onSetExpandedRender('preview')} title="Увеличить preview" aria-label="Увеличить preview">
                      <ZoomIcon />
                    </button>
                  </div>
                  <div className="preview-monitor">
                    {selectedEntry?.entryType === 'vmix' ? (
                      <div className="preview-frame preview-frame-placeholder">
                        <div className="preview-placeholder-copy">
                          <strong>External vMix Preview</strong>
                          <span>GT title graphics are rendered only inside vMix.</span>
                        </div>
                      </div>
                    ) : (
                      <iframe key={`preview-${selectedOutput?.id || 'default'}`} className="preview-frame" title="Preview Renderer" src={embeddedPreviewUrl} />
                    )}
                  </div>
                </div>
                <div className="preview-block">
                  <div className="preview-block-head">
                    <span className={`preview-state ${program.visible ? 'is-on' : 'is-off'}`}>{program.visible ? 'LIVE ON' : 'LIVE OFF'}</span>
                    <strong>{program.entryName}</strong>
                    <button className="ghost-button compact-button icon-button preview-zoom-button" onClick={() => onSetExpandedRender('live')} title="Увеличить live" aria-label="Увеличить live">
                      <ZoomIcon />
                    </button>
                  </div>
                  <div className="preview-monitor">
                    {selectedEntry?.entryType === 'vmix' ? (
                      <div className="preview-frame preview-frame-placeholder">
                        <div className="preview-placeholder-copy">
                          <strong>External vMix Live</strong>
                          <span>SHOW and HIDE control the configured vMix title actions.</span>
                        </div>
                      </div>
                    ) : (
                      <iframe key={`live-${selectedOutput?.id || 'default'}`} className="preview-frame" title="Live Renderer" src={embeddedRenderUrl} />
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
          <div className="feedback-row preview-feedback-row"><span>{feedback || error || 'Ready for live operation'}</span></div>
        </div>
      )}
    </div>
  );
}
