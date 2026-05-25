import { useEffect, useRef, useState } from 'react';
import DebouncedTextInput from '../v2/DebouncedTextInput.jsx';

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
    return <div className="empty-v3">Waiting for backend system info.</div>;
  }

  const [copiedKey, setCopiedKey] = useState('');
  const copiedTimeoutRef = useRef(null);

  useEffect(() => () => {
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }
  }, []);

  const flashCopied = (key) => {
    setCopiedKey(key);
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }
    copiedTimeoutRef.current = setTimeout(() => {
      setCopiedKey('');
      copiedTimeoutRef.current = null;
    }, 1800);
  };

  const handleCopy = (key, callback) => {
    callback();
    flashCopied(key);
  };

  return (
    <div className="integration-grid">
      <div className="output-settings-grid">
        {outputRenderTargets.map((output) => (
          <div className="output-settings-card" key={output.id}>
            <div className="panel-head-v3 output-settings-head">
              <div>
                <h3>{output.name}</h3>
              </div>
              <div className="topbar-actions">
                {output.id === selectedOutput?.id && <span className="flag flag-live">ACTIVE</span>}
                <button className="btn-v3-ghost btn-v3-sm" onClick={() => onSelectOutput(output.id)}>Open</button>
                <button className="btn-v3-ghost btn-v3-sm" onClick={() => onDeleteOutput(output.id)} disabled={outputs.length <= 1}>Delete</button>
              </div>
            </div>
            <div className="output-settings-fields">
              <label className="field-v3 field-v3-compact">
                <span>Output Name</span>
                <DebouncedTextInput
                  value={output.name || ''}
                  onCommit={(next) => onUpdateOutput(output.id, { name: next })}
                />
              </label>
              <label className="field-v3 field-v3-compact">
                <span>URL Key</span>
                <DebouncedTextInput
                  value={output.key || ''}
                  onCommit={(next) => onUpdateOutput(output.id, { key: next })}
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
                  <button className="btn-v3-ghost btn-v3-sm" onClick={() => handleCopy(`render-${output.id}`, () => onCopyRenderUrl(output))}>
                    {copiedKey === `render-${output.id}` ? 'URL Copied' : 'Copy Render'}
                  </button>
                </div>
              </div>
              <div className="output-url-row">
                <div className="output-url-copy">
                  <strong>Preview URL</strong>
                  <code>{output.previewUrl}</code>
                </div>
                <div className="output-url-actions">
                  <button className="btn-v3-ghost btn-v3-sm" onClick={() => handleCopy(`preview-${output.id}`, () => onCopyPreviewUrl(output))}>
                    {copiedKey === `preview-${output.id}` ? 'URL Copied' : 'Copy Preview'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
