#Requires -RunAsAdministrator
<#
.SYNOPSIS
    ADLogs Collector - Instalador/Atualizador completo e interativo.
.DESCRIPTION
    Instala Git se necessario, clona o repositorio, configura o ambiente
    e registra o Windows Service via NSSM.
.EXAMPLE
    .\install-collector.ps1
    .\install-collector.ps1 -Update
    .\install-collector.ps1 -Uninstall
    .\install-collector.ps1 -Status
    .\install-collector.ps1 -GitHubToken "ghp_SEUTOKEN"
#>

param(
    [switch]$Uninstall,
    [switch]$Status,
    [switch]$Update,
    [string]$GitHubToken = ""
)

$ErrorActionPreference = "Stop"
$ServiceName     = "ADLogsCollector"
$InstallBase     = "C:\adlogs"
$CollectorDir    = "$InstallBase\collector"
$RepoUrl         = "https://github.com/paulojr51/adlogs.git"
$DefaultPassword = "ADLogs2026SecProd"
$PythonUrl       = "https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe"
$GitInstallerUrl = "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/Git-2.47.1-64-bit.exe"
$NssmUrl         = "https://nssm.cc/release/nssm-2.24.zip"
$NssmExe         = "$CollectorDir\nssm.exe"

function Write-Step { param($m) Write-Host "" ; Write-Host "[>] $m" -ForegroundColor Cyan }
function Write-OK   { param($m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "[!]  $m" -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "[X]  $m" -ForegroundColor Red ; exit 1 }

function Get-CloneUrl {
    if ($GitHubToken) { return "https://${GitHubToken}@github.com/paulojr51/adlogs.git" }
    return $RepoUrl
}

# ─── Instala Git se necessario ───────────────────────────────────────────────
function Ensure-Git {
    Write-Step "Verificando Git..."
    try {
        $v = & git --version 2>&1
        Write-OK "Git ja instalado: $v"
        return
    } catch { }

    Write-Warn "Git nao encontrado. Instalando..."
    $hasWinget = $null
    try { $hasWinget = & winget --version 2>&1 } catch { }

    if ($hasWinget) {
        $ErrorActionPreference = "Continue"
        & winget install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
        $ErrorActionPreference = "Stop"
    } else {
        $gitInstaller = "$env:TEMP\adlogs-git.exe"
        Invoke-WebRequest -Uri $GitInstallerUrl -OutFile $gitInstaller -UseBasicParsing
        Start-Process $gitInstaller -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /COMPONENTS=ext\reg\shellhere,assoc,assoc_sh" -Wait
        Remove-Item $gitInstaller -ErrorAction SilentlyContinue
    }

    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
    try {
        $v = & git --version 2>&1
        Write-OK "Git instalado: $v"
    } catch {
        Write-Fail "Falha ao instalar Git. Instale de https://git-scm.com e tente novamente."
    }
}

# ─── Baixa NSSM se necessario ────────────────────────────────────────────────
function Ensure-Nssm {
    if (Test-Path $NssmExe) { return }
    Write-Step "Baixando NSSM (gerenciador de servico)..."
    $zip = "$env:TEMP\nssm.zip"
    $out = "$env:TEMP\nssm_extract"
    Invoke-WebRequest -Uri $NssmUrl -OutFile $zip -UseBasicParsing
    Expand-Archive $zip $out -Force
    $exe = Get-ChildItem $out -Filter "nssm.exe" -Recurse | Where-Object { $_.FullName -match "win64" } | Select-Object -First 1
    if (-not $exe) {
        $exe = Get-ChildItem $out -Filter "nssm.exe" -Recurse | Select-Object -First 1
    }
    Copy-Item $exe.FullName $NssmExe
    Remove-Item $zip,$out -Recurse -Force -ErrorAction SilentlyContinue
    Write-OK "NSSM pronto"
}

# ─── Registra servico com NSSM ────────────────────────────────────────────────
function Install-Service {
    param($VenvPython)
    Ensure-Nssm

    # Remove servico anterior se existir
    $old = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($old) {
        Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
        & $NssmExe remove $ServiceName confirm 2>&1 | Out-Null
        Start-Sleep -Seconds 2
    }

    $runner = "$CollectorDir\collector_runner.py"
    & $NssmExe install $ServiceName $VenvPython $runner
    & $NssmExe set $ServiceName AppDirectory $CollectorDir
    & $NssmExe set $ServiceName DisplayName "ADLogs - Coletor de Auditoria"
    & $NssmExe set $ServiceName Description "Coleta eventos de login e acesso a arquivos do Windows Event Log."
    & $NssmExe set $ServiceName Start SERVICE_AUTO_START
    & $NssmExe set $ServiceName AppRestartDelay 10000
    & $NssmExe set $ServiceName AppStdout "C:\ProgramData\ADLogs\collector.log"
    & $NssmExe set $ServiceName AppStderr "C:\ProgramData\ADLogs\collector.log"
    & $NssmExe set $ServiceName AppRotateFiles 1
    & $NssmExe set $ServiceName AppRotateBytes 10485760
}

# ─── Modo Status ─────────────────────────────────────────────────────────────
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

# ─── Modo Desinstalar ─────────────────────────────────────────────────────────
if ($Uninstall) {
    Write-Step "Removendo servico $ServiceName..."
    Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    if (Test-Path $NssmExe) {
        & $NssmExe remove $ServiceName confirm 2>&1 | Out-Null
    }
    Write-OK "Servico removido."
    exit 0
}

# ─── Modo Atualizacao ─────────────────────────────────────────────────────────
if ($Update) {
    Clear-Host
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "  ADLogs Collector - Atualizacao"                   -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan

    if (-not (Test-Path "$InstallBase\.git")) {
        Write-Fail "Repositorio nao encontrado em $InstallBase. Execute a instalacao completa primeiro."
    }

    Ensure-Git

    Write-Step "Baixando ultima versao do GitHub..."
    Set-Location $InstallBase
    $ErrorActionPreference = "Continue"
    if ($GitHubToken) { & git remote set-url origin (Get-CloneUrl) 2>&1 | Out-Null }
    & git fetch origin 2>&1 | Out-Null
    & git reset --hard origin/main 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    Write-OK "Codigo atualizado"

    $VenvPython = Join-Path $CollectorDir "venv\Scripts\python.exe"

    Write-Step "Atualizando dependencias Python..."
    $VenvPip = Join-Path $CollectorDir "venv\Scripts\pip.exe"
    $ErrorActionPreference = "Continue"
    & $VenvPip install -r "$CollectorDir\requirements.txt" --quiet 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    Write-OK "Dependencias atualizadas"

    Write-Step "Reinstalando servico..."
    Install-Service $VenvPython

    Write-Step "Iniciando servico..."
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 5

    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        Write-OK "Servico $ServiceName rodando!"
    } else {
        Write-Warn "Verifique: .\install-collector.ps1 -Status"
    }

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "  Atualizacao concluida!" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Cyan
    exit 0
}

