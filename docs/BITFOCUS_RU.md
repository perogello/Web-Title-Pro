# Интеграция с Bitfocus Companion

> English version: [BITFOCUS.md](BITFOCUS.md)

Два способа управлять Web Title Pro (WTP) из Companion:

1. **Модуль Web Title Pro** (рекомендуется, с 0.5.2) — кнопки с живой подсветкой
   эфира, переменные и готовые пресеты.
2. **Встроенный модуль Companion Generic HTTP** — без отдельного модуля, но и без
   подсветки кнопок.

Оба отправляют одни и те же команды (`POST /api/command`, см. [Команды](#команды)).

## 1. Модуль Web Title Pro (рекомендуется)

Работает с **Companion 3.5 и новее** (проверен на 5.1). Всё находится в
**Settings → Integrations → Bitfocus Companion module** (туда же ведёт кнопка
«Модуль Companion…» в Settings → Controls).

### Установка

| Ситуация | Как |
|---|---|
| Companion на **этом** компьютере | Кнопка **«Установить в Companion»** (только в десктопном приложении). Кладёт модуль в папку developer-модулей Companion и включает их. Если Companion запущен и для этого нужен его перезапуск, приложение сначала спросит, затем закроет и снова запустит Companion — кнопки на несколько секунд перестанут работать, не делайте этого в эфире. Если developer-папка уже настроена, Companion подхватит модуль сам, без перезапуска. |
| Вручную, developer-режим | Launcher Companion → шестерёнка справа вверху → *Developer* → *Select* → папка из строки **Developer path** в карточке (та, в которой *лежит* папка `web-title-pro`) → *Enable Developer Modules* → *Launch GUI*. |
| Companion на **другом** компьютере или без developer-режима | Кнопка **«Скачать»** `.tgz` в карточке → веб-интерфейс Companion → *Modules* → *Import module package* → выбрать файл. |

### Подключение

*Connections* → *Add connection* → найти **Web Title Pro** → заполнить:

| Поле | Значение |
|---|---|
| Host | `127.0.0.1`, если Companion на компьютере с WTP, иначе IP этого компьютера |
| Port | `4000` |

Когда подключение достучится до WTP, оно станет зелёным. Дальше — вкладка
**Presets** подключения: перетащите кнопки на страницу.

### Что даёт модуль

**Пресеты**

- *Output #N* — кнопка-переключатель (имя output и первое поле выбранного титра,
  красная в эфире), плюс IN, OUT, PVW IN/OUT, ROW ▲/▼ и таймер строки
  старт/стоп/сброс.
- *Titles → #N* — по кнопке на каждый титр: ставит его на этот output (синяя,
  пока титр выбран).
- *Timers* — старт/стоп с живым временем (цвет — по цветовым правилам таймера) и
  сброс.
- *Global* — Panic (снять всё) и счётчик титров в эфире.

**Действия**

| Действие | Поля |
|---|---|
| Output: command | Output, Command (Title IN/OUT, Preview IN/OUT, Row ▲/▼, таймер строки start/stop/reset) |
| Output: toggle title on/off air | Output |
| Output: select title | Output, Title, «Show it on air right away» |
| Timer: start / stop / reset | Timer, Command |
| Timer: start / stop toggle | Timer |
| Panic: hide every output | — |
| Any Web Title Pro command (incl. plugins) | любой id команды, включая оверлеи плагинов |

**Фидбеки (подсветка):** титр в эфире · титр на превью · этот титр выбран ·
что-то в эфире · таймер идёт · цвет таймера (по правилам WTP) · есть связь.

**Переменные** (output нумеруются как во вкладке Config WTP: `o1`, `o2`, …;
таймеры — `t1`, `t2`, …):

| Переменная | Значение |
|---|---|
| `o1_name` | имя output |
| `o1_title` | выбранный титр |
| `o1_value1`, `o1_value2` | первое / второе поле выбранного титра |
| `o1_on_air`, `o1_preview` | `ON` / `OFF` |
| `o1_row` | номер применённой строки данных |
| `t1_name`, `t1_time`, `t1_running` | имя таймера, текущее время, `ON` / `OFF` |
| `on_air_count`, `connected` | сколько output в эфире; `YES` / `NO` |
| `module_version`, `module_update` | версия модуля; более новая версия в WTP (пусто — актуальная) |

### Обновления и версии

Версия модуля совпадает с версией приложения, модуль входит в его состав:

- **Установлен кнопкой (на этом ПК):** обновляется сам — после обновления WTP при
  следующем запуске новая версия кладётся на место, Companion её подхватывает.
