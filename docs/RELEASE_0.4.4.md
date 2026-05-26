# Web Title Pro 0.4.4

## RU

Patch-релиз для надежности встроенного обновления.

- Updater теперь проверяет, что скачанный `.exe` получен полностью.
- Перед применением обновления проверяется ожидаемый размер GitHub asset.
- PowerShell helper повторно проверяет размер и Windows PE-заголовок перед заменой `WebTitlePro.exe`.
- Если файл скачался частично, приложение больше не закрывается для установки битого обновления.
- Добавлены unit-тесты для неполного download stream и некорректного update package.

Если версия `0.4.2` или `0.4.3` уже успела заменить `WebTitlePro.exe` неполным файлом, скачайте `0.4.4` вручную один раз. Дальше встроенный updater будет защищен от такой ошибки.

## EN

Patch release focused on built-in updater reliability.

- The updater now verifies that the downloaded `.exe` stream completed fully.
- The downloaded package is checked against the expected GitHub asset size before install.
- The PowerShell helper re-checks file size and Windows PE signature before replacing `WebTitlePro.exe`.
- If a download is partial, the app no longer quits to apply a broken update package.
- Added unit tests for incomplete download streams and invalid update packages.

If version `0.4.2` or `0.4.3` already replaced `WebTitlePro.exe` with a partial file, download `0.4.4` manually once. Future built-in updates will be protected against this failure.
