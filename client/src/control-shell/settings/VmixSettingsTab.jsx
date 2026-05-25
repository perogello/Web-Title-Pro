export default function VmixSettingsTab({
  vmixState,
  vmixHostDraft,
  onSetVmixHostDraft,
  onConnectVmix,
  onRefreshVmixState,
}) {
  const connected = !!vmixState?.connected;
  const inputsCount = vmixState?.inputs?.length || 0;
  const error = vmixState?.error;
  const currentHost = vmixState?.config?.host || '';

  const handleSubmit = (event) => {
    event.preventDefault();
    onConnectVmix?.(vmixHostDraft);
  };

  return (
    <section className="vmix-settings-card">
      <div className="vmix-settings-head">
        <div>
          <span className="kicker-v3">Integration</span>
          <h3>vMix Connection</h3>
        </div>
        <div className="vmix-settings-status">
          <span className={`vmix-status-dot ${connected ? 'is-on' : 'is-off'}`} />
          <span className={`vmix-status-label ${connected ? 'is-on' : 'is-off'}`}>
            {connected ? 'Connected' : 'Offline'}
          </span>
        </div>
      </div>

      <form className="vmix-settings-body" onSubmit={handleSubmit}>
        <label className="field-v3">
          <span>vMix Host (HTTP API)</span>
          <input
            type="url"
            value={vmixHostDraft || ''}
            onChange={(event) => onSetVmixHostDraft?.(event.target.value)}
            placeholder="http://127.0.0.1:8088"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="vmix-settings-actions">
          <button type="submit" className="btn-v3-primary btn-v3-sm">
            {connected ? 'Reconnect' : 'Connect'}
          </button>
          <button type="button" className="btn-v3-ghost btn-v3-sm" onClick={onRefreshVmixState}>
            Refresh
          </button>
        </div>
      </form>

      <div className="vmix-settings-readout">
        <div className="vmix-readout-row">
          <span className="vmix-readout-label">Discovered inputs</span>
          <strong className="vmix-readout-value">{inputsCount}</strong>
        </div>
        <div className="vmix-readout-row">
          <span className="vmix-readout-label">Active host</span>
          <code className="vmix-readout-host">{currentHost || 'not configured'}</code>
        </div>
        {error && (
          <div className="vmix-readout-error">{error}</div>
        )}
        {!error && !connected && (
          <p className="note-v3">
            Enter the IP and port of your vMix machine (default 8088 on the host running vMix).
            Make sure “Web Controller” / TCP API is enabled inside vMix Settings → Web Controller.
          </p>
        )}
      </div>
    </section>
  );
}
