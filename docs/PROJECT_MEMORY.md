# Project Memory

Last updated: 2026-10-14 (v0.5.3)

## Current Branch Context

- Releases are committed straight to `main`; current release: `v0.5.3` (GitHub Latest).
- `v0.5.0` only exists as the pre-release `v0.5.0-rc1`; `v0.5.1` was the first Latest installer build.
- Distribution (since 0.5.0): per-user NSIS installer + `electron-updater` + `asar`.
  Data lives in `%APPDATA%\web-title-pro` and survives updates.
- Release process:
  1. `npm version X --no-git-tag-version`; add the `X` entry to `desktop/changelog.json`; write `docs/RELEASE_X.md` (short, RU + EN).
  2. `npm run test:all` (unit + build + Companion module + Playwright).
  3. `npm run package:win` → `release/WebTitlePro-Setup-X.exe`, `.blockmap`, `latest.yml`.
  4. Before publishing, check ALL docs (`docs/*.md`, README EN/RU, this file, `companion-module/companion/HELP.md`) against the code and fix anything stale. README screenshots live in `docs/screenshots/` (1600×900 shots of the desktop app on a demo project); retake them when the UI changes noticeably, and never include personal paths.
  5. Commit "Release X …", `git push origin main`.
  6. `gh release create vX --target main --latest --notes-file docs/RELEASE_X.md` with all three files.
     `latest.yml` is mandatory (electron-updater feed); keep tags exactly `v<version>` (differential updates look the previous blockmap up by tag).
- Old portable 0.4.x builds cannot auto-update to the installer cleanly; release notes tell those users to install manually.

## 0.5.x Highlights

- In-app dialogs (`client/src/control-shell/app-dialog.jsx`, `desktop/integrations/app-dialog.cjs`): the main process renders message boxes inside the window via `window.__webTitleShowDialog`, native dialog only as a fallback. Shortcuts are suspended while a dialog is open.
- Notifications toast with a mode in Settings › System: all / errors only / none (`lib/use-feedback.js`, `pushFeedback` / `pushError`, localStorage `wtp.notifications`).
- File shortcuts Ctrl+N/O/S/Shift+S (`lib/use-project-shortcuts.js`, matched by physical key so they work on the RU layout).
- Applied data row is two-way (0.5.3): the panel pushes its row to the server (`POST /api/outputs/<id>/applied-row`) and adopts rows the server moves on its own (Companion / MIDI / plugins `rowNext`/`rowPrev`) from `snapshot.outputs[].appliedRow`, ignoring the echo of its own pushes, so the highlighted row always follows.
- Bitfocus Companion module (0.5.2):
  - Sources `companion-module/src` (`model.js`, `presets.js` are pure and unit-tested; `main.js` is the instance).
  - Build `npm run build:companion` (`scripts/build-companion-module.mjs`): one esbuild CJS bundle for `node18` with `@companion-module/base@1.11.3` inside (API 1.11 → Companion 3.5+). Output: `companion-module/dist/web-title-pro/` (developer-modules layout) and `web-title-pro-<ver>.tgz` (Import module package; first tar entry must be the root dir).
  - Module version = app version (baked in as `__WTP_MODULE_VERSION__`); on connect it compares with `GET /api/companion-module` and flags the connection when they differ.
  - Server: `GET /api/companion-module` (info), `GET /api/companion-module/package` (.tgz).
  - Desktop auto-install: `desktop/integrations/companion-installer.cjs` (IPC `companion:*`). Companion's launcher keeps `enable_developer` / `dev_modules_path` in `%APPDATA%\companion\config.json` and only reads it on start, so enabling developer modules needs Companion closed (the app asks, then restarts it). The module is copied to `%APPDATA%\web-title-pro\companion-modules\web-title-pro` and refreshed on every app start when the version changed. Never delete the module folder while Companion runs (Windows EPERM) — overwrite in place.
  - UI: Settings › Integrations › Bitfocus Companion module; Settings › Controls shows exact Companion field values per command (`settings/CompanionCommandFields.jsx`).

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
- Companion module: `companion-module/` (see 0.5.x Highlights).

## Fixes History (0.4.x)

