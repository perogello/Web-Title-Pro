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
              collected.push({ key: `${plugin.id}:${button.command}:${button.label}`, ...button });
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

  return (
    <div className="plugin-slot" data-slot={slot}>
      {buttons.map((button) => (
        <button
          key={button.key}
          type="button"
          className="plugin-slot-btn"
          onClick={() => onCommand?.(button.command)}
          title={`Plugin: ${button.command}`}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
