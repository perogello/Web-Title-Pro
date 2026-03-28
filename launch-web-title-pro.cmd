@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
if exist "%~dp0release\win-unpacked\Web Title Pro.exe" (
  start "" "%~dp0release\win-unpacked\Web Title Pro.exe"
  exit /b 0
)
start "" "%~dp0release\WebTitlePro-0.1.4.exe"
