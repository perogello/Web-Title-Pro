@echo off
rem Dev mode: Electron window with current code, no portable .exe packaging.
rem Runs vite build (fast) then launches Electron against dist/.
rem Re-run this script after any code change to see updates.
setlocal
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Fix errors above and try again.
  pause
  exit /b 1
)
call npm run desktop:dev
endlocal
