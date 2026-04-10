# Fluxos do Sistema — ADLogs

## 1. Fluxo de Coleta de Eventos

```
Windows Event Log (Security)
         │
         │  win32evtlog.ReadEventLog()
         ▼
  event_reader.py
  ├── Filtra Event IDs relevantes
  ├── Parseia campos (username, IP, filepath, etc.)
  ├── Ignora contas de sistema ($)
  └── Retorna lista de eventos normalizados
         │
         ▼
   db_writer.py
  ├── Verifica duplicatas (windows_record_id)
  ├── INSERT INTO login_events / file_events
  └── Commit (ou rollback em erro)
         │
         ▼
  PostgreSQL (Docker)
```

## 2. Fluxo de Heartbeat do Coletor

```
collector.py (a cada POLL_INTERVAL segundos)
         │
         ├── POST /api/collector/heartbeat
         │   { version, hostname, eventsToday, loginToday, fileToday }
         │
         └── GET /api/collector/config
             ← { monitoredFolders: [...] }
```

## 3. Fluxo de Autenticação (Frontend → API)

```
Usuário → POST /api/auth/login { email, password }
                   │
                   ▼
         AuthService.login()
         ├── Busca usuário no banco
         ├── Verifica bcrypt hash
         ├── Atualiza lastLoginAt
         └── Retorna { accessToken, refreshToken, user }
                   │
                   ▼
         Frontend armazena token no localStorage
         Todas as requisições seguintes:
         Authorization: Bearer <accessToken>
```

## 4. Fluxo de Busca de Eventos (Frontend)

```
Usuário filtra eventos (username, IP, período, etc.)
         │
         ▼
GET /api/events/logins?username=joao&from=...&to=...
         │
         ▼
LoginEventsService.findAll(filter)
├── Constrói WHERE clause com filtros
├── Prisma.loginEvent.findMany({ where, orderBy, take, skip })
└── Retorna { data, total, limit, offset }
         │
         ▼
Frontend renderiza tabela paginada
```

## 5. Fluxo de Configuração de Pastas Monitoradas

```
Admin no frontend
         │
         ▼
POST /api/monitored-folders { path, description }
         │
         ▼
MonitoredFoldersService.create()
├── Verifica duplicata
└── INSERT INTO monitored_folders
         │
         ▼
Próximo ciclo do coletor (até POLL_INTERVAL segundos):
GET /api/collector/config
← { monitoredFolders: ["C:\\nova\\pasta"] }
         │
         ▼
Coletor passa o novo caminho para event_reader.py
event_reader.py filtra file_events pela nova pasta
```

## 6. Fluxo de Deploy (Novo Cliente)

```
1. Copiar projeto para o servidor Windows
2. Configurar .env (DATABASE_URL, JWT_SECRET, etc.)
3. docker compose -f docker-compose.production.yml up -d
4. pnpm --filter @adlogs/shared prisma:migrate:prod
5. pnpm --filter @adlogs/shared prisma:seed  ← cria usuário admin
6. cd collector && .\install.ps1
7. Configurar SACLs nas pastas desejadas
8. Acessar http://localhost → login com admin@adlogs.local / admin123
9. TROCAR A SENHA DO ADMIN IMEDIATAMENTE
```

## 7. Permissões por Role

| Funcionalidade | VIEWER | ANALYST | ADMIN | SUPER_ADMIN |
|----------------|--------|---------|-------|-------------|
| Ver dashboard | ✅ | ✅ | ✅ | ✅ |
| Ver login events | ✅ | ✅ | ✅ | ✅ |
| Ver file events | ✅ | ✅ | ✅ | ✅ |
| Gerar relatórios | ✅ | ✅ | ✅ | ✅ |
| Criar usuários | ❌ | ❌ | ✅ | ✅ |
| Editar usuários | ❌ | ❌ | ✅ | ✅ |
| Deletar usuários | ❌ | ❌ | ❌ | ✅ |
| Pastas monitoradas (leitura) | ✅ | ✅ | ✅ | ✅ |
| Pastas monitoradas (escrita) | ❌ | ❌ | ✅ | ✅ |
| Status do coletor | ✅ | ✅ | ✅ | ✅ |
