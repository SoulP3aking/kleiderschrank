@echo off
chcp 65001 >nul
title Digitaler Kleiderschrank
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ist nicht installiert. Bitte von https://nodejs.org installieren.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installiere Abhaengigkeiten ^(nur beim ersten Mal^) ...
  call npm install
)

echo.
echo  Kleiderschrank laeuft auf http://localhost:5173
echo  Zum Beenden dieses Fenster schliessen.
echo.
start "" http://localhost:5173
call npx vite --host 0.0.0.0 --port 5173
