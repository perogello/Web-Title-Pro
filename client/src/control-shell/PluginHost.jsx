import { useCallback, useEffect, useMemo, useRef } from 'react';
import { BACKEND_ORIGIN } from './api.js';
import { usePlugins } from './use-plugins.js';

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

// Two mounts: a docked `panel` inside a tab (filtered by location) or a full
// content-area `tab` (the single plugin whose own tab is active). Both share the
// same bridge, so a plugin behaves identically wherever its manifest puts it.
export default function PluginHost({ mount = 'panel', location = 'live', activePluginId = null, snapshot, onCommand }) {
  const { plugins: allPlugins } = usePlugins();
  const framesRef = useRef(new Map()); // pluginId -> { node, subscribed }
  const pluginsRef = useRef([]); // latest plugin metadata (caps, settings) by index
  const snapshotRef = useRef(snapshot);

  // The enabled plugins this host is responsible for: a docked panel filters by
  // location, a tab shows the one active plugin, background takes all headless.
  const plugins = useMemo(() => {
    const matches = (p) => {
      if (!p.enabled || p.mount?.type !== mount) return false;
      if (mount === 'tab') return p.id === activePluginId;
      if (mount === 'background') return true; // headless: no location/tab
      return p.mount?.location === location;
    };
    return allPlugins.filter(matches);
  }, [allPlugins, mount, location, activePluginId]);

  const findPlugin = (id) => pluginsRef.current.find((p) => p.id === id) || null;

  // Stable ref: React calls a stable callback only on real mount/unmount, so
  // `subscribed` survives parent re-renders (an inline callback would be
  // invoked with null on every update and reset it).
  const registerFrame = useCallback((node) => {
    if (!node) return;
    const id = node.getAttribute('data-plugin-id');
    if (!id) return;
    const rec = framesRef.current.get(id) || { subscribed: false };
    rec.node = node;
    framesRef.current.set(id, rec);
  }, []);

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
      const id = rec.node.getAttribute('data-plugin-id');
      const plugin = findPlugin(id);
      if (!plugin) return;
      const win = rec.node.contentWindow;
      const caps = plugin.capabilities || [];
      const reply = (msg) => win.postMessage({ source: HOST, ...msg }, '*');

      if (data.type === 'ready') {
        reply({ type: 'init', pluginId: plugin.id, capabilities: caps, settings: plugin.settings || {} });
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

  // A contributed `action` button (from PluginSlot) is routed here: forward it
  // to that plugin's iframe if this host holds it (visible or background).
  useEffect(() => {
    const onAction = (event) => {
      const { pluginId, action } = event.detail || {};
      const win = framesRef.current.get(pluginId)?.node?.contentWindow;
      if (win) win.postMessage({ source: HOST, type: 'action', action }, '*');
    };
    window.addEventListener('wtp-plugin-action', onAction);
    return () => window.removeEventListener('wtp-plugin-action', onAction);
  }, []);

  // Keep latest metadata; prune dropped frames; push updated settings live.
  useEffect(() => {
    pluginsRef.current = plugins;
    const ids = new Set(plugins.map((p) => p.id));
    for (const key of [...framesRef.current.keys()]) {
      if (!ids.has(key)) framesRef.current.delete(key);
    }
    for (const plugin of plugins) {
      const win = framesRef.current.get(plugin.id)?.node?.contentWindow;
      if (win) win.postMessage({ source: HOST, type: 'settings', settings: plugin.settings || {} }, '*');
    }
  }, [plugins]);

  // Push each new snapshot to subscribed, read-granted frames.
  useEffect(() => {
    snapshotRef.current = snapshot;
    for (const [id, rec] of framesRef.current.entries()) {
      const win = rec.node?.contentWindow;
      const plugin = findPlugin(id);
      if (rec.subscribed && win && (plugin?.capabilities || []).includes('state:read')) {
        win.postMessage({ source: HOST, type: 'snapshot', snapshot }, '*');
      }
    }
  }, [snapshot]);

  if (!plugins.length) return null;

  const isTab = mount === 'tab';
  const isBackground = mount === 'background';
  return (
    <div className={`plugin-host ${isTab ? 'is-tab' : ''} ${isBackground ? 'is-background' : ''}`} aria-hidden={isBackground || undefined}>
      {plugins.map((plugin) => (
        <div className="plugin-frame" key={plugin.id}>
          {!isTab && !isBackground && <div className="plugin-frame-head">{plugin.mount?.label || plugin.name}</div>}
          <iframe
            title={plugin.name}
            className="plugin-frame-body"
            sandbox="allow-scripts"
            data-plugin-id={plugin.id}
            src={`${BACKEND_ORIGIN}${plugin.entryUrl}`}
            ref={registerFrame}
          />
        </div>
      ))}
    </div>
  );
}
