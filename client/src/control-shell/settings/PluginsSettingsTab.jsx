import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

// Settings › Plugins: list installed plugins, enable/disable them. Enabling a
// plugin mints a scoped capability grant on the server; the plugin then renders
// where its manifest says (a Live-tab panel for the reference plugin). Toggling
// fires a window event so the live PluginHost re-reads the list immediately.
const notifyChanged = () => window.dispatchEvent(new CustomEvent('wtp-plugins-changed'));

const CAP_LABELS = {
  'state:read': 'чтение состояния',
  'command:send': 'отправка команд',
};

const MOUNT_LABELS = {
  live: 'вкладка Live',
  rundown: 'вкладка Rundown',
  settings: 'настройки',
};

export default function PluginsSettingsTab() {
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api('/api/plugins')
      .then((res) => setPlugins(res.plugins || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (plugin) => {
    setBusyId(plugin.id);
    setError(null);
    try {
      await api(`/api/plugins/${encodeURIComponent(plugin.id)}/${plugin.enabled ? 'disable' : 'enable'}`, {
        method: 'POST',
      });
      notifyChanged();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="integration-grid">
      <div className="info-card-v3">
        <span className="info-label-v3">Плагины</span>
        <strong>Расширения панели</strong>
        <span className="note-v3">
          Плагин — это маленькое веб-приложение в песочнице (iframe), которое общается с системой
          только через мост: подписка на состояние и отправка команд, ограниченные выданными правами.
          Включённый плагин появляется там, где указано в его манифесте.
        </span>
      </div>

      {error && <div className="note-v3 is-danger">{error}</div>}

      {loading ? (
        <div className="note-v3">Загрузка…</div>
      ) : plugins.length === 0 ? (
        <div className="info-card-v3">
          <span className="note-v3">
            Плагины не найдены. Папки: <code>plugins/</code> (встроенные) и <code>storage/plugins/</code>.
          </span>
        </div>
      ) : (
        plugins.map((plugin) => (
          <div className="info-card-v3 plugin-card-v3" key={plugin.id}>
            <div className="plugin-card-head">
              <div>
                <strong>{plugin.name}</strong>{' '}
                <span className="note-v3">v{plugin.version}</span>{' '}
                <span className={`plugin-badge ${plugin.source === 'builtin' ? 'is-builtin' : ''}`}>
                  {plugin.source === 'builtin' ? 'встроенный' : 'пользовательский'}
                </span>
              </div>
              <button
                type="button"
                className={`btn-v3-ghost ${plugin.enabled ? 'is-danger' : ''}`}
                disabled={busyId === plugin.id}
                onClick={() => toggle(plugin)}
              >
                {busyId === plugin.id ? '…' : plugin.enabled ? 'Отключить' : 'Включить'}
              </button>
            </div>
            {plugin.description && <span className="note-v3">{plugin.description}</span>}
            <div className="plugin-meta">
              <span className="plugin-meta-item">
                Монтируется: {MOUNT_LABELS[plugin.mount?.location] || plugin.mount?.location || '—'}
              </span>
              <span className="plugin-meta-item">
                Права: {(plugin.capabilities || []).map((cap) => CAP_LABELS[cap] || cap).join(', ') || 'нет'}
              </span>
              <span className={`plugin-status ${plugin.enabled ? 'is-on' : ''}`}>
                {plugin.enabled ? '● включён' : '○ отключён'}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
