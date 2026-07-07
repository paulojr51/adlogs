#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Gerencia as politicas de monitoramento do ADLogs neste servidor Windows.

.DESCRIPTION
    - Habilita ou desabilita politicas de auditoria do Windows (auditpol)
    - Sincroniza automaticamente com o servidor ADLogs via API
    - Pode ser executado a qualquer momento para ajustar o monitoramento

.EXAMPLE
    .\audit.ps1               # Modo interativo: habilitar monitoramento
    .\audit.ps1 -Disable      # Modo interativo: desabilitar monitoramento
    .\audit.ps1 -Status       # Exibe o estado atual (Windows + API)
#>

param(
    [switch]$Disable,
    [switch]$Status
)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile   = Join-Path $ScriptDir ".env"

function Read-EnvFile($path) {
    $vars = @{}
    if (-not (Test-Path $path)) { return $vars }
    foreach ($line in (Get-Content $path)) {
        if ($line -match "^([^#=]+)=(.*)$") {
            $vars[$Matches[1].Trim()] = $Matches[2].Trim()
        }
    }
    return $vars
}

$cfg    = Read-EnvFile $EnvFile
$ApiUrl = $cfg["API_URL"]
$ApiKey = $cfg["SERVER_API_KEY"]

if (-not $ApiUrl -or -not $ApiKey) {
    Write-Host ""
    Write-Host "  ERRO: .env nao encontrado ou incompleto." -ForegroundColor Red
    Write-Host "  Execute install.ps1 primeiro, ou crie o .env com API_URL e SERVER_API_KEY." -ForegroundColor Red
    Write-Host ""
    exit 1
}

function Write-Title($msg) {
    $sep = "=" * ($msg.Length + 4)
    Write-Host ""
    Write-Host "  $sep" -ForegroundColor Cyan
    Write-Host "  | $msg |" -ForegroundColor Cyan
    Write-Host "  $sep" -ForegroundColor Cyan
    Write-Host ""
}
function Write-OK($msg)   { Write-Host "      [OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "      [AVISO] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "      [ERRO]  $msg" -ForegroundColor Red }

function Get-AuditEnabled($subcategory) {
    $out = auditpol /get /subcategory:"$subcategory" 2>&1 | Out-String
    return ($out -match "Success|Exito|Sucesso|Failure|Falha") -and ($out -notmatch "No Auditing|Sem auditoria|Sin auditoria")
}

function Invoke-Api($method, $path, $body = $null) {
    $headers = @{
        "x-api-key"    = $ApiKey
        "Content-Type" = "application/json"
    }
    $uri = $ApiUrl.TrimEnd("/") + $path
    try {
        if ($body) {
            $json = $body | ConvertTo-Json -Compress -Depth 3
            $resp = Invoke-WebRequest -Uri $uri -Method $method -Headers $headers -Body $json -UseBasicParsing
        } else {
            $resp = Invoke-WebRequest -Uri $uri -Method $method -Headers $headers -UseBasicParsing
        }
        return ($resp.Content | ConvertFrom-Json)
    } catch {
        Write-Warn "API nao respondeu ($uri): $($_.Exception.Message)"
        return $null
    }
}

function Enable-SubcategoryAudit {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Lsa"
    $val = (Get-ItemProperty -Path $regPath -Name "SCENoApplyLegacyAuditPolicy" -ErrorAction SilentlyContinue)."SCENoApplyLegacyAuditPolicy"
    if ($val -ne 1) {
        Set-ItemProperty -Path $regPath -Name "SCENoApplyLegacyAuditPolicy" -Value 1 -Type DWord
    }
}

