# Web Title Pro 0.4.6

## RU

Финальный релиз с исправленным portable updater и проверенным сценарием обновления с `0.4.5`.

- Исправлена критичная ошибка с portable-путями на кириллице: VBS launcher обновления теперь пишется как UTF-16LE с BOM, поэтому путь вроде `F:\тест` не превращается в неверный каталог.
- Updater заменяет и стабильный `WebTitlePro.exe`, и исходный versioned launcher, например `WebTitlePro-0.4.5.exe`.
- Ошибка замены secondary launcher больше не считается допустимой.
- Перед закрытием приложения окно прогресса обновления принудительно показывается и получает фокус.
- Для update quit добавлен жесткий fallback: окна уничтожаются явно, затем при необходимости вызывается `app.exit(0)`, чтобы helper не ждал старый процесс бесконечно.
- Status window больше не зависает, если новый запуск приложения успел почистить временный state-файл; cleanup теперь удаляет только устаревшие updater scratch-файлы.
- Status window берет иконку из exe приложения, чтобы не отображаться как обычный PowerShell window.
- Status window теперь хранит состояние WinForms timer в script-scope, закрывается после `done` и после успешного завершения удаляет свои временные `.ps1/.vbs/.json/.log` файлы.
- После обновления cached update state нормализуется: если текущая версия уже равна последнему релизу, UI показывает `up-to-date`, а не старый `available`.
- Добавлены regression-тесты для generated PowerShell, required secondary launcher, stale update state и non-Latin путей.
- E2E-тест: `F:\тест\WebTitlePro-0.4.5.exe` обновлен до GitHub `v0.4.6`, оба launcher-файла получили одинаковый hash финального build, status helper закрылся, updater scratch очистился, повторный запуск того же `WebTitlePro-0.4.5.exe` остался на `0.4.6`.
- SHA-256 финального `WebTitlePro-0.4.6.exe`: `74d0bf93eb11feb42165af6d274b5c00b2699037a628b924fa963c828e95e576`.

## EN

Final release with a fixed portable updater and a verified update path from `0.4.5`.

- Fixed a critical non-Latin portable path bug: the updater VBS launcher is now written as UTF-16LE with BOM, so a path such as `F:\тест` is not corrupted into a wrong folder.
- The updater replaces both the stable `WebTitlePro.exe` and the launched versioned file such as `WebTitlePro-0.4.5.exe`.
- Secondary launcher replacement failure is no longer treated as optional.
- The update progress window is forced visible and focused before the app closes.
- Update quit now has a hard fallback: windows are explicitly destroyed, then `app.exit(0)` is used if needed so the helper does not wait forever for the old process.
- The status window no longer hangs if the new app startup cleans the temporary state file; cleanup now removes only stale updater scratch files.
- The status window extracts the app icon from the exe so it is not shown as a plain PowerShell window.
- The status window now stores WinForms timer state in script scope, closes after the `done` state, and removes its temporary `.ps1/.vbs/.json/.log` scratch files after a successful update.
- Cached update state is normalized after restart: when the current app version already matches the latest release, the UI reports `up-to-date` instead of stale `available`.
- Added regression coverage for generated PowerShell, required secondary launcher replacement, stale update state, and non-Latin paths.
- E2E verified: `F:\тест\WebTitlePro-0.4.5.exe` updated to GitHub `v0.4.6`, both launchers matched the final build hash, the status helper closed, updater scratch was removed, and reopening the same `WebTitlePro-0.4.5.exe` stayed on `0.4.6`.
- Final `WebTitlePro-0.4.6.exe` SHA-256: `74d0bf93eb11feb42165af6d274b5c00b2699037a628b924fa963c828e95e576`.
