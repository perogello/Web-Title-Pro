# Web Title Pro 0.4.5

## RU

Patch-релиз для встроенного updater.

- Updater теперь обновляет не только стабильный `WebTitlePro.exe`, но и исходный versioned launcher, если приложение было запущено из файла вроде `WebTitlePro-0.4.4.exe`.
- После успешного обновления повторный ручной запуск старого versioned-файла больше не должен открывать прошлую версию приложения.
- Основной автоперезапуск по-прежнему идет через `WebTitlePro.exe`.
- Сохранены проверки из `0.4.4`: неполный download, неверный размер asset и невалидный `.exe` останавливают установку до закрытия приложения.
- Добавлены regression-тесты updater-а на выбор primary/secondary launcher targets и генерацию PowerShell helper.

## EN

Patch release for the built-in updater.

- The updater now updates both the stable `WebTitlePro.exe` and the original versioned launcher when the app was started from a file such as `WebTitlePro-0.4.4.exe`.
- After a successful update, manually launching the old versioned file again should no longer open the previous app version.
- Automatic restart still uses the stable `WebTitlePro.exe`.
- Existing `0.4.4` safety checks remain: incomplete downloads, asset size mismatches, and invalid `.exe` files stop installation before the app quits.
- Added updater regression tests for primary/secondary launcher target selection and PowerShell helper generation.
