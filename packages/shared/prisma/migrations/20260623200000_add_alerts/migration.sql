-- CreateEnum
CREATE TYPE "AlertCategory" AS ENUM ('LOGIN', 'FILE', 'ACCOUNT', 'SQL');

-- CreateEnum
CREATE TYPE "AlertCondition" AS ENUM ('ANY', 'THRESHOLD');

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "server_id" TEXT,
    "category" "AlertCategory" NOT NULL,
    "event_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "condition" "AlertCondition" NOT NULL DEFAULT 'ANY',
    "threshold" INTEGER,
    "window_minutes" INTEGER NOT NULL DEFAULT 5,
    "email_to" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "webhook_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" TEXT,
    "event_count" INTEGER NOT NULL DEFAULT 1,
    "notified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_rule_id_idx" ON "alerts"("rule_id");

-- CreateIndex
CREATE INDEX "alerts_server_id_idx" ON "alerts"("server_id");

-- CreateIndex
CREATE INDEX "alerts_triggered_at_idx" ON "alerts"("triggered_at");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
