import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon, ResetIcon, TrashIcon } from '../icons.jsx';

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
  return (
    <>
      <section className="card timer-card">
        <div className="card-head">
          <div>
            <span className="panel-kicker">Timer Outputs</span>
            <h3>{timers.length} timer{timers.length === 1 ? '' : 's'} with explicit output target</h3>
          </div>
          <button className="ghost-button" onClick={onCreateTimer}>Add Timer</button>
        </div>
        <div className="timer-reminder-card">
          <label className="toggle">
            <input type="checkbox" checked={reminderEnabled} onChange={(event) => onSetReminderEnabled(event.target.checked)} />
            <span>Напомнить о запуске таймера после выбора титра</span>
          </label>
          <label className="input-block compact reminder-delay-input">
            <span>Через секунд</span>
            <input type="number" min="1" step="1" value={reminderDelaySec} onChange={(event) => onSetReminderDelaySec(Number(event.target.value) || 1)} />
          </label>
        </div>
        <div className="timer-grid">
          {timers.map((timer) => (
            <div className="timer-panel" key={timer.id}>
              <div className="timer-source-head">
                <strong>{timer.name}</strong>
                <div className="mode-toggle" role="tablist" aria-label={`Timer output mode ${timer.name}`}>
                  <button
                    type="button"
                    className={`mode-toggle-button ${timer.sourceType !== 'vmix' ? 'is-active' : ''}`}
                    onClick={() => onUpdateTimer(timer.id, { sourceType: 'local' })}
                  >
                    Local
                  </button>
                  <button
                    type="button"
                    className={`mode-toggle-button ${timer.sourceType === 'vmix' ? 'is-active' : ''}`}
                    onClick={() => onUpdateTimer(timer.id, { sourceType: 'vmix' })}
                  >
                    vMix
                  </button>
                </div>
              </div>
              <label className="input-block compact">
                <span>Name</span>
                <input defaultValue={timer.name} onBlur={(event) => onUpdateTimer(timer.id, { name: event.target.value })} />
              </label>
              <div className="timer-readout">{timer.display}</div>
              <div className="timer-format-row">
                <span className="meta-label">Format</span>
                <div className="timer-format-switch">
                  <button className="ghost-button compact-button icon-button" onClick={() => onShiftTimerFormat(timer, 'left')}><ChevronLeftIcon /></button>
                  <strong>{timer.displayFormat || 'mm:ss'}</strong>
                  <button className="ghost-button compact-button icon-button" onClick={() => onShiftTimerFormat(timer, 'right')}><ChevronRightIcon /></button>
                </div>
              </div>
              <div className="timer-controls">
                <select defaultValue={timer.mode} onChange={(event) => onUpdateTimer(timer.id, { mode: event.target.value })}>
                  <option value="countdown">Down</option>
                  <option value="countup">Up</option>
                </select>
                <input type="number" min="0" step="1" defaultValue={Math.round(timer.durationMs / 1000)} onBlur={(event) => onUpdateTimer(timer.id, { durationMs: Number(event.target.value) * 1000 })} />
              </div>
              {timer.sourceType !== 'vmix' ? (
                <>
                  <label className="input-block compact">
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
                  <label className="input-block compact">
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
                  {!localTimerTemplates.length && <div className="output-note">No local templates with `data-timer` were found yet, so there is nothing to bind a local timer output to.</div>}
                  {timer.targetTemplateId && timer.targetTimerId && (
                    <div className="output-note">This timer will appear when `{localTimerTemplateMap.get(timer.targetTemplateId)?.name}` is on air with the `{timer.targetTimerId}` timer field.</div>
                  )}
                </>
              ) : (
                <>
                  <label className="input-block compact">
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
                  <label className="input-block compact">
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
                  className="ghost-button compact-button icon-button"
                  onClick={() => onRunTimerPanelCommand(timer, timer.running ? 'stop' : 'start')}
                  aria-label={timer.running ? 'Stop timer' : 'Start timer'}
                  title={timer.running ? 'Stop timer' : 'Start timer'}
                >
                  {timer.running ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button
                  className="ghost-button compact-button icon-button"
                  onClick={() => onRunTimerPanelCommand(timer, 'reset')}
                  aria-label="Reset timer"
                  title="Reset timer"
                >
                  <ResetIcon />
                </button>
                <button
                  className="ghost-button compact-button icon-button danger-button"
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

      <section className="card vmix-card">
        <div className="card-head">
          <div>
            <span className="panel-kicker">vMix Connection</span>
            <h3>{vmixState?.connected ? 'Connected to vMix' : 'Disconnected from vMix'}</h3>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button compact-button" onClick={onRefreshVmixState}>Sync Now</button>
            <span className={`connection-pill ${vmixState?.connected ? 'is-connected' : 'is-disconnected'}`}>{vmixState?.connected ? 'vMix Online' : 'vMix Offline'}</span>
          </div>
        </div>
        <div className="vmix-grid">
          <label className="input-block">
            <span>vMix Host</span>
            <input value={vmixHostDraft} onChange={(event) => onSetVmixHostDraft(event.target.value)} placeholder="http://127.0.0.1:8088" />
          </label>
          <div className="timer-command-row">
            <button className="ghost-button" onClick={() => onConnectVmix(vmixHostDraft)}>Connect / Save Host</button>
          </div>
          <div className="vmix-readout">
            <span className="meta-label">Discovered Inputs</span>
            <strong>{vmixState?.inputs?.length || 0} input(s)</strong>
          </div>
          <div className="vmix-readout">
            <span className="meta-label">Status</span>
            <strong>{vmixState?.connected ? 'Connection active' : 'Waiting for connection'}</strong>
            {vmixState?.error ? <span className="output-note">{vmixState.error}</span> : null}
          </div>
        </div>
      </section>
    </>
  );
}
