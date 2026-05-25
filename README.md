# Web Title Pro

## RU

**Web Title Pro** — локальное desktop-приложение для управления эфирными титрами, lower thirds, таймерами и data-driven графикой в live production.

Приложение рассчитано на режиссеров трансляций, операторов титров и небольшие продакшн-команды, которым нужно быстро управлять несколькими титрами, источниками данных и output-каналами без тяжелой broadcast-системы.

Web Title Pro объединяет:

- Windows desktop shell на Electron
- React-панель управления
- Node.js backend с HTTP API и WebSocket-синхронизацией
- browser renderer для вывода графики в vMix, OBS или любой Browser Source
- локальные HTML/CSS/JS-шаблоны титров
- интеграцию с vMix titles и text fields

### Для чего подходит

- Lower thirds для спикеров, гостей, ведущих и участников эфира
- PIP-титры для презентаций и конференций
- Data-driven титры из таблиц и CSV
- Несколько независимых output-каналов
- Управление титрами с основного ПК и удаленного браузера в одной сети
- Быстрое переключение строк rundown / data source
- Таймеры с цветовыми состояниями
- Интеграция с Bitfocus Companion, MIDI-контроллерами, клавиатурой и мышью

### Основные возможности

- **Local HTML titles**: кастомные титры на HTML/CSS/JS без перезагрузки Browser Source.
- **vMix workflow**: добавление vMix-титров, обновление text fields, управление состоянием из приложения.
- **Multiple outputs**: разные output-каналы могут иметь разные выбранные титры и rundown.
- **Preview / Live render**: отдельные preview и live render windows для проверки перед эфиром.
- **Data Sources**: ручной ввод, TXT / CSV, CSV URL, Google Sheets, Yandex Disk public link.
- **Mapping**: сопоставление колонок таблицы с полями титра.
- **Live Data Source**: быстрый выбор строки, ресайз колонок, таймеры в строках.
- **Timers**: countdown / countup, формат отображения, цветовые триггеры по времени.
- **Shortcuts**: keyboard / mouse shortcuts для команд, outputs, титров и таймеров.
- **MIDI**: Learn / Clear bindings для MIDI-контроллеров, включая note и CC-сообщения.
- **Bitfocus / HTTP API**: управление из Companion через Generic HTTP module.
- **Projects**: New / Open / Save / Save As / Recent.
- **Project Bundle (`.wtpkg`)**: экспорт/импорт проекта вместе с custom-шаблонами в один ZIP-архив — удобно перенести постановку на другой ПК.
- **Portable Windows build**: запуск без установки через `.exe`.

### Быстрый старт из исходников

```bash
npm install
npm run dev
```

Если PowerShell блокирует `npm.ps1`, используй:

```bash
npm.cmd install
npm.cmd run dev
```

Локальные адреса:

- Control UI: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Renderer: `http://localhost:4000/render.html`

### Desktop режим

Запуск desktop-приложения:

```bash
npm.cmd run desktop
```

Сборка portable `.exe`:

```bash
npm.cmd run package:win
```

Результат сборки:

```text
release/WebTitlePro-<version>.exe
release/WebTitlePro.exe
```

### Тесты и проверка

```bash
npm.cmd test
npm.cmd run build
npm.cmd run test:ui
```

- `npm.cmd test` / `npm.cmd run test:unit` запускает быстрые Node regression-тесты.
- `npm.cmd run test:ui` запускает Playwright smoke-тесты Control UI и сам поднимает `npm run dev`.
- Перед первым UI-тестом на машине установи браузер Playwright: `npm.cmd run test:ui:install`.
- `npm.cmd run test:all` выполняет unit-тесты, production build и UI smoke.

### Базовый workflow

1. Запусти `WebTitlePro.exe`.
2. Создай или выбери `Output`.
3. Добавь local HTML title или vMix title.
4. Открой render URL в vMix / OBS Browser Source.
5. Загрузи `Data Source` или заполни поля вручную.
6. Настрой `Mapping`, если титр должен брать данные из таблицы.
7. Используй `TITLE IN`, `LOAD`, `TITLE OUT`, shortcuts, MIDI или Bitfocus.

