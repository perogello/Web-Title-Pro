export default function BitfocusSettingsTab({ bitfocusActions, onCopyUrl, onCopyPayload }) {
  return (
    <div className="integration-grid">
      <div className="meta-card">
        <span className="meta-label">Companion</span>
        <strong>Bitfocus works through the HTTP API</strong>
        <span className="output-note">Use standard HTTP POST requests from Companion to these endpoints. LIVE has a separate alias so it is not confused with update.</span>
      </div>
      {bitfocusActions.map((action) => (
        <div className="output-url-row" key={action.id}>
          <div className="output-url-copy">
            <strong>{action.label}</strong>
            <span className="output-note">Method: POST</span>
            <code>{action.url}</code>
            <code>{JSON.stringify(action.payload)}</code>
          </div>
          <div className="output-url-actions">
            <button className="ghost-button compact-button" onClick={() => onCopyUrl(action)}>Copy URL</button>
            <button className="ghost-button compact-button" onClick={() => onCopyPayload(action)}>Copy Payload</button>
          </div>
        </div>
      ))}
    </div>
  );
}
