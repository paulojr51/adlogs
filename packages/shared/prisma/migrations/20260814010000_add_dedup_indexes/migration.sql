-- Indices de deduplicacao das tabelas de evento.
--
-- A ingestao deduplica com:
--   SELECT ... WHERE server_id = $1 AND windows_record_id IN ($2..$n)
--
-- O schema.prisma declarava @@index([windowsRecordId]) em login_events e
-- file_events desde o commit dca28dd (26/06/2026), mas NENHUMA migration foi
-- gerada junto. O indice existia so no schema: todo banco em producao ficou
-- sem ele, e a deduplicacao caiu em Parallel Seq Scan.
--
-- Medido no cliente Belvedere, com 19,7 milhoes de linhas em file_events:
--   185 segundos por lote de deduplicacao.
-- Isso inviabilizava a importacao de historico e onerava cada ingestao do
-- coletor ao vivo.
--
-- process_events, account_events e sql_events nunca tiveram indice algum
-- para essa consulta, embora seus servicos facam a mesma deduplicacao.
--
-- Composto e na ordem (server_id, windows_record_id): casa exatamente com o
-- filtro. Um indice apenas em windows_record_id nao resolve.
--
-- ATENCAO EM BASES GRANDES: CREATE INDEX bloqueia escrita enquanto roda. Em
-- tabelas com milhoes de linhas, crie antes manualmente com
-- CREATE INDEX CONCURRENTLY (mesmo nome) — o IF NOT EXISTS abaixo entao
-- encontra o indice pronto e nao bloqueia nada:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS file_events_server_id_windows_record_id_idx
--     ON file_events (server_id, windows_record_id);

CREATE INDEX IF NOT EXISTS "login_events_server_id_windows_record_id_idx"
    ON "login_events" ("server_id", "windows_record_id");

CREATE INDEX IF NOT EXISTS "file_events_server_id_windows_record_id_idx"
    ON "file_events" ("server_id", "windows_record_id");

CREATE INDEX IF NOT EXISTS "process_events_server_id_windows_record_id_idx"
    ON "process_events" ("server_id", "windows_record_id");

CREATE INDEX IF NOT EXISTS "account_events_server_id_windows_record_id_idx"
    ON "account_events" ("server_id", "windows_record_id");

CREATE INDEX IF NOT EXISTS "sql_events_server_id_windows_record_id_idx"
    ON "sql_events" ("server_id", "windows_record_id");

-- Os indices simples em windows_record_id (login_events e file_events) nunca
-- chegaram a existir no banco, entao nao ha nada a remover.
