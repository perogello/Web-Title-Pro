export default function OutputSettingsTab({
  outputInfo,
  outputRenderTargets,
  selectedOutput,
  outputs,
  onSelectOutput,
  onDeleteOutput,
  onUpdateOutput,
  onCopyRenderUrl,
  onCopyPreviewUrl,
  onCopyBaseUrl,
}) {
  if (!outputInfo) {
    return <div className="empty-state">Waiting for backend system info.</div>;
  }

  return (
    <div className="integration-grid">
      <div className="output-settings-card">
        <div className="card-head output-settings-head">
          <div>
            <span className="panel-kicker">Control</span>
            <h3>Control UI URL</h3>
          </div>
        </div>
        <div className="output-url-list">
          <div className="output-url-row">
            <div className="output-url-copy">
              <strong>Browser URL</strong>
              <code>{outputInfo.controlUrl}</code>
            </div>
            <div className="output-url-actions">
              <button className="ghost-button compact-button" onClick={() => onCopyBaseUrl(outputInfo.controlUrl)}>Copy URL</button>
            </div>
          </div>
        </div>
      </div>
      <div className="output-settings-grid">
        {outputRenderTargets.map((output) => (
          <div className="output-settings-card" key={output.id}>
            <div className="card-head output-settings-head">
              <div>
                <span className="panel-kicker">Output</span>
                <h3>{output.name}</h3>
              </div>
              <div className="topbar-actions">
                {output.id === selectedOutput?.id && <span className="flag flag-live">ACTIVE</span>}
                <button className="ghost-button compact-button" onClick={() => onSelectOutput(output.id)}>Open</button>
                <button className="ghost-button compact-button" onClick={() => onDeleteOutput(output.id)} disabled={outputs.length <= 1}>Delete</button>
              </div>
            </div>
            <div className="output-settings-fields">
              <label className="input-block compact">
                <span>Output Name</span>
                <input
                  key={`${output.id}-name-${output.name}`}
                  defaultValue={output.name}
                  onBlur={(event) => onUpdateOutput(output.id, { name: event.target.value })}
                />
              </label>
              <label className="input-block compact">
                <span>URL Key</span>
                <input
                  key={`${output.id}-key-${output.key}`}
                  defaultValue={output.key}
                  onBlur={(event) => onUpdateOutput(output.id, { key: event.target.value })}
                />
              </label>
            </div>
            <div className="output-url-list">
              <div className="output-url-row">
                <div className="output-url-copy">
                  <strong>Render URL</strong>
                  <code>{output.renderUrl}</code>
                </div>
                <div className="output-url-actions">
                  <button className="ghost-button compact-button" onClick={() => onCopyRenderUrl(output)}>Copy Render</button>
                </div>
              </div>
              <div className="output-url-row">
                <div className="output-url-copy">
                  <strong>Preview URL</strong>
                  <code>{output.previewUrl}</code>
                </div>
                <div className="output-url-actions">
                  <button className="ghost-button compact-button" onClick={() => onCopyPreviewUrl(output)}>Copy Preview</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
