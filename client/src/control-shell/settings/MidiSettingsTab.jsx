export default function MidiSettingsTab({
  midiState,
  onRefreshMidiState,
  onStartMidiLearn,
  onStopMidiLearn,
  onClearMidiBinding,
}) {
  const bindingLabels = [
    { id: 'show', label: 'SHOW' },
    { id: 'live', label: 'LIVE' },
    { id: 'hide', label: 'HIDE' },
    { id: 'previous-title', label: 'PREVIOUS TITLE' },
    { id: 'next-title', label: 'NEXT TITLE' },
  ];

  const getBindingValue = (action) => {
    const binding = (midiState?.bindings || []).find((item) => item.action === action);
    if (!binding) {
      return 'Not assigned';
    }
    const deviceLabel = binding.device === 'any' ? 'Any device' : binding.device;
    const triggerLabel = `${binding.type}${binding.note !== undefined ? ` note ${binding.note}` : ''}${binding.controller !== undefined ? ` cc ${binding.controller}` : ''}`;
    return `${deviceLabel} / ${triggerLabel}`;
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
      {midiState?.learningAction && (
        <div className="meta-card">
          <span className="meta-label">Learning</span>
          <strong>{`Waiting for ${String(midiState.learningAction).toUpperCase()} trigger`}</strong>
          <span className="output-note">
            {midiState?.lastMessage
              ? `Last signal: ${midiState.lastMessage.device} / ${midiState.lastMessage.type}${midiState.lastMessage.note !== undefined ? ` note ${midiState.lastMessage.note}` : ''}${midiState.lastMessage.controller !== undefined ? ` cc ${midiState.lastMessage.controller}` : ''}`
              : 'Press the desired button on your MIDI device now.'}
          </span>
          <div className="output-url-actions">
            <button className="ghost-button compact-button" onClick={onStopMidiLearn}>Cancel Learn</button>
          </div>
        </div>
      )}
      <div className="shortcut-entry-card">
        <div className="card-head">
          <div>
            <h3>Bindings</h3>
          </div>
        </div>
        <div className="shortcut-action-grid">
          {bindingLabels.map((binding) => {
            const value = getBindingValue(binding.id);
            const hasBinding = value !== 'Not assigned';

            return (
              <div className="shortcut-action-row" key={binding.id}>
                <strong>{binding.label}</strong>
                <code>{value}</code>
                <div className="topbar-actions">
                  <button className="ghost-button compact-button" onClick={() => onStartMidiLearn(binding.id)}>
                    Learn
                  </button>
                  <button className="ghost-button compact-button" onClick={() => onClearMidiBinding(binding.id)} disabled={!hasBinding}>
                    Clear
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
