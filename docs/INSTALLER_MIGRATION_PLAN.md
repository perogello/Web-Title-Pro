# План разработки: апдейтер и структура приложения (portable → installer)

Статус: **черновик, к исполнению.** Ветка: `feat/installer-migration`.
Автор решения: оператор (2026-07-07). Язык плана — рабочий, RU.

Цель — уйти от самодельного портабл-апдейтера и россыпи файлов к
модели «как у Lexogrine / Discord / VS Code»: **per-user NSIS-инсталлятор в
AppData + `electron-updater` + `asar`**. Это закрывает два требования:

- **стабильность апдейтера** — штатный обкатанный механизм вместо нашего
  `schtasks` + PowerShell self-replace;
- **стабильность приложения после апдейта** — `asar` (один архив, нет «призраков»
  от старых версий) + NSIS чисто заменяет установку.

Подпись кода — **не делаем** (на Windows `electron-updater` работает и без неё;
SmartScreen на первом запуске — как и сейчас у неподписанного портабла).
Портативность (запуск с флешки/чужих машин) — **не нужна**.

---

## 1. Критерии успеха

1. Обновление ставится штатным `electron-updater` без ручных действий (кроме
   первого cutover).
2. После апдейта в приложении нет файлов от предыдущей версии (нет «призраков»
   встроенных плагинов/шаблонов).
3. Данные оператора (`state.json`, кастомные плагины, настройки) переживают
   апдейт и сам переход portable → installer **без ручного копирования**.
4. Сетевые ошибки апдейта показываются понятным текстом + есть фолбэк «Открыть
   релиз вручную» (перенос уже сделанной логики поверх `electron-updater`).

## 2. Вне области (non-goals)

- Code-signing / нотаризация.
- Поддержка прокси в апдейтере (отдельная задача, если студия окажется за
  прокси).
- Сборка под macOS/Linux.
- Сохранение портативного носимого `.exe`.

---

## 3. Текущее состояние (проверенные факты)

- `package.json > build`: **`asar: false`**, `win.target: ["portable"]`,
  `portable.unpackDirName: "WebTitlePro"`. Код едет россыпью и распаковывается в
  фиксированную папку, оттуда исполняется.
- `build.files` = `dist, desktop, renderer, server, templates, package.json`.
  **`plugins/` в списке нет** — встроенные плагины сейчас в упакованную сборку
  не попадают.
- Апдейтер `desktop/integrations/updater.cjs` копирует **только `.exe`**
  (`Copy-UpdatePackage`), папку распаковки не трогает. Новый код «приезжает»
  только когда новый self-extracting stub перераспакуется поверх старого →
  удалённые/переименованные файлы остаются «призраками».
- `server/config.js`: `dataDir`/`storageDir` по умолчанию `rootDir/data` и
  `rootDir/storage`, **но** `desktop/main.cjs:1030-1031` в упакованном режиме
  переопределяет их на `app.getPath('userData')/{data,storage}`. Значит данные
  уже лежат в `%APPDATA%\Web Title Pro`, **вне** папки приложения, и от способа
  установки не зависят.
- `builtinTemplatesDir = rootDir/templates`, `builtinPluginsDir = rootDir/plugins`
  — сканируются перечислением каталога. `PluginService.init()` делает
  `fs.ensureDir(builtinPluginsDir)` — под `asar` это упадёт (read-only).

## 4. Целевая архитектура

### Дистрибуция и запуск

После перехода вместо одного носимого exe — три сущности:

