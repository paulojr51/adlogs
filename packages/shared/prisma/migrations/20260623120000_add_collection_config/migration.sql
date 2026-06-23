-- Migration: add_collection_config
-- Adiciona: ServerConfig, AccountEvent, SqlEvent
-- Modifica: CollectorStatus (accountToday, sqlToday)

-- ============================================================
-- Enums novos
-- ============================================================

CREATE TYPE "AccountEventType" AS ENUM (
  'USER_CREATED',
  'USER_ENABLED',
  'USER_DISABLED',
  'USER_DELETED',
  'USER_LOCKED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'GROUP_MEMBER_ADDED',
  'GROUP_MEMBER_REMOVED'
);

CREATE TYPE "SqlEventType" AS ENUM (
  'LOGIN_FAILED',
  'AUTH_FAILURE',
  'SERVICE_STARTED',
  'SERVICE_STOPPED'
);

-- ============================================================
-- Tabela server_config (1:1 com servers)
-- ============================================================

CREATE TABLE "server_config" (
    "id"                      TEXT NOT NULL,
    "server_id"               TEXT NOT NULL,
    "collect_logins"          BOOLEAN NOT NULL DEFAULT true,
    "collect_files"           BOOLEAN NOT NULL DEFAULT true,
    "collect_processes"       BOOLEAN NOT NULL DEFAULT false,
    "collect_account_changes" BOOLEAN NOT NULL DEFAULT false,
    "collect_sql_server"      BOOLEAN NOT NULL DEFAULT false,
    "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "server_config_server_id_key" ON "server_config"("server_id");

ALTER TABLE "server_config"
    ADD CONSTRAINT "server_config_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cria config padrão para todos os servidores já existentes
INSERT INTO "server_config" ("id", "server_id", "collect_logins", "collect_files",
    "collect_processes", "collect_account_changes", "collect_sql_server",
    "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    "id",
    true, true, false, false, false,
    NOW(), NOW()
FROM "servers";

-- ============================================================
-- Tabela account_events (imutável)
-- ============================================================

CREATE TABLE "account_events" (
    "id"               TEXT NOT NULL,
    "server_id"        TEXT NOT NULL,
    "windows_event_id" INTEGER NOT NULL,
    "event_type"       "AccountEventType" NOT NULL,
    "target_username"  TEXT NOT NULL,
    "target_domain"    TEXT,
    "actor_username"   TEXT,
    "actor_domain"     TEXT,
    "group_name"       TEXT,
    "detail"           TEXT,
    "timestamp"        TIMESTAMP(3) NOT NULL,
    "windows_record_id" TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_events_server_id_idx"      ON "account_events"("server_id");
CREATE INDEX "account_events_target_username_idx" ON "account_events"("target_username");
CREATE INDEX "account_events_timestamp_idx"       ON "account_events"("timestamp");
CREATE INDEX "account_events_event_type_idx"      ON "account_events"("event_type");

ALTER TABLE "account_events"
    ADD CONSTRAINT "account_events_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Tabela sql_events (imutável)
-- ============================================================

CREATE TABLE "sql_events" (
    "id"               TEXT NOT NULL,
    "server_id"        TEXT NOT NULL,
    "windows_event_id" INTEGER NOT NULL,
    "event_type"       "SqlEventType" NOT NULL,
    "username"         TEXT,
    "client_ip"        TEXT,
    "database"         TEXT,
    "detail"           TEXT,
    "success"          BOOLEAN NOT NULL DEFAULT false,
    "timestamp"        TIMESTAMP(3) NOT NULL,
    "windows_record_id" TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sql_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sql_events_server_id_idx"  ON "sql_events"("server_id");
CREATE INDEX "sql_events_timestamp_idx"  ON "sql_events"("timestamp");
CREATE INDEX "sql_events_event_type_idx" ON "sql_events"("event_type");

ALTER TABLE "sql_events"
    ADD CONSTRAINT "sql_events_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Atualizar collector_status: adicionar contadores
-- ============================================================

ALTER TABLE "collector_status"
    ADD COLUMN "account_today" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "sql_today"     INTEGER NOT NULL DEFAULT 0;
