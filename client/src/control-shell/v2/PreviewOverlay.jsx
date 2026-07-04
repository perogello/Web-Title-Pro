import { useState } from 'react';

const OVERLAY_HEIGHT_KEY = 'wtp-preview-overlay-height';
const DEFAULT_OVERLAY_HEIGHT = 360;
const clampOverlayHeight = (value) =>
  Math.min(720, Math.max(220, Math.round(Number(value) || 0)));

function entryIsVmix(output, entries) {
  const entry = entries.find((e) => e.id === output?.selectedEntryId);
  return entry?.entryType === 'vmix';
}

const PopOutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

function PreviewFrame({ title, state, name, url, isVmix, onPopOut, style }) {
  return (
    <div className="preview-frame-v2" style={style}>
      <div className="pf-head">
        <span className={`pf-state ${state === 'on' ? 'on' : 'off'}`}>{title}</span>
        <span className="pf-name" title={name}>{name}</span>
        {onPopOut && (
          <button
            type="button"
            className="pf-popout"
            onClick={onPopOut}
            title="Open in separate window"
            aria-label={`Open ${title} ${name} in separate window`}
          >
            <PopOutIcon />
          </button>
        )}
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
  canPreviewShow,
  onPreviewShow,
  onPreviewHide,
  onOpenWindow,
}) {
  const [mode, setMode] = useState('selected');
  // Panel height is operator-resizable (drag the bottom edge) and persisted,
  // so the preview can be pulled large enough to actually proofread a title.
  const [overlayHeight, setOverlayHeight] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(OVERLAY_HEIGHT_KEY));
      return stored ? clampOverlayHeight(stored) : DEFAULT_OVERLAY_HEIGHT;
    } catch {
      return DEFAULT_OVERLAY_HEIGHT;
    }
  });
  const [resizing, setResizing] = useState(false);

  const beginResize = (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = overlayHeight;
    setResizing(true);
    const onMove = (moveEvent) => {
      setOverlayHeight(clampOverlayHeight(startHeight + (moveEvent.clientY - startY)));
    };
    const onUp = (upEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setResizing(false);
      const finalHeight = clampOverlayHeight(startHeight + (upEvent.clientY - startY));
      try {
        localStorage.setItem(OVERLAY_HEIGHT_KEY, String(finalHeight));
      } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const selectedOutput = outputs.find((output) => output.id === selectedOutputId) || outputs[0] || null;
  const targetById = new Map((outputRenderTargets || []).map((target) => [target.id, target]));
  // In-app frames always use the embed variants: the 1920x1080 stage scales
  // to fit the frame, so the whole title is visible. Raw render URLs stay
  // reserved for vMix/OBS browser sources.
  const liveEmbedUrlFor = (output) => targetById.get(output?.id)?.liveEmbedUrl || '';
  const previewEmbedUrlFor = (output) => targetById.get(output?.id)?.previewEmbedUrl || '';
  const previewVisible = Boolean(selectedOutput?.previewProgram?.visible);
  // Selected mode shows two cards side by side. Width is the smaller of half
  // the row and the width the panel height allows, so a card is always a true
  // 16:9 box — no letterboxing, no stretching (67 = grid head + paddings).
  const selectedFrameStyle = {
    width: `min(calc(50% - 6px), ${Math.round(((overlayHeight - 67) * 16) / 9)}px)`,
  };

  return (
    <div
      className={`preview-overlay-v2 ${isOpen ? 'is-open' : ''} ${resizing ? 'is-resizing' : ''}`}
      style={{ height: isOpen ? overlayHeight : 0 }}
    >
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
          <div className="pvw-cmd-group" role="group" aria-label="Preview bus commands">
            <button
              type="button"
              className="pvw-cmd is-in"
              onClick={onPreviewShow}
              disabled={!canPreviewShow}
              title="Show the selected title on the preview bus (not on air)"
            >
              PVW IN
            </button>
            <button
              type="button"
              className="pvw-cmd is-out"
              onClick={onPreviewHide}
              disabled={!previewVisible}
              title="Hide the preview bus title"
            >
              PVW OUT
            </button>
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>Close ✕</button>
      </div>

      {mode === 'selected' && selectedOutput && (
        <div className="preview-grid-v2">
          <PreviewFrame
            title="Preview"
            state={previewVisible ? 'on' : 'off'}
            name={selectedOutput.name}
            url={previewEmbedUrlFor(selectedOutput)}
            isVmix={entryIsVmix(selectedOutput, entries)}
            onPopOut={() => onOpenWindow?.(targetById.get(selectedOutput.id), 'preview')}
            style={selectedFrameStyle}
          />
          <PreviewFrame
            title="Live"
            state={selectedOutput?.program?.visible ? 'on' : 'off'}
            name={`${selectedOutput.name} · ${selectedOutput?.program?.visible ? 'ON AIR' : 'OFF'}`}
            url={liveEmbedUrlFor(selectedOutput)}
            isVmix={entryIsVmix(selectedOutput, entries)}
            onPopOut={() => onOpenWindow?.(targetById.get(selectedOutput.id), 'live')}
            style={selectedFrameStyle}
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
              url={liveEmbedUrlFor(output)}
              isVmix={entryIsVmix(output, entries)}
              onPopOut={() => onOpenWindow?.(targetById.get(output.id), 'live')}
            />
          ))}
        </div>
      )}

      {isOpen && (
        <div
          className="preview-resize-handle"
          onMouseDown={beginResize}
          title="Drag to resize the preview panel"
          aria-label="Resize preview panel"
        />
      )}
    </div>
  );
}
