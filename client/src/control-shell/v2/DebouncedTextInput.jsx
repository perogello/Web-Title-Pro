import { useEffect, useRef, useState } from 'react';

/**
 * Text input that keeps a local draft and commits upstream on a debounce.
 * Used wherever onBlur-only commit loses edits if the user immediately
 * clicks an unrelated button (Save Project, switch tab, etc.).
 *
 * Behaviour:
 *   • onChange   → updates local draft immediately (UI feels native)
 *   • debounce   → fires `onCommit(value)` `debounceMs` after last keystroke
 *   • onBlur     → flushes any pending debounce right away
 *   • Enter key  → flushes + blurs
 *   • Escape     → resets local draft to incoming `value`
 *   • value prop changes from outside → refresh draft ONLY if not focused
 *     (so live updates don't fight an in-progress edit)
 *   • unmount    → flushes pending commit so navigating away preserves work
 */
export default function DebouncedTextInput({
  value = '',
  onCommit,
  debounceMs = 400,
  className,
  placeholder,
  ...rest
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const pendingValueRef = useRef(value);

  // Mirror external value into draft when we're NOT actively typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(value);
      pendingValueRef.current = value;
    }
  }, [value]);

  // Flush pending commit on unmount so a tab switch doesn't lose edits.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (pendingValueRef.current !== value) {
          onCommit?.(pendingValueRef.current);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = (next) => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    if (next !== value) {
      onCommit?.(next);
    }
  };

  const scheduleCommit = (next) => {
    pendingValueRef.current = next;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(next), debounceMs);
  };

  return (
    <input
      ref={inputRef}
      className={className}
      placeholder={placeholder}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        scheduleCommit(next);
      }}
      onBlur={() => flush(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          flush(draft);
          inputRef.current?.blur();
        } else if (event.key === 'Escape') {
          setDraft(value);
          pendingValueRef.current = value;
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }}
      {...rest}
    />
  );
}
