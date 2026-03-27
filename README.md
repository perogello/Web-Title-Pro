# Web Title Pro

Web Title Pro is a desktop-first title control system for live production.
It combines a React control panel, a low-latency Node.js backend, and a browser renderer for `vMix`, `OBS`, and other browser-based graphics workflows.

## What It Does

- Controls local HTML/CSS/JS titles without reloading the browser source
- Supports multiple independent outputs with separate render URLs
- Works with both local templates and `vMix` title inputs
- Includes rundown, data source tables, speaker timers, preview/live states, shortcuts, MIDI, and Bitfocus-ready HTTP API
- Packages as a Windows desktop app for broadcast operation

## Main Features

- `SHOW / LIVE / HIDE` title control with real-time updates
- Live rundown with local and `vMix` title entries
- Data source tables with editable rows
- Speaker timers linked to rows and title outputs
- `vMix` integration for timer inputs and text/title fields
- Configurable per-title shortcuts
- MIDI integration
- Companion / Bitfocus HTTP control
- Windows portable build with splash screen and local persistence

## Project Structure

```text
client/       React control panel
server/       Express + WebSocket backend
renderer/     Browser render client for Browser Input
desktop/      Electron desktop shell
templates/    Built-in local title templates
data/         Default state data
scripts/      Launch and helper scripts
```

## Requirements

For normal use of the packaged desktop app:

- Windows PC
- `vMix` only if you want to use `vMix` integration
- MIDI device only if you want MIDI control

For development from source:

- Node.js
- npm

## Install And Run From Source

```bash
npm install
npm run dev
```

If PowerShell blocks `npm.ps1`, use:

```bash
npm.cmd install
npm.cmd run dev
```

Useful local URLs:

- Control panel: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Browser renderer: `http://localhost:4000/render.html`

## Run Desktop App

Development desktop mode:

```bash
npm.cmd run desktop
```

Portable packaged build:

```bash
npm.cmd run package:win
```

This creates:

```text
release/WebTitlePro-1.0.0.exe
```

Recommended launcher:

```text
launch-web-title-pro.cmd
```

The launcher clears conflicting Electron environment flags and starts the packaged app safely.

## How To Use

1. Start the desktop app or the dev environment.
2. Create or select an `Output`.
3. Add a local template title or a `vMix` title.
4. Select a row from the live data source table.
5. Use `SHOW`, `LIVE`, or `HIDE`.
6. Copy the output render URL into `vMix` or `OBS` Browser Source.

## Local Templates

Local templates are standard HTML/CSS/JS folders.
Dynamic text fields are detected via `data-field`.
Timers are detected via `data-timer`.

Example:

```html
<span data-field="name" data-label="Name">John Doe</span>
<span data-timer="speaker">00:30</span>
```

## vMix Integration

Web Title Pro can:

- read `vMix` inputs
- send text to `vMix` title fields
- control `vMix` timer-related text outputs

Typical local API address:

```text
http://127.0.0.1:8088
```

## Shortcuts

Keyboard and mouse shortcuts are configured inside:

```text
Settings -> Shortcuts
```

Shortcuts are stored in app state and persist between launches.

## Updates

An update settings tab is included in the app.
GitHub-based version checking can be connected by setting the repository URL in:

```text
Settings -> Updates
```

## Packaging Notes

- The current Windows build is portable
- User data is stored in the application data directory, not in the project folder
- `Git for Windows` is recommended if you plan to publish from this machine

## Troubleshooting

- If the packaged app does not start from the `.exe`, try `launch-web-title-pro.cmd`
- If `git` is not recognized after installation, open a new terminal window
- If `vMix` fields do not appear, confirm that the `vMix` Web API is enabled and reachable

## License

MIT
