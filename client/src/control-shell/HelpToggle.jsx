import { useEffect, useRef, useState } from 'react';

// A small "?" button that reveals explanatory text in a popover, so settings
// cards show controls and status first and the prose only on demand. Closes on
// an outside click or Escape.
export default function HelpToggle({ children, label = 'Пояснение', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="help-toggle-v2" ref={rootRef}>
      <button
        type="button"
        className={`help-toggle-btn-v2 ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        ?
      </button>
      {open && (
        <span className={`help-toggle-pop-v2 is-${align}`} role="note">
          {children}
        </span>
      )}
    </span>
  );
}
