@echo off
chcp 65001 >nul
title Bar - pedidos na mesa
cd /d "%~dp0"
echo.
echo  ==============================================
echo     BAR - pedidos pagos na mesa
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
echo  Preparando o sistema ^(ate 1 minuto^)...
call npm run build
if errorlevel 1 (
  echo  [ERRO] Nao foi possivel preparar o sistema. Leia a mensagem acima.
  pause
  exit /b
)
echo.
echo  Neste computador: http://localhost:3100
echo  Nos celulares e tablets ^(mesmo Wi-Fi^), use um destes enderecos:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=*" %%b in ("%%a") do echo     http://%%b:3100
echo.
echo  Os dados ficam na pasta dados. Faca copia dela para ter backup.
echo  Deixe esta janela ABERTA durante o expediente.
echo  Se o Windows perguntar sobre o Firewall, permita o acesso em "Redes privadas".
echo.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3100"
call npm start
echo.
echo  O sistema parou. Leia a mensagem acima.
pause
