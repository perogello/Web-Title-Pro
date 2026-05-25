import { useEffect, useRef, useState } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '../icons.jsx';
import {
  TIMER_MAX_MS,
  TIMER_SEGMENT_STEP_MS,
  changeTimerSegment,
  getTimerSegments,
} from '../lib/timer-utils.js';

/**
 * Inline editable timer that LOOKS like plain text: e.g. `03 : 56`.
 *
 * Interactions per segment:
 *   - Click to edit (the digit pair becomes an inline input).
 *   - Arrow Up / Down or mouse wheel — step by the segment's natural unit.
 *   - Optional `withArrows` renders tiny chevrons above and below each
 *     segment so the value can also be stepped by mouse without focus.
 *   - Enter / Tab / blur commits. Escape cancels.
 */
export default function SegmentedTimerInput({
  value = 0,
  format = 'mm:ss',
  onCommit,
  className = '',
  compact = false,
  size = 'lg',          // 'lg' | 'md' | 'sm'
  withArrows = false,   // show ↑/↓ above and below each segment
}) {
  const [editingKey, setEditingKey] = useState(null);
  const [draftText, setDraftText] = useState('');
  const inputRef = useRef(null);

  const segments = getTimerSegments(value, format) || [];

  useEffect(() => {
    if (editingKey && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingKey]);

  const commitEdit = (segmentKey, nextRaw) => {
    const stepMs = TIMER_SEGMENT_STEP_MS[segmentKey] || 0;
    if (!stepMs) {
      setEditingKey(null);
      setDraftText('');
      return;
    }
    const parsed = Math.max(0, Math.min(99, Number.parseInt(nextRaw, 10) || 0));
    const currentSegments = getTimerSegments(value, format);
    let nextMs = Math.max(0, value);
    const previous = currentSegments.find((s) => s.key === segmentKey);
    if (previous) {
      const prevUnits = Number.parseInt(previous.value, 10) || 0;
      nextMs = nextMs - prevUnits * stepMs + parsed * stepMs;
    } else {
      nextMs = nextMs + parsed * stepMs;
    }
    onCommit?.(Math.max(0, Math.min(TIMER_MAX_MS, nextMs)));
    setEditingKey(null);
    setDraftText('');
  };

  const stepSegment = (segmentKey, delta) => {
    onCommit?.(changeTimerSegment(value, segmentKey, delta));
  };

  return (
    <div
      className={`seg-timer-v3 size-${size} ${compact ? 'is-compact' : ''} ${className}`}
      onWheel={(event) => {
        // Step the segment under the cursor (or the last-focused one).
        const segKey = event.target?.dataset?.segKey || editingKey;
        if (!segKey) return;
        event.preventDefault();
        stepSegment(segKey, event.deltaY < 0 ? 1 : -1);
      }}
    >
      {segments.map((segment, idx) => (
        <span className="seg-timer-v3-group" key={segment.key}>
          {idx > 0 && <span className="seg-timer-v3-sep">:</span>}
          {withArrows ? (
            <span className="seg-timer-v3-stack">
              <button
                type="button"
                className="seg-timer-v3-arrow"
                onClick={(e) => { e.stopPropagation(); stepSegment(segment.key, 1); }}
                aria-label={`Increase ${segment.key}`}
                tabIndex={-1}
              >
                <ChevronUpIcon />
              </button>
              {editingKey === segment.key ? (
                <input
                  ref={inputRef}
                  className="seg-timer-v3-input"
                  data-seg-key={segment.key}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                  onBlur={() => commitEdit(segment.key, draftText)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commitEdit(segment.key, draftText); }
                    else if (e.key === 'Escape') { setEditingKey(null); setDraftText(''); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); stepSegment(segment.key, 1); }
                    else if (e.key === 'ArrowDown') { e.preventDefault(); stepSegment(segment.key, -1); }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  maxLength={2}
                />
              ) : (
                <button
                  type="button"
                  className="seg-timer-v3-val"
                  data-seg-key={segment.key}
                  onClick={(e) => { e.stopPropagation(); setEditingKey(segment.key); setDraftText(segment.value); }}
                  title="Click to edit · ↑↓ or mouse wheel to step"
                >
                  {segment.value}
                </button>
              )}
              <button
                type="button"
                className="seg-timer-v3-arrow"
                onClick={(e) => { e.stopPropagation(); stepSegment(segment.key, -1); }}
                aria-label={`Decrease ${segment.key}`}
                tabIndex={-1}
              >
                <ChevronDownIcon />
              </button>
            </span>
          ) : editingKey === segment.key ? (
            <input
              ref={inputRef}
              className="seg-timer-v3-input"
              data-seg-key={segment.key}
              inputMode="numeric"
              pattern="[0-9]*"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
              onBlur={() => commitEdit(segment.key, draftText)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  commitEdit(segment.key, draftText);
                } else if (e.key === 'Escape') {
                  setEditingKey(null);
                  setDraftText('');
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  stepSegment(segment.key, 1);
                  setDraftText(String(Math.min(99, (Number(draftText) || 0) + 1)).padStart(2, '0'));
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  stepSegment(segment.key, -1);
                  setDraftText(String(Math.max(0, (Number(draftText) || 0) - 1)).padStart(2, '0'));
                }
              }}
              onClick={(e) => e.stopPropagation()}
              maxLength={2}
            />
          ) : (
            <button
              type="button"
              className="seg-timer-v3-val"
              data-seg-key={segment.key}
              onClick={(e) => {
                e.stopPropagation();
                setEditingKey(segment.key);
                setDraftText(segment.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  stepSegment(segment.key, 1);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  stepSegment(segment.key, -1);
                }
              }}
              title="Click to edit · ↑↓ or mouse wheel to step"
            >
              {segment.value}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
