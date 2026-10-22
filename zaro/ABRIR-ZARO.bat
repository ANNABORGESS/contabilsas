@echo off
chcp 65001 >nul
title ZARO
cd /d "%~dp0prototipo"
where node >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] Instale o Node.js LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b
)
node abrir.mjs
pause