- WebSocket `timer-tick` now sends only `{ serverTime, timers }`, not the full project snapshot.
- Live Data Source row selection updates only title `fields`; it must not overwrite the title `name`.
- Data tab manual `Source Rows` textarea auto-grows downward with content and disables native manual resize.
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
  - 2026-05-27 MIDI follow-up: JZZ input opening now tries display `name`, then stable `id`, then input index. This covers Windows/Akai cases where `info.inputs` lists a friendly name but `openMidiIn(name)` fails while `openMidiIn(id)` works.
  - MIDI status is now truly offline when no input ports are detected; the UI shows `MIDI offline: No MIDI inputs detected.` instead of a misleading enabled state with zero devices.
  - MIDI input open has a 2.5s per-target timeout, so a stuck Windows MIDI driver cannot freeze `Refresh MIDI` or Learn startup.
  - MIDI service subscribes to JZZ `onChange` and auto-refreshes when the device list changes; plugging Akai after app startup should no longer require restarting the app.
  - `v0.4.8` MIDI/Akai follow-up:
    - Failed `openMidiIn` attempts are explicitly disconnected/closed, so fallback attempts do not leave stale failed handles behind.
    - Noisy JZZ `onChange` events are ignored when the actual input signature is unchanged, preventing repeated refresh/error spam.
    - Offline errors are compacted into a short operator message; when at least one MIDI input opens, the app stays online and marks failed inputs as unavailable instead of reporting full MIDI offline.
    - Windows/Akai/vMix caveat: some Windows MIDI drivers expose input ports as exclusive. If vMix already owns the same Akai/APC input, Electron/JZZ cannot force-open it; the UI now says this directly and points the operator to either close the other MIDI owner or route through a virtual MIDI splitter.
    - Confirmed by user on 2026-05-27: closing vMix released the Akai port and Web Title Pro connected normally. Keep this diagnostic path visible in future MIDI UI changes.
- Live Notes:
  - `LiveTabV2` has a `Notes` toggle beside `Preview`.
  - Notes panel opens on the right and persists globally in localStorage under `web-title-pro.liveNotes`; it is not tied to output or selected data source.
  - Notes open/closed toggle state persists in `web-title-pro.liveNotesOpen`, so switching away from Live and returning keeps the panel exactly as the button state says.
  - Notes editor is `contentEditable`, not `textarea`; saved shape supports `{ html, text }` and migrates old plain-text notes.
  - Formatting applies to the selected text fragment, not the whole note.
  - Supported formatting: bold, italic, font size, text color, background color.
  - Pasted rich text is normalized through `text/plain` and inserted with the default notes styling, so text from spreadsheets/browsers does not bring external fonts, colors, or broken bold/italic state.
  - Color UI has two buttons: `Text` and `Fill`; `Fill` uses a native color input over the styled button so Electron opens the picker reliably.
  - Color application listens to both `input` and `change` and uses a short debounce to prevent freezes while dragging through the native palette.
  - `Clear` background is exposed from the `Fill` control, positioned beside it so the native palette does not cover the action, and preserves selection for the next formatting command.
  - Notes panel width is resizable from its left splitter, persisted in `web-title-pro.liveNotesWidth`, clamped to 260-620 px.
- Release `v0.4.7`:
  - Includes MIDI/Akai connection hardening, global Live Notes storage, and Data `Source Rows` textarea auto-grow without native manual resize.
  - Final `WebTitlePro-0.4.7.exe` and stable `WebTitlePro.exe` hashes match: `23c4e770f871edb4ef2343c08da4b1f3e37678a5fe8defd9e8dc3298e860396f`.
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
- Live Data Source:
  - Applying another source row no longer rewrites a running linked timer. Timer values continue independently from the currently selected/output row.
  - Local text/imported source rows can be reordered by dragging the row handle; remote Google/Yandex-style sources stay locked to upstream order.
- Config output/title mapping:
  - Adding a new title no longer auto-selects it globally.
  - New outputs start without a selected title, and existing output-to-title assignments are preserved when titles or outputs are added.