$categories = @(
    @{
        num      = 1
        name     = "Login/Logoff"
        desc     = "Autenticacao, logoff e bloqueio de conta (Event 4624/4634/4625)"
        apiField = "collectLogins"
        auditpol = @(
            @{ sub = "Logon";                     s = "enable"; f = "enable" },
            @{ sub = "Logoff";                    s = "enable"; f = "enable" },
            @{ sub = "Other Logon/Logoff Events"; s = "enable"; f = "enable" },
            @{ sub = "Account Lockout";           s = "enable"; f = "enable" }
        )
        onEnable  = $null
        onDisable = $null
        note      = ""
    },
    @{
        num      = 2
        name     = "Arquivos"
        desc     = "Acesso a arquivos e pastas (Event 4663)"
        apiField = "collectFiles"
        auditpol = @(
            @{ sub = "File System";         s = "enable"; f = "enable" },
            @{ sub = "Handle Manipulation"; s = "enable"; f = "disable" }
        )
        onEnable  = $null
        onDisable = $null
        note      = "Apos habilitar: configure as pastas em Configuracoes > Pastas Monitoradas no ADLogs e aplique SACL nas pastas via Propriedades > Seguranca > Auditoria."
    },
    @{
        num      = 3
        name     = "Processos"
        desc     = "Criacao de processos e linha de comando (Event 4688)"
        apiField = "collectProcesses"
        auditpol = @(
            @{ sub = "Process Creation"; s = "enable"; f = "disable" }
        )
        onEnable  = {
            $reg = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Audit"
            if (-not (Test-Path $reg)) { New-Item -Path $reg -Force | Out-Null }
            Set-ItemProperty -Path $reg -Name "ProcessCreationIncludeCmdLine_Enabled" -Value 1 -Type DWord
            Write-OK "Linha de comando habilitada no Event 4688"
        }
        onDisable = {
            $reg = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Audit"
            if (Test-Path $reg) {
                Set-ItemProperty -Path $reg -Name "ProcessCreationIncludeCmdLine_Enabled" -Value 0 -Type DWord
                Write-OK "Linha de comando desabilitada"
            }
        }
        note      = ""
    },
    @{
        num      = 4
        name     = "Contas"
        desc     = "Criacao/exclusao/bloqueio de usuarios e grupos (Event 4720/4726/4740)"
        apiField = "collectAccountChanges"
        auditpol = @(
            @{ sub = "User Account Management";     s = "enable"; f = "enable" },
            @{ sub = "Security Group Management";   s = "enable"; f = "enable" },
            @{ sub = "Computer Account Management"; s = "enable"; f = "enable" }
        )
        onEnable  = $null
        onDisable = $null
        note      = ""
    }
)

# --- Status ---
if ($Status) {
    Write-Title "ADLogs - Estado do Monitoramento"

    Write-Host "  Windows Audit Policy (este servidor):" -ForegroundColor White
    Write-Host ""
    foreach ($cat in $categories) {
        $anyOn = $cat.auditpol | Where-Object { Get-AuditEnabled $_.sub }
        $stateStr = if ($anyOn) { "HABILITADO" } else { "desabilitado" }
        $color    = if ($anyOn) { "Green" } else { "DarkGray" }
        Write-Host ("    [{0}] {1,-16} {2}" -f $cat.num, $cat.name, $stateStr) -ForegroundColor $color
    }
    $regProc = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Audit"
    $cmdLine = (Get-ItemProperty -Path $regProc -Name "ProcessCreationIncludeCmdLine_Enabled" -ErrorAction SilentlyContinue)."ProcessCreationIncludeCmdLine_Enabled"
    $cmdStr  = if ($cmdLine -eq 1) { "sim" } else { "nao" }
    Write-Host "         Linha de comando (4688): $cmdStr" -ForegroundColor DarkGray

    Write-Host ""
    Write-Host "  Configuracao no servidor ADLogs (API):" -ForegroundColor White
    Write-Host ""
    $config = Invoke-Api "GET" "/collector/config"
    if ($config) {
        $apiMap = @(
            @{ field = "collectLogins";         label = "Login/Logoff" },
            @{ field = "collectFiles";          label = "Arquivos" },
            @{ field = "collectProcesses";      label = "Processos" },
            @{ field = "collectAccountChanges"; label = "Contas" },
            @{ field = "collectSqlServer";      label = "SQL Server" }
        )
        foreach ($item in $apiMap) {
            $val   = $config.($item.field)
            $str   = if ($val) { "HABILITADO" } else { "desabilitado" }
            $color = if ($val) { "Green" } else { "DarkGray" }
            Write-Host ("    {0,-20} {1}" -f $item.label, $str) -ForegroundColor $color
        }
    } else {
        Write-Warn "Nao foi possivel consultar a API."
    }
    Write-Host ""
    exit 0
}

