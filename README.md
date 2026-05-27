# Web Title Pro

Desktop-first live title control system for vMix, OBS, HTML titles, data sources, timers, MIDI, Bitfocus Companion, and multi-output broadcast workflows.

## English

Web Title Pro is a local Windows desktop application for operating live lower thirds, vMix titles, timers, rundown-driven graphics, and browser-rendered overlays during production.

It is designed for directors, title operators, stream technicians, and small production teams that need fast control over multiple outputs without a heavy broadcast graphics system.

### Highlights

- Local HTML/CSS/JS title templates rendered through Browser Source.
- vMix title discovery, text-field sync, and input control.
- Multiple independent outputs with render and preview URLs.
- Data sources: manual text, TXT/CSV files, CSV URLs, Google Sheets links, and Yandex Disk public links.
- Live Data Source view for row-by-row rundown operation.
- Resizable Live Notes panel with rich-text formatting.
- Timers with countdown/countup modes and color triggers.
- Keyboard, mouse, MIDI, and Bitfocus Companion controls.
- MIDI Learn for notes, pads, buttons, knobs, and faders.
- MIDI CC value rules for faders: any movement, exact value, at/above threshold, or at/below threshold.
- Project files and `.wtpkg` project bundles for moving full productions between machines.
- Portable Windows `.exe` build.

### Quick Start

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
- Backend API: `http://localhost:4000`
- Renderer: `http://localhost:4000/render.html`

### Desktop Build

```bash
npm.cmd run desktop
npm.cmd run package:win
```

Build output:

```text
release/WebTitlePro-<version>.exe
release/WebTitlePro.exe
```

### Validation

```bash
npm.cmd run test:unit
npm.cmd run build
npm.cmd run test:ui
npm.cmd run test:all
```

### Documentation

- [Template Guide](docs/TEMPLATE_GUIDE.md)
- [MIDI Controls](docs/MIDI.md)
- [Bitfocus Companion](docs/BITFOCUS.md)
- [Bitfocus Companion RU](docs/BITFOCUS_RU.md)
- [Project Memory](docs/PROJECT_MEMORY.md)
- [Release 0.4.6](docs/RELEASE_0.4.6.md)
- [Release 0.4.5](docs/RELEASE_0.4.5.md)
- [Release 0.4.4](docs/RELEASE_0.4.4.md)
- [Release 0.4.3](docs/RELEASE_0.4.3.md)

## Русский

Web Title Pro - локальное Windows desktop-приложение для управления эфирными титрами, lower thirds, vMix titles, таймерами, графикой из таблиц и browser overlays во время live production.

Приложение рассчитано на режиссеров трансляций, операторов титров, техников стриминга и небольшие production-команды, которым нужно быстро управлять несколькими output-каналами без тяжелой broadcast-графической системы.

### Основные возможности

- Локальные HTML/CSS/JS шаблоны титров через Browser Source.
- Обнаружение vMix titles, синхронизация text fields и управление input-ами.
- Несколько независимых outputs с render и preview URL.
- Data sources: ручной текст, TXT/CSV файлы, CSV URL, Google Sheets links и Yandex Disk public links.
- Live Data Source для работы по строкам rundown.
- Live Notes справа от таблицы с базовым rich-text редактором.
- Таймеры countdown/countup и цветовые триггеры.
- Управление через keyboard, mouse, MIDI и Bitfocus Companion.
- MIDI Learn для keys, pads, buttons, knobs и faders.
- MIDI CC value rules для фейдеров: любое движение, точное значение, выше/равно порогу или ниже/равно порогу.
- Project files и `.wtpkg` project bundles для переноса полной постановки между машинами.
- Portable Windows `.exe` билд.

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
- Backend API: `http://localhost:4000`
- Renderer: `http://localhost:4000/render.html`

### Desktop-сборка

```bash
npm.cmd run desktop
npm.cmd run package:win
```

Результат сборки:

```text
release/WebTitlePro-<version>.exe
release/WebTitlePro.exe
```

### Проверка

```bash
npm.cmd run test:unit
npm.cmd run build
npm.cmd run test:ui
npm.cmd run test:all
```

### Документация

- [Template Guide](docs/TEMPLATE_GUIDE.md)
- [MIDI Controls](docs/MIDI.md)
- [Bitfocus Companion](docs/BITFOCUS.md)
- [Bitfocus Companion RU](docs/BITFOCUS_RU.md)
- [Project Memory](docs/PROJECT_MEMORY.md)
- [Release 0.4.6](docs/RELEASE_0.4.6.md)
- [Release 0.4.5](docs/RELEASE_0.4.5.md)
- [Release 0.4.4](docs/RELEASE_0.4.4.md)
- [Release 0.4.3](docs/RELEASE_0.4.3.md)

## Project Structure

```text
client/      React control UI
server/      Express API, WebSocket hub, MIDI, vMix, state, templates
renderer/    Browser renderer for vMix / OBS / Browser Source
desktop/     Electron shell
templates/   Built-in title templates
docs/        Product and integration documentation
tests/       Node regression tests and Playwright UI smoke tests
scripts/     Build and release helpers
```

## Network Note

By default the backend listens on port `4000` and is intended for trusted local production networks. Do not expose it directly to an untrusted public network.
