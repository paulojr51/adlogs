# Fluxos do Sistema — ADLogs

## 1. Fluxo de Coleta de Eventos (Multi-Servidor)

```
Servidor Windows Remoto A
  Windows Event Log (Security)
           │
           │  win32evtlog.ReadEventLog()
           ▼
    event_reader.py
    ├── Filtra Event IDs relevantes (4624/4625/4634/4647/4648, 4663/4656/4670, 4688)
    ├── Parseia campos (username, IP, filepath, process, commandline, etc.)
    ├── Ignora contas de sistema ($)
    └── Retorna listas de eventos normalizados
           │
           ▼
    api_writer.py
    ├── POST /api/collector/events/login   (X-Server-Key: <server_api_key>)
    ├── POST /api/collector/events/file    (X-Server-Key: <server_api_key>)
    └── POST /api/collector/events/process (X-Server-Key: <server_api_key>)
           │
           ▼
    API Central (NestJS)
    └── ServerApiKeyGuard → identifica servidor → InsertMany com serverId
           │
           ▼
    PostgreSQL (Docker) — eventos marcados com server_id
```

## 2. Fluxo de Autenticação do Coletor

```
Coletor Python (no servidor remoto)
           │
           ├── POST /api/collector/heartbeat
           │   Headers: { X-Server-Key: "adlogs_<random_hex>" }
           │   Body:    { version, hostname, eventsToday, loginToday, fileToday,
           │              processToday, lastEventAt? }
           │
           └── GET /api/collector/config
               Headers: { X-Server-Key: "adlogs_<random_hex>" }
               ← { monitoredFolders: ["C:\\pasta", ...] }

API Central:
  ServerApiKeyGuard
  ├── Extrai X-Server-Key do header
  ├── SHA-256(key) → busca server WHERE api_key_hash = hash AND active = true
  ├── Injeta req.server = <server record>
  └── Handler recebe @CurrentServer() server
```

## 3. Cadastro de Novo Servidor

```
Admin no Frontend → POST /api/servers { name, hostname, ip, description }
                               │
                               ▼
                    ServersService.create()
                    ├── Verifica nome único
                    ├── Gera rawKey = "adlogs_<random_hex_32>"
                    ├── keyHash = SHA-256(rawKey)
                    ├── INSERT INTO servers { name, ..., api_key_hash: keyHash }
                    └── Retorna { server, apiKey: rawKey }
                               │
                               ▼
                    Admin copia a API Key e configura
                    no arquivo .env do coletor no servidor remoto:
                      SERVER_API_KEY=adlogs_<raw_key>
                      API_URL=https://servidor-central:3001
```

## 4. Fluxo de Heartbeat (por Servidor)

```
collector.py (a cada POLL_INTERVAL segundos)
           │
           ├── POST /api/collector/heartbeat
           │   ← upsert CollectorStatus WHERE serverId = server.id
           │   ← lastEventAt = max(marca d'água de todas as categorias)
           │
           └── GET /api/collector/config
               ← { monitoredFolders: [...] }  (global + deste servidor)
```

⚠️ **O heartbeat é enviado a cada ciclo, mesmo quando a coleta falha.** Ele vive
num `try` separado do `_collect()`, e cada categoria trata os próprios erros
apenas logando. Por isso um coletor com a leitura do Event Log travada continua
reportando presença indefinidamente.

É por isso que o heartbeat carrega `lastEventAt`: é o único campo que congela
quando a ingestão para, e é o que sustenta o `isCollecting` no dashboard.

## 4.1. Marca d'água de leitura (anti-perda de eventos)

```
Início do ciclo
   │
   ├── state.get_watermark(kind) ── lê %PROGRAMDATA%\ADLogs\state.json
   │        (record_id, timestamp)
   │
   ├── reader.read_*_events(record_id, timestamp)
   │        └── para quando timestamp do registro < marca d'água
   │            (o RecordNumber é só fallback — ele reinicia)
   │
   ├── submit_*_events(...) ──► SubmissionError se não entregou
   │                                     │
   │                                     └── marca d'água NÃO avança,
   │                                         mesmos eventos relidos no
   │                                         próximo ciclo
   │
   └── sucesso ──► set_watermark(kind, mais recente) + grava em disco
```

Três propriedades que essa ordem garante:

1. **Falha de envio não perde evento.** A marca d'água só avança depois da
   confirmação. Antes, `_post_batch` engolia a exceção e devolvia `0`, e o
   ponteiro avançava por cima de eventos que nunca chegaram ao banco.
