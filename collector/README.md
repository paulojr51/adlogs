# ADLogs Collector

Serviço Windows (Python) responsável por ler o Event Log de segurança do Windows
e persistir eventos no banco de dados PostgreSQL do ADLogs.

## Componentes

| Arquivo | Responsabilidade |
|---------|-----------------|
| `service.py` | Wrapper de Windows Service (pywin32) |
| `collector.py` | Loop principal de coleta e heartbeat |
| `event_reader.py` | Leitura e parsing do Windows Event Log |
| `db_writer.py` | Persistência no PostgreSQL com deduplicação |
| `config.py` | Configurações via variáveis de ambiente (.env) |
| `install.ps1` | Script de instalação como Windows Service |

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
DB_URL=postgresql://adlogs:SENHA@localhost:5434/adlogs
API_URL=http://localhost:3001
POLL_INTERVAL=30
COLLECTOR_VERSION=1.0.0
```

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
