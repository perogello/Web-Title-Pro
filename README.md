# Web Title Pro

## RU

Web Title Pro вЂ” desktop-first СЃРёСЃС‚РµРјР° СѓРїСЂР°РІР»РµРЅРёСЏ С‚РёС‚СЂР°РјРё РґР»СЏ live production.
РџСЂРёР»РѕР¶РµРЅРёРµ РѕР±СЉРµРґРёРЅСЏРµС‚ React-РїР°РЅРµР»СЊ СѓРїСЂР°РІР»РµРЅРёСЏ, Node.js backend, browser renderer Рё Windows desktop shell РґР»СЏ СЂР°Р±РѕС‚С‹ СЃ Р»РѕРєР°Р»СЊРЅС‹РјРё HTML-С‚РёС‚СЂР°РјРё, `vMix` Рё data-driven РіСЂР°С„РёРєРѕР№.

### Р§С‚Рѕ РЅРѕРІРѕРіРѕ РІ `0.2.7`

- Р РµРґР°РєС‚РёСЂСѓРµРјРѕСЃС‚СЊ С‚РёС‚СЂРѕРІ РїРѕ С€СЂРёС„С‚Р°Рј Рё С†РІРµС‚Р°Рј С‚РµРїРµСЂСЊ Р·Р°РґР°РµС‚СЃСЏ СЏРІРЅРѕ С‡РµСЂРµР· `fieldStyleEditor` РІ `template.json`
- Р”РѕР±Р°РІР»РµРЅС‹ guide Рё starter template РґР»СЏ СЂР°Р·СЂР°Р±РѕС‚С‡РёРєРѕРІ Р»РѕРєР°Р»СЊРЅС‹С… HTML-С‚РёС‚СЂРѕРІ
- Р”РѕР±Р°РІР»РµРЅС‹ РЅРѕРІС‹Рµ built-in С€Р°Р±Р»РѕРЅС‹ `Lavka 2 rows` Рё `Lavka 1 row`
- РћР±РЅРѕРІР»РµРЅ workflow style editor РґР»СЏ built-in Р»РѕРєР°Р»СЊРЅС‹С… С€Р°Р±Р»РѕРЅРѕРІ

### Р§С‚Рѕ СѓРјРµРµС‚

- Р›РѕРєР°Р»СЊРЅС‹Рµ HTML/CSS/JS С‚РёС‚СЂС‹ Р±РµР· РїРµСЂРµР·Р°РіСЂСѓР·РєРё Browser Source
- `vMix` titles Рё text fields
- РќРµСЃРєРѕР»СЊРєРѕ РЅРµР·Р°РІРёСЃРёРјС‹С… outputs
- `Data Source` С‚Р°Р±Р»РёС†С‹ СЃ СЂСѓС‡РЅС‹Рј РІРІРѕРґРѕРј, `TXT / CSV`, `CSV URL`, `Google Sheets`, `Yandex Disk`
- Mapping РґР°РЅРЅС‹С… РІ С‚РёС‚СЂС‹
- РўР°Р№РјРµСЂС‹, shortcuts, MIDI, Bitfocus / HTTP API
- РџСЂРѕРµРєС‚С‹: `New / Open / Save / Save As / Recent`
- РђРІС‚РѕР·Р°РіСЂСѓР·РєР° РїРѕСЃР»РµРґРЅРµРіРѕ РїСЂРѕРµРєС‚Р°
- Portable Windows build СЃ updater flow

### Р‘С‹СЃС‚СЂС‹Р№ СЃС‚Р°СЂС‚ РёР· РёСЃС…РѕРґРЅРёРєРѕРІ

```bash
npm install
npm run dev
```

Р•СЃР»Рё PowerShell Р±Р»РѕРєРёСЂСѓРµС‚ `npm.ps1`:

```bash
npm.cmd install
npm.cmd run dev
```

Р›РѕРєР°Р»СЊРЅС‹Рµ Р°РґСЂРµСЃР°:

- Control UI: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Renderer: `http://localhost:4000/render.html`

### Desktop СЂРµР¶РёРј

