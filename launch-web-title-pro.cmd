@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="

rem Preferred: stable portable file
if exist "%~dp0release\WebTitlePro.exe" (
  start "" "%~dp0release\WebTitlePro.exe"
  exit /b 0
)

rem Fallback: pick the latest versioned portable build and promote it to the stable name
for /f "delims=" %%F in ('dir /b /a-d /o-n "%~dp0release\WebTitlePro-*.exe" 2^>nul') do (
  copy /Y "%~dp0release\%%F" "%~dp0release\WebTitlePro.exe" >nul
  start "" "%~dp0release\WebTitlePro.exe"
  exit /b 0
)

echo Web Title Pro executable was not found in the release folder.
echo Build it first with: npm.cmd run package:win
exit /b 1
