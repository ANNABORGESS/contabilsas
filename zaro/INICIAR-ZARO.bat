@echo off
chcp 65001 >nul
title ZARO
cd /d "%~dp0app"
echo.
echo  ==============================================
echo     ZARO - Sistema contabil
echo  ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] O Node.js nao foi encontrado.
  echo  Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b
)
if not exist "node_modules" (
  echo  Instalando componentes ^(so na primeira vez, pode levar alguns minutos^)...
  call npm ci --no-fund --no-audit
)
if not exist "node_modules" (
  echo  [ERRO] Falha ao instalar. Verifique a internet e tente de novo.
  pause
  exit /b
)
echo  Preparando o ZARO ^(ate 1 minuto^)...
call npm run build
if errorlevel 1 (
  echo  [ERRO] Nao foi possivel preparar o ZARO. Leia a mensagem acima.
  pause
  exit /b
)
echo.
echo  ZARO aberto em http://localhost:3000
echo  Os dados ficam na pasta app\dados. Faca copia dela para ter backup.
echo  Deixe esta janela ABERTA enquanto usa o ZARO.
echo.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
echo.
echo  O ZARO parou. Leia a mensagem acima.
pause
