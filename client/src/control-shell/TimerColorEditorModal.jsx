import { useEffect, useMemo, useState } from 'react';
import { PlusIcon, TrashIcon } from './icons.jsx';

const formatThreshold = (ms, format) => {
  const safe = Math.max(0, Math.round(Number(ms) || 0));
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');

  if (format === 'hh:mm:ss') {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  if (format === 'ss') {
    return String(totalSeconds);
  }
  return `${pad(minutes)}:${pad(seconds)}`;
};

const parseThreshold = (input, format) => {
  if (input === '' || input === null || input === undefined) {
    return null;
  }
  const value = String(input).trim();
  if (!value) {
    return null;
  }

  if (format === 'ss') {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
  }

  const parts = value.split(':').map((part) => part.trim());
  if (parts.some((part) => part === '' || Number.isNaN(Number(part)))) {
    return null;
  }
  const nums = parts.map((part) => Number(part));

  if (format === 'hh:mm:ss') {
    if (nums.length !== 3) return null;
    const [h, m, s] = nums;
    if (m < 0 || m > 59 || s < 0 || s > 59 || h < 0) return null;
    return (h * 3600 + m * 60 + s) * 1000;
  }

  if (nums.length === 1) {
    const seconds = nums[0];
    return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
  }
  if (nums.length !== 2) return null;
  const [m, s] = nums;
  if (m < 0 || s < 0 || s > 59) return null;
  return (m * 60 + s) * 1000;
};

const resolvePreviewColor = (timer, currentMs, defaultColor, triggers) => {
  if (!triggers.length) {
    return defaultColor || '';
  }
  const sorted = [...triggers].sort((a, b) => a.atMs - b.atMs);

  if (timer.mode === 'countup') {
    let chosen = '';
    for (const trigger of sorted) {
      if (currentMs >= trigger.atMs) {
        chosen = trigger.color;
      } else {
        break;
      }
    }
    return chosen || defaultColor || '';
  }

  for (const trigger of sorted) {
    if (currentMs <= trigger.atMs) {
      return trigger.color;
    }
  }
  return defaultColor || '';
};

const newTriggerId = () =>
  (globalThis.crypto?.randomUUID?.() || `tg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

export default function TimerColorEditorModal({ timer, onClose, onSave }) {
  const [defaultColor, setDefaultColor] = useState(timer.defaultColor || '#ffffff');
  const [triggers, setTriggers] = useState(() =>
    (timer.colorTriggers || []).map((trigger) => ({
      id: trigger.id,
      atMs: Number(trigger.atMs) || 0,
      thresholdInput: formatThreshold(trigger.atMs, timer.displayFormat),
      color: trigger.color || '#ffff00',
    })),
  );

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const previewColor = useMemo(
    () =>
      resolvePreviewColor(
        timer,
        timer.currentMs ?? timer.valueMs ?? 0,
        defaultColor,
        triggers.filter((trigger) => trigger.atMs >= 0 && trigger.color),
      ),
    [timer, defaultColor, triggers],
  );

  const addTrigger = () => {
    setTriggers((current) => [
      ...current,
      {
        id: newTriggerId(),
        atMs: 0,
        thresholdInput: formatThreshold(0, timer.displayFormat),
        color: '#ffaa00',
      },
    ]);
  };

  const removeTrigger = (id) => {
    setTriggers((current) => current.filter((trigger) => trigger.id !== id));
  };

  const updateTrigger = (id, patch) => {
    setTriggers((current) =>
      current.map((trigger) => (trigger.id === id ? { ...trigger, ...patch } : trigger)),
    );
  };

  const handleSave = () => {
    const cleaned = triggers
      .map((trigger) => {
        const parsed = parseThreshold(trigger.thresholdInput, timer.displayFormat);
        const atMs = parsed ?? trigger.atMs;
        return {
          id: trigger.id,
          atMs,
          color: trigger.color,
        };
      })
      .filter((trigger) => Number.isFinite(trigger.atMs) && trigger.atMs >= 0 && trigger.color);

    onSave({
      defaultColor: defaultColor || '',
      colorTriggers: cleaned,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--narrow timer-color-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-head-v3">
          <div>
            <span className="kicker-v3">Timer Colors</span>
            <h3>{timer.name}</h3>
          </div>
          <div className="topbar-actions">
            <button className="btn-v3-ghost btn-v3-sm" onClick={onClose}>Cancel</button>
            <button className="btn-v3-primary btn-v3-sm" onClick={handleSave}>Save</button>
          </div>
        </div>

        <div className="timer-color-editor">
          <div className="info-card-v3 timer-color-preview" style={previewColor ? { borderColor: previewColor } : undefined}>
            <span className="info-label-v3">Preview</span>
            <strong className="timer-readout" style={previewColor ? { color: previewColor } : undefined}>
              {timer.display || formatThreshold(timer.currentMs ?? timer.valueMs ?? 0, timer.displayFormat)}
            </strong>
            <span className="note-v3">Format: {timer.displayFormat || 'mm:ss'} · {timer.mode}</span>
          </div>

          <label className="field-v3 field-v3-compact">
            <span>Default color</span>
            <div className="color-row">
              <input
                type="color"
                value={defaultColor || '#ffffff'}
                onChange={(event) => setDefaultColor(event.target.value)}
              />
              <input
                type="text"
                value={defaultColor}
                onChange={(event) => setDefaultColor(event.target.value)}
                placeholder="#ffffff"
              />
              <button
                type="button"
                className="btn-v3-ghost btn-v3-sm"
                onClick={() => setDefaultColor('')}
                title="Clear (use template default)"
              >
                Clear
              </button>
            </div>
          </label>

          <div className="trigger-list-head">
            <span className="info-label-v3">
              Triggers ({timer.mode === 'countup' ? 'fire when value ≥ threshold' : 'fire when value ≤ threshold'})
            </span>
            <button className="btn-v3-ghost btn-v3-sm btn-v3-icon" onClick={addTrigger} title="Add trigger">
              <PlusIcon />
            </button>
          </div>

          <div className="trigger-list">
            {triggers.length === 0 && (
              <div className="note-v3">No triggers — the timer always uses the default color.</div>
            )}
            {triggers.map((trigger) => (
              <div className="trigger-row" key={trigger.id}>
                <input
                  type="text"
                  className="trigger-time-input"
                  value={trigger.thresholdInput}
                  onChange={(event) => updateTrigger(trigger.id, { thresholdInput: event.target.value })}
                  placeholder={timer.displayFormat || 'mm:ss'}
                />
                <input
                  type="color"
                  value={trigger.color || '#ffaa00'}
                  onChange={(event) => updateTrigger(trigger.id, { color: event.target.value })}
                />
                <input
                  type="text"
                  className="trigger-hex-input"
                  value={trigger.color}
                  onChange={(event) => updateTrigger(trigger.id, { color: event.target.value })}
                />
                <button
                  type="button"
                  className="btn-v3-ghost btn-v3-sm btn-v3-icon btn-v3-danger"
                  onClick={() => removeTrigger(trigger.id)}
                  title="Remove trigger"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
