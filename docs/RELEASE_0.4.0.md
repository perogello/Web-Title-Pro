# Web Title Pro 0.4.0

Major UI redesign + stability pass.

## UI / UX redesign

- Compact one-row top bar (LIVE / CONFIG / DATA / TIMERS / SETTINGS + OFFLINE/VMIX/MIDI/YANDEX chips).
- Desktop window is frameless: native Windows title bar is replaced by in-app minimize / maximize / close controls and a draggable top-bar region.
- OutputsSidebar on the left for LIVE / CONFIG / DATA / TIMERS — resizable, persisted width, ON AIR markers + per-output play/stop buttons.
- Brand-new LIVE tab (`v2/LiveTabV2`):
  - Excel-style column resize with full-height 20 px hit zone, neighbour widths snapshotted before drag.
  - Per-row timer stack with up/down arrow controls and explicit play/pause/reset state colors (green/idle, warn/running, red/expired with pulse).
  - Selected row gets a pale-red background.
  - `Notes` toggle opens a right-side rich-text notes panel. Notes persist per output/source in localStorage, selected text can be formatted independently (bold, italic, font size, text color, background color), color controls are simplified to `Text` / `Fill`, and the panel width is resizable with a persisted splitter.
- Brand-new CONFIG tab (`v2/ConfigTab`):
  - Outputs + Titles + Mapping on a single screen.
  - Render and Preview URL chips appear under the selected output (no more digging into Settings).
  - Local and vMix titles have distinct visual treatment; vMix entries use a blue accent and local entries remain neutral.
- PreviewOverlay reused for floating Selected/All-outputs preview windows.
- SETTINGS rebuilt as a vertical sub-nav (4 sections):
  - **Outputs** — output cards with name, URL key, render/preview URLs (long URLs now properly clip with ellipsis and don't push cards off-screen).
  - **Controls** — unified binding editor: search box, four collapsible sections (Commands / Outputs / Title entries / Timers), per-action keyboard / MIDI / Companion pills with inline Learn / Clear / Global toggle, MIDI status, and Refresh MIDI.
  - **Integrations** — vMix card (host input + connect/refresh + last error / discovered inputs readout) and Yandex OAuth.
  - **System** — updates, about, and the Control UI URL.
- Active sub-nav section now has a red accent bar + soft red tint (was almost invisible before).

## Stability fixes

- **Dirty-detection JSON.stringify storm**: removed `valueMs` / `running` / `startedAt` / program runtime fields from the project-dirty signature. Before: a full project tree was JSON-stringified ~10 times per second while a timer was running. Now: the signature is stable across timer ticks.
- **WebSocket reconnect timer leak**: the close handler now clears any in-flight reconnect timeout before scheduling a new one, preventing piled-up reconnect attempts on rapid close/error sequences.
- **Unmount cleanup**: feedback, debounced-save, and timer-reminder `setTimeout`s are now all cleared when `ControlShell` unmounts, so they can't fire on a dead tree and crash hot-reload / window close.
- **Global shortcut listener thrash**: `useGlobalShortcuts` now attaches its keyboard / mouse listeners exactly once and reads state via a ref. Before: the effect's `deps` array recomputed several `JSON.stringify` calls every render and could resubscribe listeners on every 100 ms snapshot tick.
- **WebSocket timer payload**: `timer-tick` now sends only `{ serverTime, timers }` instead of the full project snapshot, removing the previous 10 Hz full-state broadcast.

## Bug fixes

- **Render preview said “No URL”**: `PreviewOverlay` was reading non-existent `renderUrl` / `previewUrl` fields on the output objects. It now receives the computed `outputRenderTargets` map and resolves URLs by output id, so local-title previews actually render.
- **Bitfocus Companion chip never showed**: kebab-case Bitfocus action IDs (`select-output-<id>`, `previous-title`, `timer-toggle-<id>`) didn't match the camelCase keys the UI used (`selectOutput:<id>`, `previousTitle`, `timerToggle:<id>`). The lookup now indexes Bitfocus actions under both spellings, and the 🔗 pill surfaces correctly on every row.
- **CONFIG icons broken / delete not red**: rename and delete icon buttons were getting clobbered by the legacy `.shell-v2 .content-v2-inner button` override. Renamed to `cfg-icon-btn-v2` (the `-v2` suffix opts out of the legacy cascade) with a proper `is-danger` modifier.
- **Settings → Outputs cards overflowed the right edge**: long render/preview URLs forced grid tracks past their container. Cards now have `min-width: 0`, and `<code>` URL chips truncate with ellipsis.
- **Data row selection renamed titles**: applying a Live Data Source row now updates only title fields. The title name stays stable and field data remains separate.
- **vMix input label used long keys as numbers**: new vMix titles store `vmixInputNumber`, and existing entries are enriched from current vMix state when possible. Config and output cards no longer display UUID-like keys as `Input #...`.
- **MIDI Learn action mismatch**: Controls UI uses `selectOutput:...`, `selectEntry:...`, `timerToggle:...`, `previousTitle`; backend now accepts these IDs and maps them to dispatch actions. The Controls tab also reads MIDI bindings from the backend array shape correctly.
- **Dead modules removed**: `tabs/LiveTab.jsx`, `tabs/MappingTab.jsx`, `PreviewTitlePanel`, `TitlesPanel`, `ProjectPanel`, `MidiSettingsTab`, `BitfocusSettingsTab`, `TestSettingsTab` (~1 000 lines).

## Refactor

- Pure helpers extracted from `ControlShell.jsx` into `client/src/control-shell/lib/`:
  - `timer-utils.js` — format/segment/changeTimerSegment, status, linked-id helpers.
  - `entry-utils.js` — field maps, persist shapes, dirty shapes, vmix-input config, font picker, persisted entry/timer, signature builder, localStorage column-width helpers.
  - `use-feedback.js` — toast hook with auto-clear + unmount safety.
  - `use-project-dirty.js` — baseline + dirty flag + `markClean()`.
- Total source went from 9 273 lines to 8 449 (–824). ControlShell.jsx dropped from 4 313 to ~3 894.
- CSS is split into `client/src/styles/*.css` and imported through `client/src/styles/index.css`.

## Testing

- Unit/regression tests: `npm run test:unit` (alias: `npm test`).
- Production build: `npm run build`.
- Browser smoke tests: `npm run test:ui`.
  - Uses Playwright Chromium.
  - Installs browser binaries with `npm run test:ui:install`.
  - Automatically starts `npm run dev` through Playwright `webServer`.
- Full local verification: `npm run test:all`.
  - UI smoke covers Notes open, rich-text selected-fragment formatting, and Notes panel resize.

## Version

`package.json` → `0.4.0`.

## Known limitations

- vMix ON AIR isn't read back from vMix (only the last command issued from this app is shown).
- MIDI bindings only react to `noteon` and `cc` triggers.
- GitHub Releases API is queried without a token (60 req/h IP limit).
