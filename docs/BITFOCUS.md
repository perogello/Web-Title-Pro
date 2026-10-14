# Bitfocus Companion integration

> Русская версия: [BITFOCUS_RU.md](BITFOCUS_RU.md)

Two ways to drive Web Title Pro (WTP) from Companion:

1. **The Web Title Pro module** (recommended, since 0.5.2) — buttons with live
   on-air feedback, variables and ready-made presets.
2. **Companion's built-in Generic HTTP module** — no extra module, but no
   button feedback.

Both fire the same commands (`POST /api/command`, see [Commands](#commands)).

## 1. Web Title Pro module (recommended)

Works with **Companion 3.5 and newer** (tested on 5.1). Everything lives in
**Settings → Integrations → Bitfocus Companion module** (also reachable from
the "Модуль Companion…" button in Settings → Controls).

### Install

| Situation | How |
|---|---|
| Companion on **this** computer | **Install into Companion** button (desktop app only). It copies the module into Companion's developer modules folder and turns developer modules on. If Companion is running and that needs a restart, the app asks first, then closes and relaunches Companion — buttons pause for a few seconds, so don't do it on air. If a developer folder is already set up, Companion picks the module up live without a restart. |
| Manually, developer mode | Companion launcher → cog (top right) → *Developer* → *Select* the folder shown as **Developer path** in the card (the one that *contains* the `web-title-pro` folder) → *Enable Developer Modules* → *Launch GUI*. |
| Companion on **another** computer, or no developer mode | **Download** the `.tgz` from the card → Companion web UI → *Modules* → *Import module package* → pick the file. |

### Add the connection

*Connections* → *Add connection* → search **Web Title Pro** → set:

| Field | Value |
|---|---|
| Host | `127.0.0.1` if Companion runs on the WTP computer, otherwise that computer's IP |
| Port | `4000` |

The connection turns green when it reaches WTP. Then open its **Presets** tab
and drag buttons onto a page.

### What you get

**Presets**

- *Output #N* — a toggle button (shows the output name and the first field of the
  selected title, red while on air) plus IN, OUT, PVW IN/OUT, ROW ▲/▼ and the row
  timer start/stop/reset.
- *Titles → #N* — one button per title that puts it on that output (blue while
  selected).
- *Timers* — start/stop with the live time (colour follows the timer's colour
  rules) and reset.
- *Global* — panic (hide every output) and an on-air counter.

**Actions**

| Action | Options |
|---|---|
| Output: command | Output, Command (Title IN/OUT, Preview IN/OUT, Row ▲/▼, row timer start/stop/reset) |
| Output: toggle title on/off air | Output |
| Output: select title | Output, Title, "Show it on air right away" |
| Timer: start / stop / reset | Timer, Command |
| Timer: start / stop toggle | Timer |
| Panic: hide every output | — |
| Any Web Title Pro command (incl. plugins) | any command id, incl. plugin commands and overlays |

**Feedbacks:** title on air · title on the preview bus · this title selected ·
any output on air · timer running · timer colour (from WTP colour rules) ·
connected.

**Variables** (outputs are numbered as in the WTP Config tab: `o1`, `o2`, …;
timers `t1`, `t2`, …):

| Variable | Meaning |
|---|---|
| `o1_name` | output name |
| `o1_title` | selected title |
| `o1_value1`, `o1_value2` | first / second field of the selected title |
| `o1_on_air`, `o1_preview` | `ON` / `OFF` |
| `o1_row` | applied data row number |
| `t1_name`, `t1_time`, `t1_running` | timer name, current time, `ON` / `OFF` |
| `on_air_count`, `connected` | outputs on air; `YES` / `NO` |
| `module_version`, `module_update` | this module's version; the newer version WTP ships (empty = up to date) |

### Updates and versions

The module's version is the app's version, and the module ships inside the app:

- **Installed with the button (this computer):** updated automatically — after
  a WTP update the next start copies the new module in and Companion reloads it.
