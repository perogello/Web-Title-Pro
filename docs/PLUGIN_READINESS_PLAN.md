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
- **[done] Phase 2 — unified command bus.** `POST /api/command { actionId }`
  (`server/state/command-bus.js`) turns one canonical action id into one store
  operation. It is now the single dispatch path for the keyboard, MIDI,
  Companion and plugins. Server-side row stepping (`store.stepOutputRow` +
  ported `field-mapping.js`) fans out to synced outputs, so **MIDI / Companion /
  plugins step data rows and drive per-output timers** just like the panel.
  - The keyboard routes titleIn/out, preview in/out, timer and panic through
    the bus; row stepping keeps the richer client flow so the on-air reminder
    still fires (per-output timers resolve the current timer client-side, then
    run through the bus by explicit timer id).
  - Server-side row stepping needs an initial applied row for source context
    (set by applying a row in the UI first).
  - Legacy verb routes (`/commands/:action`, `/program/live`,
    `/timers/:id/toggle`) are marked `@deprecated` but kept working for existing
    Companion/script setups — removal needs a deprecation cycle, not a hard cut.
- **[done] Phase 3 (part 1) — versioned command contract.** A published,
  versioned command surface (`server/state/command-catalog.js`):
  `GET /api/command/catalog` returns the API version (`{ major, minor }`), the
  action-id grammar, the command vocabulary with descriptions, and every
  concrete action id valid against the live store right now. `/api/app/meta`
  carries `commandApiVersion` so a client can check compatibility before it
  binds. This is the stable surface plugins/Companion program to.
  - **[todo, deliberate]** Hard removal of the legacy verb routes is *not* done:
    it needs a deprecation cycle (existing Companion buttons would break), so
    they stay `@deprecated` until a version that announces their removal.
- **[done] Phase 4 — capability model & tokens.** `server/state/access.js`
  defines two capabilities (`state:read`, `command:send`), token generation,
  and grant normalisation. The store owns a persisted grant registry
  (`createAccessGrant` returns the raw token *once*; `listAccessGrants` never
  leaks it; `resolveGrantByToken` / `grantHasCapability` for the future bridge).
  Grants are **app-level**: kept out of the WS snapshot (never broadcast),
  stripped from project export, and never adopted from an imported project.
  Operator management over loopback: `GET/POST/PATCH/DELETE /api/access/grants`,
  `GET /api/access/capabilities`.
  - The loopback API stays open for the operator's own panel and existing
    Companion/MIDI — capabilities gate the **plugin bridge** (Phase 5), not the
    trusted local client. Enforcement lives at the bridge, added with the host.
- **[todo]** Phase 5 below (plugin host — needs a UX/security checkpoint first).

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
- **[done]** Version the API (`apiVersion`, compatibility promise, published
  action-id catalogue) — see `server/state/command-catalog.js`,
  `GET /api/command/catalog`, `commandApiVersion` on `/api/app/meta`.
- **[todo]** Remove legacy command routes; converge on the command bus. Held
  back for a deprecation cycle so existing Companion setups keep working.

### Phase 4 — Permissions & auth  *(done)*
- **[done]** Capability model per client/plugin: read-only snapshot vs command
  rights (`state:read` / `command:send`) — `server/state/access.js`.
- **[done]** Local token so external surfaces/plugins must be granted access;
  grant registry in the store, managed via `/api/access/grants`. Tokens never
  broadcast, never exported. Enforcement is wired in with the Phase 5 bridge.

### Phase 5 — Plugin host  *(implemented — POC verified end to end)*

**Status:** built and verified. A reference plugin (`plugins/rundown-remote`)
discovers, enables from Settings › Plugins, mounts on Live in a sandboxed
iframe, receives the snapshot over the bridge, and drives the command bus from
inside the sandbox — proven by an isolated Playwright e2e (`tests/ui/plugins.spec.js`)
and an HTTP smoke of the whole plugin API. What exists now:
- **Discovery/serving:** `server/plugins/plugin-service.js` scans
  `plugins/` + `storage/plugins/` for a `plugin.json` (name, entry, requested
  capabilities, mount); assets at `/plugin-assets/<source>/<slug>`.
- **Registry + grants:** store owns per-plugin enabled/settings (app-level, out
  of snapshot/export); enable mints a Phase-4 grant scoped to the manifest's
  capabilities, disable revokes it. Routes: `GET /api/plugins`,
  `POST /api/plugins/:id/enable|disable`, `PUT .../settings`, `GET .../token`.
- **UI:** Settings › Plugins (list, enable/disable, capabilities/mount).
- **Bridge:** `client/src/control-shell/PluginHost.jsx` renders enabled plugins
  in `<iframe sandbox="allow-scripts">` and brokers `postMessage`: snapshot only
  to `state:read` grants, commands only to `command:send` grants; frames matched
  by live `contentWindow`.

**Known boundary (honest):** the loopback API stays open, so the bridge is a
*cooperative* contract + a disable switch, not a hard jail — a
malicious-by-design plugin could `fetch` `/api/command` directly instead of
using the bridge. A hard boundary would require origin-scoped token enforcement
on the API (breaks the operator's own open client) or serving plugins from a
separate CORS-blocked origin. Fine for trusted/in-house plugins (SPX's model
too); revisit if untrusted third-party plugins become a goal.

**Done since:** per-plugin settings — plugins declare a settings schema in the
manifest; Settings › Plugins renders a form and the host pushes changes live to
the running iframe over the bridge (`PUT /api/plugins/:id/settings`).

**Remaining polish (not blockers):** custom-plugin install/remove flow (folder
import like templates), `tab`-type mount rendering (only `panel` is wired), and
hard-removing the deprecated legacy routes (needs a deprecation cycle).

_Original design intent, now realised:_

**Management UI — decided:** a new **"Plugins"** item in **Settings**, showing a
list of installed plugins with **enable / disable** and **per-plugin settings**.
Management lives in settings; a plugin's own surface is separate (below).

**Mount point — decided:** the *plugin decides where and how it runs* via its
manifest. The host does not hard-code a single mount; the manifest declares the
mount (e.g. `mount: "tab" | "panel"` + where), and the host honours it. Settings
only enables/configures; the manifest drives placement.

- `plugins/` folder + manifest (`plugin.json`: name, version, entry html,
  requested capabilities, **mount declaration**).
- Discovery on startup (mirrors the custom-templates scan).
- Sandbox: plugin runs in `<iframe sandbox>` with no Node; all actions go
  through a `postMessage` bridge → the command bus + scoped WS, gated by the
  Phase 4 capability grant (this is where grant enforcement is wired in).
- Lifecycle: enable / disable / remove from the Settings › Plugins list; a
  plugin error is isolated from the main window.
- Build order suggestion: bridge + one built-in POC plugin in an `<iframe>`
  first (validate WS-in + command-out end to end under a grant), then the
  Settings › Plugins list and manifest-driven mount, then folder discovery.

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
