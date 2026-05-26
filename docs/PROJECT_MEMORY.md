# Project Memory

Last updated: 2026-05-26

## Current Branch Context

- Active branch during release prep: `staging/0.4.0`; release should be pushed to `main`.
- Current release target: `v0.4.3`.
- GitHub branches:
- `origin/main` is the release target for the current `0.4.x` line.
- `origin/staging/0.4.0` was used for prerelease work and should not remain the primary release target.
- Local `.claude/worktrees/exciting-cerf-fb0314` is older than current `0.4.x` work.
- Current recurring untracked local items: `templates/google-timer/`, `templates/google-timer-2/`, `templates/google-timer-3/`.

## Current Architecture

- Frontend: React control shell in `client/src/ControlShell.jsx`, with UI components under `client/src/control-shell/`.
- Current UI surface:
  - `control-shell/v2/TopBar.jsx`
  - `control-shell/v2/OutputsSidebar.jsx`
  - `control-shell/v2/LiveTabV2.jsx`
  - `control-shell/v2/ConfigTab.jsx`
  - `control-shell/v2/PreviewOverlay.jsx`
- Desktop shell:
  - Main Electron window is frameless (`frame: false`).
  - TopBar renders desktop-only in-app window controls when `window.webTitleDesktop` is present.
  - Window controls use preload IPC: `window:minimize`, `window:toggle-maximize`, `window:close`, and `window:get-state`.
  - CSS uses `-webkit-app-region: drag` on the top bar and `no-drag` on interactive controls.
- CSS is split into `client/src/styles/*.css`, imported via `client/src/styles/index.css`.
- Backend: Express + WebSocket in `server/`.
- Renderer: `renderer/render.js`.
- Desktop shell: Electron files under `desktop/`.
- Project bundle support: `server/templates/bundle-service.js`.

## Recent Fixes

- WebSocket `timer-tick` now sends only `{ serverTime, timers }`, not the full project snapshot.
- Live Data Source row selection updates only title `fields`; it must not overwrite the title `name`.
- vMix title input display:
  - New vMix entries store `vmixInputNumber`.
  - Existing vMix entries are enriched from current `vmixState.inputs` when possible.
  - UI must not display UUID-like `vmixInputKey` values as `Input #...`.
- Config visually separates local and vMix titles:
  - local: neutral left accent.
  - vMix: blue left accent and subtle blue background.
- MIDI Learn:
  - UI action IDs are `previousTitle`, `nextTitle`, `selectOutput:<id>`, `selectEntry:<id>`, `timerToggle:<id>`, `timerReset:<id>`.
  - Backend dispatch normalizes those to old command IDs where needed.
  - `midiState.bindings` is an array; Controls builds a lookup map with old/new aliases.
  - Controls includes MIDI status and `Refresh MIDI`.
  - JZZ input ports must be used as the returned chainable port (`openMidiIn(...).connect(...)`); `and()` does not reliably pass the port as an argument.
  - Learned MIDI bindings are stored as `device: "any"` plus `deviceName` for display, so Akai/other controllers keep working after reconnects where the OS port name changes.
  - MIDI parser stores channel for note/CC messages; matching honors channel when present.
  - CC/fader bindings can include a `valueMode` rule (`any`, `eq`, `gte`, `lte`) plus `value` 0-127, so faders can trigger only at a threshold instead of every movement.
  - Controls shows detected MIDI inputs, last received MIDI message, and any open error for operator diagnostics.
  - External reference checked: vMixUTC MIDI mapping stores event type + channel + note/control and uses a Learn flow that copies the learned event into the mapping row.
- Live Notes:
  - `LiveTabV2` has a `Notes` toggle beside `Preview`.
  - Notes panel opens on the right and persists per output/source in localStorage.
  - Notes editor is `contentEditable`, not `textarea`; saved shape supports `{ html, text }` and migrates old plain-text notes.
  - Formatting applies to the selected text fragment, not the whole note.
  - Supported formatting: bold, italic, font size, text color, background color.
  - Color UI has two buttons: `Text` and `Fill`; `Fill` uses a native color input over the styled button so Electron opens the picker reliably.
  - Color application listens to both `input` and `change` and uses a short debounce to prevent freezes while dragging through the native palette.
  - `Clear` background is exposed from the `Fill` control, positioned beside it so the native palette does not cover the action, and preserves selection for the next formatting command.
  - Notes panel width is resizable from its left splitter, persisted in `web-title-pro.liveNotesWidth`, clamped to 260-620 px.
- Add Title modal:
  - `Local / vMix Title` uses modal-scoped segmented-control styling.
  - Active vMix mode uses the vMix blue accent.
  - Template package upload hides the native gray file input and shows a styled `Choose files` chip plus selected-file text.
- Project bundle export/import:
  - `.wtpkg` contains `manifest.json`, `project-summary.json`, `project.json`, and `templates/<slug>/...` only for referenced custom templates.
  - Seeing only a few files in the archive is expected when no custom templates are referenced; full project data lives in `project.json`.
  - `project-summary.json` is a readable verification file with counts/lists for outputs, local/vMix titles, data sources, timers, templates, and discovered vMix inputs.
  - Project-level app settings are persisted in `project.json.state.integrations`: vMix host/selected timer input, update settings, keyboard/global shortcuts, and MIDI bindings.
  - `project.json.runtime.vmix.inputs` carries the discovered vMix input list from export time; importing still applies the regular persisted project state and source library.
  - Not project-bundle state: window size/position, recent-project history, and browser-local Live Notes stored in localStorage.

## Tests

- Unit/regression tests:
  - `npm.cmd test`
  - `npm.cmd run test:unit`
- Production build:
  - `npm.cmd run build`
- Playwright browser smoke:
  - Install browser once: `npm.cmd run test:ui:install`
  - Run smoke: `npm.cmd run test:ui`
  - Config: `playwright.config.cjs`
  - Specs: `tests/ui/`
  - Playwright starts `npm run dev` automatically through `webServer`.
  - Current UI smoke covers Notes open, selected-text rich formatting, color application, and Notes panel resize.
  - Add Title modal styling is covered: segmented mode switch, vMix accent, hidden native file input, styled upload picker.
  - Bundle tests cover custom template inclusion, zip-slip rejection, project summary counts, local/vMix title preservation, data sources, vMix discovered input export, keyboard/global shortcuts, and MIDI bindings.
- `dev:server` uses a narrowed nodemon watch (`server`, `package.json`) so Playwright `test-results/`, Vite build output, and local files do not restart the backend during UI tests.
- Full verification:
  - `npm.cmd run test:all`

## Known Limitations

- vMix ON AIR is still not read back from vMix; UI reflects the last command issued by this app.
- MIDI action dispatch supports `noteon` and positive-value `cc`; CC bindings can further restrict `value` through `any` / `eq` / `gte` / `lte`.
- GitHub Releases API is queried without a token and may hit the public 60 req/h IP limit.
- Browser/plugin automation may not be available in every Codex session; project-level Playwright smoke is the reliable fallback.
