# Интеграция с Bitfocus Companion

Web Title Pro общается с Companion через встроенный модуль **Generic HTTP** —
устанавливать отдельный плагин не нужно. Здесь — список всех endpoint'ов,
которые можно повесить на кнопку Stream Deck, и готовые конфигурации.

> Английская версия: [BITFOCUS.md](BITFOCUS.md)

## Настройка (5 минут)

1. В Companion добавь новое подключение типа **generic-http**.
2. В качестве base host укажи `http://<ip-машины-с-wtp>:4000` (если WTP и
   Companion запущены на одной машине — `127.0.0.1`).
3. На каждую кнопку добавь **HTTP POST** action с URL из таблицы ниже.
   Headers оставляй пустыми, если иное не указано. Body — JSON, оставь
   пустым если таблица не показывает body.

> **Важно:** WTP должен быть запущен в момент когда Companion отправляет
> команду — иначе Companion покажет ошибку "ECONNREFUSED".

## Все доступные actions

Все URL — относительно `http://<wtp-host>:4000`.

### Программные команды (TITLE IN / LOAD / TITLE OUT / LIVE)

| Кнопка       | Метод | URL                              | Body                       | Что делает |
|--------------|-------|----------------------------------|----------------------------|------------|
| TITLE IN     | POST  | `/api/program/show`              | `{}`                       | То же что и зелёная кнопка в UI. Показывает текущий выбранный entry на текущем output. |
| LOAD         | POST  | `/api/program/update`            | `{}`                       | Подготавливает local title в live без вывода в эфир. Не работает для vMix-титров. |
| TITLE OUT    | POST  | `/api/program/hide`              | `{}`                       | Снимает активный титр с Transition Out. |
| LIVE         | POST  | `/api/program/live`              | `{}`                       | Пушит draft-значения в текущий on-air титр (быстрая подмена данных в эфире). |

В body можно опционально передать `{ "entryId": "<id>", "outputId": "<id>" }` —
явно указать какой entry/output затронуть.

### Навигация по титрам

| Кнопка         | Метод | URL                                     | Body |
|----------------|-------|-----------------------------------------|------|
| TITLE NEXT     | POST  | `/api/commands/next-title`              | `{}` |
| TITLE PREV     | POST  | `/api/commands/previous-title`          | `{}` |

Опционально — `{ "outputId": "<id>" }` чтобы переключаться внутри
конкретного output.

### Выбор Output

| Кнопка               | Метод | URL                                       | Body                       |
|----------------------|-------|-------------------------------------------|----------------------------|
| OUTPUT (по имени)    | POST  | `/api/outputs/<output-id>/select`         | `{}`                       |
| OUTPUT (универсально)| POST  | `/api/commands/select-output`             | `{ "outputId": "<id>" }`   |

`<output-id>` виден в адресной строке при выборе output в Settings, либо
возвращается в `GET /api/render/state` под `outputs[].id`.

### Выбор Entry

| Действие        | Метод | URL                                   |
|-----------------|-------|---------------------------------------|
| Select entry    | POST  | `/api/entries/<entry-id>/select`      |

`<entry-id>` берётся из `GET /api/render/state → entries[].id`.

### Таймеры

| Действие   | Метод | URL                                    |
|------------|-------|----------------------------------------|
| Start      | POST  | `/api/timers/<timer-id>/start`         |
| Stop       | POST  | `/api/timers/<timer-id>/stop`          |
| Reset      | POST  | `/api/timers/<timer-id>/reset`         |

Timer id берутся из snapshot'а `timers[].id`. По умолчанию первый — `"main"`.

## Feedback / подсветка кнопок по состоянию

Generic HTTP module в Companion умеет HTTP-poll feedbacks. Целься на
`GET /api/render/state` и парси JSON чтобы окрашивать кнопки:

- `program.visible === true` → ON AIR (красная подложка на TITLE OUT).
- `selectedOutput.id` → подсветка кнопки текущего output.
- `timers[i].running === true` → мигание кнопки Start/Stop таймера.

Интервал опроса 500–1000 мс достаточно для одной станции в LAN.

## Quickstart — curl-снипеты

```bash
# Замени 127.0.0.1 на IP машины с WTP если нужно.
curl -X POST http://127.0.0.1:4000/api/program/show
curl -X POST http://127.0.0.1:4000/api/program/update
curl -X POST http://127.0.0.1:4000/api/program/hide
curl -X POST http://127.0.0.1:4000/api/program/live

curl -X POST http://127.0.0.1:4000/api/commands/next-title
curl -X POST http://127.0.0.1:4000/api/commands/previous-title

curl -X POST http://127.0.0.1:4000/api/timers/main/start
curl -X POST http://127.0.0.1:4000/api/timers/main/reset
```

## Companion preset (документация-пример)

Сохрани сниппет ниже как `webtitlepro-buttons.json` и используй *Import* →
*Import a page* в Companion 3. Preset предполагает что WTP по адресу
`127.0.0.1:4000`. После импорта поправь host подключения Generic HTTP если
нужно.

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

> Это документация-пример, не настоящий Companion export. У Companion 3
> реальный page export содержит дополнительные служебные поля (instance ID,
> trigger config). Быстрее всего:
> 1. Сделай одну кнопку в Companion вручную по таблице выше.
> 2. ПКМ → Copy. Вставь на остальные кнопки страницы.
> 3. Поправь URL у каждой.

## Известные ограничения

- **WTP не отслеживает реальное состояние vMix.** ON AIR / OFF badge
  показывает **последнюю команду** отправленную из этого приложения, а не
  фактическое состояние титра в vMix. Если оператор переключил титр прямо
  в vMix вне нашего приложения — наш UI про это не узнает. См. tooltip на
  badge.
- WTP слушает на `0.0.0.0:4000` без аутентификации. В open Wi-Fi venue
  любой в той же подсети может POST'ить на /api. Для конференц-залов с
  чужой сетью — изолируй или используй отдельный VLAN.
