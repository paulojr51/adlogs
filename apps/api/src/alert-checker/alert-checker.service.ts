import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { AlertRule } from '@adlogs/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AlertsService } from '../alerts/alerts.service';

@Injectable()
export class AlertCheckerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertCheckerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
    private readonly alertsService: AlertsService,
  ) {}

  onModuleInit() {
    void this.runCheck();
    this.timer = setInterval(() => void this.runCheck(), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runCheck() {
    const rules = await this.prisma.alertRule.findMany({ where: { enabled: true } });
    if (rules.length === 0) return;
    this.logger.debug(`Verificando ${rules.length} regra(s) de alerta`);
    for (const rule of rules) {
      await this.evaluateRule(rule).catch((err: unknown) =>
        this.logger.error(`Erro ao avaliar regra "${rule.name}": ${String(err)}`),
      );
    }
  }

  async evaluateRule(rule: AlertRule): Promise<void> {
    const since = new Date(Date.now() - rule.windowMinutes * 60_000);

    const recent = await this.prisma.alert.findFirst({
      where: { ruleId: rule.id, triggeredAt: { gte: since } },
    });
    if (recent) {
      this.logger.debug(`Regra "${rule.name}": alerta recente ignorado (cooldown)`);
      return;
    }

    const count = await this.countEvents(rule, since);
    this.logger.debug(`Regra "${rule.name}": ${count} evento(s) nos últimos ${rule.windowMinutes}min`);

    const triggered =
      rule.condition === 'ANY' ? count > 0 : count >= (rule.threshold ?? 1);
    if (!triggered) return;

    const detail = `${count} evento(s) detectado(s) nos últimos ${rule.windowMinutes} minutos`;

    const serverId = rule.serverId ?? (await this.getFirstServerId());
    if (!serverId) {
      this.logger.warn(`Regra "${rule.name}": nenhum servidor ativo encontrado`);
      return;
    }

    this.logger.log(`Alerta disparado: "${rule.name}" — ${detail}`);
    const alert = await this.alertsService.create({ ruleId: rule.id, serverId, eventCount: count, detail });

    const body = `Alerta: ${rule.name}\n${detail}\nCategoria: ${rule.category}\nServidor: ${serverId}`;
    await this.notification.sendEmail(
      rule.emailTo,
      `[ADLogs] Alerta: ${rule.name}`,
      body,
    );

    if (rule.webhookUrl) {
      await this.notification.sendWebhook(rule.webhookUrl, {
        alert: rule.name,
        category: rule.category,
        eventCount: count,
        detail,
        triggeredAt: alert.triggeredAt ?? new Date(),
      });
    }

    await this.alertsService.markNotified(alert.id);
  }

  private async countEvents(rule: AlertRule, since: Date): Promise<number> {
    const serverFilter = rule.serverId ? { serverId: rule.serverId } : {};
    const types = rule.eventTypes;

    switch (rule.category) {
      case 'LOGIN': {
        const where: Record<string, unknown> = { ...serverFilter, timestamp: { gte: since } };
        if (types.includes('FAILED')) where['success'] = false;
        else if (types.includes('SUCCESS')) where['success'] = true;
        return this.prisma.loginEvent.count({ where });
      }
      case 'FILE': {
        const where: Record<string, unknown> = { ...serverFilter, timestamp: { gte: since } };
        if (types.length > 0) where['action'] = { in: types };
        return this.prisma.fileEvent.count({ where });
      }
      case 'ACCOUNT': {
        const where: Record<string, unknown> = { ...serverFilter, timestamp: { gte: since } };
        if (types.length > 0) where['eventType'] = { in: types };
        return this.prisma.accountEvent.count({ where });
      }
      case 'SQL': {
        const where: Record<string, unknown> = { ...serverFilter, timestamp: { gte: since } };
        if (types.length > 0) where['eventType'] = { in: types };
        return this.prisma.sqlEvent.count({ where });
      }
      default:
        return 0;
    }
  }

  private async getFirstServerId(): Promise<string | null> {
    const server = await this.prisma.server.findFirst({
      where: { active: true },
      select: { id: true },
    });
    return server?.id ?? null;
  }
}
