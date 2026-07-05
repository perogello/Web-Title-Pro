import { useCallback, useEffect, useRef, useState } from 'react';
import { api, BACKEND_ORIGIN } from './api.js';

// The plugin bridge. Enabled plugins whose manifest mounts them at `location`
// are rendered in sandboxed iframes. The iframe cannot reach the app directly
// (sandbox="allow-scripts" only → opaque origin, no parent access); it talks
// solely through postMessage. This host is the trusted broker: it forwards the
// live snapshot only to plugins granted `state:read` and forwards commands only
// for plugins granted `command:send`, matching what the server minted on enable.
//
// Messages are matched by iframe window reference (event.origin is "null" under
// sandbox), so only a known plugin frame can drive the bridge.
const HOST = 'wtp-host';
const PLUGIN = 'wtp-plugin';

export default function PluginHost({ location = 'live', snapshot, onCommand }) {
  const [plugins, setPlugins] = useState([]);
  // pluginId -> { node (the <iframe>), plugin, subscribed }. We read
  // node.contentWindow live at message time rather than caching it, because a
  // frame's contentWindow can change across its initial navigation.
  const framesRef = useRef(new Map());
  const snapshotRef = useRef(snapshot);

  const load = useCallback(() => {
    api('/api/plugins')
      .then((res) =>
        setPlugins(
          (res.plugins || []).filter(
            (p) => p.enabled && p.mount?.type === 'panel' && p.mount?.location === location,
          ),
        ),
      )
      .catch(() => setPlugins([]));
  }, [location]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-read when a plugin is toggled from Settings.
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('wtp-plugins-changed', handler);
    return () => window.removeEventListener('wtp-plugins-changed', handler);
  }, [load]);

  // Bridge: receive requests from plugin iframes.
  useEffect(() => {
    const handler = (event) => {
      const data = event.data;
      if (!data || data.source !== PLUGIN) return;

      let rec = null;
      for (const candidate of framesRef.current.values()) {
        if (candidate.node?.contentWindow && candidate.node.contentWindow === event.source) {
          rec = candidate;
          break;
        }
      }
      if (!rec) return;
      const win = rec.node.contentWindow;
      const caps = rec.plugin.capabilities || [];
      const reply = (msg) => win.postMessage({ source: HOST, ...msg }, '*');

      if (data.type === 'ready') {
        reply({ type: 'init', pluginId: rec.plugin.id, capabilities: caps, settings: rec.plugin.settings || {} });
      } else if (data.type === 'subscribe') {
        if (!caps.includes('state:read')) return;
        rec.subscribed = true;
        if (snapshotRef.current) reply({ type: 'snapshot', snapshot: snapshotRef.current });
      } else if (data.type === 'command') {
        if (!caps.includes('command:send')) {
          reply({ type: 'command-result', requestId: data.requestId, ok: false, error: 'command:send not granted' });
          return;
        }
        Promise.resolve(onCommand?.(data.actionId))
          .then(() => reply({ type: 'command-result', requestId: data.requestId, ok: true }))
          .catch((err) => reply({ type: 'command-result', requestId: data.requestId, ok: false, error: err.message }));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onCommand]);

  // Push each new snapshot to subscribed, read-granted frames.
  useEffect(() => {
    snapshotRef.current = snapshot;
    for (const rec of framesRef.current.values()) {
      const win = rec.node?.contentWindow;
      if (rec.subscribed && win && (rec.plugin.capabilities || []).includes('state:read')) {
        win.postMessage({ source: HOST, type: 'snapshot', snapshot }, '*');
      }
    }
  }, [snapshot]);

  if (!plugins.length) return null;

  return (
    <div className="plugin-host">
      {plugins.map((plugin) => (
        <div className="plugin-frame" key={plugin.id}>
          <div className="plugin-frame-head">{plugin.mount?.label || plugin.name}</div>
          <iframe
            title={plugin.name}
            className="plugin-frame-body"
            sandbox="allow-scripts"
            src={`${BACKEND_ORIGIN}${plugin.entryUrl}`}
            ref={(node) => {
              if (node) {
                const prev = framesRef.current.get(plugin.id);
                framesRef.current.set(plugin.id, { node, plugin, subscribed: prev?.subscribed || false });
              } else {
                framesRef.current.delete(plugin.id);
              }
            }}
          />
        </div>
      ))}
    </div>
  );
}
