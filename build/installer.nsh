; Custom NSIS hooks, auto-included by electron-builder as build/installer.nsh.
;
; customUnInstall runs during a real, user-initiated uninstall (Windows
; "Apps & features" / the Uninstall shortcut). It asks whether to also delete
; the user's data. It is skipped:
;   - during an app update (${isUpdated}) so updating never wipes data;
;   - in silent mode (/S) via the /SD IDNO default, which is what the in-app
;     "Remove completely" uses — that path decides about data on its own.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Также удалить все данные Web Title Pro (настройки, титры, токены интеграций)?$\n$\nНажмите «Нет», чтобы сохранить их для будущей установки." /SD IDNO IDNO customKeepData
      RMDir /r "$APPDATA\web-title-pro"
    customKeepData:
  ${endIf}
!macroend
