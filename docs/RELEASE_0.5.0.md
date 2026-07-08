# Web Title Pro 0.5.0

Переход с portable на инсталлятор с автообновлением. Данные пользователя
(`%APPDATA%\web-title-pro`) сохраняются при переходе и обновлениях.

## RU

- Приложение теперь ставится инсталлятором (per-user, без прав администратора); обновления идут штатным `electron-updater` и применяются надёжнее, без дублей exe.
- При удалении можно выбрать: удалить только приложение или вместе со всеми данными — и в приложении (Settings → System), и через штатное удаление Windows.
- Ошибки обновления показываются понятным текстом; если сеть блокирует GitHub — есть кнопки «Открыть релиз» и «Повторить».
- Система плагинов: включение, выключение и настройка в Settings → Plugins.

## EN

- The app now installs via a per-user installer (no admin rights); updates use `electron-updater` and apply more reliably, with no duplicate exes.
- Uninstall now asks whether to remove the app only or the app together with all its data — both in-app (Settings → System) and via the standard Windows uninstall.
- Update errors are shown in plain language; when a network blocks GitHub, "Open Release Page" and "Try Again" are offered.
- Plugin system: enable, disable and configure plugins in Settings → Plugins.

## Artifacts

- `WebTitlePro-Setup-0.5.0.exe` — per-user NSIS installer.
- `WebTitlePro-Setup-0.5.0.exe.blockmap` — differential-update block map.
- `latest.yml` — electron-updater feed (must be uploaded to the release).

`WebTitlePro-Setup-0.5.0.exe` SHA-256: `729fe2039d179f1bb3b22df979e564cf72b171d33d903356341d800bba41a882`

## Publish (when ready — not done yet)

```bash
gh release create v0.5.0 --target main --title "Web Title Pro 0.5.0" --notes-file docs/RELEASE_0.5.0.md \
  release/WebTitlePro-Setup-0.5.0.exe \
  release/WebTitlePro-Setup-0.5.0.exe.blockmap \
  release/latest.yml
```

First cutover from portable is manual: install `WebTitlePro-Setup-0.5.0.exe`
once; data carries over automatically. Do not update via the old portable
prompt (it would grab the installer as if it were a portable exe).
