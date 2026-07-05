import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

// A named host slot that renders native buttons contributed by enabled plugins
// (manifest `contributes.buttons`). The plugin declares a slot + label +
// canonical command; the host draws a host-styled button and dispatches that
// command on click. No plugin DOM is injected — the contribution is purely
// declarative, so a contributed button can only fire a known command, and only
// for a plugin that was granted `command:send`.
export default function PluginSlot({ slot, onCommand }) {
  const [buttons, setButtons] = useState([]);

  const load = useCallback(() => {
    api('/api/plugins')
      .then((res) => {
        const collected = [];
        for (const plugin of res.plugins || []) {
          if (!plugin.enabled || !(plugin.capabilities || []).includes('command:send')) continue;
          for (const button of plugin.contributes?.buttons || []) {
            if (button.slot === slot) {
              collected.push({
                key: `${plugin.id}:${button.command || button.action}:${button.label}`,
                pluginId: plugin.id,
                ...button,
              });
            }
          }
        }
        setButtons(collected);
      })
      .catch(() => setButtons([]));
  }, [slot]);

  useEffect(() => {
    load();
    window.addEventListener('wtp-plugins-changed', load);
    return () => window.removeEventListener('wtp-plugins-changed', load);
  }, [load]);

  if (!buttons.length) return null;

  // A `command` button fires a canonical actionId directly; an `action` button
  // is routed to the plugin's own iframe (a PluginHost forwards it), where the
  // plugin runs its logic.
  const fire = (button) => {
    if (button.command) {
      onCommand?.(button.command);
    } else if (button.action) {
      window.dispatchEvent(
        new CustomEvent('wtp-plugin-action', { detail: { pluginId: button.pluginId, action: button.action } }),
      );
    }
  };

  return (
    <div className="plugin-slot" data-slot={slot}>
      {buttons.map((button) => (
        <button
          key={button.key}
          type="button"
          className="plugin-slot-btn"
          onClick={() => fire(button)}
          title={button.command ? `Plugin command: ${button.command}` : `Plugin action: ${button.action}`}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
