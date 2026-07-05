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

const notifyChangedForm = () => window.dispatchEvent(new CustomEvent('wtp-plugins-changed'));

// A form built from the plugin's declared settings schema. Discrete controls
// (checkbox/select) save immediately; free-text/number commit on blur to avoid
// a write per keystroke. Saving pushes the new settings live to the plugin.
function PluginSettingsForm({ plugin }) {
  const [values, setValues] = useState(plugin.settings || {});

  useEffect(() => {
    setValues(plugin.settings || {});
    // Re-sync only when the plugin identity changes, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin.id]);

  const commit = async (next) => {
    try {
      await api(`/api/plugins/${encodeURIComponent(plugin.id)}/settings`, {
        method: 'PUT',
        body: { settings: next },
      });
      notifyChangedForm();
    } catch {
      /* surfaced elsewhere; keep the form responsive */
    }
  };

  if (!plugin.settingsSchema?.length) return null;

  return (
    <div className="plugin-settings">
      {plugin.settingsSchema.map((field) => {
        const value = values[field.key];
        if (field.type === 'checkbox') {
          return (
            <label className="plugin-setting is-inline" key={field.key}>
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => {
                  const next = { ...values, [field.key]: event.target.checked };
                  setValues(next);
                  commit(next);
                }}
              />
              <span className="plugin-setting-label">{field.label}</span>
            </label>
          );
        }
        if (field.type === 'select') {
          return (
            <label className="plugin-setting" key={field.key}>
              <span className="plugin-setting-label">{field.label}</span>
              <select
                value={value ?? ''}
                onChange={(event) => {
                  const next = { ...values, [field.key]: event.target.value };
                  setValues(next);
                  commit(next);
                }}
              >
                {(field.options || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        const isNumber = field.type === 'number';
        return (
          <label className="plugin-setting" key={field.key}>
            <span className="plugin-setting-label">{field.label}</span>
            <input
              type={isNumber ? 'number' : 'text'}
              value={value ?? ''}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  [field.key]: isNumber
                    ? event.target.value === ''
                      ? ''
                      : Number(event.target.value)
                    : event.target.value,
                }))
              }
              onBlur={() => commit(values)}
            />
          </label>
        );
      })}
    </div>
  );
}

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
            <PluginSettingsForm plugin={plugin} />
          </div>
        ))
      )}
    </div>
  );
}
