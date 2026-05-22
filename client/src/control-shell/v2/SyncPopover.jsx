import { useEffect, useRef, useState } from 'react';

export default function SyncPopover({ outputs, selectedOutputId, syncedOutputIds, onToggleOutput }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const syncedSet = new Set([...(syncedOutputIds || []), selectedOutputId].filter(Boolean));
  const total = outputs.length;
  const count = outputs.filter((output) => syncedSet.has(output.id)).length;
  const isMulti = count > 1;

  return (
    <div className="sync-wrap-v2" ref={wrapRef}>
      <button
        type="button"
        className={`compact-btn-v2 ${open || isMulti ? 'is-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Sync this source across outputs"
      >
        <span className="chain">{'🔗'}</span>
        <span className="count">{count}<span style={{ color: 'var(--text-faint-v2)' }}>/{total}</span></span>
      </button>
      {open && (
        <div className="sync-popover-v2">
          <div className="label">Sync source across outputs</div>
          {outputs.map((output) => {
            const isCurrent = output.id === selectedOutputId;
            const checked = syncedSet.has(output.id);
            return (
              <label key={output.id} className="chip">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isCurrent}
                  onChange={(event) => onToggleOutput?.(output.id, event.target.checked)}
                />
                <span className="main">{output.name}</span>
                {isCurrent && <span className="hint">current</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
