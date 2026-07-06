# Плагины

> English version: [PLUGINS.md](PLUGINS.md)

Плагин — это маленькое самостоятельное веб-приложение, расширяющее Web Title
Pro. Он может добавить панель управления, свою эфирную графику, свои данные,
кнопки и команды — не трогая код приложения. Плагин всегда **опционален**:
включил, когда нужен; выключил или удалил, когда нет.

- **Пользователю:** сразу к разделу [Установка и управление](#14-установка-и-управление).
- **Разработчику:** возьми [шаблон-скелет](plugin-template/) и держи эту страницу как справочник.

---

## 1. Что умеет плагин

- Показать **панель управления** на вкладке, **свою вкладку** верхнего уровня
  или работать **фоном** (headless).
- Владеть **своими данными** (счёт, доска бинго, фид), которые персистятся и
  синхронно видны всем его поверхностям.
- Быть **эфирной графикой**: нести **оверлей**, который композитит рендерер (или
  использовать как browser-source в OBS/vMix), и/или **нести title-шаблоны**,
  работающие в обычном рундауне.
- Слать **команды** приложению (титр в эфир, листать строки, старт таймера…).
- Добавлять **нативные кнопки** в тулбары и **команды** для привязки к клавишам.
- Объявлять **настройки**, которые оператор правит в Settings › Plugins.

---

## 2. Из чего состоит

Плагин — это папка с манифестом `plugin.json` и одной-несколькими HTML-поверхностями:

```
my-plugin/
  plugin.json        # манифест (обязателен)
  panel.html         # панель управления (манифестное "entry")
  overlay.html       # опциональная эфирная графика (манифестное "overlay")
  templates/         # опциональные встроенные title-шаблоны
    lower-third/
      index.html
      template.json
```

- **Встроенные** плагины лежат в `plugins/`, id = `builtin:<папка>`.
- **Пользовательские** — в `storage/plugins/`, id = `custom:<папка>`.
- Все файлы отдаются по `/plugin-assets/<source>/<папка>/…`.

---

## 3. Справочник `plugin.json`

| Поле | Тип | Примечание |
|---|---|---|
| `name` | string | **Обязательно.** Показывается в UI. |
| `version` | string | напр. `"1.0.0"`. |
| `description` | string | Одна строка. |
| `author` | string | |
| `entry` | string | HTML панели. По умолчанию `index.html`. Внутри папки. |
| `overlay` | string | Опциональный HTML эфирной поверхности. Внутри папки. |
| `capabilities` | string[] | Что использует плагин — см. [Права](#4-права-capabilities). |
| `mount` | object | Где живёт панель — см. [Монтирование](#5-поверхности-и-монтирование). |
| `settings` | array | Настройки для оператора — см. [Настройки](#10-настройки). |
| `contributes` | object | Кнопки и команды — см. [Вклады](#9-вклады-contributes). |

Минимальный манифест:

```json
{
  "name": "My Plugin",
  "entry": "panel.html",
  "capabilities": ["state:read", "command:send"],
  "mount": { "type": "panel", "location": "live", "label": "My Plugin" }
}
```

---

## 4. Права (capabilities)

Объявляют, что плагин использует. Показываются оператору.

| Право | Даёт |
|---|---|
| `state:read` | Получать снапшот состояния (ауты, таймеры, program…). |
| `command:send` | Слать canonical-команды (`POST /api/command`). Нужно для contributed **command**-кнопок. |
| `data:read` | Читать свои данные. |
| `data:write` | Писать свои данные. |

---

## 5. Поверхности и монтирование

`mount.type` решает, где появится **панель** (`entry`):

| `type` | Где |
|---|---|
| `panel` | Докнутая панель внутри вкладки из `mount.location` (`live` / `rundown` / `settings`). |
| `tab` | Своя вкладка верхнего уровня. |
| `background` | Headless — скрытый iframe на всех вкладках. Для автоматизаций. |

`mount.label` — заголовок панели/вкладки. **Оверлей** — отдельная поверхность
(это эфирная графика, а не панель), см. [Эфирный оверлей](#8-эфирный-оверлей).

---

## 6. SDK

Каждая поверхность подключает SDK и общается с приложением через глобальный `WTP`:

```html
<script src="/plugin-sdk.js"></script>
```

| Вызов | Что делает |
|---|---|
| `WTP.pluginId` | id этого плагина (напр. `custom:my-plugin`). |
| `WTP.onState(cb)` | Подписка на снапшот состояния; срабатывает сразу и на каждое изменение. |
| `WTP.onData(cb)` | Подписка на данные плагина; сразу и на каждое изменение. |
| `WTP.getState()` / `WTP.getData()` | Текущие значения. |
| `WTP.setData(obj)` | Заменить данные плагина (персист + broadcast всем поверхностям). |
| `WTP.command(actionId)` | Выполнить canonical-команду. |

SDK работает одинаково **внутри приложения** и **как отдельная страница**
(browser-source в OBS) — определяет всё из своего URL и ходит на локальный сервер
по WebSocket + относительному HTTP.

---

## 7. Данные плагина

`WTP.setData(obj)` / `WTP.onData(cb)` — сердце контентного плагина: панель пишет,
оверлей (и любая другая поверхность / browser-source) получает изменение вживую.

```js
// panel.html
WTP.setData({ home: 3, away: 1 });

// overlay.html
WTP.onData(function (d) { render(d.home, d.away); });
```

Данные персистятся вместе с приложением, лимит **256 КБ** на плагин. При прямом
вызове REST передавай envelope `{ data }`: `GET/PUT /api/plugins/<id>/data`.

---

## 8. Эфирный оверлей

Объяви `overlay` в манифесте. Это обычная страница (рендери из своих данных через
SDK). Два способа вывести в эфир:

1. **Через рендерер приложения** — команда `overlay:<pluginId>:in` (и
   `overlay:<pluginId>:out` — убрать). Рендерер композитит оверлей полным слоем.
   Работает только пока плагин включён; при выключении/удалении снимается сам.
   Это canonical-команды — их можно вешать на Companion/MIDI.
2. **Как browser-source** — скопируй URL оверлея из Settings › Plugins в OBS/vMix.

```js
WTP.command('overlay:' + WTP.pluginId + ':in');   // в эфир
WTP.command('overlay:' + WTP.pluginId + ':out');  // из эфира
```

---

## 9. Вклады (contributes)

`contributes` позволяет добавить нативный UI в хост.

### Кнопки

Нативные кнопки в слоте:

```json
"contributes": {
  "buttons": [
    { "slot": "live.toolbar", "label": "PANIC", "command": "global:allOutputsOut" },
    { "slot": "live.toolbar", "label": "Draw", "action": "draw" }
  ]
}
```

- Слоты: `live.toolbar`, `config.toolbar`, `sources.toolbar`, `timers.toolbar`.
- `command` → хост выполняет эту canonical-команду (нужно `command:send`).
- `action` → хост шлёт сообщение в iframe плагина; твой код запускает логику
  (см. [мост](#11-мост-postmessage)).

### Команды

Объяви именованные команды; они попадают в каталог и **биндятся на клавиши**
(Settings › Controls):

```json
"contributes": { "commands": [ { "id": "draw", "label": "Draw a number" } ] }
```

Команда появляется как `plugin:<pluginId>:draw`. При вызове маршрутизируется в
твой iframe как action — обрабатывай так же, как action-кнопку.

---

## 10. Настройки

Объяви настройки; оператор правит их в Settings › Plugins:

```json
"settings": [
  { "key": "title", "label": "Заголовок оверлея", "type": "text", "default": "Привет" },
  { "key": "compact", "label": "Компактно", "type": "checkbox", "default": false },
  { "key": "accent", "label": "Акцент", "type": "select", "default": "green",
    "options": [ { "value": "green", "label": "Зелёный" }, { "value": "blue", "label": "Синий" } ] }
]
```

Типы: `text`, `number`, `checkbox`, `select`. Настройки приходят плагину,
**смонтированному внутри приложения**, через мост (ниже).

---

## 11. Мост (postMessage)

SDK покрывает состояние, данные и команды. Две вещи приходят через мост
`postMessage` (для плагинов, смонтированных внутри приложения): вызовы
contributed-`action` и настройки. Слушай их:

```js
window.addEventListener('message', function (e) {
  if (!e.data || e.data.source !== 'wtp-host') return;
  if (e.data.type === 'action')   { runAction(e.data.action); }        // action / команда
  if (e.data.type === 'init')     { applySettings(e.data.settings); }  // начальные настройки
  if (e.data.type === 'settings') { applySettings(e.data.settings); }  // настройки изменились
});
```

---

## 12. Встроенные шаблоны

Клади title-шаблоны в `<plugin>/templates/<name>/`. Каждый — обычный шаблон
(HTML с элементами `data-field` + опциональный `template.json` с
`name`/`description`/`category`). Они появляются в выборе шаблонов и работают в
рундауне как любой: маппинг data-source, синхро-ауты, vMix-титры. Пример:
`plugins/bingo/templates/bingo-lower-third/`.

---

## 13. Команды и их список

`WTP.command(actionId)` принимает любой canonical action id. Полный живой список
— `GET /api/command/catalog` (с описаниями). Виды:

| Шаблон | Пример | Смысл |
|---|---|---|
| `output:<id>:<cmd>` | `output:output-main:titleIn` | титр in/out, preview in/out, `rowPrev`/`rowNext`, `timerStart`/`Stop`/`Reset` |
| `timer:<id>:<cmd>` | `timer:main:start` | `start`/`stop`/`reset` |
| `global:<cmd>` | `global:allOutputsOut` | паника |
| `overlay:<pluginId>:<in\|out>` | `overlay:custom:bingo:in` | твой оверлей в/из эфира |
| `plugin:<pluginId>:<cmd>` | `plugin:custom:bingo:draw` | твоя объявленная команда (в твой iframe) |

---

## 14. Установка и управление

- **Установка:** Settings › Plugins → *Установить из архива/файлов* (`.zip` или
  набор файлов) или *Установить из папки*. Либо положи папку в `storage/plugins/`.
- **Вкл/выкл:** переключатель в Settings › Plugins. От выключенного плагина
  ничего не работает.
- **Удаление:** кнопка *Удалить* (для пользовательских). Встроенные не удаляются.
- **Настройки и URL оверлея:** показаны на карточке плагина в Settings › Plugins.

---

## 15. Модель безопасности и лимиты

- Поверхности плагина работают в **песочнице-iframe** (`sandbox="allow-scripts"`,
  opaque origin): плагин **не может** трогать документ хост-приложения. До
  приложения он дотягивается только через локальный API + WebSocket — как обычный
  browser-source.
- Установленные плагины — **доверенный локальный код** (как browser-source в OBS
  или шаблон SPX): ставь те, которым доверяешь.
- Лимиты: данные — до **256 КБ** на плагин; оверлей выходит в эфир только для
  **включённого** плагина.
- Доступа к микрофону/камере у плагинов нет.

---

## 16. Примеры в репозитории

- `plugins/bingo` — полный **контентный** плагин: панель + оверлей (SDK) +
  встроенный шаблон.
- `plugins/rundown-remote` — **управляющий** плагин: панель листает строки и
  выводит титры in/out, с contributed-кнопкой PANIC и объявленной командой.
- `docs/plugin-template/` — стартовый скелет «скопируй меня».