# =============================================================================
# INSTALACAO COMPLETA
# =============================================================================
Clear-Host
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ADLogs Collector - Instalador"                   -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Git ------------------------------------------------------------------
Ensure-Git

# --- 2. Clonar ou atualizar repositorio --------------------------------------
Write-Step "Obtendo codigo do repositorio..."
if (Test-Path "$InstallBase\.git") {
    Write-Warn "Instalacao anterior encontrada. Atualizando repositorio..."
    Set-Location $InstallBase
    $ErrorActionPreference = "Continue"
    if ($GitHubToken) { & git remote set-url origin (Get-CloneUrl) 2>&1 | Out-Null }
    & git fetch origin 2>&1 | Out-Null
    & git reset --hard origin/main 2>&1 | Out-Null
    $ErrorActionPreference = "Stop"
    Write-OK "Repositorio atualizado"
} else {
    if (Test-Path $InstallBase) {
        Rename-Item $InstallBase "$InstallBase.backup.$(Get-Date -Format 'yyyyMMddHHmmss')" -ErrorAction SilentlyContinue
    }
    & git clone (Get-CloneUrl) $InstallBase
    Write-OK "Repositorio clonado em $InstallBase"
}

if (-not (Test-Path $CollectorDir)) {
    Write-Fail "Pasta collector nao encontrada em $CollectorDir."
}

