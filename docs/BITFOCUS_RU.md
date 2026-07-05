# Интеграция с Bitfocus Companion

Web Title Pro общается с Companion через встроенный модуль **Generic HTTP** —
устанавливать отдельный плагин не нужно. Все кнопки бьют в **один endpoint**;
меняется только `actionId` в теле запроса.

> Английская версия: [BITFOCUS.md](BITFOCUS.md)

## Настройка (5 минут)

1. В Companion добавь новое подключение типа **generic-http**.
2. В качестве base host укажи `http://<ip-машины-с-wtp>:4000` (если WTP и
   Companion на одной машине — `127.0.0.1`).
3. На каждую кнопку добавь **HTTP POST** action:
   - **URL:** `http://<wtp-host>:4000/api/command`
   - **Header:** `Content-Type: application/json`
   - **Body (JSON):** `{ "actionId": "<команда>" }` — id команды из таблиц ниже.

> **Важно:** WTP должен быть запущен, когда Companion шлёт команду — иначе
> Companion покажет "ECONNREFUSED".

> Готовые пары URL + payload для каждой кнопки можно скопировать прямо из
> приложения: **Settings → Controls**, блок Companion — кнопки «Copy URL» и
> «Copy payload».

## Команды

Все — `POST http://<wtp-host>:4000/api/command`, тело `{ "actionId": "…" }`.

### На выход (output)

`<id>` — id выхода (по умолчанию `output-main`; виден в Settings и в
`GET /api/render/state → outputs[].id`).

| Кнопка              | actionId                       |
|---------------------|--------------------------------|
| TITLE IN            | `output:<id>:titleIn`          |
| TITLE OUT           | `output:<id>:titleOut`         |
| PREVIEW IN          | `output:<id>:previewIn`        |
| PREVIEW OUT         | `output:<id>:previewOut`       |
| ROW ▲ (строка выше) | `output:<id>:rowPrev`          |
| ROW ▼ (строка ниже) | `output:<id>:rowNext`          |
| Таймер строки Start | `output:<id>:timerStart`       |
| Таймер строки Stop  | `output:<id>:timerStop`        |
| Таймер строки Reset | `output:<id>:timerReset`       |

`titleIn` показывает текущий выбранный титр выхода. `rowNext`/`rowPrev` листают
строки источника данных на этом выходе (вниз — дальше, вверх — выше) и, если
титр в эфире, сразу обновляют его.

### На конкретный таймер

`<id>` — id таймера (по умолчанию `main`; из `GET /api/render/state → timers[].id`).

| Кнопка | actionId             |
|--------|----------------------|
| Start  | `timer:<id>:start`   |
| Stop   | `timer:<id>:stop`    |
| Reset  | `timer:<id>:reset`   |

### Глобально

| Кнопка                    | actionId               |
|---------------------------|------------------------|
| ALL OUTPUTS OUT (паника)  | `global:allOutputsOut` |

## Низкоуровневые REST-роуты (при необходимости)

Единый `/api/command` покрывает все кнопки пульта. Если нужен «сырой» доступ,
стабильными остаются: `POST /api/program/show|update|hide`,
`POST /api/preview/show|hide`, `POST /api/timers/<id>/start|stop|reset`,
`POST /api/outputs/<id>/select`, `POST /api/entries/<id>/select`.

Устаревшие глаголы `/api/commands/:action`, `/api/program/live` и
`/api/timers/:id/toggle` **удалены** — используй `/api/command`.

## Feedback / подсветка кнопок по состоянию

Generic HTTP module умеет HTTP-poll feedbacks. Целься на
`GET /api/render/state` и парси JSON:

- `outputs[i].program.visible === true` → ON AIR (красная подложка на TITLE OUT).
- `selectedOutput.id` → подсветка кнопки текущего выхода.
- `timers[i].running === true` → мигание кнопки Start/Stop таймера.

Интервал опроса 500–1000 мс достаточно для одной станции в LAN.

## Quickstart — curl-снипеты

```bash
# Замени 127.0.0.1 на IP машины с WTP если нужно.
CMD=http://127.0.0.1:4000/api/command
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:titleIn"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:titleOut"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:rowNext"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"timer:main:start"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"global:allOutputsOut"}'
```

## Companion preset (документация-пример)

Все кнопки — один URL, отличается только body. Быстрее всего:

1. Сделай одну кнопку в Companion вручную (URL `/api/command`, header
   `Content-Type: application/json`, body `{"actionId":"output:output-main:titleIn"}`).
2. ПКМ → Copy. Вставь на остальные кнопки страницы.
3. Поправь `actionId` в body у каждой.

```json
{
  "version": "1.0",
  "type": "page",
  "name": "Web Title Pro",
  "note": "Каждая кнопка: POST http://127.0.0.1:4000/api/command, header Content-Type: application/json, body ниже.",
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

> Это документация-пример, не настоящий Companion export: реальный page export
> Companion 3 содержит служебные поля (instance ID, trigger config).

## Известные ограничения

- **WTP не отслеживает реальное состояние vMix.** ON AIR / OFF badge
  показывает **последнюю команду** из этого приложения, а не фактическое
  состояние титра в vMix. Если оператор переключил титр прямо в vMix — наш UI
  про это не узнает.
- WTP слушает на `0.0.0.0:4000` без аутентификации. В открытом Wi-Fi любой в
  той же подсети может POST'ить на /api. Для чужих сетей — изолируй или
  используй отдельный VLAN.
