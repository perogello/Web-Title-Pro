import { EditIcon, EyeIcon, EyeOffIcon, FolderIcon, GripIcon, StopwatchIcon, TrashIcon } from './icons.jsx';

export default function TitlesPanel({
  visibleEntries,
  selectedEntry,
  program,
  templateMap,
  manageRundown,
  showHiddenEntries,
  draggedRundownEntryId,
  busyAction,
  onToggleManage,
  onToggleShowHidden,
  onSelectEntry,
  onDragStartEntry,
  onDropEntry,
  onDragEndEntry,
  onToggleEntryHidden,
  onRemoveEntry,
  canOpenEntryFolder,
  onOpenEntryFolder,
  canManageEntryAppearance,
  onManageEntryAppearance,
  getRundownPrimaryLabel,
  getRundownSecondaryLabel,
}) {
  return (
    <section className="card rundown-card">
      <div className="card-head">
        <div>
          <span className="panel-kicker">Titles</span>
          <h3>{visibleEntries.length} entries</h3>
        </div>
        <div className="topbar-actions">
          <button className={`ghost-button compact-button ${manageRundown ? 'is-active-manage' : ''}`} onClick={onToggleManage}>
            Manage
          </button>
          <button className={`ghost-button compact-button ${showHiddenEntries ? 'is-active-manage' : ''}`} onClick={onToggleShowHidden}>
            Show Hidden
          </button>
        </div>
      </div>
      <div className="rundown-list">
        {visibleEntries.map((entry) => {
          const isSelected = entry.id === selectedEntry?.id;
          const isProgram = entry.id === program.entryId;
          const entryHasTimer =
            Boolean(entry.hasTimer) ||
            (entry.entryType !== 'vmix' && Array.isArray(templateMap.get(entry.templateId)?.timers) && templateMap.get(entry.templateId).timers.length > 0);

          return (
            <div
              key={entry.id}
              className={`rundown-item ${isSelected ? 'is-selected' : ''} ${isProgram ? 'is-program' : ''} ${entry.hidden ? 'is-hidden-entry' : ''} ${manageRundown ? 'is-manage' : ''} ${draggedRundownEntryId === entry.id ? 'is-dragging' : ''}`}
              onClick={() => onSelectEntry(entry.id)}
              draggable={manageRundown}
              onDragStart={(event) => {
                if (!manageRundown) {
                  return;
                }
                event.dataTransfer.effectAllowed = 'move';
                onDragStartEntry(entry.id);
              }}
              onDragOver={(event) => {
                if (!manageRundown || !draggedRundownEntryId || draggedRundownEntryId === entry.id) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                if (!manageRundown) {
                  return;
                }
                event.preventDefault();
                onDropEntry(entry.id);
              }}
              onDragEnd={onDragEndEntry}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectEntry(entry.id);
                }
              }}
              role="button"
              tabIndex={0}
              aria-disabled={busyAction === `select-${entry.id}`}
            >
              {manageRundown && (
                <div className="rundown-manage-handle" aria-hidden="true">
                  <GripIcon />
                </div>
              )}
              <div className="rundown-main">
                <div className="rundown-title-row">
                  <strong>{getRundownPrimaryLabel(entry)}</strong>
                  <span className={`entry-type-badge ${entry.entryType === 'vmix' ? 'is-vmix' : 'is-local'}`}>
                    {entry.entryType === 'vmix' ? 'VMIX' : 'LOCAL'}
                  </span>
                  {entryHasTimer && (
                    <span className="entry-feature-badge" title="This title has a timer slot">
                      <StopwatchIcon />
                    </span>
                  )}
                </div>
                {getRundownSecondaryLabel(entry) ? <span className="rundown-secondary-label">{getRundownSecondaryLabel(entry)}</span> : null}
              </div>
              <div className="rundown-flags">
                {isSelected && <span className="flag flag-selected">SELECTED</span>}
                {isProgram && <span className={`flag ${program.visible ? 'flag-live' : 'flag-standby'}`}>{program.visible ? 'LIVE' : 'READY'}</span>}
              </div>
              {manageRundown && (
                <div className="rundown-manage-actions" onClick={(event) => event.stopPropagation()}>
                  <button
                    className="ghost-button compact-button icon-button"
                    onClick={() => onToggleEntryHidden(entry, !entry.hidden)}
                    disabled={busyAction === `${entry.hidden ? 'show' : 'hide'}-entry-${entry.id}`}
                    aria-label={entry.hidden ? 'Restore title' : 'Hide title'}
                  >
                    {entry.hidden ? <EyeIcon /> : <EyeOffIcon />}
                  </button>
                  {canOpenEntryFolder?.(entry) && (
                    <button
                      className="ghost-button compact-button icon-button"
                      onClick={() => onOpenEntryFolder(entry)}
                      aria-label="Open title folder"
                    >
                      <FolderIcon />
                    </button>
                  )}
                  {canManageEntryAppearance?.(entry) && (
                    <button
                      className="ghost-button compact-button icon-button"
                      onClick={() => onManageEntryAppearance(entry)}
                      aria-label="Edit title appearance"
                    >
                      <EditIcon />
                    </button>
                  )}
                  <button
                    className="ghost-button compact-button icon-button danger-button"
                    onClick={() => onRemoveEntry(entry)}
                    disabled={busyAction === `remove-entry-${entry.id}`}
                    aria-label="Remove title"
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