- **Imported `.tgz` (another computer):** re-import after updating WTP. When the
  versions differ, the connection turns yellow with
  *"Module vX, Web Title Pro ships vY — update: …"*.

The card in Settings → Integrations shows the installed and bundled versions.

Module sources: `companion-module/`; build: `npm run build:companion` (also run
by `npm run package:win`).

## 2. Generic HTTP (no module)

1. *Connections* → *Add connection* → **Generic HTTP**. Leave **Base URL** empty.
2. For every button add the **POST** action and fill its fields:

| Generic HTTP field | Value |
|---|---|
| URL | `http://<wtp-host>:4000/api/command` (`127.0.0.1` on the same computer) |
| Body | `{"actionId":"<command>"}` — command ids below |
| header input(JSON) | leave empty |
| Content Type | `application/json` (the default) |

> **Settings → Controls** in WTP lists, for every command, the exact values for
> each field (and the module action + options) with a **Copy** button per value.

WTP must be running when Companion fires the action, otherwise Companion
reports `ECONNREFUSED`. Generic HTTP gives no on-air button colours — use the
module for that.

## Commands

All commands are `POST http://<wtp-host>:4000/api/command` with body
`{ "actionId": "…" }`. The full live list (with ids for the current project) is
at `GET /api/command/catalog`.

### Per output

`<id>` is the output id (default `output-main`; see `GET /api/state →
outputs[].id`).

| Command         | actionId                  |
|-----------------|---------------------------|
| Title IN        | `output:<id>:titleIn`     |
| Title OUT       | `output:<id>:titleOut`    |
| Preview IN      | `output:<id>:previewIn`   |
| Preview OUT     | `output:<id>:previewOut`  |
| Row ▲ (prev)    | `output:<id>:rowPrev`     |
| Row ▼ (next)    | `output:<id>:rowNext`     |
| Row timer Start | `output:<id>:timerStart`  |
| Row timer Stop  | `output:<id>:timerStop`   |
| Row timer Reset | `output:<id>:timerReset`  |

`titleIn` shows the output's currently selected title. `rowNext` / `rowPrev`
step the data-source rows on that output (down = further, up = higher) and, if
the title is on air, update it immediately.

### Per timer

`<id>` is the timer id (see `GET /api/state → timers[].id`).

| Command | actionId            |
|---------|---------------------|
| Start   | `timer:<id>:start`  |
| Stop    | `timer:<id>:stop`   |
| Reset   | `timer:<id>:reset`  |

### Global

| Command                 | actionId               |
|-------------------------|------------------------|
| All outputs OUT (panic) | `global:allOutputsOut` |

Plugin commands (`plugin:<pluginId>:<command>`) run inside the plugin in the
control panel and can't be fired from Companion; plugin overlays can
(`overlay:<pluginId>:in|out`, via the module's "Any command" action).

## Low-level REST routes (if needed)

`/api/command` covers every button. Stable raw routes:
`POST /api/program/show|update|hide`, `POST /api/preview/show|hide`,
`POST /api/timers/<id>/start|stop|reset`, `POST /api/outputs/<id>/select`,
`POST /api/entries/<id>/select`. Live state: `GET /api/state` and the WebSocket
`ws://<wtp-host>:4000/ws` (full snapshot on change + timer ticks), which the
module uses.

## Quickstart curl snippets

```bash
# Replace 127.0.0.1 with the WTP host if needed.
CMD=http://127.0.0.1:4000/api/command
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:titleIn"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:titleOut"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:rowNext"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"global:allOutputsOut"}'
```

## Known limitations

- **WTP does not read vMix's real state.** ON AIR reflects the **last command**
  sent through WTP; a title toggled directly in vMix is not noticed.
- WTP listens on `0.0.0.0:4000` without authentication. For Companion on another
  computer port 4000 must be reachable (firewall); on untrusted networks isolate
  it (dedicated VLAN).
