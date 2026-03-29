# Web Title Pro

## RU

Web Title Pro — это desktop-first система управления титрами для live production.
Проект объединяет React-панель управления, low-latency Node.js backend и browser renderer для `vMix`, `OBS` и других browser-based графических пайплайнов.

### Возможности

- Управление локальными HTML/CSS/JS титрами без перезагрузки Browser Source
- Несколько независимых outputs со своими render URL
- Поддержка локальных шаблонов и `vMix` title inputs
- Live rundown, data source таблицы, таймеры спикеров, preview/live состояния
- Горячие клавиши, MIDI, HTTP API для Bitfocus Companion
- Desktop-упаковка для Windows

### Основные функции

- `SHOW / LIVE / HIDE` с real-time обновлениями
- Live rundown с типами `Local` и `vMix`
- Data source таблицы с редактируемыми строками
- Таймеры, связанные со строками и output-ами
- Интеграция с `vMix` для text/title fields и timer inputs
- Настраиваемые shortcuts для каждого титра
- MIDI integration
- Companion / Bitfocus HTTP control
- Portable Windows build со splash screen и сохранением состояния

### Структура проекта

```text
client/       React control panel
server/       Express + WebSocket backend
renderer/     Browser renderer for Browser Input
desktop/      Electron desktop shell
templates/    Встроенные локальные шаблоны
data/         Базовое состояние проекта
scripts/      Скрипты запуска и обслуживания
```

### Что нужно для работы

Для обычного использования desktop-приложения:

- Windows ПК
- `vMix` — только если нужна интеграция с `vMix`
- MIDI-устройство — только если нужен MIDI-контроль

Для запуска из исходников:

- Node.js
- npm

### Установка и запуск из исходников

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

- Панель управления: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Browser renderer: `http://localhost:4000/render.html`

### Desktop-режим

Для запуска desktop-версии в dev-режиме:

```bash
npm.cmd run desktop
```

Для сборки portable `.exe`:

```bash
npm.cmd run package:win
```

Результат сборки:

```text
release/WebTitlePro-0.1.6.exe
release/WebTitlePro.exe
```

`WebTitlePro-0.1.6.exe` используется как versioned release asset.
`WebTitlePro.exe` создается автоматически после сборки и используется как стабильный локальный файл для запуска и обновлений.

Рекомендуемый launcher:

```text
launch-web-title-pro.cmd
```

Он очищает конфликтующие Electron-переменные окружения и безопасно запускает packaged app.
Для прямого ярлыка пользователю лучше использовать:

```text
release/WebTitlePro.exe
```

### Как использовать

1. Запусти desktop-приложение или dev-режим.
2. Создай или выбери `Output`.
3. Добавь локальный титр или `vMix` title.
4. Выбери строку из live data source таблицы.
5. Используй `SHOW`, `LIVE` или `HIDE`.
6. Скопируй render URL output-а в `vMix` или `OBS` Browser Source.

### Локальные шаблоны

Локальные шаблоны — это обычные HTML/CSS/JS папки.
Текстовые поля определяются через `data-field`.
Таймеры определяются через `data-timer`.

Пример:

```html
<span data-field="name" data-label="Name">John Doe</span>
<span data-timer="speaker">00:30</span>
```

### Правила шаблонов

При импорте шаблон проходит автоматическую валидацию.

Разрешено:

- локальные `html`, `css`, `js`, `json`
- локальные изображения
- локальные шрифты
- локальные видео `mp4` и `webm`

Запрещено:

- внешние `http://` и `https://` ресурсы
- внешние CDN, внешние шрифты и внешние скрипты
- теги `iframe`, `object`, `embed`

Базовые лимиты импорта:

- архив до `25 MB`
- распакованный шаблон до `60 MB`
- до `150` файлов в пакете
- один файл до `30 MB`

Если шаблон не проходит проверку, приложение показывает подробный список ошибок по файлам, чтобы дизайнер мог быстро исправить пакет.

### Интеграция с vMix

Web Title Pro умеет:

- читать список `vMix` inputs
- отправлять текст в `vMix` title fields
- управлять timer-related text outputs

Типичный локальный адрес API:

```text
http://127.0.0.1:8088
```

### Shortcuts

Клавиатурные и mouse shortcuts настраиваются в:

```text
Settings -> Shortcuts
```

Настройки сохраняются в состоянии приложения и не теряются между перезапусками.

### Updates

Во вкладке updates можно подключить GitHub-репозиторий и проверку версий:

```text
Settings -> Updates
```

### Полезно знать

