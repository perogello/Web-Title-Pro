@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
if exist "%~dp0release\win-unpacked\Web Title Pro.exe" (
  start "" "%~dp0release\win-unpacked\Web Title Pro.exe"
  exit /b 0
)
if exist "%~dp0release\WebTitlePro.exe" (
  start "" "%~dp0release\WebTitlePro.exe"
  exit /b 0
)
for /f "delims=" %%F in ('dir /b /a-d /o-n "%~dp0release\WebTitlePro-*.exe" 2^>nul') do (
  copy /Y "%~dp0release\%%F" "%~dp0release\WebTitlePro.exe" >nul
  start "" "%~dp0release\WebTitlePro.exe"
  exit /b 0
)
echo Web Title Pro executable was not found in the release folder.
exit /b 1
