import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, PaletteIcon, PauseIcon, PlayIcon, ResetIcon, TrashIcon } from '../icons.jsx';
import TimerColorEditorModal from '../TimerColorEditorModal.jsx';
import SegmentedTimerInput from '../v2/SegmentedTimerInput.jsx';
import DebouncedTextInput from '../v2/DebouncedTextInput.jsx';
import { getLinkedTimerStatus } from '../lib/timer-utils.js';

export default function TimersTab({
  timers,
  reminderEnabled,
  reminderDelaySec,
  localTimerTemplateMap,
  localTimerTemplates,
  vmixState,
  vmixHostDraft,
  onSetReminderEnabled,
  onSetReminderDelaySec,
  onCreateTimer,
  onUpdateTimer,
  onShiftTimerFormat,
  onRunTimerPanelCommand,
  onDeleteTimer,
  onSetVmixHostDraft,
  onConnectVmix,
  onRefreshVmixState,
}) {
  const [colorEditorTimerId, setColorEditorTimerId] = useState(null);
  const colorEditorTimer = timers.find((timer) => timer.id === colorEditorTimerId) || null;

  return (
    <>
      <section className="timer-card">
        <div className="panel-head-v3">
          <div>
            <span className="kicker-v3">Timer Outputs</span>
            <h3>{timers.length} timer{timers.length === 1 ? '' : 's'} with explicit output target</h3>
          </div>
          <button className="btn-v3-ghost" onClick={onCreateTimer}>Add Timer</button>
        </div>
        <div className="timer-reminder-card">
          <label className="toggle-pill-v3">
            <input type="checkbox" checked={reminderEnabled} onChange={(event) => onSetReminderEnabled(event.target.checked)} />
            <span>Напомнить о запуске таймера после выбора титра</span>
          </label>
          <label className="field-v3 field-v3-compact reminder-delay-input">
            <span>Через секунд</span>
            <input type="number" min="1" step="1" value={reminderDelaySec} onChange={(event) => onSetReminderDelaySec(Number(event.target.value) || 1)} />
          </label>
        </div>
        <div className="timer-grid">
          {timers.map((timer) => (
            <div className="timer-panel" key={timer.id}>
              <div className="timer-source-head">
                <strong>{timer.name}</strong>
                <div className="seg-control-v3" role="tablist" aria-label={`Timer output mode ${timer.name}`}>
                  <button
                    type="button"
                    className={`seg-button-v3 ${timer.sourceType !== 'vmix' ? 'is-active' : ''}`}
                    onClick={() => onUpdateTimer(timer.id, { sourceType: 'local' })}
                  >
                    Local
                  </button>
                  <button
                    type="button"
                    className={`seg-button-v3 ${timer.sourceType === 'vmix' ? 'is-active' : ''}`}
                    onClick={() => onUpdateTimer(timer.id, { sourceType: 'vmix' })}
                  >
                    vMix
                  </button>
                </div>
              </div>
              <label className="field-v3 field-v3-compact">
                <span>Name</span>
                <DebouncedTextInput
                  value={timer.name || ''}
                  onCommit={(next) => onUpdateTimer(timer.id, { name: next })}
                />
              </label>
              {/* Big editable readout — click any digit to type, ↑↓/wheel to step.
                  When timer is idle we edit duration directly; while running the
                  readout switches to the live ticking value (currentMs from the
                  server, pushed over WS every 100ms) and becomes read-only, since
                  editing the duration mid-countdown wouldn't affect the running
                  value anyway. */}
              <SegmentedTimerInput
                value={
                  timer.running
                    ? Number(timer.currentMs ?? timer.valueMs ?? 0)
                    : Number(timer.durationMs || 0)
                }
                format={timer.displayFormat || 'mm:ss'}
                onCommit={(nextMs) => onUpdateTimer(timer.id, { durationMs: nextMs })}
                size="lg"
                className="timer-readout-edit"
                readOnly={timer.running}
                withArrows={!timer.running}
                color={timer.running ? (timer.color || '') : ''}
              />
              <div className="timer-meta-row">
                <div className="timer-meta-block">
                  <span className="info-label-v3">Mode</span>
                  <select defaultValue={timer.mode} onChange={(event) => onUpdateTimer(timer.id, { mode: event.target.value })}>
                    <option value="countdown">Down</option>
                    <option value="countup">Up</option>
                  </select>
                </div>
                <div className="timer-meta-block">
                  <span className="info-label-v3">Format</span>
                  <div className="timer-format-switch">
                    <button className="btn-v3-ghost btn-v3-sm btn-v3-icon" onClick={() => onShiftTimerFormat(timer, 'left')}><ChevronLeftIcon /></button>
                    <strong>{timer.displayFormat || 'mm:ss'}</strong>
                    <button className="btn-v3-ghost btn-v3-sm btn-v3-icon" onClick={() => onShiftTimerFormat(timer, 'right')}><ChevronRightIcon /></button>
                  </div>
                </div>
              </div>
              {timer.sourceType !== 'vmix' ? (
                <>
                  <label className="field-v3 field-v3-compact">
                    <span>Local title template</span>
                    <select
                      value={timer.targetTemplateId || ''}
                      onChange={(event) => {
                        const nextTemplate = localTimerTemplateMap.get(event.target.value);
                        onUpdateTimer(timer.id, {
                          sourceType: 'local',
                          targetTemplateId: event.target.value || null,
                          targetTimerId: nextTemplate?.timers?.[0]?.id || null,
                        });
                      }}
                    >
                      <option value="">Select local title</option>
                      {localTimerTemplates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-v3 field-v3-compact">
                    <span>Timer field in template</span>
                    <select
                      value={timer.targetTimerId || ''}
                      onChange={(event) => onUpdateTimer(timer.id, { targetTimerId: event.target.value || null })}
                      disabled={!timer.targetTemplateId}
                    >
                      <option value="">Select timer field</option>
                      {(localTimerTemplateMap.get(timer.targetTemplateId)?.timers || []).map((slot) => (
                        <option key={slot.id} value={slot.id}>{slot.label}</option>
                      ))}
                    </select>
                  </label>
                  {!localTimerTemplates.length && <div className="note-v3">No local templates with `data-timer` were found yet, so there is nothing to bind a local timer output to.</div>}
                  {timer.targetTemplateId && timer.targetTimerId && (
                    <div className="note-v3">This timer will appear when `{localTimerTemplateMap.get(timer.targetTemplateId)?.name}` is on air with the `{timer.targetTimerId}` timer field.</div>
                  )}
                </>
              ) : (
                <>
                  <label className="field-v3 field-v3-compact">
                    <span>vMix text input target</span>
                    <select
                      value={timer.vmixInputKey || ''}
                      onChange={(event) => {
                        const nextInput = (vmixState?.inputs || []).find((input) => (input.key || input.number) === event.target.value);
                        onUpdateTimer(timer.id, {
                          sourceType: 'vmix',
                          vmixInputKey: event.target.value || null,
                          vmixTextField: nextInput?.textFields?.[0]?.name || 'Text',
                        });
                      }}
                    >
                      <option value="">Select vMix input</option>
                      {(vmixState?.inputs || []).map((input) => (
                        <option key={input.key || input.number} value={input.key || input.number}>
                          {input.number}. {input.title || input.shortTitle || input.key}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-v3 field-v3-compact">
                    <span>vMix text field name</span>
                    <select
                      value={timer.vmixTextField || ((vmixState?.inputs || []).find((input) => (input.key || input.number) === timer.vmixInputKey)?.textFields?.[0]?.name || 'Text')}
                      onChange={(event) => onUpdateTimer(timer.id, { vmixTextField: event.target.value || 'Text' })}
                    >
                      {(((vmixState?.inputs || []).find((input) => (input.key || input.number) === timer.vmixInputKey)?.textFields) || [{ name: 'Text', index: '0' }]).map((field) => (
                        <option key={`${field.index}-${field.name}`} value={field.name}>{field.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <div className="timer-command-row">
                <button
                  className={`timer-state-btn-v2 is-${getLinkedTimerStatus(timer)}`}
                  onClick={() => onRunTimerPanelCommand(timer, timer.running ? 'stop' : 'start')}
                  aria-label={timer.running ? 'Pause timer' : 'Start timer'}
                  title={timer.running ? 'Pause timer' : 'Start timer'}
                >
                  {timer.running ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button
                  className="timer-state-btn-v2 is-reset"
                  onClick={() => onRunTimerPanelCommand(timer, 'reset')}
                  aria-label="Reset timer"
                  title="Reset timer"
                >
                  <ResetIcon />
                </button>
                <button
                  className="timer-state-btn-v2 is-palette"
                  onClick={() => setColorEditorTimerId(timer.id)}
                  aria-label="Edit timer colors"
                  title="Default color and color triggers"
                  style={timer.color ? { color: timer.color } : undefined}
                >
                  <PaletteIcon />
                </button>
                <button
                  className="timer-state-btn-v2 is-danger"
                  onClick={() => onDeleteTimer(timer.id)}
                  aria-label="Delete timer"
                  title="Delete timer"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {!vmixState?.connected && timers.some((t) => t.sourceType === 'vmix') && (
        <div className="timer-vmix-hint">
          One or more timers target vMix inputs, but vMix is not connected.
          <a href="#" onClick={(e) => { e.preventDefault(); onRefreshVmixState?.(); }}>
            Try reconnect
          </a>
          {' '}or configure host in <strong>Settings → Integrations → vMix</strong>.
        </div>
      )}

      {colorEditorTimer && (
        <TimerColorEditorModal
          timer={colorEditorTimer}
          onClose={() => setColorEditorTimerId(null)}
          onSave={(patch) => {
            onUpdateTimer(colorEditorTimer.id, patch);
            setColorEditorTimerId(null);
          }}
        />
      )}
    </>
  );
}
