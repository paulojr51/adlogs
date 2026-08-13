# Schema do Banco de Dados — ADLogs

## Diagrama de Entidades

```
users ──────── system_audit
                    │
                    └── userId → users.id

servers ────────────────────────────────────────────────────────┐
    │                                                            │
    ├── login_events      (imutável — serverId obrigatório)     │
    ├── file_events       (imutável — serverId obrigatório)     │
    ├── process_events    (imutável — serverId obrigatório)     │
    ├── collector_status  (um por servidor)                     │
    └── monitored_folders (serverId NULL = global)              │
```

## Tabelas

### users
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| name | string | Nome completo |
| email | string | E-mail único (login) |
| password_hash | string | Bcrypt hash (rounds=12) |
| role | Role | SUPER_ADMIN, ADMIN, ANALYST, VIEWER |
| active | boolean | Usuário ativo/inativo |
| token_version | int | Versionamento para invalidação de JWT |
| last_login_at | datetime? | Último login |
| created_at | datetime | Criação |
| updated_at | datetime | Última atualização |

### servers
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| name | string | Nome de exibição do servidor |
| hostname | string? | Nome do host Windows |
| ip_address | string? | IP do servidor |
| description | string? | Descrição livre |
| api_key_hash | string | SHA-256 da API Key do coletor |
| active | boolean | Servidor ativo/inativo |
| last_seen_at | datetime? | Último heartbeat recebido |
| created_at | datetime | Criação |
| updated_at | datetime | Última atualização |

**Nota:** A API Key é gerada no cadastro e retornada em plaintext UMA única vez. Armazena-se apenas o hash SHA-256. Use `POST /api/servers/:id/rotate-key` para regenerar.

### login_events ⚠️ IMUTÁVEL
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| server_id | string | FK → servers.id |
| windows_event_id | int | ID do evento Windows (4624, 4625, 4634, 4647) |
| username | string | Nome do usuário Windows |
| domain | string? | Domínio |
| source_ip | string? | IP de origem |
| workstation | string? | Nome da estação |
| logon_type | int? | Tipo numérico de logon |
| logon_type_name | string? | Nome do tipo (Interactive, Network, etc.) |
| success | boolean | true = logon bem-sucedido |
| failure_reason | string? | Motivo da falha (se success=false) |
| timestamp | datetime | Data/hora do evento (UTC) |
| windows_record_id | string? | Record number do Event Log (dedup por server) |
| created_at | datetime | Inserção no banco |

**Índices:** server_id, username, timestamp, success, source_ip, windows_event_id

### file_events ⚠️ IMUTÁVEL
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| server_id | string | FK → servers.id |
| windows_event_id | int | ID do evento Windows (4663, 4656, 4670) |
| username | string | Usuário que acessou |
| domain | string? | Domínio |
| file_path | string | Caminho completo do arquivo |
| monitored_folder | string? | Pasta monitorada que gerou o evento |
| action | FileAction | READ, WRITE, DELETE, RENAME, PERMISSION_CHANGE |
| process_name | string? | Nome do processo |
| process_id | int? | PID |
| timestamp | datetime | Data/hora do evento (UTC) |
| windows_record_id | string? | Record number (dedup por server) |
| created_at | datetime | Inserção no banco |

**Índices:** server_id, username, timestamp, file_path, action, monitored_folder, windows_event_id

### process_events ⚠️ IMUTÁVEL
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| server_id | string | FK → servers.id |
| windows_event_id | int | 4688 (default) |
| username | string | Usuário que iniciou o processo |
| domain | string? | Domínio |
| process_name | string | Nome do executável (basename do path) |
| process_path | string? | Caminho completo do executável |
| command_line | string? | Linha de comando completa (requer GPO) |
| parent_process_name | string? | Nome do processo pai |
| parent_process_id | int? | PID do processo pai |
| process_id | int? | PID do novo processo |
| timestamp | datetime | Data/hora do evento (UTC) |
| windows_record_id | string? | Record number (dedup por server) |
| created_at | datetime | Inserção no banco |

