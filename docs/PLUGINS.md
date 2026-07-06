# Plugins

> Русская версия: [PLUGINS_RU.md](PLUGINS_RU.md)

A plugin is a small, self-contained web app that extends Web Title Pro. It can
add a control panel, its own on-air graphic, custom data, buttons and commands —
without touching the app's code. A plugin is always **optional**: enable it when
you want it, disable or remove it when you don't.

- **Users:** jump to [Installing & managing](#installing--managing).
- **Developers:** start from the [starter template](plugin-template/) and use
  this page as the reference.

---

## 1. What a plugin can do

- Show a **control panel** on a tab, its **own top-level tab**, or run
  **headless** in the background.
- Own a **data model** (scores, a bingo board, a feed) that persists and stays
  in sync across all of its surfaces.
- Be the **on-air graphic**: ship an **overlay** the renderer composites (or use
  as an OBS/vMix browser source), and/or **bundle title templates** that work in
  the normal rundown.
- Send **commands** to the app (take a title to air, step rows, start a timer…).
- Add **native buttons** to toolbars and **commands** you can bind to the
  keyboard.
- Declare **settings** the operator edits in Settings › Plugins.

---

## 2. Anatomy

A plugin is a folder with a `plugin.json` manifest and one or more HTML surfaces:

```
my-plugin/
  plugin.json        # manifest (required)
  panel.html         # control surface (the manifest "entry")
  overlay.html       # optional on-air graphic (the manifest "overlay")
  templates/         # optional bundled title templates
    lower-third/
      index.html
      template.json
```

- **Built-in** plugins live in `plugins/` and get the id `builtin:<folder>`.
- **Custom** plugins live in `storage/plugins/` and get the id `custom:<folder>`.
- All files are served at `/plugin-assets/<source>/<folder>/…`.

---

## 3. `plugin.json` reference

| Field | Type | Notes |
|---|---|---|
| `name` | string | **Required.** Shown in the UI. |
| `version` | string | e.g. `"1.0.0"`. |
| `description` | string | One line. |
| `author` | string | |
| `entry` | string | Control surface HTML. Default `index.html`. Must be inside the folder. |
| `overlay` | string | Optional on-air surface HTML. Must be inside the folder. |
| `capabilities` | string[] | What the plugin uses — see [Capabilities](#4-capabilities). |
| `mount` | object | Where the control surface lives — see [Mounts](#5-surfaces--mounts). |
| `settings` | array | Operator-editable settings — see [Settings](#10-settings). |
| `contributes` | object | Buttons + commands — see [Contributions](#9-contributions). |

Minimal manifest:

```json
{
  "name": "My Plugin",
  "entry": "panel.html",
  "capabilities": ["state:read", "command:send"],
  "mount": { "type": "panel", "location": "live", "label": "My Plugin" }
}
```

---

## 4. Capabilities

Declare what the plugin uses. They're shown to the operator and act as a
manifest of intent.

| Capability | Grants |
|---|---|
| `state:read` | Receive the app state snapshot (outputs, timers, program…). |
| `command:send` | Send canonical commands (`POST /api/command`). Required for contributed **command** buttons. |
| `data:read` | Read the plugin's own content data. |
| `data:write` | Write the plugin's own content data. |

---

## 5. Surfaces & mounts

`mount.type` decides where the **control surface** (`entry`) appears:

| `type` | Where |
|---|---|
| `panel` | Docked panel inside a tab, chosen by `mount.location` (`live` / `rundown` / `settings`). |
| `tab` | Its own top-level tab in the main navigation. |
| `background` | Headless — runs in a hidden iframe on every tab. Use for automation. |

`mount.label` is the panel/tab title. The **overlay** surface is separate (it's
the on-air graphic, not a control surface) — see [On-air overlay](#8-on-air-overlay).

---

## 6. The SDK

Every surface loads the SDK and talks to the app through the global `WTP`:

```html
<script src="/plugin-sdk.js"></script>
```

| Call | Does |
|---|---|
| `WTP.pluginId` | This plugin's id (e.g. `custom:my-plugin`). |
| `WTP.onState(cb)` | Subscribe to the app state snapshot; fires now + on every change. |
| `WTP.onData(cb)` | Subscribe to this plugin's data; fires now + on every change. |
| `WTP.getState()` / `WTP.getData()` | Current values. |
| `WTP.setData(obj)` | Replace this plugin's data (persists + broadcasts to all surfaces). |
| `WTP.command(actionId)` | Dispatch a canonical command. |

The SDK works the same **inside the app** and **as a standalone page** (an OBS
browser source) — it derives everything from its own URL and talks to the local
server over a WebSocket + relative HTTP.

---

## 7. Content data

`WTP.setData(obj)` / `WTP.onData(cb)` are the heart of a content plugin: the
panel writes, the overlay (and any other surface / browser source) receives the
change live.

```js
// panel.html
WTP.setData({ home: 3, away: 1 });

// overlay.html
WTP.onData(function (d) { render(d.home, d.away); });
```

Data is persisted with the app and capped at **256 KB** per plugin. Send the
`{ data }` envelope if you call the REST endpoint directly:
`GET/PUT /api/plugins/<id>/data`.

---

## 8. On-air overlay

Declare an `overlay` in the manifest. It's a normal page (use the SDK to render
from your data). Two ways to get it on air:

1. **Through the app renderer** — send the command `overlay:<pluginId>:in`
   (and `overlay:<pluginId>:out` to hide). The renderer composites your overlay
   as a full-frame layer. Only works while the plugin is enabled; it's cleared
   automatically when the plugin is disabled or removed. These are canonical
   commands, so they can also be bound to Companion/MIDI.
2. **As a browser source** — copy the overlay URL from Settings › Plugins into
   OBS/vMix.

```js
WTP.command('overlay:' + WTP.pluginId + ':in');   // take on air
WTP.command('overlay:' + WTP.pluginId + ':out');  // off air
```

---

## 9. Contributions

`contributes` lets the plugin add native UI to the host.

### Buttons

Native buttons in a host slot:

```json
"contributes": {
  "buttons": [
    { "slot": "live.toolbar", "label": "PANIC", "command": "global:allOutputsOut" },
    { "slot": "live.toolbar", "label": "Draw", "action": "draw" }
  ]
}
```

- Slots: `live.toolbar`, `config.toolbar`, `sources.toolbar`, `timers.toolbar`.
- `command` → the host dispatches that canonical command (needs `command:send`).
- `action` → the host forwards a message to your plugin's iframe; your code runs
  the logic (see [the bridge](#11-the-postmessage-bridge)).

### Commands

Declare named commands; they're published in the catalogue and can be **bound to
the keyboard** (Settings › Controls):

```json
"contributes": { "commands": [ { "id": "draw", "label": "Draw a number" } ] }
```

A declared command appears as `plugin:<pluginId>:draw`. When invoked it is routed
to your iframe as an action — handle it the same way as an action button.

---

## 10. Settings

Declare settings; the operator edits them in Settings › Plugins:

```json
"settings": [
  { "key": "title", "label": "Overlay title", "type": "text", "default": "Hello" },
  { "key": "compact", "label": "Compact", "type": "checkbox", "default": false },
  { "key": "accent", "label": "Accent", "type": "select", "default": "green",
    "options": [ { "value": "green", "label": "Green" }, { "value": "blue", "label": "Blue" } ] }
]
```

Types: `text`, `number`, `checkbox`, `select`. Settings are delivered to a
plugin **mounted inside the app** over the bridge (below).

---

## 11. The postMessage bridge

The SDK covers state, data and commands. Two things arrive over a `postMessage`
bridge instead, for plugins mounted inside the app: **contributed `action`
invocations** and **settings**. Listen for them:

```js
window.addEventListener('message', function (e) {
  if (!e.data || e.data.source !== 'wtp-host') return;
  if (e.data.type === 'action')   { runAction(e.data.action); }        // a contributed action / command
  if (e.data.type === 'init')     { applySettings(e.data.settings); }  // initial settings
  if (e.data.type === 'settings') { applySettings(e.data.settings); }  // settings changed
});
```

---

## 12. Bundled templates

Drop title templates under `<plugin>/templates/<name>/`. Each is a normal
template (an HTML file with `data-field` elements, plus optional `template.json`
for `name`/`description`/`category`). They appear in the template picker and work
in the rundown like any template — data-source mapping, synced outputs, vMix
titles. See `plugins/bingo/templates/bingo-lower-third/` for a working example.

---

## 13. Commands & discovery

`WTP.command(actionId)` accepts any canonical action id. The full, live list is
published at `GET /api/command/catalog` (with descriptions). The kinds:

| Pattern | Example | Meaning |
|---|---|---|
| `output:<id>:<cmd>` | `output:output-main:titleIn` | title in/out, preview in/out, `rowPrev`/`rowNext`, `timerStart`/`Stop`/`Reset` |
| `timer:<id>:<cmd>` | `timer:main:start` | `start`/`stop`/`reset` |
| `global:<cmd>` | `global:allOutputsOut` | panic |
| `overlay:<pluginId>:<in\|out>` | `overlay:custom:bingo:in` | your overlay on/off air |
| `plugin:<pluginId>:<cmd>` | `plugin:custom:bingo:draw` | your declared command (client-routed to your iframe) |

---

## 14. Installing & managing

- **Install:** Settings › Plugins → *Install from archive/files* (a `.zip` or a
  set of files) or *Install from folder*. Or drop the folder into
  `storage/plugins/`.
- **Enable / disable:** toggle in Settings › Plugins. Nothing from a disabled
  plugin runs.
- **Remove:** the *Delete* button (custom plugins). Built-ins can't be removed.
- **Settings & overlay URL:** shown per plugin in Settings › Plugins.

---

## 15. Security model & limits

- Plugin surfaces run in a **sandboxed iframe** (`sandbox="allow-scripts"`,
  opaque origin): a plugin **cannot** touch the host app's document. It reaches
  the app only through the local API + WebSocket — exactly like a browser source.
- Installed plugins are **trusted local code** (like an OBS browser source or an
  SPX template): install ones you trust.
- Limits: content data is capped at **256 KB** per plugin; an overlay only goes
  on air for an **enabled** plugin.
- There is no microphone/camera access from plugins.

---

## 16. Examples in the repo

- `plugins/bingo` — a full **content** plugin: panel + overlay (SDK) + a bundled
  template.
- `plugins/rundown-remote` — a **control** plugin: a panel that steps rows and
  takes titles in/out, with a contributed PANIC button and a declared command.
- `docs/plugin-template/` — the copy-me starter.
