<#
.SYNOPSIS
    Configura a SACL de uma pasta monitorada para auditar apenas alteracoes,
    sem auditar leitura.

.DESCRIPTION
    Auditar leitura de arquivo faz o Windows gerar um evento 4663 a cada
    abertura. Em pastas de trabalho isso produz volume desproporcional: no
    cliente Belvedere, 70% dos eventos de arquivo eram READ, o Security log
    enchia 1.28 GB varias vezes ao dia e o arquivamento constante zerava o
    RecordNumber, quebrando a coleta.

    Este script troca a auditoria por uma que cobre apenas o que interessa:
    escrita, exclusao, mudanca de permissao e tomada de posse.

    ANTES DE ALTERAR, a SACL atual e' salva em um arquivo .sddl no mesmo
    diretorio do script. Para desfazer, use -Restaurar apontando para ele.

    Use -Simular primeiro: mostra o que existe hoje e o que seria aplicado,
    sem tocar em nada.

    NOTA: mantenha este arquivo em ASCII puro. Ver commit 52fb1db.

.PARAMETER Pasta
    Pasta monitorada (ex: E:\dados\Dropbox).

.PARAMETER Identidade
    Quem sera auditado (ex: 'ADV\Usuarios do dominio', 'Todos').
    Por padrao o script PRESERVA a identidade que ja esta configurada na pasta.
    Ampliar o escopo (por exemplo de "usuarios do dominio" para "todos") tende a
    AUMENTAR o volume do log, porque passa a auditar contas de servico, backup e
    antivirus - que o coletor descarta no parse. Log a mais, dado util nenhum.

.PARAMETER Simular
    Mostra as regras atuais e as que seriam aplicadas, sem alterar nada.

.PARAMETER Restaurar
    Caminho de um arquivo .sddl gerado por uma execucao anterior. Restaura a
    auditoria que existia antes.

.EXAMPLE
    .\configurar-sacl.ps1 -Pasta E:\dados\Dropbox -Simular

.EXAMPLE
    .\configurar-sacl.ps1 -Pasta E:\dados\Dropbox

.EXAMPLE
    .\configurar-sacl.ps1 -Pasta E:\dados\Dropbox -Restaurar .\sacl-backup-Dropbox-20260813-214500.sddl
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Pasta,

    [string]$Identidade,

    [switch]$Simular,

    [string]$Restaurar
)

$ErrorActionPreference = 'Stop'

$Raiz = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Titulo($msg) {
    Write-Host ""
    Write-Host "  === $msg ===" -ForegroundColor Cyan
    Write-Host ""
}

