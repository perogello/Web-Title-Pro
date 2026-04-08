export default function MidiSettingsTab({
  midiState,
  onRefreshMidiState,
  onStartMidiLearn,
  onStopMidiLearn,
}) {
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
      <div className="meta-card">
        <span className="meta-label">Learn</span>
        <strong>{midiState?.learningAction ? `Waiting for ${String(midiState.learningAction).toUpperCase()} trigger` : 'Ready to learn a binding'}</strong>
        <span className="output-note">
          {midiState?.lastMessage
            ? `Last signal: ${midiState.lastMessage.device} / ${midiState.lastMessage.type}${midiState.lastMessage.note !== undefined ? ` note ${midiState.lastMessage.note}` : ''}${midiState.lastMessage.controller !== undefined ? ` cc ${midiState.lastMessage.controller}` : ''}`
            : 'Press Learn, then the desired button on your MIDI device.'}
        </span>
        <div className="output-url-actions">
          <button className="ghost-button compact-button" onClick={() => onStartMidiLearn('show')}>Learn SHOW</button>
          <button className="ghost-button compact-button" onClick={() => onStartMidiLearn('live')}>Learn LIVE</button>
          <button className="ghost-button compact-button" onClick={() => onStartMidiLearn('hide')}>Learn HIDE</button>
          <button className="ghost-button compact-button" onClick={() => onStartMidiLearn('previous-title')}>Learn PREV</button>
          <button className="ghost-button compact-button" onClick={() => onStartMidiLearn('next-title')}>Learn NEXT</button>
          <button className="ghost-button compact-button" onClick={onStopMidiLearn} disabled={!midiState?.learningAction}>Cancel Learn</button>
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
      <div className="midi-binding-list">
        {(midiState?.bindings || []).map((binding, index) => (
          <div className="output-url-row" key={`${binding.device}-${binding.note}-${index}`}>
            <div className="output-url-copy">
              <strong>{String(binding.action || '').toUpperCase()}</strong>
              <span className="output-note">{binding.device === 'any' ? 'Any device' : binding.device}</span>
              <code>{binding.type}{binding.note !== undefined ? ` note ${binding.note}` : ''}{binding.controller !== undefined ? ` cc ${binding.controller}` : ''}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
