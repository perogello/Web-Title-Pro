import { useEffect, useRef, useState } from 'react';
import {
  WindowCloseIcon,
  WindowMaximizeIcon,
  WindowMinimizeIcon,
  WindowRestoreIcon,
} from '../icons.jsx';

// Bundle import — hidden file input fired from the menu item below. Keeps
// the picker out of the layout tree until the user actually clicks Import.
function BundleFileInput({ onPick, inputRef }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept=".wtpkg,.zip,application/zip"
      style={{ display: 'none' }}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) onPick?.(file);
      }}
    />
  );
}

const TABS = [
  { id: 'rundown', label: 'Live', icon: '▶' },
  { id: 'config', label: 'Config', icon: '⚙' },
  { id: 'sources', label: 'Data', icon: '⊞' },
  { id: 'timers', label: 'Timers', icon: '⏱' },
  { id: 'settings', label: 'Settings', icon: '⚒' },
];

function StatusBadge({ tone, label, title, onClick }) {
  // Clickable chips navigate to their settings page; non-clickable stays as a span.
  if (onClick) {
    return (
      <button
        type="button"
        className={`badge-status-v2 is-${tone} is-clickable`}
        onClick={onClick}
        title={title || label}
      >
        <span className="dot" />
        <span>{label}</span>
      </button>
    );
  }
  return (
    <span className={`badge-status-v2 is-${tone}`} title={title || label}>
      <span className="dot" />
      <span>{label}</span>
    </span>
  );
}

