# Web Title Pro 0.5.0

> ## ⚠️ ВАЖНО: переход на установочную версию
>
> **Начиная с 0.5.0 приложение распространяется инсталлятором, а не portable‑exe.**
>
> - **Старые portable‑версии (`WebTitlePro.exe`, `WebTitlePro-0.4.x.exe`) лучше удалить вручную.**
> - **Portable корректно на новую версию НЕ обновится:** его встроенный апдейтер попытается подложить инсталлятор как portable‑файл. На уведомление «Доступно обновление» в старом portable жмите **«Позже»** и ставьте 0.5.0 **вручную** через `WebTitlePro-Setup-0.5.0.exe`.
> - **Данные не потеряются:** настройки, титры и плагины лежат в `%APPDATA%\web-title-pro` и подхватываются автоматически — переносить/чистить их не нужно.
>
> ---
>
> ## ⚠️ IMPORTANT: switch to an installer build
>
> **From 0.5.0 the app ships as an installer, not a portable exe.**
>
> - **Delete old portable copies (`WebTitlePro.exe`, `WebTitlePro-0.4.x.exe`) by hand.**
> - **Portable will NOT auto-update correctly** — its updater would drop the installer in as if it were a portable file. On the old portable's "update available" prompt click **"Later"** and install 0.5.0 manually from `WebTitlePro-Setup-0.5.0.exe`.
> - **Your data is safe:** settings, titles and plugins live in `%APPDATA%\web-title-pro` and carry over automatically.

## RU

- **Инсталлятор вместо portable:** установка per-user, без прав администратора; обновления идут штатным `electron-updater`, применяются надёжнее и **без дублей exe** (старый portable плодил `WebTitlePro.exe` + версионные копии — этого больше нет).
- **Чистая замена файлов при обновлении:** приложение упаковано в один `app.asar`, поэтому от старых версий не остаётся «мусорных» файлов.
- **Выбор при удалении:** можно удалить только приложение или вместе со всеми данными — и в приложении (Settings → System), и через штатное удаление Windows.
- **Понятные ошибки обновления:** вместо «fetch failed» — человеческий текст, а если сеть/прокси блокирует GitHub, есть кнопки «Открыть релиз» и «Повторить».
- **Плагины:** система плагинов теперь входит в сборку — включение, выключение и настройка в Settings → Plugins (референсные плагины bingo и rundown-remote в комплекте).

## EN

- **Installer instead of portable:** per-user install, no admin rights; updates use `electron-updater`, apply more reliably and **with no duplicate exes** (the old portable spawned `WebTitlePro.exe` plus versioned copies — gone now).
- **Clean file replacement on update:** the app is packed into a single `app.asar`, so no stale files are left behind from older versions.
- **Uninstall choice:** remove the app only, or the app together with all its data — both in-app (Settings → System) and via the standard Windows uninstall.
- **Clear update errors:** plain-language messages instead of "fetch failed", plus "Open Release Page" / "Try Again" when a network or proxy blocks GitHub.
- **Plugins:** the plugin system now ships in the build — enable, disable and configure plugins in Settings → Plugins (reference plugins bingo and rundown-remote included).

## Artifacts

- `WebTitlePro-Setup-0.5.0.exe` — per-user NSIS installer.
- `WebTitlePro-Setup-0.5.0.exe.blockmap` — differential-update block map.
- `latest.yml` — electron-updater feed (must be uploaded to the release).

`WebTitlePro-Setup-0.5.0.exe` SHA-256: `965c1ad35dc1a6fbc8817b92451344d29dd52c582d8c28005d80f24c7a5a3e57`

## Install

First install is manual: run `WebTitlePro-Setup-0.5.0.exe` once; data carries
over automatically from any previous portable version. Then delete the old
portable exe files by hand.
