#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala o ADLogs Collector como Windows Service.

.DESCRIPTION
    Configura o ambiente Python, instala dependências e registra o serviço Windows.
    Deve ser executado como Administrador.

.EXAMPLE
    .\install.ps1
    .\install.ps1 -Uninstall
    .\install.ps1 -Status
#>

param(
    [switch]$Uninstall,
    [switch]$Status,
    [string]$PythonPath = "python"
)

$ServiceName = "ADLogsCollector"
$CollectorDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ADLogs Collector - Instalador" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Status
if ($Status) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Host "Servico: $($svc.DisplayName)" -ForegroundColor Green
        Write-Host "Status:  $($svc.Status)"
    } else {
        Write-Host "Servico $ServiceName nao encontrado." -ForegroundColor Yellow
    }
    exit 0
}

# Desinstalar
if ($Uninstall) {
    Write-Host "Parando e removendo servico..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
    & $PythonPath "$CollectorDir\service.py" remove
    Write-Host "Servico removido." -ForegroundColor Green
    exit 0
}

# Verificar Python
Write-Host "[1/5] Verificando Python..." -ForegroundColor Yellow
try {
    $pythonVersion = & $PythonPath --version 2>&1
    Write-Host "      $pythonVersion" -ForegroundColor Green
} catch {
    Write-Error "Python nao encontrado. Instale Python 3.10+ e tente novamente."
    exit 1
}

# Criar ambiente virtual
Write-Host "[2/5] Criando ambiente virtual..." -ForegroundColor Yellow
$VenvPath = Join-Path $CollectorDir "venv"
if (-not (Test-Path $VenvPath)) {
    & $PythonPath -m venv $VenvPath
}
$PipPath = Join-Path $VenvPath "Scripts\pip.exe"
$PythonVenv = Join-Path $VenvPath "Scripts\python.exe"
Write-Host "      OK" -ForegroundColor Green

# Instalar dependencias
Write-Host "[3/5] Instalando dependencias..." -ForegroundColor Yellow
& $PipPath install -r "$CollectorDir\requirements.txt" --quiet
Write-Host "      OK" -ForegroundColor Green

# Configurar .env
Write-Host "[4/5] Configurando .env..." -ForegroundColor Yellow
$EnvFile = Join-Path $CollectorDir ".env"
if (-not (Test-Path $EnvFile)) {
    Copy-Item "$CollectorDir\.env.example" $EnvFile
    Write-Host "      .env criado a partir do .env.example" -ForegroundColor Yellow
    Write-Host "      IMPORTANTE: Edite o arquivo .env antes de iniciar o servico!" -ForegroundColor Red
    Write-Host "      Arquivo: $EnvFile" -ForegroundColor Red
} else {
    Write-Host "      .env ja existe" -ForegroundColor Green
}

# Instalar e iniciar servico
Write-Host "[5/5] Instalando servico Windows..." -ForegroundColor Yellow
Set-Location $CollectorDir
& $PythonVenv "service.py" install
& $PythonVenv "service.py" start
Write-Host "      Servico instalado e iniciado!" -ForegroundColor Green

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Instalacao concluida!" -ForegroundColor Green
Write-Host ""
Write-Host "  Comandos uteis:" -ForegroundColor White
Write-Host "  - Status:   Get-Service ADLogsCollector" -ForegroundColor Gray
Write-Host "  - Logs:     C:\ProgramData\ADLogs\collector.log" -ForegroundColor Gray
Write-Host "  - Parar:    Stop-Service ADLogsCollector" -ForegroundColor Gray
Write-Host "  - Iniciar:  Start-Service ADLogsCollector" -ForegroundColor Gray
Write-Host "  - Remover:  .\install.ps1 -Uninstall" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Cyan