# --- Habilitar / Desabilitar ---
$actionLabel = if ($Disable) { "DESABILITAR" } else { "HABILITAR" }
Write-Title "ADLogs - $actionLabel Monitoramento"

Write-Host "  Categorias disponiveis:" -ForegroundColor White
Write-Host ""
foreach ($cat in $categories) {
    Write-Host ("    [{0}] {1,-16} {2}" -f $cat.num, $cat.name, $cat.desc) -ForegroundColor White
    if ($cat.note) {
        Write-Host "         >> $($cat.note)" -ForegroundColor DarkYellow
    }
}
Write-Host ""

$sel = (Read-Host "  Numeros para $actionLabel (separados por virgula, Enter = todos)").Trim()

if ([string]::IsNullOrWhiteSpace($sel)) {
    $selected = $categories
} else {
    $nums     = $sel -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -match "^\d+$" }
    $selected = @($categories | Where-Object { $nums -contains [string]$_.num })
}

if ($selected.Count -eq 0) {
    Write-Warn "Nenhuma categoria valida selecionada. Encerrando."
    exit 1
}

Write-Host ""
Write-Host "  Aplicando alteracoes..." -ForegroundColor Cyan
Enable-SubcategoryAudit

$apiPatch = @{}

foreach ($cat in $selected) {
    Write-Host ""
    Write-Host "  --- $($cat.name) ---" -ForegroundColor Cyan

    if ($Disable) {
        foreach ($p in $cat.auditpol) {
            auditpol /set /subcategory:"$($p.sub)" /success:disable /failure:disable 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { Write-OK "$($p.sub)" }
            else { Write-Warn "$($p.sub) - nao encontrado nesta versao do Windows" }
        }
        if ($cat.onDisable) { & $cat.onDisable }
        $apiPatch[$cat.apiField] = $false
    } else {
        foreach ($p in $cat.auditpol) {
            auditpol /set /subcategory:"$($p.sub)" /success:$($p.s) /failure:$($p.f) 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { Write-OK "$($p.sub)" }
            else { Write-Warn "$($p.sub) - nao encontrado nesta versao do Windows" }
        }
        if ($cat.onEnable) { & $cat.onEnable }
        $apiPatch[$cat.apiField] = $true
        if ($cat.note) {
            Write-Host ""
            Write-Host "      >> $($cat.note)" -ForegroundColor DarkYellow
        }
    }
}

Write-Host ""
Write-Host "  Sincronizando com o servidor ADLogs..." -ForegroundColor Cyan
$result = Invoke-Api "PATCH" "/collector/config" $apiPatch
if ($result) {
    Write-OK "Configuracao sincronizada com sucesso"
} else {
    Write-Warn "API indisponivel no momento. Configuracao Windows foi aplicada."
    Write-Warn "Atualize manualmente em: Configuracoes > Servidor > Monitoramento no sistema."
}

Write-Host ""
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host "  Concluido!" -ForegroundColor Green
Write-Host ""
Write-Host "  Comandos uteis:" -ForegroundColor White
Write-Host "    .\audit.ps1 -Status    -> Ver estado atual" -ForegroundColor Gray
Write-Host "    .\audit.ps1 -Disable   -> Desabilitar categorias" -ForegroundColor Gray
Write-Host "    .\audit.ps1            -> Habilitar categorias" -ForegroundColor Gray
Write-Host "  ==========================================" -ForegroundColor Cyan
Write-Host ""