function WindowControls() {
  const desktopBridge = typeof window !== 'undefined' ? window.webTitleDesktop : null;
  const [windowState, setWindowState] = useState({ isMaximized: false });

  useEffect(() => {
    if (!desktopBridge?.getWindowState) return undefined;

    let cancelled = false;
    desktopBridge.getWindowState()
      .then((payload) => {
        if (!cancelled && payload?.ok) setWindowState(payload);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [desktopBridge]);

  useEffect(() => {
    if (!desktopBridge?.onWindowStateChanged) return undefined;
    return desktopBridge.onWindowStateChanged((payload) => {
      if (payload?.ok) setWindowState(payload);
    });
  }, [desktopBridge]);

  if (!desktopBridge?.minimizeWindow || !desktopBridge?.toggleMaximizeWindow || !desktopBridge?.closeWindow) {
    return null;
  }

  return (
    <div className="window-controls-v2" aria-label="Window controls">
      <button
        type="button"
        className="window-control-btn-v2"
        onClick={() => desktopBridge.minimizeWindow()}
        title="Minimize"
        aria-label="Minimize window"
      >
        <WindowMinimizeIcon />
      </button>
      <button
        type="button"
        className="window-control-btn-v2"
        onClick={() => desktopBridge.toggleMaximizeWindow()}
        title={windowState.isMaximized ? 'Restore' : 'Maximize'}
        aria-label={windowState.isMaximized ? 'Restore window' : 'Maximize window'}
      >
        {windowState.isMaximized ? <WindowRestoreIcon /> : <WindowMaximizeIcon />}
      </button>
      <button
        type="button"
        className="window-control-btn-v2 is-close"
        onClick={() => desktopBridge.closeWindow()}
        title="Close"
        aria-label="Close window"
      >
        <WindowCloseIcon />
      </button>
    </div>
  );
}

export default function TopBar({
  activeTab,
  onSetActiveTab,
  currentProjectName,
  projectDirty,
  projectStatus,
  connection,
  vmixState,
  midiState,
  yandexAuthState,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onSaveAsProject,
  onOpenRecentProject,
  onOpenTemplateFolders,
  onExportProjectBundle,
  onImportProjectBundleFile,
  onOpenSettingsTab,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const bundleInputRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const wsConnected = connection === 'connected';
  const wsTone = wsConnected ? 'on' : connection === 'reconnecting' || connection === 'connecting' ? 'warn' : 'off';
  const vmixTone = vmixState?.connected ? 'on' : 'off';
  const midiTone = midiState?.enabled ? (midiState?.inputs?.length ? 'on' : 'warn') : 'off';
  const yandexTone = yandexAuthState?.accessToken ? 'on' : 'off';

  const recent = projectStatus?.recentProjects || [];

  return (
    <header className="topbar-v2" ref={menuRef}>
      <button className="app-menu" onClick={() => setMenuOpen((v) => !v)}>
        <span className="burger">{'☰'}</span>
        <span className="project">
          <strong>{currentProjectName || 'Unsaved Project'}</strong>
          {projectDirty && <span className="dirty">{'●'}</span>}
        </span>
      </button>

      <nav className="tabs-v2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-v2 ${activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => onSetActiveTab(tab.id)}
            title={tab.label}
          >
            <span className="icon">{tab.icon}</span>
            <span className="label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="titlebar-drag-v2" aria-hidden="true" />

      <div className="status-v2">
        {/* Connection chip is a status-only indicator — no settings page for it.
            The other three are click-throughs into their integration/control panels:
              vMix   → Settings ▸ Integrations
              MIDI   → Settings ▸ Controls (Shortcuts/MIDI bindings)
              Yandex → Settings ▸ Integrations */}
        <StatusBadge
          tone={wsTone}
          label={wsConnected ? 'Connected' : connection === 'reconnecting' ? 'Reconnecting' : connection === 'connecting' ? 'Connecting' : 'Offline'}
          title={`WebSocket: ${connection}`}
        />
        <StatusBadge
          tone={vmixTone}
          label="vMix"
          title={vmixState?.connected ? 'vMix connected — click to open settings' : `vMix: ${vmixState?.error || 'disconnected'} — click to open settings`}
          onClick={() => onOpenSettingsTab?.('integrations')}
        />
        <StatusBadge
          tone={midiTone}
          label="MIDI"
          title={midiState?.enabled ? `MIDI: ${midiState?.inputs?.length || 0} device(s) — click to open Controls` : 'MIDI off — click to open Controls'}
          onClick={() => onOpenSettingsTab?.('controls')}
        />
        <StatusBadge
          tone={yandexTone}
          label="Yandex"
          title={yandexAuthState?.accessToken ? `Yandex: ${yandexAuthState?.accountLogin || 'connected'} — click to open settings` : 'Yandex: not connected — click to open settings'}
          onClick={() => onOpenSettingsTab?.('integrations')}
        />
      </div>

      <WindowControls />

      {menuOpen && (
        <div className="file-dropdown">
          <button onClick={() => { setMenuOpen(false); onNewProject?.(); }}>
            New project <span className="kbd">Ctrl+N</span>
          </button>
          <button onClick={() => { setMenuOpen(false); onOpenProject?.(); }}>
            Open... <span className="kbd">Ctrl+O</span>
          </button>
          <button onClick={() => { setMenuOpen(false); onSaveProject?.(); }}>
            Save <span className="kbd">Ctrl+S</span>
          </button>
          <button onClick={() => { setMenuOpen(false); onSaveAsProject?.(); }}>
            Save as... <span className="kbd">Ctrl+Shift+S</span>
          </button>
          {recent.length > 0 && (
            <>
              <span className="sep" />
              <div className="group-label">Recent</div>
              {recent.slice(0, 6).map((item) => (
                <button
                  key={item.path}
                  className="recent"
                  title={item.path}
                  onClick={() => { setMenuOpen(false); onOpenRecentProject?.(item.path); }}
                >
                  {item.name}
                </button>
              ))}
            </>
          )}
          <span className="sep" />
          <div className="group-label">Project bundle (.wtpkg)</div>
          <button
            onClick={() => { setMenuOpen(false); onExportProjectBundle?.(); }}
            title="Export this project together with all referenced custom templates as one .wtpkg file"
          >
            Export bundle...
          </button>
          <button
            onClick={() => { setMenuOpen(false); bundleInputRef.current?.click(); }}
            title="Import a .wtpkg project bundle and install its bundled templates"
          >
            Import bundle...
          </button>
          <span className="sep" />
          <button onClick={() => { setMenuOpen(false); onOpenTemplateFolders?.(); }}>
            Open templates folder
          </button>
        </div>
      )}
      <BundleFileInput inputRef={bundleInputRef} onPick={onImportProjectBundleFile} />
    </header>
  );
}