# --- 3. Coleta de informacoes ------------------------------------------------
Write-Host ""
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
Write-Host "    Intervalo: ${PollInterval}s"
Write-Host ""
$confirm = (Read-Host "Confirmar instalacao? [S/n]").Trim()
if ($confirm -match "^[Nn]$") { Write-Host "Cancelado." ; exit 0 }

# --- 4. Python ---------------------------------------------------------------
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
    Invoke-WebRequest -Uri $PythonUrl -OutFile $installer -UseBasicParsing
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

# --- 5. Ambiente virtual -----------------------------------------------------
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

# --- 6. Dependencias ---------------------------------------------------------
Write-Step "Instalando dependencias Python..."
$ErrorActionPreference = "Continue"
& $VenvPip install --upgrade pip --quiet 2>&1 | Out-Null
& $VenvPip install -r "$CollectorDir\requirements.txt" --quiet
if ($LASTEXITCODE -ne 0) { Write-Fail "Falha ao instalar dependencias." }
$ErrorActionPreference = "Stop"
Write-OK "Dependencias instaladas"

# --- 7. Arquivo .env ---------------------------------------------------------
Write-Step "Gravando .env..."
$LOG_DIR = "C:\ProgramData\ADLogs"
New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null
$envLines = @(
    "DB_URL=postgresql://adlogs:${DBPassword}@${ServerIP}:${DBPort}/adlogs",
    "API_URL=http://${ServerIP}",
    "POLL_INTERVAL=${PollInterval}",
    "COLLECTOR_VERSION=1.0.0",
    "SERVICE_NAME=ADLogsCollector",
    "SERVICE_DISPLAY_NAME=ADLogs - Coletor de Auditoria",
    "SERVICE_DESCRIPTION=Coleta eventos de login e acesso a arquivos do Windows Event Log."
)
[System.IO.File]::WriteAllLines("$CollectorDir\.env", $envLines, (New-Object System.Text.UTF8Encoding $false))
Write-OK ".env gravado"

# --- 8. Teste de conectividade -----------------------------------------------
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
    Write-Host "    2. Porta $DBPort liberada no firewall"
    Write-Host "    3. A senha esta correta"
    Write-Host ""
    $cont = (Read-Host "Continuar mesmo assim? [s/N]").Trim()
    if ($cont -notmatch "^[Ss]$") { exit 1 }
}

# --- 9. Registrar e iniciar servico via NSSM ---------------------------------
Write-Step "Registrando Windows Service (NSSM)..."
Install-Service $VenvPython
Write-OK "Servico registrado"

Write-Step "Iniciando servico..."
Start-Service -Name $ServiceName
Start-Sleep -Seconds 6

# --- 10. Verificacao final ---------------------------------------------------
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-OK "Servico $ServiceName rodando!"
} else {
    Write-Warn "Servico pode nao ter iniciado."
    Write-Host "  Verifique o log: Get-Content 'C:\ProgramData\ADLogs\collector.log' -Tail 20" -ForegroundColor Gray
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
Write-Host "  Arquivos em     : $CollectorDir" -ForegroundColor White
Write-Host ""
Write-Host "  Comandos uteis:" -ForegroundColor White
Write-Host "    Status    : .\install-collector.ps1 -Status" -ForegroundColor Gray
Write-Host "    Atualizar : .\install-collector.ps1 -Update" -ForegroundColor Gray
Write-Host "    Reiniciar : Restart-Service $ServiceName" -ForegroundColor Gray
Write-Host "    Logs      : Get-Content 'C:\ProgramData\ADLogs\collector.log' -Wait -Tail 20" -ForegroundColor Gray
Write-Host "    Remover   : .\install-collector.ps1 -Uninstall" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Cyan
