import { useState } from 'react';

function entryIsVmix(output, entries) {
  const entry = entries.find((e) => e.id === output?.selectedEntryId);
  return entry?.entryType === 'vmix';
}

function PreviewFrame({ title, state, name, url, isVmix }) {
  return (
    <div className="preview-frame-v2">
      <div className="pf-head">
        <span className={`pf-state ${state === 'on' ? 'on' : 'off'}`}>{title}</span>
        <span className="pf-name" title={name}>{name}</span>
      </div>
      <div className="pf-body">
        {isVmix ? (
          <div className="placeholder">External vMix — preview not embedded</div>
        ) : url ? (
          <iframe src={url} title={`${title} ${name}`} />
        ) : (
          <div className="placeholder">No URL</div>
        )}
      </div>
    </div>
  );
}

export default function PreviewOverlay({
  isOpen,
  onClose,
  outputs,
  entries,
  selectedOutputId,
  outputRenderTargets,
}) {
  const [mode, setMode] = useState('selected');
  const selectedOutput = outputs.find((output) => output.id === selectedOutputId) || outputs[0] || null;
  const targetById = new Map((outputRenderTargets || []).map((target) => [target.id, target]));
  const renderUrlFor = (output) => targetById.get(output?.id)?.renderUrl || '';
  const previewUrlFor = (output) => targetById.get(output?.id)?.previewUrl || '';

  return (
    <div className={`preview-overlay-v2 ${isOpen ? 'is-open' : ''}`}>
      <div className="preview-overlay-v2-head">
        <div className="title-block">
          <span className="kicker">Preview</span>
          <div className="seg-control-v3">
            <button
              className={mode === 'selected' ? 'is-active' : ''}
              onClick={() => setMode('selected')}
            >
              Selected output
            </button>
            <button
              className={mode === 'all' ? 'is-active' : ''}
              onClick={() => setMode('all')}
            >
              All outputs
            </button>
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>Close ✕</button>
      </div>

      {mode === 'selected' && selectedOutput && (
        <div className="preview-grid-v2">
          <PreviewFrame
            title="Preview"
            state="off"
            name={selectedOutput.name}
            url={previewUrlFor(selectedOutput)}
            isVmix={entryIsVmix(selectedOutput, entries)}
          />
          <PreviewFrame
            title="Live"
            state={selectedOutput?.program?.visible ? 'on' : 'off'}
            name={`${selectedOutput.name} · ${selectedOutput?.program?.visible ? 'ON AIR' : 'OFF'}`}
            url={renderUrlFor(selectedOutput)}
            isVmix={entryIsVmix(selectedOutput, entries)}
          />
        </div>
      )}

      {mode === 'all' && (
        <div className="preview-grid-v2 is-multiview">
          {outputs.map((output) => (
            <PreviewFrame
              key={output.id}
              title={output?.program?.visible ? 'ON AIR' : 'OFF'}
              state={output?.program?.visible ? 'on' : 'off'}
              name={output.name}
              url={renderUrlFor(output)}
              isVmix={entryIsVmix(output, entries)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
