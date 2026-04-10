#Requires -RunAsAdministrator
<#
.SYNOPSIS
    ADLogs Collector - Instalador completo e interativo.
.DESCRIPTION
    Pede o IP do servidor, instala Python se necessario,
    configura o .env, cria virtualenv, instala dependencias,
    testa conexao com banco e registra o Windows Service.
.EXAMPLE
    .\install-collector.ps1
    .\install-collector.ps1 -Uninstall
    .\install-collector.ps1 -Status
#>

param(
    [switch]$Uninstall,
    [switch]$Status
)

$ErrorActionPreference = "Stop"
$ServiceName     = "ADLogsCollector"
$CollectorDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$DefaultPassword = "ADLogs2026SecProd"
$PythonUrl       = "https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe"

function Write-Step { param($m) Write-Host "" ; Write-Host "[>] $m" -ForegroundColor Cyan }
function Write-OK   { param($m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "[!]  $m" -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "[X]  $m" -ForegroundColor Red ; exit 1 }

# --- Modo Status -------------------------------------------------------------
if ($Status) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Host "Servico: $($svc.DisplayName)" -ForegroundColor Cyan
        if ($svc.Status -eq "Running") {
            Write-Host "Status:  $($svc.Status)" -ForegroundColor Green
        } else {
            Write-Host "Status:  $($svc.Status)" -ForegroundColor Red
        }
        $log = "C:\ProgramData\ADLogs\collector.log"
        if (Test-Path $log) {
            Write-Host ""
            Write-Host "Ultimas linhas do log:" -ForegroundColor Cyan
            Get-Content $log -Tail 15
        }
    } else {
        Write-Warn "Servico $ServiceName nao encontrado."
    }
    exit 0
}

# --- Modo Desinstalar --------------------------------------------------------
if ($Uninstall) {
    Write-Step "Removendo servico $ServiceName..."
    Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $vp = Join-Path $CollectorDir "venv\Scripts\python.exe"
    if (Test-Path $vp) {
        Set-Location $CollectorDir
        & $vp service.py remove 2>&1 | Out-Null
    }
    Write-OK "Servico removido."
    exit 0
}

# --- Cabecalho ----------------------------------------------------------------
Clear-Host
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ADLogs Collector - Instalador"                   -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# --- Coleta de informacoes ---------------------------------------------------
Write-Host "Informe os dados do servidor ADLogs:" -ForegroundColor White
Write-Host ""

do {
    $ServerIP = (Read-Host "  IP ou hostname do servidor (ex: 192.168.1.75)").Trim()
    if (-not $ServerIP) { Write-Warn "Campo obrigatorio." }
} while (-not $ServerIP)

$DBPort = (Read-Host "  Porta do banco [5434]").Trim()
if (-not $DBPort) { $DBPort = "5434" }

$DBPassword = (Read-Host "  Senha do banco [$DefaultPassword]").Trim()
if (-not $DBPassword) { $DBPassword = $DefaultPassword }

$PollInterval = (Read-Host "  Intervalo de coleta em segundos [30]").Trim()
if (-not $PollInterval) { $PollInterval = "30" }

Write-Host ""
Write-Host "  Configuracao:" -ForegroundColor White
Write-Host "    Servidor : $ServerIP"
Write-Host "    Banco    : postgresql://adlogs:****@${ServerIP}:${DBPort}/adlogs"
Write-Host "    API      : http://$ServerIP"
Write-Host "    Intervalo: ${PollInterval}s"
Write-Host ""
$confirm = (Read-Host "Confirmar instalacao? [S/n]").Trim()
if ($confirm -match "^[Nn]$") { Write-Host "Cancelado." ; exit 0 }

# --- 1. Python ---------------------------------------------------------------
Write-Step "Verificando Python 3.10+..."
$PythonExe = $null

foreach ($candidate in @("python", "python3", "py")) {
    try {
        $v = & $candidate --version 2>&1
        if ("$v" -match "Python 3\.(1[0-9]|[2-9]\d)") {
            $PythonExe = $candidate
            Write-OK "Python encontrado: $v"
            break
        }
    } catch { }
}

if (-not $PythonExe) {
    Write-Warn "Python 3.10+ nao encontrado. Instalando Python 3.12..."
    $installer = "$env:TEMP\adlogs-python.exe"
    Write-Host "  Baixando de python.org..."
    Invoke-WebRequest -Uri $PythonUrl -OutFile $installer -UseBasicParsing
    Write-Host "  Instalando (aguarde)..."
    Start-Process $installer -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" -Wait
    Remove-Item $installer -ErrorAction SilentlyContinue
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
    try {
        $v = & python --version 2>&1
        $PythonExe = "python"
        Write-OK "Python instalado: $v"
    } catch {
        Write-Fail "Falha ao instalar Python. Instale de https://www.python.org e tente novamente."
    }
}

# --- 2. Ambiente virtual -----------------------------------------------------
Write-Step "Criando ambiente virtual Python..."
$VenvDir    = Join-Path $CollectorDir "venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip    = Join-Path $VenvDir "Scripts\pip.exe"