- Updater:
  - Default update channel is `stable`.
  - `v0.4.4` adds validation for partial downloads: response `content-length`, GitHub asset size, and Windows PE signature are checked before the app quits for install.
  - The PowerShell helper also checks source/target size before replacing `WebTitlePro.exe`; this prevents a truncated `.download` from silently replacing the launcher.
  - `v0.4.5` updates both `WebTitlePro.exe` and the launched versioned portable file (`WebTitlePro-<version>.exe`) when they are different, so manually reopening the old file does not relaunch the old version.
  - `v0.4.6` updater hardening makes the secondary launched versioned file required when detected. If it cannot be replaced, the update fails visibly instead of silently leaving the old launcher in place.
  - `v0.4.6` also forces the update progress window visible/focused after confirmation and shows a short handoff status before the app quits.
  - `v0.4.6` writes the VBS launcher as UTF-16LE with BOM. This fixes non-Latin portable paths such as `F:\тест`; ASCII VBS corrupted that path and made the helper copy files into the wrong folder.
  - `v0.4.6` update quit explicitly destroys app windows and falls back to `app.exit(0)` so the helper does not wait forever when a modal/native dialog prevents normal `app.quit()` from closing the main window.
  - `v0.4.6` status window extracts the app icon from the target exe and closes if its state file disappears after progress was already observed. Startup cleanup only deletes updater scratch files older than 15 minutes so it does not race the active status window.
  - `v0.4.6` status window stores WinForms timer state in PowerShell script-scope, closes after `done`, and removes its own `.ps1/.vbs/.json/.log` scratch files after a successful update.
  - `v0.4.6` normalizes stale update state on restart: if current app version is already the latest release, cached `available: true` is reported as `up-to-date`.
  - E2E check on 2026-05-27: fixed local `0.4.5` in `F:\тест` updated to GitHub `v0.4.6`, replaced both `WebTitlePro.exe` and `WebTitlePro-0.4.5.exe`, restarted as `0.4.6`, status helper closed, updater scratch was removed, and reopening the same `WebTitlePro-0.4.5.exe` stayed on `0.4.6` with `up-to-date`.
  - GitHub cleanup on 2026-05-27 removed the temporary updater test release/tag `v0.4.6` and stale tags `v0.4.7`, `v0.4.5-test.1` before publishing the final `v0.4.6`.
  - If `0.4.2` or `0.4.3` already replaced `WebTitlePro.exe` with a partial file, the user must download a fresh portable `.exe` manually once because older updater code cannot be patched retroactively.

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
  - Current UI smoke covers Notes open-state persistence, selected-text rich formatting, color application, and Notes panel resize.
  - UI smoke covers external rich-text paste normalization in Notes and local Data source row reordering.
  - Program-state tests cover stable output-to-title assignments when adding titles and outputs.
  - Add Title modal styling is covered: segmented mode switch, vMix accent, hidden native file input, styled upload picker.
  - Bundle tests cover custom template inclusion, zip-slip rejection, project summary counts, local/vMix title preservation, data sources, vMix discovered input export, keyboard/global shortcuts, and MIDI bindings.
  - Updater tests: `auto-updater.test.js` (numeric version compare, network-error classification, missing-manifest detection, legacy portable scratch cleanup) and `updates.test.js` (server-side release selection used by the browser build). The 0.4.x portable-updater tests were removed with the portable updater in 0.5.0.
  - Playwright also covers: Companion card and per-command Companion fields, notifications modes, file shortcuts, Config rename/markers, Live column resize, row highlight following externally stepped rows.
  - MIDI regression tests cover name/id/index input opening, missing devices, open timeout, JZZ device-change auto-refresh, Learn, CC faders, and value rules.
- `dev:server` uses a narrowed nodemon watch (`server`, `package.json`) so Playwright `test-results/`, Vite build output, and local files do not restart the backend during UI tests.
- Companion module: `tests/companion-module.test.js` (choices, variables, presets), `tests/companion-installer.test.js` (install / restart prompt / live reload / startup sync on temp dirs); Playwright covers the Integrations card and the per-command Companion fields.
- Desktop flows (save/open/recent, dialogs, updater) are verified ad hoc with Playwright `_electron` and an isolated `--user-data-dir`, replacing native `dialog.*` in the main process.
- Full verification:
  - `npm.cmd run test:all`

## Known Limitations

- vMix ON AIR is still not read back from vMix; UI reflects the last command issued by this app.
- MIDI action dispatch supports `noteon` and positive-value `cc`; CC bindings can further restrict `value` through `any` / `eq` / `gte` / `lte`.
- GitHub Releases API is queried without a token and may hit the public 60 req/h IP limit.
- Browser/plugin automation may not be available in every Codex session; project-level Playwright smoke is the reliable fallback.
