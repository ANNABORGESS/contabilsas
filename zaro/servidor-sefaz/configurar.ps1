$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Write-Host ''
Write-Host ' Configuracao do certificado.'
Write-Host ''
Write-Host ' 1) Selecione o arquivo do certificado digital A1 (.pfx ou .p12)...'
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = 'Selecione o certificado A1'
$d.Filter = 'Certificado A1 (*.pfx;*.p12)|*.pfx;*.p12'
if ($d.ShowDialog() -ne 'OK') { Write-Host ' [ERRO] Nenhum certificado selecionado.'; exit 1 }
Copy-Item -LiteralPath $d.FileName -Destination (Join-Path $PWD 'certificado.pfx') -Force
Write-Host '    Certificado copiado.'
Write-Host ''
Write-Host ' 2) Digite a senha do certificado (ela fica so neste computador):'
$s = Read-Host -AsSecureString '    Senha'
$senha = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
$senha = $senha.Replace('\', '\\').Replace('"', '\"')
$token = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
$linhas = @('PORT=8787', "ZARO_TOKEN=$token", 'AMBIENTE=homologacao', 'UF_AUTOR=13', 'CERT_PFX_PATH=./certificado.pfx', ('CERT_PFX_SENHA="' + $senha + '"'), 'CORS_ORIGIN=*', 'NSU_FILE=./nsu.json')
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllLines((Join-Path $PWD '.env'), $linhas, $utf8)
[IO.File]::WriteAllText((Join-Path $PWD 'TOKEN-ZARO.txt'), $token, $utf8)
Write-Host ''
Write-Host ' ----------------------------------------------'
Write-Host ' TOKEN PARA COLAR NO ZARO:'
Write-Host (' ' + $token)
Write-Host ' ----------------------------------------------'
Write-Host ' (tambem fica salvo no arquivo TOKEN-ZARO.txt)'
