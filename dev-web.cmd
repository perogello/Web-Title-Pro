@echo off
rem Dev mode: Vite HMR + Express backend, opens at http://localhost:5173
rem Edit React files and see changes instantly without rebuild.
setlocal
cd /d "%~dp0"
call npm run dev
endlocal
