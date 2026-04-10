# Schema do Banco de Dados — ADLogs

## Diagrama de Entidades

```
users ──────── system_audit
                    │
                    └── userId → users.id

login_events   (imutável — sem FK externas)
file_events    (imutável — sem FK externas)
monitored_folders
collector_status
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

### login_events ⚠️ IMUTÁVEL
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
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
| windows_record_id | string? | Record number do Event Log (dedup) |
| created_at | datetime | Inserção no banco |

**Índices:** username, timestamp, success, source_ip, windows_event_id

### file_events ⚠️ IMUTÁVEL
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| windows_event_id | int | ID do evento Windows (4663, 4660, 4670) |
| username | string | Usuário que acessou |
| domain | string? | Domínio |
| file_path | string | Caminho completo do arquivo |
| monitored_folder | string? | Pasta monitorada que gerou o evento |
| action | FileAction | READ, WRITE, DELETE, RENAME, PERMISSION_CHANGE |
| process_name | string? | Nome do processo |
| process_id | int? | PID |
| timestamp | datetime | Data/hora do evento (UTC) |
| windows_record_id | string? | Record number (dedup) |
| created_at | datetime | Inserção no banco |

**Índices:** username, timestamp, file_path, action, monitored_folder, windows_event_id

### monitored_folders
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| path | string | Caminho completo da pasta (único) |
| description | string? | Descrição |
| active | boolean | Pasta ativa/inativa |
| created_at | datetime | Criação |
| updated_at | datetime | Última atualização |

### collector_status
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | cuid | PK |
| is_running | boolean | Coletor online? |
| last_seen_at | datetime | Último heartbeat |
| version | string? | Versão do coletor |
| hostname | string? | Nome do servidor |
| events_today | int | Total de eventos hoje |
| login_today | int | Login events hoje |
| file_today | int | File events hoje |
| updated_at | datetime | Última atualização |

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

1. `login_events` e `file_events` são **imutáveis** — apenas INSERT e SELECT são permitidos.
2. Deduplicação de eventos via `windows_record_id` (único por tabela).
3. Todas as datas são armazenadas em UTC.
4. `password_hash` nunca é retornado em respostas de API.
5. `SUPER_ADMIN` não pode ser desativado ou rebaixado via API.
