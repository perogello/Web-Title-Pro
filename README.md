# Web Title Pro

## RU

Web Title Pro — desktop-first система управления титрами для live production.
Приложение объединяет React-панель управления, Node.js backend, browser renderer и Windows desktop shell для работы с локальными HTML-титрами, `vMix` и data-driven графикой.

### Что нового в `0.2.11`

- Обновлены `khural`-титры и их цветовая схема
- Добавлен новый built-in шаблон `KHURAL TEST TITLE 2`
- Убраны лишние текстовые подсветки у `Khural PIP` и `Khural PIP 2`

### Что умеет

- Локальные HTML/CSS/JS титры без перезагрузки Browser Source
- `vMix` titles и text fields
- Несколько независимых outputs
- `Data Source` таблицы из text, `TXT / CSV`, `CSV URL`, `Google Sheets`, `Yandex Disk`
- Mapping данных в титры
- Таймеры, shortcuts, MIDI, Bitfocus / HTTP API
- Проекты: `New / Open / Save / Save As / Recent`
- Portable Windows build с updater flow

### Быстрый старт из исходников

```bash
npm install
npm run dev
```

Если PowerShell блокирует `npm.ps1`:

```bash
npm.cmd install
npm.cmd run dev
```

Локальные адреса:

- Control UI: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Renderer: `http://localhost:4000/render.html`

### Desktop режим

Запуск desktop-версии:

```bash
npm.cmd run desktop
```

Сборка portable `.exe`:

```bash
npm.cmd run package:win
```

Результат:

```text
release/WebTitlePro-0.2.11.exe
release/WebTitlePro.exe
```

- `WebTitlePro-0.2.11.exe` — versioned release asset
- `WebTitlePro.exe` — основной стабильный файл для запуска

### Как использовать

1. Открой приложение.
2. Создай или выбери `Output`.
3. Добавь локальный или `vMix` титр.
4. Загрузи `Data Source` или введи данные вручную.
5. При необходимости настрой `Mapping`.
6. Используй `SHOW`, `SET` и `HIDE`.
7. Подключи render URL в `vMix` или `OBS` Browser Source.

### Data Source

Поддерживаются:

- Text
- TXT / CSV File
- CSV URL
- Google Sheets
- Yandex Disk public link

Для `Google Sheets` и `Yandex Disk` доступны `Refresh` и `Auto-refresh`.

### Yandex

Интеграция с Yandex настраивается локально в:

```text
Settings -> Yandex
```

Приложение не поставляется с готовыми credentials или токенами.
Подробная инструкция:

- [docs/YANDEX_CREDENTIALS.md](docs/YANDEX_CREDENTIALS.md)

### Разработка шаблонов

Если хочешь делать свои local HTML-титры для `Web Title Pro`, смотри:

- [docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)
- [docs/TEMPLATE_STARTER](docs/TEMPLATE_STARTER)

### Структура проекта

```text
client/       React control panel
server/       Express + WebSocket backend
renderer/     Browser renderer
desktop/      Electron desktop shell
templates/    Built-in local templates
scripts/      Build and helper scripts
docs/         Product and integration notes
```

---

## EN

Web Title Pro is a desktop-first title control system for live production.
It combines a React control panel, Node.js backend, browser renderer, and Windows desktop shell for local HTML titles, `vMix`, and data-driven graphics workflows.

### What's New in `0.2.11`

- Updated the `khural` titles and their color scheme
- Added a new built-in template: `KHURAL TEST TITLE 2`
- Removed extra text glow from `Khural PIP` and `Khural PIP 2`

### Main Features

- Local HTML/CSS/JS titles without reloading the Browser Source
- `vMix` titles and text fields
- Multiple independent outputs
- `Data Source` tables from text, `TXT / CSV`, `CSV URL`, `Google Sheets`, and `Yandex Disk`
- Data mapping into titles
- Timers, shortcuts, MIDI, Bitfocus / HTTP API
- Project workflow: `New / Open / Save / Save As / Recent`
- Portable Windows build with updater flow

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
release/WebTitlePro-0.2.11.exe
release/WebTitlePro.exe
```

- `WebTitlePro-0.2.11.exe` is the versioned release asset
- `WebTitlePro.exe` is the main stable executable for end users

### Basic Workflow

1. Open the app.
2. Create or select an `Output`.
3. Add a local or `vMix` title.
4. Load a `Data Source` or enter data manually.
5. Configure `Mapping` when needed.
6. Use `SHOW`, `SET`, and `HIDE`.
7. Connect the render URL to `vMix` or `OBS` Browser Source.

### Data Sources

Supported input types:

- Text
- TXT / CSV File
- CSV URL
- Google Sheets
- Yandex Disk public link

`Google Sheets` and `Yandex Disk` support `Refresh` and `Auto-refresh`.

### Yandex

Yandex integration is configured locally in:

```text
Settings -> Yandex
```

The app does not ship with built-in credentials or tokens.
See:

- [docs/YANDEX_CREDENTIALS.md](docs/YANDEX_CREDENTIALS.md)

### Template Development

If you want to build custom local HTML titles for `Web Title Pro`, see:

- [docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md)
- [docs/TEMPLATE_STARTER](docs/TEMPLATE_STARTER)

### Project Structure

```text
client/       React control panel
server/       Express + WebSocket backend
renderer/     Browser renderer
desktop/      Electron desktop shell
templates/    Built-in local templates
scripts/      Build and helper scripts
docs/         Product and integration notes
```