- Текущая Windows-сборка portable
- Пользовательские данные лежат в app data, а не в папке проекта
- Для публикации на GitHub удобно иметь установленный `Git for Windows`

### Troubleshooting

- Если packaged app не стартует напрямую из `.exe`, используй `launch-web-title-pro.cmd`
- Если `git` не распознается после установки, открой новый терминал
- Если поля `vMix` не видны, проверь доступность Web API

## EN

Web Title Pro is a desktop-first title control system for live production.
It combines a React control panel, a low-latency Node.js backend, and a browser renderer for `vMix`, `OBS`, and other browser-based graphics workflows.

### Features

- Controls local HTML/CSS/JS titles without reloading the browser source
- Supports multiple independent outputs with separate render URLs
- Works with both local templates and `vMix` title inputs
- Includes live rundown, data source tables, speaker timers, preview/live states, shortcuts, MIDI, and Bitfocus-ready HTTP API
- Packages as a Windows desktop app for broadcast operation

### Main Functions

- `SHOW / LIVE / HIDE` title control with real-time updates
- Live rundown with `Local` and `vMix` entries
- Editable data source tables
- Timers linked to rows and outputs
- `vMix` integration for timer inputs and text/title fields
- Configurable per-title shortcuts
- MIDI integration
- Companion / Bitfocus HTTP control
- Portable Windows build with splash screen and persistent state

### Project Structure

```text
client/       React control panel
server/       Express + WebSocket backend
renderer/     Browser renderer for Browser Input
desktop/      Electron desktop shell
templates/    Built-in local templates
data/         Default project state
scripts/      Launch and helper scripts
```

### Requirements

For normal packaged app usage:

- Windows PC
- `vMix` only if you need `vMix` integration
- MIDI device only if you need MIDI control

For running from source:

- Node.js
- npm

### Install And Run From Source

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

- Control panel: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Browser renderer: `http://localhost:4000/render.html`

### Desktop Mode

Run desktop mode in development:

```bash
npm.cmd run desktop
```

Build the portable `.exe`:

```bash
npm.cmd run package:win
```

Build output:

```text
release/WebTitlePro-0.1.6.exe
release/WebTitlePro.exe
```

`WebTitlePro-0.1.6.exe` is the versioned release asset.
`WebTitlePro.exe` is created automatically after packaging and is intended as the stable local executable for launch and updates.

Recommended launcher:

```text
launch-web-title-pro.cmd
```

It clears conflicting Electron environment flags and starts the packaged app safely.
For a direct desktop shortcut, prefer:

```text
release/WebTitlePro.exe
```

### How To Use

1. Start the desktop app or the dev environment.
2. Create or select an `Output`.
3. Add a local title or a `vMix` title.
4. Select a row from the live data source table.
5. Use `SHOW`, `LIVE`, or `HIDE`.
6. Copy the output render URL into `vMix` or `OBS` Browser Source.

### Local Templates

Local templates are standard HTML/CSS/JS folders.
Dynamic text fields are detected via `data-field`.
Timers are detected via `data-timer`.

Example:

```html
<span data-field="name" data-label="Name">John Doe</span>
<span data-timer="speaker">00:30</span>
```

### Template Rules

Imported templates are validated automatically.

Allowed:

- local `html`, `css`, `js`, `json`
- local images
- local fonts
- local `mp4` and `webm` videos

Blocked:

- external `http://` and `https://` resources
- external CDNs, fonts, and scripts
- `iframe`, `object`, and `embed` tags

Import limits:

- archive up to `25 MB`
- unpacked template up to `60 MB`
- up to `150` files per package
- single file up to `30 MB`

If validation fails, the application shows a detailed per-file error report so the designer can fix the package quickly.

### vMix Integration

Web Title Pro can:

- read `vMix` inputs
- send text to `vMix` title fields
- control timer-related text outputs

Typical local API address:

```text
http://127.0.0.1:8088
```

### Shortcuts

Keyboard and mouse shortcuts are configured in:

```text
Settings -> Shortcuts
```

They are stored in app state and persist between launches.

### Updates

The updates tab can be used to connect GitHub-based version checking:

```text
Settings -> Updates
```

### Helpful Notes

- The current Windows build is portable
- User data is stored in the application data directory, not in the project folder
- `Git for Windows` is recommended if you plan to publish from this machine

### Troubleshooting

- If the packaged app does not start directly from the `.exe`, use `launch-web-title-pro.cmd`
- If `git` is not recognized after installation, open a new terminal window
- If `vMix` fields do not appear, confirm that the Web API is enabled and reachable

## License

MIT
