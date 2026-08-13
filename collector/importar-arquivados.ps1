<#
.SYNOPSIS
    Importa uma pasta de Archive-Security-*.evtx para o ADLogs, de forma
    resumivel.

.DESCRIPTION
    Importar centenas de GB de log arquivado leva horas. Rodar import_evtx.py
    direto sobre a pasta inteira funciona, mas se o processo cair no meio nao
    ha como saber onde parou, e recomecar do zero custa todo o trabalho ja
    feito (a deduplicacao evita duplicar dados, mas nao o tempo).

    Este script processa um arquivo por vez e registra os concluidos. Ao ser
    executado de novo, pula o que ja entrou e continua de onde parou.

    Para na primeira falha em vez de seguir adiante: numa recuperacao de
    historico, um arquivo pulado em silencio e pior que uma parada visivel.

    NOTA: mantenha este arquivo em ASCII puro. O Windows PowerShell 5.1 le
    arquivos sem BOM como ANSI, e caracteres acentuados viram sequencias que
    incluem aspas curvas, quebrando o parser. Ver commit 52fb1db.

.PARAMETER Pasta
    Pasta com os arquivos Archive-Security-*.evtx.

.PARAMETER Desde
    Opcional. Importa apenas eventos a partir desta data (formato YYYY-MM-DD).

.PARAMETER Simular
    Conta os eventos sem gravar nada. Util para dimensionar antes de comecar.

.EXAMPLE
    .\importar-arquivados.ps1 -Pasta G:\agosto -Simular

.EXAMPLE
    Start-Process powershell -ArgumentList '-NoProfile -File C:\adlogs\collector\importar-arquivados.ps1 -Pasta G:\agosto' -WindowStyle Hidden

.EXAMPLE
    .\importar-arquivados.ps1 -Pasta G:\agosto
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Pasta,

    [string]$Desde,

    [switch]$Simular
)

$ErrorActionPreference = 'Stop'

$RaizColetor = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python      = Join-Path $RaizColetor 'venv\Scripts\python.exe'
$Importador  = Join-Path $RaizColetor 'import_evtx.py'

$Rotulo     = (Split-Path $Pasta -Leaf) -replace '[^\w\-]', '_'
$Log        = Join-Path $RaizColetor "import-$Rotulo.log"
$Concluidos = Join-Path $RaizColetor "import-$Rotulo-concluidos.txt"

function Write-Registro {
    param([string]$Mensagem)
    $linha = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Mensagem
    Write-Host $linha
    Add-Content -Path $Log -Value $linha -Encoding utf8
}

if (-not (Test-Path $Python))     { throw "Python da venv nao encontrado: $Python" }
if (-not (Test-Path $Importador)) { throw "import_evtx.py nao encontrado: $Importador" }
if (-not (Test-Path $Pasta))      { throw "Pasta nao encontrada: $Pasta" }

if (-not (Test-Path $Concluidos)) {
    New-Item -ItemType File -Path $Concluidos | Out-Null
}

# Ordena por nome: os arquivos ja nascem com a data no nome, entao a ordem
# alfabetica coincide com a cronologica.
$arquivos = Get-ChildItem -Path $Pasta -Filter 'Archive-Security-*.evtx' | Sort-Object Name
if ($arquivos.Count -eq 0) {
    throw "Nenhum Archive-Security-*.evtx encontrado em $Pasta"
}

$jaFeitos  = @(Get-Content $Concluidos)
$pendentes = @($arquivos | Where-Object { $jaFeitos -notcontains $_.Name })

if ($pendentes.Count -eq 0) {
    Write-Registro "Nada pendente em $Pasta - todos os $($arquivos.Count) arquivos ja foram importados."
    return
}

$totalGB = [math]::Round((($pendentes | Measure-Object -Property Length -Sum).Sum) / 1GB, 1)

Write-Registro "=== Importacao iniciada ==="
Write-Registro "Pasta    : $Pasta"
Write-Registro "Arquivos : $($arquivos.Count) no total, $($pendentes.Count) pendentes ($totalGB GB)"
if ($Desde)   { Write-Registro "Desde    : $Desde" }
if ($Simular) { Write-Registro "MODO SIMULACAO - nada sera gravado" }

$indice = 0
$falhou = $false

foreach ($arquivo in $pendentes) {
    $indice++
    $inicio = Get-Date
    Write-Registro "[$indice/$($pendentes.Count)] Iniciando $($arquivo.Name)"

    $argumentos = @($Importador, $arquivo.FullName)
    if ($Desde)   { $argumentos += @('--desde', $Desde) }
    if ($Simular) { $argumentos += '--simular' }

    & $Python @argumentos 2>&1 | ForEach-Object {
        Add-Content -Path $Log -Value $_ -Encoding utf8
    }
    $codigo = $LASTEXITCODE

    $duracao = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1)

    if ($codigo -ne 0) {
        Write-Registro "FALHOU $($arquivo.Name) (codigo $codigo) apos $duracao min - interrompendo"
        Write-Registro "Corrija a causa e rode o mesmo comando: a importacao retoma deste arquivo."
        $falhou = $true
        break
    }

    # So marca como concluido apos sucesso confirmado. Em simulacao nao marca,
    # senao a importacao real pularia os arquivos como se ja tivessem entrado.
    if (-not $Simular) {
        Add-Content -Path $Concluidos -Value $arquivo.Name -Encoding utf8
    }
    Write-Registro "[$indice/$($pendentes.Count)] OK $($arquivo.Name) em $duracao min"
}

if ($falhou) {
    Write-Registro "=== Importacao INTERROMPIDA ==="
    exit 1
}

Write-Registro "=== Importacao concluida ==="
Write-Registro "Log completo em: $Log"
