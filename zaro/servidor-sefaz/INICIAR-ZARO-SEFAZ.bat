@echo off
chcp 65001 >nul
title ZARO SEFAZ
cd /d "%~dp0"
echo.
echo  ==============================================
echo     ZARO - Conexao com a SEFAZ (Amazonas)
echo  ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] O Node.js nao foi encontrado.
  echo  Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b
)

set "PRECISA="
if not exist ".env" set "PRECISA=1"
if not exist "certificado.pfx" set "PRECISA=1"
if exist ".env" findstr /r /c:"^ZARO_TOKEN=..*" .env >nul || set "PRECISA=1"
if exist ".env" findstr /r /c:"^CERT_PFX_SENHA=..*" .env >nul || set "PRECISA=1"
if defined PRECISA if exist ".env" del /q ".env"
if defined PRECISA powershell -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0configurar.ps1"
if not exist ".env" (
  echo.
  echo  [ERRO] A configuracao nao foi concluida.
  pause
  exit /b
)

if not exist "node_modules" (
  echo.
  echo  Instalando componentes ^(so na primeira vez, aguarde^)...
  call npm install --no-fund --no-audit
)
if not exist "node_modules" (
  echo  [ERRO] Falha ao instalar. Verifique a internet e tente de novo.
  pause
  exit /b
)

if not exist "cloudflared.exe" (
  echo.
  echo  Baixando o tunel seguro ^(so na primeira vez^)...
  powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
)
if exist "tunel.log" del /q "tunel.log"
if exist "TUNEL-ZARO.txt" del /q "TUNEL-ZARO.txt"
if exist "cloudflared.exe" start "" /b cloudflared.exe tunnel --no-autoupdate --url http://localhost:8787 --logfile tunel.log
if exist "cloudflared.exe" powershell -NoProfile -Command "$u=''; for($i=0;$i -lt 40 -and -not $u;$i++){ Start-Sleep 1; if(Test-Path tunel.log){ $m=Select-String -Path tunel.log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1; if($m){ $u=$m.Matches[0].Value } } }; if($u){ [IO.File]::WriteAllText('TUNEL-ZARO.txt',$u) }"
set "TUNEL=http://localhost:8787"
if exist "TUNEL-ZARO.txt" set /p TUNEL=<TUNEL-ZARO.txt
set /p TOKEN=<TOKEN-ZARO.txt
echo.
echo  No ZARO: Configuracoes ^> Integracoes ^> SEFAZ
echo    Endereco: %TUNEL%
echo    Token:    %TOKEN%
echo.
echo  ^(o endereco tambem fica no arquivo TUNEL-ZARO.txt e muda cada vez que abrir^)
echo.
echo  Deixe esta janela ABERTA enquanto usa a integracao.
echo.
start "" cmd /c "timeout /t 4 >nul & start %TUNEL%"
node --env-file=.env server.js
echo.
echo  O servidor parou. Leia a mensagem acima.
pause