Р—Р°РїСѓСЃРє desktop-РІРµСЂСЃРёРё:

```bash
npm.cmd run desktop
```

РЎР±РѕСЂРєР° portable `.exe`:

```bash
npm.cmd run package:win
```

Р РµР·СѓР»СЊС‚Р°С‚:

```text
release/WebTitlePro-0.2.7.exe
release/WebTitlePro.exe
```

- `WebTitlePro-0.2.7.exe` вЂ” versioned release asset
- `WebTitlePro.exe` вЂ” РѕСЃРЅРѕРІРЅРѕР№ СЃС‚Р°Р±РёР»СЊРЅС‹Р№ С„Р°Р№Р» РґР»СЏ Р·Р°РїСѓСЃРєР° РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј

### РљР°Рє РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ

1. РћС‚РєСЂРѕР№ РїСЂРёР»РѕР¶РµРЅРёРµ.
2. РЎРѕР·РґР°Р№ РёР»Рё РІС‹Р±РµСЂРё `Output`.
3. Р”РѕР±Р°РІСЊ Р»РѕРєР°Р»СЊРЅС‹Р№ РёР»Рё `vMix` С‚РёС‚СЂ.
4. Р—Р°РіСЂСѓР·РёС‚Рµ `Data Source` РёР»Рё РІРІРµРґРё РґР°РЅРЅС‹Рµ РІСЂСѓС‡РЅСѓСЋ.
5. РџСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё РЅР°СЃС‚СЂРѕР№ `Mapping`.
6. РСЃРїРѕР»СЊР·СѓР№ `SHOW`, `SET` Рё `HIDE`.
7. РџРѕРґРєР»СЋС‡Рё render URL РІ `vMix` РёР»Рё `OBS` Browser Source.

### Data Source

РџРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ:

- Text
- TXT / CSV File
- CSV URL
- Google Sheets
- Yandex Disk public link

Р”Р»СЏ `Google Sheets` Рё `Yandex Disk` РґРѕСЃС‚СѓРїРЅС‹ `Refresh` Рё `Auto-refresh`.

### Yandex

РРЅС‚РµРіСЂР°С†РёСЏ СЃ Yandex РЅР°СЃС‚СЂР°РёРІР°РµС‚СЃСЏ Р»РѕРєР°Р»СЊРЅРѕ РІ:

```text
Settings -> Yandex
```

РџСЂРёР»РѕР¶РµРЅРёРµ РЅРµ РїРѕСЃС‚Р°РІР»СЏРµС‚СЃСЏ СЃ РіРѕС‚РѕРІС‹РјРё credentials РёР»Рё С‚РѕРєРµРЅР°РјРё.
РџРѕРґСЂРѕР±РЅР°СЏ РёРЅСЃС‚СЂСѓРєС†РёСЏ:

- [docs/YANDEX_CREDENTIALS.md](docs/YANDEX_CREDENTIALS.md)

### РЎС‚СЂСѓРєС‚СѓСЂР° РїСЂРѕРµРєС‚Р°

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

### What's New in `0.2.7`

- Fixed the updater flow so the app now handles project save prompts and closes correctly for update installation
- Added an `Update Now` button to the `Updates` section
- Restored the `Control UI URL` in `Settings -> Output`
- Added global `Next Title` and `Previous Title` commands for keyboard, MIDI, and Bitfocus
- Improved the multi-operator workflow by making the selected `Output` local to each client
- Added new built-in templates: `Khural PIP Title` and `Khural PIP Title 2`
### Main Features

- Local HTML/CSS/JS titles without reloading the Browser Source
- `vMix` titles and text fields
- Multiple independent outputs
- `Data Source` tables from manual text, `TXT / CSV`, `CSV URL`, `Google Sheets`, and `Yandex Disk`
- Mapping from source data into titles
- Timers, shortcuts, MIDI, Bitfocus / HTTP API
- Project workflow: `New / Open / Save / Save As / Recent`
- Auto-load last project on startup
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
release/WebTitlePro-0.2.7.exe
release/WebTitlePro.exe
```

- `WebTitlePro-0.2.7.exe` is the versioned release asset
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





