# Bitfocus Companion integration

> Русская версия: [BITFOCUS_RU.md](BITFOCUS_RU.md)

Web Title Pro talks to Companion through its **Generic HTTP** module — no custom
plugin install is required. This document lists every action you can bind to a
Stream Deck button and gives copy-paste configurations.

## Setup (5 minutes)

1. In Companion, add a new connection of type **generic-http**.
2. Set the base host to `http://<wtp-machine-ip>:4000` (use `127.0.0.1` if WTP
   and Companion run on the same machine).
3. For every button you want, add an **HTTP POST** action with the URL from the
   table below. Leave Headers empty unless noted. Body is JSON; leave blank if
   the table does not show a body.

> Tip: the page below works against any vMix machine on the LAN as long as the
> WTP host is reachable. WTP itself must be running when Companion fires the
> action — otherwise Companion will show an "ECONNREFUSED" error.

## Action reference

All URLs are relative to `http://<wtp-host>:4000`.

### Program (TITLE IN / LOAD / TITLE OUT / LIVE)

| Button label | Method | URL                              | Body                       | Notes |
|--------------|--------|----------------------------------|----------------------------|-------|
| TITLE IN     | POST   | `/api/program/show`              | `{}`                       | Same action as the green button. Targets the currently selected entry. |
| LOAD         | POST   | `/api/program/update`            | `{}`                       | Prepares the local title in live without showing it. Disabled for vMix-source titles. |
| TITLE OUT    | POST   | `/api/program/hide`              | `{}`                       | Hides the active title with Transition Out. |
| LIVE         | POST   | `/api/program/live`              | `{}`                       | Pushes draft values to the on-air title (used for live data swaps). |

Optional body fields for all four: `{ "entryId": "<id>", "outputId": "<id>" }` —
override which entry/output to target.

### Title navigation

| Button label   | Method | URL                                     | Body |
|----------------|--------|-----------------------------------------|------|
| TITLE NEXT     | POST   | `/api/commands/next-title`              | `{}` |
| TITLE PREV     | POST   | `/api/commands/previous-title`          | `{}` |

Optionally scope to a specific output with `{ "outputId": "<id>" }`.

### Output selection

| Button label        | Method | URL                                       | Body                       |
|---------------------|--------|-------------------------------------------|----------------------------|
| OUTPUT (named)      | POST   | `/api/outputs/<output-id>/select`         | `{}`                       |
| OUTPUT (generic)    | POST   | `/api/commands/select-output`             | `{ "outputId": "<id>" }`   |

`<output-id>` is visible in the URL bar when you select an output in Settings,
or returned by `GET /api/render/state` under `outputs[].id`.

### Timers

| Action     | Method | URL                                    |
|------------|--------|----------------------------------------|
| Start      | POST   | `/api/timers/<timer-id>/start`         |
| Stop       | POST   | `/api/timers/<timer-id>/stop`          |
| Reset      | POST   | `/api/timers/<timer-id>/reset`         |

Timer ids are returned in the snapshot at `timers[].id`. The default one is
`"main"`.

### Entry selection

| Action          | Method | URL                                   |
|-----------------|--------|---------------------------------------|
| Select entry    | POST   | `/api/entries/<entry-id>/select`      |

Entry ids come from `GET /api/render/state` under `entries[].id`.

## Feedback / state

Companion's Generic HTTP module supports HTTP-poll feedbacks. Point it at
`GET /api/render/state` and parse the JSON to drive button colors:

- `program.visible === true` → ON AIR (red tone on TITLE OUT button)
- `selectedOutput.id` → highlight current output button
- `timers[i].running === true` → blink the timer Start/Stop button

Poll interval 500–1000 ms is reasonable for a single LAN station.

## Quickstart curl snippets

```bash
# Replace 127.0.0.1 with the WTP host if needed.
curl -X POST http://127.0.0.1:4000/api/program/show
curl -X POST http://127.0.0.1:4000/api/program/update
curl -X POST http://127.0.0.1:4000/api/program/hide
curl -X POST http://127.0.0.1:4000/api/program/live

curl -X POST http://127.0.0.1:4000/api/commands/next-title
curl -X POST http://127.0.0.1:4000/api/commands/previous-title

curl -X POST http://127.0.0.1:4000/api/timers/main/start
curl -X POST http://127.0.0.1:4000/api/timers/main/reset
```

## Companion preset (one-click import)

Save the snippet below as `webtitlepro-buttons.json` and use Companion 3's
*Import* → *Import a page* button. The preset assumes the WTP host is at
`127.0.0.1:4000`. After import, edit the Generic HTTP connection's host if
needed.

```json
{
  "version": "1.0",
  "type": "page",
  "name": "Web Title Pro",
  "controls": {
    "0/0": { "type": "button", "label": "TITLE IN",  "url": "http://127.0.0.1:4000/api/program/show",   "method": "POST", "color": "#5ddb92" },
    "0/1": { "type": "button", "label": "LOAD",      "url": "http://127.0.0.1:4000/api/program/update", "method": "POST", "color": "#ff9d42" },
    "0/2": { "type": "button", "label": "TITLE OUT", "url": "http://127.0.0.1:4000/api/program/hide",   "method": "POST", "color": "#ff5d6d" },
    "0/3": { "type": "button", "label": "PREV",      "url": "http://127.0.0.1:4000/api/commands/previous-title", "method": "POST" },
    "0/4": { "type": "button", "label": "NEXT",      "url": "http://127.0.0.1:4000/api/commands/next-title", "method": "POST" },
    "1/0": { "type": "button", "label": "TIMER ▶",   "url": "http://127.0.0.1:4000/api/timers/main/start", "method": "POST", "color": "#5ddb92" },
    "1/1": { "type": "button", "label": "TIMER ■",   "url": "http://127.0.0.1:4000/api/timers/main/stop",  "method": "POST" },
    "1/2": { "type": "button", "label": "TIMER ↻",   "url": "http://127.0.0.1:4000/api/timers/main/reset", "method": "POST" }
  }
}
```

> The schema above is a documentation example, not a literal Companion export.
> Companion 3's actual page export contains additional plumbing (instance IDs,
> trigger configs). The fastest workflow is:
> 1. Make one button in Companion the manual way using the table above.
> 2. Right-click → Copy. Paste into the rest of the page.
> 3. Adjust the URL per button.
