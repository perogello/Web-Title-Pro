# Plugin starter

A minimal, working content plugin: a control **panel**, an on-air **overlay**,
its **own data**, and app **commands** — all through the SDK.

## Try it in 3 steps

1. Copy this whole folder into your custom plugins directory and rename it
   (the folder name becomes part of the plugin id):
   - `storage/plugins/my-plugin/`
   - or install it from **Settings › Plugins → Install from folder / archive**.
2. In **Settings › Plugins**, enable **My Plugin**.
3. Open the **Live** tab — the panel appears. Type text, **Save**, then
   **Overlay ON air**. The overlay shows your text on the render output
   (and at the browser-source URL shown in Settings › Plugins).

## Files

- `plugin.json` — the manifest (name, surfaces, capabilities, settings).
- `panel.html` — the control UI, mounted in the app.
- `overlay.html` — the on-air graphic, composited by the renderer / usable as an
  OBS/vMix browser source.

## Next

- Full reference: [../PLUGINS.md](../PLUGINS.md) (English) /
  [../PLUGINS_RU.md](../PLUGINS_RU.md) (Russian).
- Real examples in the repo: `plugins/bingo` (content: panel + overlay + bundled
  template) and `plugins/rundown-remote` (control panel).
