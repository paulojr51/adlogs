-- ============================================================
-- Migration: add_multi_server
-- Adiciona suporte a múltiplos servidores monitorados.
-- Cria tabelas servers e process_events.
-- Adiciona server_id a login_events, file_events,
-- collector_status e monitored_folders.
-- Migra dados existentes para um servidor padrão legado.
-- ============================================================

-- CreateTable servers
CREATE TABLE "servers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "ip_address" TEXT,
    "description" TEXT,
    "api_key_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "servers_api_key_hash_idx" ON "servers"("api_key_hash");

-- CreateTable process_events
CREATE TABLE "process_events" (
    "id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "windows_event_id" INTEGER NOT NULL DEFAULT 4688,
    "username" TEXT NOT NULL,
    "domain" TEXT,
    "process_name" TEXT NOT NULL,
    "process_path" TEXT,
    "command_line" TEXT,
    "parent_process_name" TEXT,
    "parent_process_id" INTEGER,
    "process_id" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "windows_record_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "process_events_server_id_idx" ON "process_events"("server_id");
CREATE INDEX "process_events_username_idx" ON "process_events"("username");
CREATE INDEX "process_events_timestamp_idx" ON "process_events"("timestamp");
CREATE INDEX "process_events_process_name_idx" ON "process_events"("process_name");

-- -------------------------------------------------------
-- Migração de dados: criar servidor padrão para dados legados
-- -------------------------------------------------------

-- Cria servidor padrão a partir do collector_status existente (se houver)
INSERT INTO "servers" ("id", "name", "hostname", "api_key_hash", "active", "created_at", "updated_at")
SELECT
    'server-legacy',
    COALESCE("hostname", 'Servidor Principal'),
    "hostname",
    'LEGACY_NO_KEY',
    true,
    NOW(),
    NOW()
FROM "collector_status"
LIMIT 1;

-- Fallback: cria servidor padrão se não havia collector_status
INSERT INTO "servers" ("id", "name", "api_key_hash", "active", "created_at", "updated_at")
SELECT 'server-legacy', 'Servidor Principal', 'LEGACY_NO_KEY', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "servers" WHERE "id" = 'server-legacy');

-- -------------------------------------------------------
-- Adicionar server_id a login_events
-- -------------------------------------------------------

ALTER TABLE "login_events" ADD COLUMN "server_id" TEXT;
UPDATE "login_events" SET "server_id" = 'server-legacy';
ALTER TABLE "login_events" ALTER COLUMN "server_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "login_events_server_id_idx" ON "login_events"("server_id");

-- -------------------------------------------------------
-- Adicionar server_id a file_events
-- -------------------------------------------------------

ALTER TABLE "file_events" ADD COLUMN "server_id" TEXT;
UPDATE "file_events" SET "server_id" = 'server-legacy';
ALTER TABLE "file_events" ALTER COLUMN "server_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "file_events" ADD CONSTRAINT "file_events_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "file_events_server_id_idx" ON "file_events"("server_id");

-- -------------------------------------------------------
-- Adicionar server_id a monitored_folders (nullable = global)
-- -------------------------------------------------------

ALTER TABLE "monitored_folders" ADD COLUMN "server_id" TEXT;

-- AddForeignKey
ALTER TABLE "monitored_folders" ADD CONSTRAINT "monitored_folders_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "monitored_folders_server_id_idx" ON "monitored_folders"("server_id");

-- -------------------------------------------------------
-- Refatorar collector_status para ser por servidor
-- -------------------------------------------------------

ALTER TABLE "collector_status" ADD COLUMN "server_id" TEXT;
ALTER TABLE "collector_status" ADD COLUMN "process_today" INTEGER NOT NULL DEFAULT 0;
UPDATE "collector_status" SET "server_id" = 'server-legacy';
ALTER TABLE "collector_status" ALTER COLUMN "server_id" SET NOT NULL;
ALTER TABLE "collector_status" ADD CONSTRAINT "collector_status_server_id_key" UNIQUE ("server_id");

-- AddForeignKey
ALTER TABLE "collector_status" ADD CONSTRAINT "collector_status_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (process_events → servers)
ALTER TABLE "process_events" ADD CONSTRAINT "process_events_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
