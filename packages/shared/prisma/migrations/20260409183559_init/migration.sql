-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "FileAction" AS ENUM ('READ', 'WRITE', 'DELETE', 'RENAME', 'PERMISSION_CHANGE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "windows_event_id" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "domain" TEXT,
    "source_ip" TEXT,
    "workstation" TEXT,
    "logon_type" INTEGER,
    "logon_type_name" TEXT,
    "success" BOOLEAN NOT NULL,
    "failure_reason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "windows_record_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_events" (
    "id" TEXT NOT NULL,
    "windows_event_id" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "domain" TEXT,
    "file_path" TEXT NOT NULL,
    "monitored_folder" TEXT,
    "action" "FileAction" NOT NULL,
    "process_name" TEXT,
    "process_id" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "windows_record_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitored_folders" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitored_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collector_status" (
    "id" TEXT NOT NULL,
    "is_running" BOOLEAN NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "version" TEXT,
    "hostname" TEXT,
    "events_today" INTEGER NOT NULL DEFAULT 0,
    "login_today" INTEGER NOT NULL DEFAULT 0,
    "file_today" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collector_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_audit" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "ip" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "login_events_username_idx" ON "login_events"("username");

-- CreateIndex
CREATE INDEX "login_events_timestamp_idx" ON "login_events"("timestamp");

-- CreateIndex
CREATE INDEX "login_events_success_idx" ON "login_events"("success");

-- CreateIndex
CREATE INDEX "login_events_source_ip_idx" ON "login_events"("source_ip");

-- CreateIndex
CREATE INDEX "login_events_windows_event_id_idx" ON "login_events"("windows_event_id");

-- CreateIndex
CREATE INDEX "file_events_username_idx" ON "file_events"("username");

-- CreateIndex
CREATE INDEX "file_events_timestamp_idx" ON "file_events"("timestamp");

-- CreateIndex
CREATE INDEX "file_events_file_path_idx" ON "file_events"("file_path");

-- CreateIndex
CREATE INDEX "file_events_action_idx" ON "file_events"("action");

-- CreateIndex
CREATE INDEX "file_events_monitored_folder_idx" ON "file_events"("monitored_folder");

-- CreateIndex
CREATE INDEX "file_events_windows_event_id_idx" ON "file_events"("windows_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "monitored_folders_path_key" ON "monitored_folders"("path");

-- CreateIndex
CREATE INDEX "system_audit_user_id_idx" ON "system_audit"("user_id");

-- CreateIndex
CREATE INDEX "system_audit_timestamp_idx" ON "system_audit"("timestamp");

-- AddForeignKey
ALTER TABLE "system_audit" ADD CONSTRAINT "system_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
