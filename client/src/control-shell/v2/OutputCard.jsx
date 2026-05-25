import { useEffect, useRef, useState } from 'react';

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4l14 8-14 8z" /></svg>
);
const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" /></svg>
);

const truncate = (value, max = 80) => {
  if (!value) return '';
  const s = String(value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

const formatVmixInputInfo = (entry) => {
  if (entry?.entryType !== 'vmix') return '';
  if (entry.vmixInputNumber) return `Input #${entry.vmixInputNumber}`;
  if (entry.vmixInputTitle || entry.vmixInputKey) return 'Input configured';
  return '';
};

export default function OutputCard({
  output,
  entries,
  isSelected,
  busy,
  onSelect,
  onAssignEntry,
  onPlay,
  onStop,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onClick = (event) => {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [pickerOpen]);

  const program = output?.program || {};
  const visible = Boolean(program.visible);
  const currentEntry = entries.find((entry) => entry.id === output?.selectedEntryId) || null;
  const isVmix = currentEntry?.entryType === 'vmix';

  // What's "currently being output" — prefer the field values, fall back to entry name
  const currentDataParts = [];
  if (currentEntry) {
    const fields = currentEntry.fields || {};
    const fieldList = currentEntry.templateFields || [];
    fieldList.forEach((field) => {
      const value = fields[field.name];
      if (value && String(value).trim()) {
        currentDataParts.push(String(value).trim());
      }
    });
    if (!currentDataParts.length && currentEntry.name) {
      currentDataParts.push(currentEntry.name);
    }
  }
  const currentDataText = currentDataParts.join(' · ');

  // Title file display
  const titleFileLabel = currentEntry
    ? (isVmix
        ? currentEntry.vmixInputTitle || currentEntry.name || 'vMix Title'
        : currentEntry.templateName || currentEntry.name || 'Local Title')
    : '';

  const inputInfo = isVmix ? formatVmixInputInfo(currentEntry) : '';

  const handleSelect = (event) => {
    if (event.target.closest('button')) return;
    onSelect?.(output.id);
  };

  const handlePickerToggle = (event) => {
    event.stopPropagation();
    onSelect?.(output.id);
    setPickerOpen((v) => !v);
  };

  const handleAssign = (entryId) => {
    setPickerOpen(false);
    onAssignEntry?.(output.id, entryId);
  };

  const handlePlay = (event) => {
    event.stopPropagation();
    onSelect?.(output.id);
    onPlay?.(output.id, currentEntry?.id);
  };
  const handleStop = (event) => {
    event.stopPropagation();
    onSelect?.(output.id);
    onStop?.(output.id);
  };

  const stateBadge = visible ? 'ON AIR' : 'OFF';

  return (
    <div
      ref={cardRef}
      className={`output-card-v2 ${isSelected ? 'is-selected' : ''} ${visible ? 'is-live' : ''}`}
      onClick={handleSelect}
    >
      <div className="oc-v2-head">
        <span className="name" title={output.name}>{output.name}</span>
        <span className="state">{stateBadge}</span>
      </div>

      <div className="oc-v2-meta">
        <div className="type-row">
          <span className={`badge-type ${isVmix ? 'is-vmix' : 'is-local'}`}>
            {isVmix ? 'VMIX' : 'LOCAL'}
          </span>
          {inputInfo && <span className="input-info">{inputInfo}</span>}
        </div>

        <div className={`current-data ${currentDataText ? '' : 'is-none'}`} title={currentDataText}>
          {currentDataText || 'no data'}
        </div>

        <button
          type="button"
          className={`title-file ${titleFileLabel ? '' : 'is-empty'}`}
          onClick={handlePickerToggle}
          title={titleFileLabel || 'Pick a title'}
        >
          {titleFileLabel || 'Pick a title'}
        </button>

        {pickerOpen && (
          <div className="title-picker-v2">
            <div className="label">Available titles</div>
            {entries.length === 0 && (
              <div className="label" style={{ color: 'var(--text-faint-v2)' }}>No titles yet — add in Config</div>
            )}
            {entries.map((entry) => {
              const isCurrent = entry.id === output?.selectedEntryId;
              const label = entry.entryType === 'vmix'
                ? (entry.vmixInputTitle || entry.name)
                : (entry.templateName || entry.name);
              const sub = entry.entryType === 'vmix'
                ? `vMix · ${entry.name || 'untitled'}`
                : `LOCAL · ${entry.name || 'untitled'}`;
              return (
                <button
                  key={entry.id}
                  className={isCurrent ? 'is-current' : ''}
                  onClick={() => handleAssign(entry.id)}
                  title={truncate(label, 80)}
                >
                  {truncate(label, 60)}
                  <span className="row-meta">{truncate(sub, 60)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="oc-v2-controls">
        <button
          className="play"
          onClick={handlePlay}
          disabled={!currentEntry || busy}
          title="Title in"
          aria-label="Title in"
        >
          <PlayIcon />
        </button>
        <button
          className="stop"
          onClick={handleStop}
          disabled={busy}
          title="Title out"
          aria-label="Title out"
        >
          <StopIcon />
        </button>
      </div>
    </div>
  );
}