### Работа с титрами

Локальный титр — это папка с HTML-шаблоном, стилями, optional JS и metadata. Шаблон может быть простым статичным lower third или более сложной анимацией.

Поддерживаются:

- редактируемые поля текста
- системные и кастомные шрифты
- inline style editing для поддерживаемых шаблонов
- CSS-анимации и keyframes
- JavaScript внутри шаблона, если он нужен для более сложной графики
- data attributes для интеграции с renderer

Документация для авторов шаблонов:

- [docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)
- [docs/TEMPLATE_STARTER](docs/TEMPLATE_STARTER)

### Data Source

Поддерживаемые источники:

- Text
- TXT / CSV file
- CSV URL
- Google Sheets public link
- Yandex Disk public link

Для удаленных таблиц доступны `Refresh` и `Auto-refresh`. Если таблица открыта в редакторе Google Sheets или другом сервисе, обновления могут приходить с задержкой на стороне сервиса.

### Управление извне

Web Title Pro можно управлять не только из интерфейса:

- Keyboard / mouse shortcuts
- MIDI-контроллеры
- Bitfocus Companion через HTTP
- Прямые HTTP-запросы к backend API
- Удаленный Control UI из браузера в той же сети

Bitfocus-документация:

- [docs/BITFOCUS.md](docs/BITFOCUS.md)
- [docs/BITFOCUS_RU.md](docs/BITFOCUS_RU.md)

### Важное про сеть

Backend по умолчанию доступен в локальной сети на порту `4000`. Это удобно для работы с ноутбука или второго ПК, но в публичной сети лучше использовать изолированную production-сеть, потому что любой участник подсети может отправлять HTTP-команды приложению.

### Структура проекта

```text
client/
  src/
    ControlShell.jsx                    # главный контейнер (постепенно декомпозится)
    control-shell/
      v2/                               # текущая UI: Live, Config, OutputsSidebar, TopBar, PreviewOverlay
      tabs/                             # Sources, Timers
      settings/                         # Outputs, Shortcuts, Vmix, Yandex, Updates, About
      lib/                              # чистые helpers (timer, entry, dirty, feedback, project actions)
      hooks.js                          # WS / vMix / MIDI хуки
    styles/                             # 23 CSS-модуля (палитра, top bar, sidebar, content, modals и т.д.)
server/                                 # Express + WebSocket backend
renderer/                               # Browser renderer для vMix / OBS
desktop/                                # Electron shell
templates/                              # built-in HTML шаблоны
scripts/                                # Build and helper scripts
docs/                                   # Product and integration docs
tests/                                  # Node + Playwright smoke tests
```

Актуальная память проекта для дальнейшей разработки: [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md).

### UI после v0.4.0

- **Тонкий top-bar** с табами LIVE / CONFIG / DATA / TIMERS / SETTINGS и статус-чипами OFFLINE/VMIX/MIDI/YANDEX справа.
- **OutputsSidebar** слева на всех вкладках кроме SETTINGS — карточки outputs с ON AIR-индикаторами и кнопками play/stop, ширина регулируется ресайзером.
- **LIVE** — Live Data Source с ресайзящимися колонками, таймерами на строках и toggle-панелью Notes справа: rich-text заметки сохраняются per output/source, поддерживают форматирование выделенного текста, две кнопки цвета (`Text` / `Fill`) и ресайз ширины панели.
- **CONFIG** — outputs, titles и mapping в одном экране, render/preview URL прячутся под выбранный output; local/vMix титры визуально разделены.
- **DATA** — источники данных (Text / TXT / CSV URL / Google Sheets / Yandex Disk) с маппингом колонок и Auto-refresh.
- **TIMERS** — локальные таймеры и vMix-таймеры с цветовыми триггерами и vmix/local индикацией.
- **SETTINGS** — вертикальный sub-nav (Outputs / Controls / Integrations / System) с красной полосой и фоном на активной секции.
  - **Controls** — единый редактор биндингов: поиск, секции (Commands / Outputs / Title entries / Timers), на каждый action три пилюли (⌨ Keyboard / 🎹 MIDI / 🔗 Companion) с inline Learn/Clear, статусом MIDI и Refresh MIDI.
  - **Integrations** — карточка vMix (host + статус) и Yandex OAuth.
  - **System** — обновления + about + Control UI URL.

