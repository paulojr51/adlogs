#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Instala o ADLogs Collector como Windows Service.

.DESCRIPTION
    - Instala Python 3.11 automaticamente se nao encontrado
    - Instala dependencias no Python do sistema
    - Cria o .env interativamente (pergunta chave e URL da API)
    - Registra e inicia o servico Windows
    - Habilita auditoria do Windows (logon/logoff)
    Deve ser executado como Administrador.

.EXAMPLE
    .\install.ps1
    .\install.ps1 -Uninstall
    .\install.ps1 -Status
    .\install.ps1 -EnableAuditOnly
#>

param(
    [switch]$Uninstall,
    [switch]$Status,
    [switch]$EnableAuditOnly
)

$ServiceName     = "ADLogsCollector"
$CollectorDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonInstaller = "C:\temp\python-setup.exe"

# Forca TLS 1.2 para todos os downloads
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step($n, $total, $msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Yellow
}
function Write-OK($msg = "OK") {
    Write-Host "      $msg" -ForegroundColor Green
}
function Write-Warn($msg) {
    Write-Host "  AVISO: $msg" -ForegroundColor Yellow
}
function Write-Fail($msg) {
    Write-Host "  ERRO: $msg" -ForegroundColor Red
}

function Enable-WindowsAudit {
    Write-Host ""
    Write-Host "Habilitando politicas de auditoria do Windows..." -ForegroundColor Yellow

    $policies = @(
        @{ sub = "Logon";                      s = "enable"; f = "enable" },
        @{ sub = "Logoff";                     s = "enable"; f = "enable" },
        @{ sub = "Other Logon/Logoff Events";  s = "enable"; f = "enable" },
        @{ sub = "Account Lockout";            s = "enable"; f = "enable" },
        @{ sub = "File System";                s = "enable"; f = "enable" },
        @{ sub = "Handle Manipulation";        s = "enable"; f = "disable" },
        @{ sub = "User Account Management";    s = "enable"; f = "enable" },
        @{ sub = "Security Group Management";  s = "enable"; f = "enable" }
    )

    foreach ($p in $policies) {
        auditpol /set /subcategory:"$($p.sub)" /success:$($p.s) /failure:$($p.f) 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "      [OK] $($p.sub)" -ForegroundColor Green
        } else {
            Write-Host "      [--] $($p.sub) (ignorado)" -ForegroundColor DarkGray
        }
    }

    # Garantir auditoria por subcategoria habilitada no registro
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa"
    $val = (Get-ItemProperty -Path $regPath -Name "SCENoApplyLegacyAuditPolicy" -ErrorAction SilentlyContinue)."SCENoApplyLegacyAuditPolicy"
    if ($val -ne 1) {
        Set-ItemProperty -Path $regPath -Name "SCENoApplyLegacyAuditPolicy" -Value 1 -Type DWord
        Write-Host "      [OK] Auditoria por subcategoria habilitada no registro" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Verificando:" -ForegroundColor Cyan
    auditpol /get /subcategory:"Logon","Logoff","Account Lockout"
}

# Modo: somente auditoria
if ($EnableAuditOnly) {
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "  ADLogs - Habilitar Auditoria Windows" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Enable-WindowsAudit
    exit 0
}

# Modo: status
if ($Status) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Host "Servico: $($svc.DisplayName)" -ForegroundColor Green
        Write-Host "Status:  $($svc.Status)"
        Write-Host "Logs:    C:\ProgramData\ADLogs\collector.log"
    } else {
        Write-Host "Servico $ServiceName nao encontrado." -ForegroundColor Yellow
    }
    exit 0
}

# Modo: desinstalar
if ($Uninstall) {
    Write-Host "Parando e removendo servico..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    python "$CollectorDir\service.py" remove 2>&1 | Out-Null
    Write-Host "Servico removido." -ForegroundColor Green
    exit 0
}

# Instalacao completa
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ADLogs Collector - Instalador" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$TOTAL = 6

# PASSO 1: Python
Write-Step 1 $TOTAL "Verificando Python 3.10+..."

$pythonOk = $false
try {
    $ver = & python --version 2>&1
    if ($ver -match "Python 3\.(\d+)" -and [int]$Matches[1] -ge 10) {
        Write-OK $ver
        $pythonOk = $true
    } else {
        Write-Warn "Versao incompativel: $ver"
    }
} catch {
    Write-Warn "Python nao encontrado no PATH."
}

if (-not $pythonOk) {
    Write-Host "      Baixando Python 3.11.9..." -ForegroundColor Yellow
    if (-not (Test-Path "C:\temp")) { New-Item -ItemType Directory "C:\temp" | Out-Null }

    try {
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -OutFile $PythonInstaller -UseBasicParsing
    } catch {
        Write-Fail "Falha ao baixar Python. Instale manualmente em python.org com 'Add to PATH'."
        exit 1
    }

    Write-Host "      Instalando Python (aguarde ~60s)..." -ForegroundColor Yellow
    Start-Process -FilePath $PythonInstaller -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" -Wait -NoNewWindow

    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

    try {
        $ver = & python --version 2>&1
        Write-OK "Python instalado: $ver"
    } catch {
        Write-Fail "Python instalado mas nao esta no PATH. Feche e reabra o PowerShell como Admin e rode novamente."
        exit 1
    }
}