| Что | Где | Роль |
|---|---|---|
| Инсталлятор `WebTitlePro-Setup-<ver>.exe` | скачивается / тянется авто-апдейтером | ставит/обновляет, одноразовый |
| Реальный exe `Web Title Pro.exe` + `resources\app.asar` | `%LOCALAPPDATA%\Programs\Web Title Pro\` | сам файл приложения, постоянный |
| Ярлык `.lnk` | меню Пуск / рабочий стол | то, что запускает оператор ежедневно |

### Данные

`%APPDATA%\Web Title Pro\{data,storage}` — единый путь для портабла и
инсталлятора. Переносится автоматически. Бэкап перед апдейтом уже делается
(`backupUserDataBeforeUpdate`).

---

## 5. Этапы

### Этап 0 — База
- [ ] Ветка `feat/installer-migration` от актуального `main`.
- [ ] Зафиксировать baseline: портабл текущей версии собирается и запускается.

### Этап 1 — asar-готовность (код + флаги сборки; дистрибуцию не меняем)
**СТАТУС: ГОТОВО** (коммит `build(installer stage 1): asar-ready builtin templates/plugins`).
Проверено на реальной asar-сборке: 14 builtin-шаблонов + bundled plugin-шаблон +
плагины bingo/rundown-remote сканируются, статика 200. Ключевая находка:
**fs-extra не asar-aware** → builtin-каталоги резолвим в `app.asar.unpacked`
(`server/config.js`). Плюс `plugins/**` раньше вообще не паковались.

Безопасно, обратимо, улучшает даже текущий портабл. Данные не затрагиваются.

- [ ] `server/plugins/plugin-service.js`: убрать `fs.ensureDir(builtinPluginsDir)`
      (builtin — read-only, создавать нечего), `ensureDir` оставить только для
      `customPluginsDir`.
- [ ] Ревизия `server/templates/template-service.js` — та же логика: builtin
      только читается, никакой записи в `rootDir/templates`.
- [ ] `package.json > build`: `asar: true` +
      `asarUnpack: ["plugins/**", "templates/**"]` (код — в архив; встроенные
      плагины/шаблоны — реальными файлами рядом для `readdir` и `express.static`).
- [ ] Добавить `plugins/**` в `build.files`.
- **Проверка:** собрать; поднять сервер в packaged-раскладке изолированно
      (`WEB_TITLE_PRO_DATA_DIR`/`STORAGE_DIR` в scratchpad); убедиться, что
      грузится, видит встроенные шаблоны/плагины, `/plugin-assets/builtin` и
      `/template-assets/builtin` отдают 200.
- **Риск:** низкий. **Откат:** revert флагов сборки.

### Этап 2 — Дистрибуция: NSIS + electron-updater (внешнее, трудно откатываемое)
**СТАТУС: КОД ГОТОВ** (коммит `build(installer stage 2): NSIS + electron-updater`).
Сделано: `electron-updater@6.8.9`; `win.target: nsis` (oneClick, perMachine:false),
`nsis.artifactName: WebTitlePro-Setup-${version}`, `publish: github`;
`package:win` → `electron-builder --win nsis --publish never`; новая интеграция
`desktop/integrations/auto-updater.cjs` (autoUpdater + наш прогресс/confirm +
классификатор ошибок + «Открыть релиз»/«Повторить»); `main.cjs` переключён.
Проверено на упакованной сборке: `Setup.exe`+`latest.yml`+`blockmap`+`app-update.yml`
генерятся; приложение поднимается, Этап-1-скан цел; autoUpdater корректно
резолвит GitHub-фид и **тихо** обрабатывает отсутствие `latest.yml` (404) у
старого релиза. **Полный цикл скачал/применил/перезапустил проверяется только на
первом опубликованном nsis-релизе (Этап 3/4).** Старый `updater.cjs` пока оставлен
(его тест зелёный); удаление — Этап 5.

- [ ] Зависимость `electron-updater`.
- [ ] `package.json > build`: `win.target` `portable` → `nsis`;
      `nsis: { oneClick: true, perMachine: false, ... }` (per-user AppData, без
      админки; ярлыки Пуск + рабочий стол);
      `publish: { provider: "github", owner: "perogello", repo: "Web-Title-Pro" }`.
- [ ] `desktop/main.cjs`: заменить вызовы самодельного апдейтера на `autoUpdater`
      (`checkForUpdatesAndNotify` / ручной flow), сохранив наш hero-UI,
      `confirmInstall` и логику «понятная ошибка + Открыть релиз» — обернуть ими
      события `checking-for-update`, `update-available`, `download-progress`,
      `update-downloaded`, `error`.
- [ ] Перенести классификатор ошибок (`describeUpdateError` / `describeNetworkError`)
      в обёртку над `autoUpdater` — сетевые сбои он тоже отдаёт.
- **Проверка:** собрать nsis; поставить локально; поднять «прошлую» версию в
      GitHub Releases (или тестовый feed) и обновиться → скачал / применил /
      перезапустился; проверить поведение при обрыве сети (понятная ошибка +
      Открыть релиз).
- **Риск:** высокий. **Откат:** вернуть `win.target: portable`, старый апдейтер
      ещё в дереве до Этапа 5.

### Этап 3 — Релиз-флоу
**СТАТУС: ГОТОВО (без публикации).**
- [x] README (EN+RU): Desktop Build → ассеты `WebTitlePro-Setup-<ver>.exe` +
      `.blockmap` + `latest.yml`; highlight «portable» → «per-user installer».
- [x] Bump версии `0.4.11 → 0.5.0` (package.json + package-lock.json).
- [x] Черновик короткой записи `0.5.0` в `desktop/changelog.json` (помечен
      `$draft`, дату/текст финализируем на релизе).
- Новый релиз-процесс: bump версии → `npm run package:win` →
      **`gh release create v<ver> release/WebTitlePro-Setup-<ver>.exe
      release/WebTitlePro-Setup-<ver>.exe.blockmap release/latest.yml`** (обязательно
      залить `latest.yml` — без него electron-updater не увидит апдейт) → RU/EN
      notes → снять `$draft` с changelog. Публикация — по явной команде оператора.
- `scripts/finalize-portable.cjs` больше не вызывается (портабл-специфичный) —
      удаление в Этапе 5.

### Этап 4 — Cutover существующих установок
- [ ] **Разово вручную** поставить nsis-сборку. Через старый авто-апдейт нельзя:
      его маска `WebTitlePro-*.exe` схватит `WebTitlePro-Setup-*.exe` и подложит
      инсталлятор как портабл — каша.
- [ ] Убедиться, что данные подхватились из `%APPDATA%\Web Title Pro` (без
      ручного копирования).
- [ ] Удалить старый носимый портабл-exe.

### Этап 5 — Чистка
**СТАТУС: ЧАСТИЧНО (файлы удалены; reset/uninstall — в код-ревью).**
- [x] Удалены `desktop/integrations/updater.cjs`, `tests/updater-integration.test.js`,
      `scripts/finalize-portable.cjs`. Тесты 154/154, билд чистый.
- [x] `portable`/`unpackDirName` уже убраны из конфига (Этап 2).
- [x] Память/доки обновлены под новую модель.
- [ ] **ОТКРЫТО (код-ревью):** `launchCleanupAndQuit` (reset/uninstall в
      `main.cjs`) всё ещё завязан на `PORTABLE_EXECUTABLE_*` env + стабильный
      портабл-лаунчер, которых под nsis нет — «Сбросить»/«Удалить» под
      инсталлятором нужно перевести на `process.execPath` / NSIS-uninstaller.

---

## 6. Риски и их снятие

| Риск | Снятие |
|---|---|
| Апдейт неподписанного .exe тихо кладётся в карантин AV | Тот же риск есть и сейчас у портабла; при проблеме — фолбэк «Открыть релиз» + ручная установка. Долгосрочно — сертификат (вне области). |
| Старый портабл-апдейтер схватит `Setup.exe` | Cutover делаем вручную (Этап 4), не через авто-апдейт. |
| `express.static` из asar капризит | Встроенные плагины/шаблоны вынесены `asarUnpack` — реальные файлы, поведение не меняется. |
| Потеря данных при переходе | Данные в userData, путь не зависит от способа установки; переносятся сами. |

## 7. Решённые вопросы

- **Портативность** — не нужна.
- **Code-signing** — не делаем (Windows + `electron-updater` работает без неё).

## 8. Порядок исполнения

Этапы 1 → 2 → 3 по одному, с проверкой на каждом и коммитом-чекпоинтом.
Этап 4 — в момент фактического выпуска. Этап 5 — после подтверждения, что новая
модель работает. Релиз делается **только по явной команде оператора**.
