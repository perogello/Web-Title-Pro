# Project Memory

Last updated: 2026-05-29

## Current Branch Context

- Active release branch: `main`.
- Current release target: final `v0.4.8`.
- Current local build output: `release/WebTitlePro-0.4.8.exe` and stable launcher `release/WebTitlePro.exe`.
- Final `WebTitlePro-0.4.8.exe` SHA-256: `f4c8299ab7b399e45a21edff6cac7c45c54022cea46e8fdda030c3cb37feee8b`.
- GitHub branches:
- `origin/main` is the release target for the current `0.4.x` line.
- `origin/staging/0.4.0` was used for prerelease work and has been retired as the primary release target.
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
  - Updater tests cover stable/prerelease release selection, incomplete download streams, truncated executable packages, invalid executable signatures, required secondary launcher replacement, generated PowerShell syntax, script-scoped status window state, stale update-state normalization, and non-Latin launcher paths.
  - MIDI regression tests cover name/id/index input opening, missing devices, open timeout, JZZ device-change auto-refresh, Learn, CC faders, and value rules.
- `dev:server` uses a narrowed nodemon watch (`server`, `package.json`) so Playwright `test-results/`, Vite build output, and local files do not restart the backend during UI tests.
- Full verification:
  - `npm.cmd run test:all`

## Known Limitations

- vMix ON AIR is still not read back from vMix; UI reflects the last command issued by this app.
- MIDI action dispatch supports `noteon` and positive-value `cc`; CC bindings can further restrict `value` through `any` / `eq` / `gte` / `lte`.
- GitHub Releases API is queried without a token and may hit the public 60 req/h IP limit.
- Browser/plugin automation may not be available in every Codex session; project-level Playwright smoke is the reliable fallback.