2. **Reinício do serviço não perde posição.** O estado é persistido em disco;
   antes vivia só em memória, e reiniciar fazia o coletor reler apenas os
   últimos N eventos, pulando o acumulado durante a parada.
3. **Reset do RecordNumber não trava a coleta.** Quando o Security log é limpo
   ou arquivado por tamanho (`AutoBackupLogFiles`), o `RecordNumber` volta a 1.
   Parar a leitura por `record_number <= last_record_id` descartava todo evento
   novo indefinidamente. O `timestamp` nunca reinicia, então é ele a referência
   primária — e o recuo do RecordNumber é registrado como `WARNING`.

## 5. Fluxo de Autenticação (Frontend → API)

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

## 6. Fluxo de Busca de Eventos (Frontend)

```
Usuário filtra eventos (username, IP, período, serverId, etc.)
         │
         ▼
GET /api/events/logins?username=joao&serverId=srv_A&from=...&to=...
         │
         ▼
LoginEventsService.findAll(filter)
├── Constrói WHERE clause com filtros (incluindo serverId)
├── Prisma.loginEvent.findMany({ where, orderBy, take, skip })
└── Retorna { data, total, limit, offset }
         │
         ▼
Frontend renderiza tabela paginada com coluna Servidor
```

## 7. Fluxo de Configuração de Pastas Monitoradas

```
Admin no frontend
         │
         ▼
POST /api/monitored-folders { path, description }   (serverId opcional)
         │
         ▼
MonitoredFoldersService.create()
├── Verifica duplicata
└── INSERT INTO monitored_folders (serverId NULL = global)
         │
         ▼
Próximo ciclo do coletor (até POLL_INTERVAL segundos):
GET /api/collector/config
← { monitoredFolders: [...] }
  (retorna pastas WHERE serverId = server.id OR serverId IS NULL)
```

## 8. Fluxo de Deploy — Novo Servidor Monitorado

```
1. No painel ADLogs: Servidores → Novo Servidor → copiar API Key
2. No servidor Windows remoto:
   a. Copiar pasta collector/ para o servidor
   b. Editar collector/.env:
        API_URL=https://servidor-central:3001
        SERVER_API_KEY=adlogs_<chave_copiada>
   c. Executar: cd collector && .\install.ps1
   d. Habilitar Event 4688 (opcional):
        secpol.msc → Audit Process Creation: Success
        gpedit.msc → Include command line: Enabled
3. O servidor aparece como Online no painel em até POLL_INTERVAL segundos
```

## 9. Fluxo de Deploy — Primeira Instalação (Instância Central)

```
1. Copiar projeto para o servidor central (Windows ou Linux)
2. Configurar .env (DATABASE_URL, JWT_SECRET, etc.)
3. docker compose -f docker-compose.production.yml up -d
4. pnpm --filter @adlogs/shared prisma:migrate:prod  ← cria schema + migra dados legados
5. pnpm --filter @adlogs/shared prisma:seed          ← cria usuário admin
6. No mesmo servidor (se for monitorar logins locais):
   cd collector && .\install.ps1
7. Acessar http://localhost → login com admin@adlogs.local / admin123
8. TROCAR A SENHA DO ADMIN IMEDIATAMENTE
9. Criar registro do servidor local em Servidores, configurar API Key no coletor
```

## 10. Permissões por Role

| Funcionalidade | VIEWER | ANALYST | ADMIN | SUPER_ADMIN |
|----------------|--------|---------|-------|-------------|
| Ver dashboard | ✅ | ✅ | ✅ | ✅ |
| Ver login events | ✅ | ✅ | ✅ | ✅ |
| Ver file events | ✅ | ✅ | ✅ | ✅ |
| Ver process events | ✅ | ✅ | ✅ | ✅ |
| Gerar relatórios | ✅ | ✅ | ✅ | ✅ |
| Ver servidores | ✅ | ✅ | ✅ | ✅ |
| Criar usuários | ❌ | ❌ | ✅ | ✅ |
| Editar usuários | ❌ | ❌ | ✅ | ✅ |
| Deletar usuários | ❌ | ❌ | ❌ | ✅ |
| Criar servidores | ❌ | ❌ | ✅ | ✅ |
| Editar servidores | ❌ | ❌ | ✅ | ✅ |
| Rotacionar API Key | ❌ | ❌ | ❌ | ✅ |
| Desativar servidores | ❌ | ❌ | ❌ | ✅ |
| Pastas monitoradas (leitura) | ✅ | ✅ | ✅ | ✅ |
| Pastas monitoradas (escrita) | ❌ | ❌ | ✅ | ✅ |
| Status do coletor | ✅ | ✅ | ✅ | ✅ |
