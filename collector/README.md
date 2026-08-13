# ADLogs Collector

Serviço Windows (Python) que lê o Event Log de segurança e envia os eventos para
a API central do ADLogs, autenticado por `X-Server-Key`.

## Componentes

| Arquivo | Responsabilidade |
|---------|-----------------|
| `service.py` | Wrapper de Windows Service (pywin32) |
| `collector.py` | Loop principal de coleta e heartbeat |
| `event_reader.py` | Leitura e parsing do Windows Event Log |
| `state.py` | Marca d'água de leitura, persistida entre reinícios |
| `api_writer.py` | Envio dos eventos para a API central |
| `import_evtx.py` | Importação de `.evtx` históricos (recuperação) |
| `db_writer.py` | **Legado.** Escrita direta no PostgreSQL, sem `server_id` |
| `config.py` | Configurações via variáveis de ambiente (.env) |
| `install.ps1` | Script de instalação como Windows Service |

> `db_writer.py` é anterior ao suporte multi-servidor e **não preenche
> `server_id`**, que é `NOT NULL` no schema atual — todo INSERT por ele falha.
> Nada no fluxo atual o utiliza. Mantido apenas como referência histórica.

## Marca d'água de leitura (`state.py`)

O coletor guarda, por categoria de evento, até onde já leu — em
`%PROGRAMDATA%\ADLogs\state.json`:

```json
{
  "login": { "record_id": 4242, "timestamp": "2026-08-13T10:00:00+00:00" },
  "file":  { "record_id": 991,  "timestamp": "2026-08-13T09:58:00+00:00" }
}
```

São **dois** componentes de propósito:

- **`record_id`** — o `RecordNumber` do Windows. Rápido, mas **reinicia em 1**
  quando o Security log é limpo ou arquivado por tamanho
  (`AutoBackupLogFiles`). Serve apenas como fallback.
- **`timestamp`** — o horário do evento. Nunca reinicia; é a referência
  primária que decide onde parar a leitura.

Três regras que sustentam a integridade da coleta:

1. **A marca d'água só avança com envio confirmado.** `api_writer` levanta
   `SubmissionError` quando não conseguiu entregar; o ciclo aborta e os mesmos
   eventos são relidos depois. Um `0` de retorno significa "a API aceitou e
   nada era novo" — nunca "falhou".
2. **O estado sobrevive ao reinício do serviço.** Sem isso, reiniciar faz o
   coletor reler só os últimos N eventos e pular o acumulado da parada.
3. **Recuo do `RecordNumber` vira `WARNING` no log.** É o sintoma de log
   limpo/arquivado, e precisa ser visível.

Apagar `state.json` faz o coletor recomeçar do início do log disponível. É
seguro (a API deduplica), mas gera releitura — não faça isso por rotina.

## Pré-requisitos

- Windows Server 2016+ ou Windows 10+
- Python 3.10+
- PostgreSQL rodando (via Docker Compose do projeto)
- Permissão de Administrador para instalar o serviço

## Instalação

```powershell
# PowerShell como Administrador
cd C:\caminho\do\adlogs\collector

# Copiar e editar configuração
Copy-Item .env.example .env
notepad .env  # Editar DB_URL e API_URL

# Instalar
.\install.ps1

# Verificar status
Get-Service ADLogsCollector
```

## Configuração (.env)

```env
API_URL=http://localhost:3001
SERVER_API_KEY=adlogs_<chave gerada no painel de Servidores>
POLL_INTERVAL=30
COLLECTOR_VERSION=2.1.0
```

`SERVER_API_KEY` identifica o servidor perante a API — é ela que resolve o
`serverId` dos eventos. Sem ela o coletor sobe, avisa no log e não envia nada.

## Recuperação de histórico (`import_evtx.py`)

Reimporta eventos de arquivos `.evtx` pela mesma rota do coletor em tempo real
(API + deduplicação). Serve para migrar clientes com histórico em arquivo e
para cobrir períodos em que a coleta ficou parada.

Quando o Windows está configurado para arquivar o log ao encher, os períodos
antigos ficam em `C:\Windows\System32\winevt\Logs\Archive-Security-*.evtx`.

```powershell
# Conferir o que existe e de quando é
Get-ChildItem C:\Windows\System32\winevt\Logs\Archive-Security-*.evtx |
  Select-Object Name, LastWriteTime, @{n='MB';e={[int]($_.Length/1MB)}}

# Simular primeiro — conta os eventos sem gravar nada
python import_evtx.py C:\Windows\System32\winevt\Logs\ --simular

# Importar de fato, a partir de uma data
python import_evtx.py C:\Windows\System32\winevt\Logs\ --desde 2026-07-21
```

Reexecutar é seguro: o que já entrou é deduplicado por
`(server_id, windows_record_id, timestamp)`. Se um lote não puder ser entregue
após 3 tentativas, a importação **para e avisa** em vez de seguir em frente —
numa recuperação, um lote perdido não pode se confundir com "eram duplicados".

## Logs

Os logs ficam em: `C:\ProgramData\ADLogs\collector.log`

```powershell
# Ver últimas 50 linhas
Get-Content C:\ProgramData\ADLogs\collector.log -Tail 50

# Monitorar em tempo real
Get-Content C:\ProgramData\ADLogs\collector.log -Wait -Tail 20
```

## Eventos Coletados

### Login/Logoff
| Event ID | Descrição |
|----------|-----------|
| 4624 | Logon bem-sucedido |
| 4625 | Falha de logon |
| 4634 | Logoff |
| 4647 | Logoff iniciado pelo usuário |

### Acesso a Arquivos (requer configuração adicional)
| Event ID | Descrição |
|----------|-----------|
| 4663 | Acesso a objeto tentado |
| 4660 | Objeto excluído |
| 4670 | Permissões de objeto alteradas |

Ver `docs/windows-audit-setup.md` para configurar o monitoramento de arquivos.

## Modo Debug

Para rodar em foreground (sem instalar como serviço):

```powershell
cd C:\caminho\do\adlogs\collector
python service.py debug
```

## Desinstalação

```powershell
.\install.ps1 -Uninstall
```
