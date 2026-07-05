# Bitfocus Companion integration

> Русская версия: [BITFOCUS_RU.md](BITFOCUS_RU.md)

Web Title Pro talks to Companion through its **Generic HTTP** module — no custom
plugin install is required. Every button hits **one endpoint**; only the
`actionId` in the request body changes.

## Setup (5 minutes)

1. In Companion, add a new connection of type **generic-http**.
2. Set the base host to `http://<wtp-machine-ip>:4000` (use `127.0.0.1` if WTP
   and Companion run on the same machine).
3. For every button, add an **HTTP POST** action:
   - **URL:** `http://<wtp-host>:4000/api/command`
   - **Header:** `Content-Type: application/json`
   - **Body (JSON):** `{ "actionId": "<command>" }` — the id from the tables below.

> WTP must be running when Companion fires the action — otherwise Companion
> shows an "ECONNREFUSED" error.

> Ready-made URL + payload pairs for every button can be copied straight from the
> app: **Settings → Controls**, Companion block — "Copy URL" / "Copy payload".

## Commands

All are `POST http://<wtp-host>:4000/api/command` with body `{ "actionId": "…" }`.

### Per output

`<id>` is the output id (default `output-main`; visible in Settings and in
`GET /api/render/state → outputs[].id`).

| Button          | actionId                  |
|-----------------|---------------------------|
| TITLE IN        | `output:<id>:titleIn`     |
| TITLE OUT       | `output:<id>:titleOut`    |
| PREVIEW IN      | `output:<id>:previewIn`   |
| PREVIEW OUT     | `output:<id>:previewOut`  |
| ROW ▲ (prev)    | `output:<id>:rowPrev`     |
| ROW ▼ (next)    | `output:<id>:rowNext`     |
| Row timer Start | `output:<id>:timerStart`  |
| Row timer Stop  | `output:<id>:timerStop`   |
| Row timer Reset | `output:<id>:timerReset`  |

`titleIn` shows the output's currently selected title. `rowNext`/`rowPrev` step
the data-source rows on that output (down = further, up = higher) and, if the
title is on air, update it immediately.

### Per timer

`<id>` is the timer id (default `main`; from `GET /api/render/state → timers[].id`).

| Button | actionId            |
|--------|---------------------|
| Start  | `timer:<id>:start`  |
| Stop   | `timer:<id>:stop`   |
| Reset  | `timer:<id>:reset`  |

### Global

| Button                  | actionId               |
|-------------------------|------------------------|
| ALL OUTPUTS OUT (panic) | `global:allOutputsOut` |

## Low-level REST routes (if needed)

The unified `/api/command` covers every button. If you need raw access, these
stay stable: `POST /api/program/show|update|hide`,
`POST /api/preview/show|hide`, `POST /api/timers/<id>/start|stop|reset`,
`POST /api/outputs/<id>/select`, `POST /api/entries/<id>/select`.

The legacy verbs `/api/commands/:action`, `/api/program/live` and
`/api/timers/:id/toggle` have been **removed** — use `/api/command`.

## Feedback / state

Companion's Generic HTTP module supports HTTP-poll feedbacks. Point it at
`GET /api/render/state` and parse the JSON to drive button colors:

- `outputs[i].program.visible === true` → ON AIR (red tone on TITLE OUT)
- `selectedOutput.id` → highlight the current output button
- `timers[i].running === true` → blink the timer Start/Stop button

Poll interval 500–1000 ms is reasonable for a single LAN station.

## Quickstart curl snippets

```bash
# Replace 127.0.0.1 with the WTP host if needed.
CMD=http://127.0.0.1:4000/api/command
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:titleIn"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:titleOut"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:rowNext"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"timer:main:start"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"global:allOutputsOut"}'
```

## Companion preset (documentation example)

Every button shares one URL; only the body differs. Fastest workflow:

1. Make one button in Companion (URL `/api/command`, header
   `Content-Type: application/json`, body `{"actionId":"output:output-main:titleIn"}`).
2. Right-click → Copy. Paste onto the rest of the page.
3. Edit the `actionId` in each body.

```json
{
  "version": "1.0",
  "type": "page",
  "name": "Web Title Pro",
  "note": "Every button: POST http://127.0.0.1:4000/api/command, header Content-Type: application/json, body below.",
  "controls": {
    "0/0": { "label": "TITLE IN",  "body": { "actionId": "output:output-main:titleIn" },  "color": "#5ddb92" },
    "0/1": { "label": "TITLE OUT", "body": { "actionId": "output:output-main:titleOut" }, "color": "#ff5d6d" },
    "0/2": { "label": "PVW IN",    "body": { "actionId": "output:output-main:previewIn" } },
    "0/3": { "label": "ROW ▲",     "body": { "actionId": "output:output-main:rowPrev" } },
    "0/4": { "label": "ROW ▼",     "body": { "actionId": "output:output-main:rowNext" } },
    "1/0": { "label": "TIMER ▶",   "body": { "actionId": "timer:main:start" }, "color": "#5ddb92" },
    "1/1": { "label": "TIMER ■",   "body": { "actionId": "timer:main:stop" } },
    "1/2": { "label": "TIMER ↻",   "body": { "actionId": "timer:main:reset" } },
    "1/4": { "label": "PANIC",     "body": { "actionId": "global:allOutputsOut" }, "color": "#ff5d6d" }
  }
}
```

> The schema above is a documentation example, not a literal Companion export.
> Companion 3's actual page export contains additional plumbing (instance IDs,
> trigger configs).

## Known limitations

- **WTP does not track vMix's real state.** The ON AIR / OFF badge reflects the
  **last command** sent from this app, not the title's actual state in vMix. If
  an operator toggles a title directly in vMix, our UI won't know.
- WTP listens on `0.0.0.0:4000` without authentication. On an open network,
  anyone on the same subnet can POST to /api. On untrusted networks, isolate it
  or use a dedicated VLAN.