- **Импортирован `.tgz` (на другом ПК):** после обновления WTP импортируйте
  заново. Если версии разошлись, подключение в Companion станет жёлтым с текстом
  *«Module vX, Web Title Pro ships vY — update: …»*.

Карточка в Settings → Integrations показывает установленную и встроенную версии.

Исходники модуля — `companion-module/`, сборка — `npm run build:companion`
(запускается и в `npm run package:win`).

## 2. Generic HTTP (без модуля)

1. *Connections* → *Add connection* → **Generic HTTP**. Поле **Base URL** оставьте
   пустым.
2. На каждую кнопку добавьте действие **POST** и заполните его поля:

| Поле Generic HTTP | Что вводить |
|---|---|
| URL | `http://<ip-машины-с-wtp>:4000/api/command` (`127.0.0.1` на том же ПК) |
| Body | `{"actionId":"<команда>"}` — id команд ниже |
| header input(JSON) | оставить пустым |
| Content Type | `application/json` (по умолчанию) |

> В WTP в **Settings → Controls** для каждой команды выведены точные значения
> всех полей (и действие модуля с его полями) с кнопкой **Copy** у каждого.

WTP должен быть запущен, когда Companion шлёт команду, иначе Companion покажет
`ECONNREFUSED`. Подсветки эфира на кнопках Generic HTTP не даёт — для неё нужен
модуль.

## Команды

Все команды — `POST http://<wtp-host>:4000/api/command` с телом
`{ "actionId": "…" }`. Полный живой список (с id текущего проекта) —
`GET /api/command/catalog`.

### На выход (output)

`<id>` — id output (по умолчанию `output-main`; см. `GET /api/state →
outputs[].id`).

| Команда            | actionId                  |
|--------------------|---------------------------|
| Title IN           | `output:<id>:titleIn`     |
| Title OUT          | `output:<id>:titleOut`    |
| Preview IN         | `output:<id>:previewIn`   |
| Preview OUT        | `output:<id>:previewOut`  |
| Строка ▲ (пред.)   | `output:<id>:rowPrev`     |
| Строка ▼ (след.)   | `output:<id>:rowNext`     |
| Таймер строки Start | `output:<id>:timerStart` |
| Таймер строки Stop  | `output:<id>:timerStop`  |
| Таймер строки Reset | `output:<id>:timerReset` |

`titleIn` выводит выбранный на output титр. `rowNext` / `rowPrev` переключают
строки источника данных на этом output (вниз — дальше, вверх — выше); если титр
в эфире, он сразу обновляется. Подсветка строки во вкладках Live и Data WTP
переезжает следом (с 0.5.3).

### На таймер

`<id>` — id таймера (см. `GET /api/state → timers[].id`).

| Команда | actionId            |
|---------|---------------------|
| Start   | `timer:<id>:start`  |
| Stop    | `timer:<id>:stop`   |
| Reset   | `timer:<id>:reset`  |

### Глобально

| Команда                       | actionId               |
|-------------------------------|------------------------|
| Снять все output (panic)      | `global:allOutputsOut` |

Команды плагинов (`plugin:<pluginId>:<command>`) выполняются внутри плагина в
панели управления, из Companion их не вызвать; оверлеи плагинов — можно
(`overlay:<pluginId>:in|out`, через действие модуля «Any command»).

## Низкоуровневые REST-роуты (при необходимости)

`/api/command` покрывает все кнопки. Стабильные «сырые» роуты:
`POST /api/program/show|update|hide`, `POST /api/preview/show|hide`,
`POST /api/timers/<id>/start|stop|reset`, `POST /api/outputs/<id>/select`,
`POST /api/entries/<id>/select`. Живое состояние: `GET /api/state` и WebSocket
`ws://<wtp-host>:4000/ws` (полный снимок при изменениях + тики таймеров) — его
использует модуль.

## Quickstart — curl

```bash
# Замените 127.0.0.1 на IP машины с WTP, если нужно.
CMD=http://127.0.0.1:4000/api/command
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:titleIn"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:titleOut"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"output:output-main:rowNext"}'
curl -X POST $CMD -H "Content-Type: application/json" -d '{"actionId":"global:allOutputsOut"}'
```

## Известные ограничения

- **WTP не читает реальное состояние vMix.** ON AIR отражает **последнюю команду**,
  отправленную через WTP; титр, включённый прямо в vMix, WTP не заметит.
- WTP слушает `0.0.0.0:4000` без авторизации. Для Companion на другом компьютере
  порт 4000 должен быть доступен (файрвол); в недоверенных сетях изолируйте его
  (отдельный VLAN).