# Registrar pywin32 no sistema (obrigatorio para o servico Windows funcionar)
Write-Host "      Registrando pywin32 no sistema..." -ForegroundColor Yellow
pip install pywin32==308 --quiet 2>&1 | Out-Null
$postInstall = "C:\Program Files\Python311\Scripts\pywin32_postinstall.py"
if (-not (Test-Path $postInstall)) {
    $siteDir = (python -c "import site; print(site.getsitepackages()[0])" 2>&1).Trim()
    $postInstall = Join-Path (Split-Path $siteDir -Parent) "Scripts\pywin32_postinstall.py"
}
if (Test-Path $postInstall) {
    python $postInstall -install -silent 2>&1 | Out-Null
    Write-OK "pywin32 registrado"
} else {
    Write-Warn "pywin32_postinstall.py nao localizado — se o servico falhar, rode manualmente: python -m pywin32_postinstall -install"
}

# PASSO 2: Dependencias no sistema
Write-Step 2 $TOTAL "Instalando dependencias no Python do sistema..."
pip install pywin32==308 requests==2.32.3 python-dotenv==1.0.1 psycopg2-binary==2.9.10 --quiet 2>&1 | Out-Null
Write-OK "Dependencias instaladas"

# PASSO 3: Ambiente virtual
Write-Step 3 $TOTAL "Criando ambiente virtual (para debug)..."
$VenvPath   = Join-Path $CollectorDir "venv"
$PipVenv    = Join-Path $VenvPath "Scripts\pip.exe"
if (-not (Test-Path $VenvPath)) {
    python -m venv $VenvPath 2>&1 | Out-Null
}
& $PipVenv install -r "$CollectorDir\requirements.txt" --quiet 2>&1 | Out-Null
Write-OK "Venv pronto"

# PASSO 4: Configurar .env
Write-Step 4 $TOTAL "Configurando .env..."
$EnvFile    = Join-Path $CollectorDir ".env"
$needsConfig = $true

if (Test-Path $EnvFile) {
    $existing = Get-Content $EnvFile -Raw
    if ($existing -match "SERVER_API_KEY=adlogs_") {
        Write-OK ".env ja configurado"
        $needsConfig = $false
    } else {
        Write-Warn ".env existe mas SERVER_API_KEY nao configurada. Reconfigurando..."
    }
}

if ($needsConfig) {
    Write-Host ""
    Write-Host "  Informe os dados de conexao com o servidor central ADLogs:" -ForegroundColor Cyan
    Write-Host ""

    $defaultUrl = "http://192.168.2.250:3001"
    $apiUrl = Read-Host "  URL da API (Enter para '$defaultUrl')"
    if ([string]::IsNullOrWhiteSpace($apiUrl)) { $apiUrl = $defaultUrl }

    do {
        $apiKey = (Read-Host "  Chave do servidor (SERVER_API_KEY)").Trim()
        if (-not $apiKey.StartsWith("adlogs_")) {
            Write-Warn "A chave deve comecar com 'adlogs_'. Tente novamente."
        }
    } while (-not $apiKey.StartsWith("adlogs_"))

    $intervalStr = Read-Host "  Intervalo de coleta em segundos (Enter para 30)"
    if ([string]::IsNullOrWhiteSpace($intervalStr) -or $intervalStr -notmatch "^\d+$") {
        $interval = 30
    } else {
        $interval = [int]$intervalStr
    }

    $envContent = "API_URL=$apiUrl`r`nSERVER_API_KEY=$apiKey`r`nPOLL_INTERVAL=$interval`r`nCOLLECTOR_VERSION=1.0.0`r`nSERVICE_NAME=ADLogsCollector`r`nSERVICE_DISPLAY_NAME=ADLogs - Coletor de Auditoria`r`nSERVICE_DESCRIPTION=Coleta eventos de login e acesso a arquivos do Windows Event Log."
    Set-Content -Path $EnvFile -Value $envContent -Encoding UTF8
    Write-OK ".env criado"
}

# PASSO 5: Instalar e iniciar servico
Write-Step 5 $TOTAL "Instalando servico Windows..."
Set-Location $CollectorDir

$svcExisting = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svcExisting) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    python "$CollectorDir\service.py" remove 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

python "$CollectorDir\service.py" install 2>&1 | Out-Null

# Reinicio automatico em caso de falha
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null

Start-Service $ServiceName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 6

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-OK "Servico iniciado"
} else {
    Write-Fail "Servico nao iniciou automaticamente."
    Write-Host "      Para diagnosticar: .\venv\Scripts\python.exe service.py debug" -ForegroundColor Gray
}

# PASSO 6: Auditoria Windows
Write-Step 6 $TOTAL "Habilitando auditoria do Windows..."
Enable-WindowsAudit

# Resultado final
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
$finalSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($finalSvc -and $finalSvc.Status -eq "Running") {
    Write-Host "  Instalacao concluida com sucesso!" -ForegroundColor Green
} else {
    Write-Host "  Instalacao concluida com alertas. Verifique o log." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Comandos uteis:" -ForegroundColor White
Write-Host "  - Status:    .\install.ps1 -Status" -ForegroundColor Gray
Write-Host "  - Logs:      Get-Content C:\ProgramData\ADLogs\collector.log -Tail 30" -ForegroundColor Gray
Write-Host "  - Debug:     .\venv\Scripts\python.exe service.py debug" -ForegroundColor Gray
Write-Host "  - Reiniciar: Restart-Service ADLogsCollector" -ForegroundColor Gray
Write-Host "  - Remover:   .\install.ps1 -Uninstall" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Cyan
