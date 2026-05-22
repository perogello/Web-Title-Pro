import { useEffect, useRef, useState } from 'react';

const TABS = [
  { id: 'rundown', label: 'Live', icon: '▶' },
  { id: 'config', label: 'Config', icon: '⚙' },
  { id: 'sources', label: 'Data', icon: '⊞' },
  { id: 'timers', label: 'Timers', icon: '⏱' },
  { id: 'settings', label: 'Settings', icon: '⚒' },
];

function StatusBadge({ tone, label, title }) {
  return (
    <span className={`badge-status-v2 is-${tone}`} title={title || label}>
      <span className="dot" />
      <span>{label}</span>
    </span>
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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

  const wsTone = connection === 'online' ? 'on' : connection === 'reconnecting' ? 'warn' : 'off';
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

      <div />

      <div className="status-v2">
        <StatusBadge
          tone={wsTone}
          label={connection === 'online' ? 'Connected' : connection === 'reconnecting' ? 'Reconnecting' : 'Offline'}
          title={`WebSocket: ${connection}`}
        />
        <StatusBadge
          tone={vmixTone}
          label="vMix"
          title={vmixState?.connected ? 'vMix connected' : `vMix: ${vmixState?.error || 'disconnected'}`}
        />
        <StatusBadge
          tone={midiTone}
          label="MIDI"
          title={midiState?.enabled ? `MIDI: ${midiState?.inputs?.length || 0} device(s)` : 'MIDI off'}
        />
        <StatusBadge
          tone={yandexTone}
          label="Yandex"
          title={yandexAuthState?.accessToken ? `Yandex: ${yandexAuthState?.accountLogin || 'connected'}` : 'Yandex: not connected'}
        />
      </div>

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
          <button onClick={() => { setMenuOpen(false); onOpenTemplateFolders?.(); }}>
            Open templates folder
          </button>
        </div>
      )}
    </header>
  );
}
