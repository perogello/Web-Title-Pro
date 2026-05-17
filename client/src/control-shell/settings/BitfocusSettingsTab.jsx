export default function BitfocusSettingsTab({ bitfocusActions, onCopyUrl, onCopyPayload }) {
  const grouped = bitfocusActions.reduce((acc, action) => {
    const section = action.section || 'Commands';
    if (!acc[section]) acc[section] = [];
    acc[section].push(action);
    return acc;
  }, {});
  const sectionOrder = ['Commands', 'Outputs', 'Title entries', 'Timers'];
  const orderedSections = [
    ...sectionOrder.filter((name) => grouped[name]?.length),
    ...Object.keys(grouped).filter((name) => !sectionOrder.includes(name)),
  ];

  return (
    <div className="integration-grid">
      <div className="meta-card">
        <span className="meta-label">Companion</span>
        <strong>Bitfocus works through the HTTP API</strong>
        <span className="output-note">
          Use standard HTTP POST requests from Companion to these endpoints. Same action set as Shortcuts and MIDI tabs — every command, output, title entry, and timer here has a matching keyboard / MIDI binding. Full reference and Russian guide in docs/BITFOCUS.md and docs/BITFOCUS_RU.md.
        </span>
      </div>

      {orderedSections.map((sectionName) => (
        <div className="shortcut-entry-card" key={sectionName}>
          <div className="card-head">
            <div>
              <h3>{sectionName}</h3>
            </div>
          </div>
          <div className="bitfocus-action-list">
            {grouped[sectionName].map((action) => (
              <div className="output-url-row" key={action.id}>
                <div className="output-url-copy">
                  <strong>{action.label}</strong>
                  <span className="output-note">Method: POST</span>
                  <code>{action.url}</code>
                  {action.payload && Object.values(action.payload).some((v) => v !== undefined) && (
                    <code>{JSON.stringify(action.payload)}</code>
                  )}
                </div>
                <div className="output-url-actions">
                  <button className="ghost-button compact-button" onClick={() => onCopyUrl(action)}>Copy URL</button>
                  <button className="ghost-button compact-button" onClick={() => onCopyPayload(action)}>Copy Payload</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