function Show-RegrasAtuais($caminho) {
    $acl = Get-Acl -Path $caminho -Audit
    $regras = $acl.GetAuditRules($true, $false, [System.Security.Principal.NTAccount])
    if ($regras.Count -eq 0) {
        Write-Host "    (nenhuma regra de auditoria configurada)" -ForegroundColor Yellow
        return
    }
    foreach ($r in $regras) {
        Write-Host ("    {0,-24} {1,-10} {2}" -f `
            $r.IdentityReference, $r.AuditFlags, $r.FileSystemRights) -ForegroundColor White
        Write-Host ("      heranca: {0} / {1}" -f $r.InheritanceFlags, $r.PropagationFlags) -ForegroundColor DarkGray
    }
}

if (-not (Test-Path $Pasta)) { throw "Pasta nao encontrada: $Pasta" }

# --- Restauracao -----------------------------------------------------------

if ($Restaurar) {
    if (-not (Test-Path $Restaurar)) { throw "Arquivo de backup nao encontrado: $Restaurar" }

    Write-Titulo "Restaurando auditoria de $Pasta"
    Write-Host "  Regras atuais (serao substituidas):" -ForegroundColor White
    Show-RegrasAtuais $Pasta

    $sddl = (Get-Content $Restaurar -Raw).Trim()
    $acl = Get-Acl -Path $Pasta -Audit
    $acl.SetSecurityDescriptorSddlForm($sddl, 'Audit')
    Set-Acl -Path $Pasta -AclObject $acl

    Write-Host ""
    Write-Host "  Regras restauradas:" -ForegroundColor Green
    Show-RegrasAtuais $Pasta
    return
}

# --- Diagnostico -----------------------------------------------------------

Write-Titulo "Auditoria atual de $Pasta"
Show-RegrasAtuais $Pasta

# Direitos que geram os eventos que interessam:
#   4663 com mascara de escrita, 4656 com DELETE, 4670 para permissao.
# Deliberadamente FORA: ReadData, ReadAttributes, ReadExtendedAttributes,
# ExecuteFile e ReadPermissions - sao os que produzem a enxurrada.
$Direitos =
    [System.Security.AccessControl.FileSystemRights]::WriteData -bor
    [System.Security.AccessControl.FileSystemRights]::AppendData -bor
    [System.Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor
    [System.Security.AccessControl.FileSystemRights]::WriteAttributes -bor
    [System.Security.AccessControl.FileSystemRights]::Delete -bor
    [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
    [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor
    [System.Security.AccessControl.FileSystemRights]::TakeOwnership

# A identidade auditada e' uma decisao do cliente, nao um detalhe tecnico.
# Preserva-se a que ja existe: ampliar o escopo (de "usuarios do dominio" para
# "todos", por exemplo) faz o log crescer com contas de servico e backup, que o
# coletor descarta no parse - volume a mais sem dado util.
$aclLeitura = Get-Acl -Path $Pasta -Audit
$regrasAtuais = $aclLeitura.GetAuditRules($true, $false, [System.Security.Principal.NTAccount])
$identidadesAtuais = @($regrasAtuais | ForEach-Object { $_.IdentityReference.Value } | Sort-Object -Unique)

if ($Identidade) {
    $alvo = $Identidade
    $origemAlvo = 'informada por parametro'
} elseif ($identidadesAtuais.Count -eq 1) {
    $alvo = $identidadesAtuais[0]
    $origemAlvo = 'preservada da configuracao atual'
} elseif ($identidadesAtuais.Count -eq 0) {
    throw ("A pasta nao tem auditoria configurada, entao nao ha identidade a preservar. " +
           "Informe explicitamente, ex: -Identidade 'Todos'")
} else {
    throw ("A pasta tem auditoria para mais de uma identidade: " +
           ($identidadesAtuais -join ', ') +
           ". Escolher qual manter e' decisao sua - informe com -Identidade.")
}

try {
    $conta = New-Object System.Security.Principal.NTAccount($alvo)
    $null = $conta.Translate([System.Security.Principal.SecurityIdentifier])
} catch {
    throw "Identidade nao reconhecida pelo Windows: '$alvo'"
}

Write-Titulo "Auditoria que sera aplicada"
Write-Host "    Identidade : $alvo  ($origemAlvo)" -ForegroundColor White
Write-Host "    Eventos    : Sucesso e Falha" -ForegroundColor White
Write-Host "    Direitos   : $Direitos" -ForegroundColor White
Write-Host "    Heranca    : subpastas e arquivos" -ForegroundColor White
Write-Host ""
Write-Host "    FORA (nao serao mais auditados): leitura de dados," -ForegroundColor DarkYellow
Write-Host "    leitura de atributos, execucao e leitura de permissoes." -ForegroundColor DarkYellow

if ($Identidade -and $identidadesAtuais.Count -eq 1 -and $Identidade -ne $identidadesAtuais[0]) {
    Write-Host ""
    Write-Host "    ATENCAO: a identidade auditada vai MUDAR" -ForegroundColor Red
    Write-Host "      de : $($identidadesAtuais[0])" -ForegroundColor Red
    Write-Host "      para: $alvo" -ForegroundColor Red
    Write-Host "    Ampliar o escopo aumenta o volume do log." -ForegroundColor Red
}

if ($Simular) {
    Write-Host ""
    Write-Host "  MODO SIMULACAO - nada foi alterado." -ForegroundColor Yellow
    Write-Host "  Rode sem -Simular para aplicar." -ForegroundColor Yellow
    return
}

# --- Backup ----------------------------------------------------------------

$rotulo  = (Split-Path $Pasta -Leaf) -replace '[^\w\-]', '_'
$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup  = Join-Path $Raiz "sacl-backup-$rotulo-$carimbo.sddl"

$aclAtual = Get-Acl -Path $Pasta -Audit
$aclAtual.GetSecurityDescriptorSddlForm('Audit') | Set-Content -Path $backup -Encoding ascii

Write-Titulo "Backup salvo"
Write-Host "    $backup" -ForegroundColor Green
Write-Host "    Para desfazer: .\configurar-sacl.ps1 -Pasta '$Pasta' -Restaurar '$backup'" -ForegroundColor Gray

# --- Aplicacao -------------------------------------------------------------

$acl = Get-Acl -Path $Pasta -Audit

# Remove as regras existentes antes de aplicar a nova: acumular regras deixaria
# a auditoria de leitura ativa junto com a nova.
$existentes = $acl.GetAuditRules($true, $false, [System.Security.Principal.NTAccount])
foreach ($r in $existentes) {
    $null = $acl.RemoveAuditRule($r)
}

$regra = New-Object System.Security.AccessControl.FileSystemAuditRule(
    (New-Object System.Security.Principal.NTAccount($alvo)),
    $Direitos,
    'ContainerInherit, ObjectInherit',
    'None',
    'Success, Failure'
)
$acl.AddAuditRule($regra)

Write-Host ""
Write-Host "  Aplicando... (a propagacao para subpastas pode levar alguns minutos)" -ForegroundColor Cyan
Set-Acl -Path $Pasta -AclObject $acl

Write-Titulo "Auditoria depois da alteracao"
Show-RegrasAtuais $Pasta

Write-Host ""
Write-Host "  Pronto. O volume do Security log deve cair de forma acentuada." -ForegroundColor Green
Write-Host "  Confira em alguns minutos: Get-WinEvent -ListLog Security | Select FileSize" -ForegroundColor Gray
