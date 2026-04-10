# API Endpoints — ADLogs

Base URL: `http://localhost:3001/api`

## Autenticação

Todos os endpoints (exceto marcados com 🔓) requerem o header:
```
Authorization: Bearer <access_token>
```

---

## Auth

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/auth/login` | Login com email/senha | 🔓 |
| POST | `/auth/logout` | Logout (invalida tokens) | ✅ |
| POST | `/auth/refresh` | Renova access token | ✅ |
| GET | `/auth/me` | Dados do usuário atual | ✅ |

### POST /auth/login
```json
// Request
{ "email": "admin@adlogs.local", "password": "admin123" }

// Response
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "name": "...", "email": "...", "role": "SUPER_ADMIN" }
}
```

---

## Users

Requer role `ADMIN` ou `SUPER_ADMIN`.

| Método | Endpoint | Descrição | Role mínimo |
|--------|----------|-----------|-------------|
| GET | `/users` | Lista todos os usuários | ADMIN |
| GET | `/users/:id` | Detalhe de um usuário | ADMIN |
| POST | `/users` | Cria usuário | ADMIN |
| PATCH | `/users/:id` | Atualiza usuário | ADMIN |
| DELETE | `/users/:id` | Remove usuário | SUPER_ADMIN |

---

## Eventos de Login

| Método | Endpoint | Descrição | Role mínimo |
|--------|----------|-----------|-------------|
| GET | `/events/logins` | Lista eventos com filtros | VIEWER |
| GET | `/events/logins/stats` | Estatísticas agregadas | VIEWER |
| GET | `/events/logins/:id` | Detalhe de um evento | VIEWER |

### Query Params — GET /events/logins
| Param | Tipo | Descrição |
|-------|------|-----------|
| username | string | Filtro parcial por nome de usuário |
| sourceIp | string | Filtro por IP de origem |
| success | boolean | `true` = sucesso, `false` = falha |
| from | ISO datetime | Data/hora início |
| to | ISO datetime | Data/hora fim |
| limit | number | Registros por página (1-200, padrão 50) |
| offset | number | Deslocamento para paginação |

---

## Eventos de Arquivo

| Método | Endpoint | Descrição | Role mínimo |
|--------|----------|-----------|-------------|
| GET | `/events/files` | Lista eventos com filtros | VIEWER |
| GET | `/events/files/stats` | Estatísticas por tipo de ação | VIEWER |
| GET | `/events/files/:id` | Detalhe de um evento | VIEWER |

### Query Params — GET /events/files
| Param | Tipo | Descrição |
|-------|------|-----------|
| username | string | Filtro por usuário |
| filePath | string | Filtro parcial por caminho |
| monitoredFolder | string | Filtro por pasta monitorada |
| action | FileAction | READ, WRITE, DELETE, RENAME, PERMISSION_CHANGE |
| from | ISO datetime | Data/hora início |
| to | ISO datetime | Data/hora fim |
| limit / offset | number | Paginação |

---

## Dashboard

| Método | Endpoint | Descrição | Role mínimo |
|--------|----------|-----------|-------------|
| GET | `/dashboard/summary` | Resumo do dia + eventos recentes | VIEWER |
| GET | `/dashboard/chart/logins` | Dados para gráfico de logins | VIEWER |
| GET | `/dashboard/top-users` | Usuários mais ativos | VIEWER |

### Query Params — GET /dashboard/chart/logins
| Param | Tipo | Descrição |
|-------|------|-----------|
| days | number | Número de dias (padrão 7) |

---

## Pastas Monitoradas

| Método | Endpoint | Descrição | Role mínimo |
|--------|----------|-----------|-------------|
| GET | `/monitored-folders` | Lista pastas | VIEWER |
| GET | `/monitored-folders/:id` | Detalhe | VIEWER |
| POST | `/monitored-folders` | Adiciona pasta | ADMIN |
| PATCH | `/monitored-folders/:id` | Atualiza (description/active) | ADMIN |
| DELETE | `/monitored-folders/:id` | Remove | ADMIN |

---

## Collector

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | `/collector/heartbeat` | Heartbeat do coletor Python | 🔓 |
| GET | `/collector/config` | Configuração para o coletor | 🔓 |
| GET | `/collector/status` | Status do coletor | VIEWER |

---

## Relatórios

| Método | Endpoint | Descrição | Role mínimo |
|--------|----------|-----------|-------------|
| GET | `/reports/user-activity` | Linha do tempo completa de um usuário | VIEWER |
| GET | `/reports/folder-activity` | Quem acessou uma pasta num período | VIEWER |
| GET | `/reports/folder-action` | Ação específica em uma pasta | VIEWER |

### GET /reports/user-activity
| Param | Tipo | Descrição |
|-------|------|-----------|
| username | string | Nome do usuário (parcial) |
| from | ISO datetime | Início do período |
| to | ISO datetime | Fim do período |

Retorna linha do tempo unificada (logins + logoffs + arquivo) ordenada por horário.

### GET /reports/folder-activity
| Param | Tipo | Descrição |
|-------|------|-----------|
| folderPath | string | Parte do caminho da pasta |
| from | ISO datetime | Início do período |
| to | ISO datetime | Fim do período |

### GET /reports/folder-action
| Param | Tipo | Descrição |
|-------|------|-----------|
| folderPath | string | Parte do caminho da pasta |
| action | FileAction | READ, WRITE, DELETE, RENAME, PERMISSION_CHANGE |
| from | ISO datetime | Início do período |
| to | ISO datetime | Fim do período |

---

## Health

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| GET | `/health` | Verifica se a API está online | 🔓 |
