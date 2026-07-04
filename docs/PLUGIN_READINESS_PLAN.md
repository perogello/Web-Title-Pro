# Plugin System — Readiness & Roadmap

Status: **in progress.** Phase 1 (data → server) and the unified command bus
(start of Phase 2) are implemented and tested; the plugin host itself is not
built yet. This document is the agreed direction for turning Web Title Pro into
a host that third-party (or in-house) plugins can extend, without destabilising
live playout.

## Progress

- **[done] Phase 1 — data on the server.** The data-source library lives in the
  store (normalised, persisted, in the snapshot) with `GET/PUT /api/sources`.
  The client hydrates from the server, migrates legacy `localStorage` once, and
  mirrors edits. Each output records its applied data row server-side
  (`POST /api/outputs/:id/applied-row`); the server resolves an output's current
  row and current timer.
- **[done] Phase 2 (start) — unified command bus.** `POST /api/command
  { actionId }` (`server/state/command-bus.js`) turns one canonical action id
  into one store operation. Server-side row stepping (`store.stepOutputRow` +
  ported `field-mapping.js`) means **MIDI / Companion / plugins can now step
  data rows and drive per-output timers** — previously keyboard-only. MIDI runs
  through the same bus.
  - Known trade-off: the keyboard path still uses the richer client
    `applySourceRow` (synced-output fan-out + reminders); the server bus applies
    to a single output. Full unification is the rest of Phase 2.
  - Server-side row stepping needs an initial applied row for source context
    (set by applying a row in the UI first).
- **[todo]** finish Phase 2 (move the rest of dispatch server-side / unify the
  keyboard path), then Phases 3–5 below.

"Server" throughout means the **in-process local backend** (Express on
`localhost:4000`, bundled inside the portable `.exe`). Nothing goes to the cloud;
data never leaves the machine.

---

## 1. Goal

Let plugins add panels and integrations **around** the app through a stable,
versioned API — without editing core code and without a plugin crash being able
to take down the show.

SPX-style model: a plugin is a small sandboxed web app (HTML/JS) that talks to
the existing REST + WebSocket API through a permissioned bridge. No third-party
code runs in the main process for the first milestone.

---

## 2. Where we are today

**Good foundation already in place**
- ~58 REST routes + a WebSocket hub (full snapshot on change, sliced
  `timer-tick` at 10 Hz).
- Canonical command ids from the shortcut redesign
  (`output:<id>:titleIn`, `timer:<id>:start`, `global:allOutputsOut`) — this is
  effectively a **command bus** and the natural plugin command surface.
- `sources/fetch-remote` (Google Sheets / Yandex) is already server-side.
- Project export/bundle already serialises `sources`.

**Blockers (must fix before a plugin system is stable)**
1. **Data lives in the browser.** The data-source library (rows for lower
   thirds) is stored in one tab's `localStorage`
   (`web-title-pro-source-library`). The server cannot see or drive it — MIDI
   row-stepping already can't work because of this. A plugin, a second panel,
   MIDI, or Companion all need server-owned data.
2. **No single canonical command entry point.** Commands are split across
   `/program/*`, `/commands/:action`, `/preview/*`, `/timers/:id/*`, and part of
   the logic (row stepping, an output's "current timer") lives only in React
   (`dispatchAction` in `ControlShell`). Plugins can't invoke what only exists
   in the UI.
3. **Business logic trapped in the `ControlShell` monolith** (~3.5k lines):
   `applySourceRow`, `dispatchAction`, timer resolution, field application. Not
   reusable, hard to test in isolation.

**Cruft to clear (so the plugin contract is coherent)**
- Legacy command routes: `/commands/:action` still carries `select-output`,
  `next-title`, `previous-title`; `/program/live` (the `live` command was
  removed); `/timers/:id/toggle` duplicates start/stop.
- No API versioning — routes and action ids change freely.
- No auth/permission model — the API is wide open on localhost; "can send a
  command" == "can take you to air".

---

## 3. Roadmap (each phase is useful on its own, even without plugins)

### Phase 1 — Source library → server  *(the biggest blocker, do first)*
- Move `sources` into `store.js` state (the normalisation in
  `client/src/source-library.js` is framework-agnostic and ports almost as-is).
- Persist in `state.json` (atomic write already exists) + keep bundle export.
- REST CRUD: create/update/delete/duplicate/reorder rows & sources; `apply-row`.
- Sources join the WS snapshot so every client/plugin/MIDI/Companion sees them.
- Move `activeSourceRows` / `activeTimerRows` (which row/timer is live per
  output) server-side so "current row/timer" is shared, not tab-local.
- **One-time migration**: on first launch of the new version, import existing
  `localStorage` into the server, then treat `localStorage` as a deprecated
  backup. Must not lose the operator's rows.
- Payoff without plugins: fixes MIDI row-stepping, enables a second control
  panel, makes the logic testable.

### Phase 2 — Unified command bus
- One endpoint: `POST /api/command { actionId }`, server-side, doing exactly
  what `dispatchAction` does today (needs Phase 1 for row stepping).
- Keyboard, MIDI, Companion, and plugins all go through the same door.
- Extract command/business logic out of `ControlShell` into a shared layer
  (ideally server-side). Component only renders + calls commands.

### Phase 3 — Contract hygiene
- Remove legacy command routes; converge on the command bus.
- Version the API (`apiVersion`, compatibility promise, published action-id
  catalogue).

### Phase 4 — Permissions & auth
- Capability model per client/plugin: read-only snapshot vs command rights.
- Local token so external surfaces/plugins must be granted access.

### Phase 5 — Plugin host  *(only after 1–4)*
- `plugins/` folder + manifest (`plugin.json`: name, version, entry html,
  requested capabilities, mount point).
- Discovery on startup (mirrors the custom-templates scan).
- Sandbox: plugin runs in `<iframe sandbox>` with no Node; all actions go
  through a `postMessage` bridge → the command bus + scoped WS, gated by the
  capability grant.
- Lifecycle: enable / disable / remove; a plugin error is isolated from the
  main window.

---

## 4. Plugin ideas (once the host exists)

**Panel plugins (Phase 5, realistic):** sports scores, moderated
social-media lower thirds, weather/rates/election feeds, sponsor rotation,
teleprompter, rundown import for a specific venue/format, all-outputs
multiview dashboard.

**Would need server/protocol plugins (later, higher risk):** OSC, direct
Stream Deck, Ember+, NDI tally, CasparCG bridge, PTZ control — these add new
protocols and require code in the backend/main process.

---

## 5. Recommendation

Do **not** start with the plugin host. Start with **Phase 1 (data → server)** —
without it any plugin system is half-working (exactly like MIDI row-stepping
today). Phases 1–3 are worth doing regardless of plugins: they de-risk the
monolith, fix existing bugs, and make the system testable. Plugins then become
a natural extension of an already-clean command bus.