**Índices:** server_id, username, timestamp, process_name

**Pré-requisito para capturar command_line:**
- `secpol.msc` → Audit Process Creation: Success habilitado
- `gpedit.msc` → Computer Configuration → Administrative Templates → System → Audit Process Creation → Include command line: Enabled

### monitored_folders
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| server_id | string? | FK → servers.id (NULL = global, aplica a todos) |
| path | string | Caminho completo da pasta (único) |
| description | string? | Descrição |
| active | boolean | Pasta ativa/inativa |
| created_at | datetime | Criação |
| updated_at | datetime | Última atualização |

### collector_status
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| server_id | string | FK → servers.id (UNIQUE — um registro por servidor) |
| is_running | boolean | Coletor online? |
| last_seen_at | datetime | Último heartbeat |
| last_event_at | datetime? | Evento mais recente que o coletor conseguiu entregar |
| version | string? | Versão do coletor |
| hostname | string? | Nome do servidor reportado pelo coletor |
| events_today | int | Total de eventos hoje |
| login_today | int | Login events hoje |
| file_today | int | File events hoje |
| process_today | int | Process events hoje |
| updated_at | datetime | Última atualização |

**`last_seen_at` vs `last_event_at` — não confundir.** `last_seen_at` só diz que o
processo do coletor está vivo: o heartbeat é enviado a cada ciclo,
independentemente de a leitura do Event Log ter funcionado. `last_event_at` diz
até onde a coleta realmente chegou. Quando o primeiro avança e o segundo
congela, a ingestão parou — e foi essa distinção que faltava quando um coletor
ficou 23 dias "online" no dashboard sem gravar um único evento.

A API expõe os dois como `isRunning` e `isCollecting`. `isCollecting` é `null`
(desconhecido, nunca "falha") quando o coletor está offline ou quando é uma
versão antiga que não reporta `last_event_at`.

**Deduplicação de eventos.** Não há constraint `UNIQUE` nas tabelas de evento —
o `skipDuplicates` do Prisma é inócuo aqui, e a deduplicação real acontece na
aplicação. A chave é `(server_id, windows_record_id, timestamp)`. O `timestamp`
é indispensável: o `RecordNumber` do Windows **reinicia em 1** quando o Security
log é limpo ou arquivado por tamanho, então deduplicar só pelo par
`(server_id, windows_record_id)` faria eventos novos legítimos colidirem com
antigos e serem descartados em silêncio — além de inviabilizar a reimportação de
arquivos `.evtx` históricos.

### system_audit
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| user_id | string | FK → users.id |
| action | string | Ação realizada |
| detail | string? | Detalhes |
| ip | string? | IP do usuário |
| timestamp | datetime | Quando ocorreu |

## Enums

### Role
- `SUPER_ADMIN` — Acesso total ao sistema
- `ADMIN` — Gestão de usuários e configurações
- `ANALYST` — Visualização de eventos e relatórios
- `VIEWER` — Somente leitura

### FileAction
- `READ` — Leitura de arquivo
- `WRITE` — Escrita/modificação
- `DELETE` — Exclusão
- `RENAME` — Renomeação
- `PERMISSION_CHANGE` — Alteração de permissões (Event ID 4670)

## Regras de Negócio

1. `login_events`, `file_events` e `process_events` são **imutáveis** — apenas INSERT e SELECT são permitidos.
2. Deduplicação de eventos via `windows_record_id` + `server_id` (par único por tabela).
3. Todas as datas são armazenadas em UTC.
4. `password_hash` e `api_key_hash` **nunca** são retornados em respostas de API.
5. `SUPER_ADMIN` não pode ser desativado ou rebaixado via API.
6. `server_id` é obrigatório em todos os eventos — dados legados migrados para `server-legacy`.
7. `monitored_folders.server_id = NULL` significa pasta global (aplicada a todos os servidores).