---

## EN

**Web Title Pro** is a local desktop application for controlling live titles, lower thirds, timers, and data-driven graphics in live production.

It is designed for broadcast directors, title operators, event teams, and small production crews that need fast control over multiple titles, data sources, and output channels without a heavy broadcast graphics system.

Web Title Pro combines:

- Electron-based Windows desktop shell
- React control panel
- Node.js backend with HTTP API and WebSocket synchronization
- Browser renderer for vMix, OBS, or any Browser Source
- Local HTML/CSS/JS title templates
- vMix title and text-field integration

### Use Cases

- Speaker, guest, host, and participant lower thirds
- PIP titles for presentations and conferences
- Data-driven titles from tables and CSV files
- Multiple independent output channels
- Remote control from another browser on the same network
- Fast rundown / data-source row switching
- Timers with color states
- Control via Bitfocus Companion, MIDI controllers, keyboard, and mouse

### Main Features

- **Local HTML titles**: custom HTML/CSS/JS graphics without reloading the Browser Source.
- **vMix workflow**: add vMix titles, update text fields, and control title state from the app.
- **Multiple outputs**: different outputs can have different selected titles and rundowns.
- **Preview / Live render**: separate preview and live render windows for safe checks before air.
- **Data Sources**: manual input, TXT / CSV, CSV URL, Google Sheets, Yandex Disk public link.
- **Mapping**: map table columns to title fields.
- **Live Data Source**: fast row selection, resizable columns, row timers.
- **Timers**: countdown / countup, display format, color triggers by time.
- **Shortcuts**: keyboard / mouse bindings for commands, outputs, titles, and timers.
- **MIDI**: Learn / Clear bindings for MIDI controllers, including note and CC messages.
- **Bitfocus / HTTP API**: control through Companion using the Generic HTTP module.
- **Projects**: New / Open / Save / Save As / Recent.
- **Project Bundle (`.wtpkg`)**: export/import a project together with its custom templates as a single ZIP — convenient for moving a show between machines.
- **Portable Windows build**: run the app from a standalone `.exe`.

### Quick Start From Source

```bash
npm install
npm run dev
```

If PowerShell blocks `npm.ps1`, use:

```bash
npm.cmd install
npm.cmd run dev
```

Local URLs:

- Control UI: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Renderer: `http://localhost:4000/render.html`

### Desktop Mode

Run the desktop app:

```bash
npm.cmd run desktop
```

Build the portable `.exe`:

```bash
npm.cmd run package:win
```

Build output:

```text
release/WebTitlePro-<version>.exe
release/WebTitlePro.exe
```

### Testing

```bash
npm.cmd test
npm.cmd run build
npm.cmd run test:ui
```

- `npm.cmd test` / `npm.cmd run test:unit` runs the fast Node regression suite.
- `npm.cmd run test:ui` runs Playwright Control UI smoke tests and starts `npm run dev` automatically.
- Before the first UI test on a machine, install the Playwright browser: `npm.cmd run test:ui:install`.
- `npm.cmd run test:all` runs unit tests, production build, and UI smoke.

### Basic Workflow

1. Start `WebTitlePro.exe`.
2. Create or select an `Output`.
3. Add a local HTML title or a vMix title.
4. Open the render URL in vMix / OBS Browser Source.
5. Load a `Data Source` or edit fields manually.
6. Configure `Mapping` if the title should use table data.
7. Use `TITLE IN`, `LOAD`, `TITLE OUT`, shortcuts, MIDI, or Bitfocus.

