# Web Title Pro 0.5.1

> **Portable 0.4.x → установщик.** Это первая основная (Latest) версия на инсталляторе.
> В старом portable на «Доступно обновление» жмите **«Позже»** и один раз поставьте
> `WebTitlePro-Setup-0.5.1.exe` вручную, затем удалите старые `WebTitlePro*.exe`.
> Данные (`%APPDATA%\web-title-pro`) подхватятся автоматически.
> Установленная 0.5.0 обновится сама.
>
> **Portable 0.4.x → installer.** First Latest release on the installer. In the old
> portable click **"Later"** on the update prompt, install `WebTitlePro-Setup-0.5.1.exe`
> once by hand and delete the old `WebTitlePro*.exe`. Data carries over automatically.
> An installed 0.5.0 updates itself.

## RU

- Диалоги при закрытии и обновлении, подтверждения и сброс — в стиле приложения вместо системных окон Windows.
- Работают Ctrl+S / Ctrl+Shift+S / Ctrl+O / Ctrl+N (и на русской раскладке). «Сохранить» при закрытии теперь сохраняет и закрывает приложение.
- Вернулись уведомления внизу экрана; в Settings › System: все / только ошибки / никакие.
- Recent: удалённый проект убирается из списка с понятным сообщением.
- Config: переименование output в строке, привязка титров показана номерами #1, #2…
- Live: колонки сжимаются уже текста без роста строк; клик рядом с ✎ в Data больше не выводит строку в эфир.
- Заметки: исправлены цвет, заливка и размер; доступны без источника данных.
- Таймеры: в выборе vMix-источника только GT-титры. Верхняя панель сжимается по ширине окна.

## EN

- Close/update prompts, confirmations and reset are app-styled instead of native Windows dialogs.
- Ctrl+S / Ctrl+Shift+S / Ctrl+O / Ctrl+N work (Russian layout too). "Save" on close now saves and closes the app.
- Bottom-of-screen notifications are back; Settings › System: all / errors only / none.
- Recent: a deleted project is removed from the list with a clear message.
- Config: inline output rename; title bindings shown as #1, #2… markers.
- Live: columns squeeze below their text without growing rows; clicking next to ✎ in Data no longer puts the row on air.
- Notes: colour, fill and size fixed; available without a data source.
- Timers: the vMix source list shows GT titles only. The top bar compacts to the window width.

## Artifacts

- `WebTitlePro-Setup-0.5.1.exe` — per-user NSIS installer.
- `WebTitlePro-Setup-0.5.1.exe.blockmap` — differential-update block map.
- `latest.yml` — electron-updater feed (must be uploaded to the release).
