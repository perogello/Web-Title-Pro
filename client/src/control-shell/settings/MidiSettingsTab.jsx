export default function MidiSettingsTab({
  midiState,
  outputs = [],
  entries = [],
  timers = [],
  onRefreshMidiState,
  onStartMidiLearn,
  onStopMidiLearn,
  onClearMidiBinding,
}) {
  const programBindings = [
    { id: 'show', label: 'TITLE IN' },
    { id: 'live', label: 'LIVE' },
    { id: 'hide', label: 'TITLE OUT' },
    { id: 'previous-title', label: 'PREVIOUS TITLE' },
    { id: 'next-title', label: 'NEXT TITLE' },
  ];
  const outputBindings = outputs.map((output) => ({
    id: `select-output:${output.id}`,
    label: output.name,
  }));
  const entryBindings = entries.map((entry) => ({
    id: `entry-select:${entry.id}`,
    label: entry.name || entry.templateName || entry.id,
  }));
  const timerBindings = timers.flatMap((timer) => [
    { id: `timer-toggle:${timer.id}`, label: `${timer.name || timer.id} — Start / Stop` },
    { id: `timer-reset:${timer.id}`, label: `${timer.name || timer.id} — Reset` },
  ]);

  const getBindingValue = (action) => {
    const binding = (midiState?.bindings || []).find((item) => item.action === action);
    if (!binding) {
      return '';
    }
    const deviceLabel = binding.device === 'any' ? 'Any device' : binding.device;
    const triggerLabel = `${binding.type}${binding.note !== undefined ? ` note ${binding.note}` : ''}${binding.controller !== undefined ? ` cc ${binding.controller}` : ''}`;
    return `${deviceLabel} / ${triggerLabel}`;
  };

  const formatLastMessage = () => {
    const m = midiState?.lastMessage;
    if (!m) return 'Press the desired button on your MIDI device…';
    return `Last: ${m.device || 'any'} / ${m.type}${m.note !== undefined ? ` note ${m.note}` : ''}${m.controller !== undefined ? ` cc ${m.controller}` : ''}`;
  };

  const renderRow = ({ key, label, action }) => {
    const value = getBindingValue(action);
    const isLearning = midiState?.learningAction === action;
    return (
      <div className={`shortcut-action-row ${isLearning ? 'is-learning' : ''}`} key={key}>
        <strong>{label}</strong>
        {isLearning ? (
          <code className="shortcut-learning-cell">{formatLastMessage()}</code>
        ) : (
          <code>{value || 'Not assigned'}</code>
        )}
        <div className="topbar-actions">
          {isLearning ? (
            <button className="ghost-button compact-button is-cancel-learn" onClick={onStopMidiLearn}>
              Cancel
            </button>
          ) : (
            <>
              <button className="ghost-button compact-button" onClick={() => onStartMidiLearn(action)}>
                Learn
              </button>
              <button
                className="ghost-button compact-button"
                onClick={() => onClearMidiBinding(action)}
                disabled={!value}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="integration-grid">
      <div className="card-head integration-head">
        <div>
          <span className="panel-kicker">MIDI</span>
          <h3>{midiState?.enabled ? 'MIDI listener active' : 'MIDI listener unavailable'}</h3>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button compact-button" onClick={onRefreshMidiState}>Refresh Devices</button>
          <span className={`connection-pill ${midiState?.enabled ? 'is-connected' : 'is-disconnected'}`}>{midiState?.enabled ? 'MIDI ON' : 'MIDI OFF'}</span>
        </div>
      </div>
      <div className="meta-card">
        <span className="meta-label">Devices</span>
        <strong>{midiState?.inputs?.length || 0} input device(s)</strong>
        <span className="output-note">{midiState?.error || 'The service listens for MIDI inputs automatically when the app starts.'}</span>
      </div>

      <div className="shortcut-entry-card">
        <div className="card-head">
          <div>
            <h3>Commands</h3>
          </div>
        </div>
        <div className="shortcut-action-grid">
          {programBindings.map((b) => renderRow({ key: b.id, label: b.label, action: b.id }))}
        </div>
      </div>

      <div className="shortcut-entry-card">
        <div className="card-head">
          <div>
            <h3>Outputs</h3>
          </div>
        </div>
        <div className="shortcut-action-grid">
          {outputBindings.map((b) => renderRow({ key: b.id, label: b.label, action: b.id }))}
          {!outputBindings.length && <div className="empty-state">No outputs available.</div>}
        </div>
      </div>

      {entryBindings.length > 0 && (
        <div className="shortcut-entry-card">
          <div className="card-head">
            <div>
              <h3>Title entries</h3>
            </div>
          </div>
          <div className="shortcut-action-grid">
            {entryBindings.map((b) => renderRow({ key: b.id, label: b.label, action: b.id }))}
          </div>
        </div>
      )}

      {timerBindings.length > 0 && (
        <div className="shortcut-entry-card">
          <div className="card-head">
            <div>
              <h3>Timers</h3>
            </div>
          </div>
          <div className="shortcut-action-grid">
            {timerBindings.map((b) => renderRow({ key: b.id, label: b.label, action: b.id }))}
          </div>
        </div>
      )}

      <div className="midi-device-list">
        {(midiState?.inputs || []).map((input) => (
          <div className="source-list-item" key={input.name}>
            <strong>{input.name}</strong>
            <span>MIDI Input</span>
          </div>
        ))}
        {!midiState?.inputs?.length && <div className="empty-state">No MIDI devices detected.</div>}
      </div>
    </div>
  );
}