### Title Templates

A local title is a folder with an HTML template, styles, optional JS, and metadata. It can be a simple static lower third or a more advanced animated graphic.

Supported template capabilities:

- editable text fields
- system and custom fonts
- inline style editing for supported templates
- CSS animations and keyframes
- optional JavaScript for more advanced graphics
- data attributes for renderer integration

Template authoring docs:

- [docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)
- [docs/TEMPLATE_STARTER](docs/TEMPLATE_STARTER)

### Data Sources

Supported sources:

- Text
- TXT / CSV file
- CSV URL
- Google Sheets public link
- Yandex Disk public link

Remote tables support `Refresh` and `Auto-refresh`. If a Google Sheet or another remote table is open in an editor, updates may be delayed by the service itself.

### External Control

Web Title Pro can be controlled outside the main UI:

- Keyboard / mouse shortcuts
- MIDI controllers
- Bitfocus Companion over HTTP
- Direct HTTP requests to the backend API
- Remote Control UI from another browser on the same network

Bitfocus documentation:

- [docs/BITFOCUS.md](docs/BITFOCUS.md)
- [docs/BITFOCUS_RU.md](docs/BITFOCUS_RU.md)

### Network Note

The backend is available on the local network on port `4000` by default. This is useful for laptop / second-PC control, but on public networks you should isolate the production network because anyone on the subnet can send HTTP commands to the app.

### Project Structure

```text
client/
  src/
    ControlShell.jsx                    # main container (incrementally decomposed)
    control-shell/
      v2/                               # current UI: Live, Config, OutputsSidebar, TopBar, PreviewOverlay
      tabs/                             # Sources, Timers
      settings/                         # Outputs, Shortcuts, Vmix, Yandex, Updates, About
      lib/                              # pure helpers (timer, entry, dirty, feedback, project actions)
      hooks.js                          # WS / vMix / MIDI hooks
    styles/                             # 23 CSS modules (palette, top bar, sidebar, content, modals, etc.)
server/                                 # Express + WebSocket backend
renderer/                               # Browser renderer for vMix / OBS
desktop/                                # Electron shell
templates/                              # Built-in HTML templates
scripts/                                # Build and helper scripts
docs/                                   # Product and integration docs
tests/                                  # Node + Playwright smoke tests
```

Project context for future maintenance is tracked in [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md).

### UI After v0.4.0

- **Thin top bar** with LIVE / CONFIG / DATA / TIMERS / SETTINGS tabs and OFFLINE/VMIX/MIDI/YANDEX status chips on the right.
- **OutputsSidebar** on the left on every tab except SETTINGS — output cards with ON AIR markers and play/stop buttons, resizable width.
- **LIVE** — Live Data Source with resizable columns, per-row timers, and a right-side Notes toggle: rich-text notes persist per output/source, support selected-text formatting, two color buttons (`Text` / `Fill`), and a resizable panel width.
- **CONFIG** — outputs, titles, and mapping on one screen; render/preview URL chips reveal under the selected output; local/vMix titles are visually distinct.
- **DATA** — data sources (Text / TXT / CSV URL / Google Sheets / Yandex Disk) with column mapping and Auto-refresh.
- **TIMERS** — local and vMix-bound timers with color triggers and vmix/local indication.
- **SETTINGS** — vertical sub-nav (Outputs / Controls / Integrations / System) with a red accent bar and tint on the active section.
  - **Controls** — unified binding editor: search box, collapsible sections (Commands / Outputs / Title entries / Timers), and per-action pills (⌨ Keyboard / 🎹 MIDI / 🔗 Companion) with inline Learn/Clear, MIDI status, and Refresh MIDI.
  - **Integrations** — vMix card (host + status) and Yandex OAuth.
  - **System** — updates + about + Control UI URL.