if (Test-Path $VenvDir) {
    Write-Warn "Ambiente virtual existente - recriando..."
    Remove-Item $VenvDir -Recurse -Force
}
& $PythonExe -m venv $VenvDir
Write-OK "Ambiente virtual criado"

# --- 3. Dependencias ---------------------------------------------------------
Write-Step "Instalando dependencias Python..."
$ErrorActionPreference = "Continue"
& $VenvPip install --upgrade pip --quiet 2>&1 | Out-Null
& $VenvPip install -r "$CollectorDir\requirements.txt" --quiet
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha ao instalar dependencias. Verifique a conexao com a internet." }
$ErrorActionPreference = "Stop"
Write-OK "Dependencias instaladas"

# --- 4. Arquivo .env ---------------------------------------------------------
Write-Step "Gravando .env..."
$envLines = @(
    "DB_URL=postgresql://adlogs:${DBPassword}@${ServerIP}:${DBPort}/adlogs",
    "API_URL=http://${ServerIP}",
    "POLL_INTERVAL=${PollInterval}",
    "COLLECTOR_VERSION=1.0.0",
    "SERVICE_NAME=ADLogsCollector",
    "SERVICE_DISPLAY_NAME=ADLogs - Coletor de Auditoria",
    "SERVICE_DESCRIPTION=Coleta eventos de login e acesso a arquivos do Windows Event Log."
)
[System.IO.File]::WriteAllLines("$CollectorDir\.env", $envLines, [System.Text.Encoding]::UTF8)
Write-OK ".env gravado"

# --- 5. Teste de conectividade -----------------------------------------------
Write-Step "Testando conexao com o banco em ${ServerIP}:${DBPort}..."
$testScript = "$env:TEMP\adlogs_test.py"
@"
import sys, os
sys.path.insert(0, r'$CollectorDir')
os.chdir(r'$CollectorDir')
try:
    import psycopg2
    conn = psycopg2.connect(
        host='$ServerIP', port=$DBPort, dbname='adlogs',
        user='adlogs', password='$DBPassword', connect_timeout=8
    )
    conn.close()
    print('OK')
except Exception as e:
    print('ERRO: ' + str(e))
    sys.exit(1)
"@ | Out-File -FilePath $testScript -Encoding UTF8

$result = & $VenvPython $testScript 2>&1
Remove-Item $testScript -ErrorAction SilentlyContinue

if ("$result" -match "^OK") {
    Write-OK "Conexao com o banco estabelecida"
} else {
    Write-Warn "Nao foi possivel conectar: $result"
    Write-Host ""
    Write-Host "  Verifique:" -ForegroundColor Yellow
    Write-Host "    1. O servidor $ServerIP esta acessivel nesta rede"
    Write-Host "    2. Porta $DBPort liberada no firewall do servidor"
    Write-Host "       No servidor Ubuntu: ufw allow from <IP_DESTE_AD> to any port $DBPort"
    Write-Host "    3. A senha esta correta"
    Write-Host ""
    $cont = (Read-Host "Continuar mesmo assim? [s/N]").Trim()
    if ($cont -notmatch "^[Ss]$") { exit 1 }
}

# --- 6. Remover versao anterior ----------------------------------------------
$oldSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($oldSvc) {
    Write-Step "Removendo instalacao anterior..."
    Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Set-Location $CollectorDir
    & $VenvPython service.py remove 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    Write-OK "Versao anterior removida"
}

# --- 7. Instalar e iniciar servico -------------------------------------------
Write-Step "Instalando Windows Service..."
Set-Location $CollectorDir
& $VenvPython service.py install

Write-Step "Iniciando servico..."
& $VenvPython service.py start
Start-Sleep -Seconds 6

# --- 8. Verificacao final ----------------------------------------------------
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-OK "Servico $ServiceName rodando!"
} else {
    Write-Warn "Servico pode nao ter iniciado. Teste:"
    Write-Host "  $VenvPython $CollectorDir\service.py debug" -ForegroundColor Gray
}

$logFile = "C:\ProgramData\ADLogs\collector.log"
Write-Step "Aguardando primeiros eventos (30s)..."
Start-Sleep -Seconds 32
if (Test-Path $logFile) {
    Write-Host ""
    Write-Host "Ultimas linhas do log:" -ForegroundColor Cyan
    Get-Content $logFile -Tail 10
}

# --- Resumo ------------------------------------------------------------------
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Instalacao concluida!" -ForegroundColor Green
Write-Host ""
Write-Host "  Servidor ADLogs : $ServerIP" -ForegroundColor White
Write-Host "  Servico Windows : $ServiceName" -ForegroundColor White
Write-Host ""
Write-Host "  Comandos uteis:" -ForegroundColor White
Write-Host "    Status    : .\install-collector.ps1 -Status" -ForegroundColor Gray
Write-Host "    Reiniciar : Restart-Service $ServiceName" -ForegroundColor Gray
Write-Host "    Logs      : Get-Content 'C:\ProgramData\ADLogs\collector.log' -Wait -Tail 20" -ForegroundColor Gray
Write-Host "    Remover   : .\install-collector.ps1 -Uninstall" -ForegroundColor Gray
Write-Host "    Debug     : $VenvPython $CollectorDir\service.py debug" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Cyan
