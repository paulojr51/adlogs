import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UserActivityItem {
  type: 'LOGIN' | 'LOGOFF' | 'LOGIN_FAILED' | 'FILE';
  timestamp: Date;
  detail: string;
  extra?: Record<string, unknown>;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Linha do tempo completa de um usuário num período.
   * Combina login_events + file_events, ordenados por horário.
   */
  async getUserActivity(username: string, from: Date, to: Date) {
    const [loginEvents, fileEvents] = await Promise.all([
      this.prisma.loginEvent.findMany({
        where: {
          username: { contains: username, mode: 'insensitive' },
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: 'asc' },
        select: {
          id: true,
          windowsEventId: true,
          username: true,
          domain: true,
          sourceIp: true,
          workstation: true,
          logonTypeName: true,
          success: true,
          failureReason: true,
          timestamp: true,
        },
      }),
      this.prisma.fileEvent.findMany({
        where: {
          username: { contains: username, mode: 'insensitive' },
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: 'asc' },
        select: {
          id: true,
          username: true,
          domain: true,
          filePath: true,
          monitoredFolder: true,
          action: true,
          processName: true,
          timestamp: true,
        },
      }),
    ]);

    // Monta linha do tempo unificada
    const timeline: UserActivityItem[] = [
      ...loginEvents.map((e) => ({
        type: this._loginType(e.windowsEventId, e.success),
        timestamp: e.timestamp,
        detail: this._loginDetail(e),
        extra: {
          id: e.id,
          sourceIp: e.sourceIp,
          workstation: e.workstation,
          logonTypeName: e.logonTypeName,
          failureReason: e.failureReason,
          domain: e.domain,
        },
      })),
      ...fileEvents.map((e) => ({
        type: 'FILE' as const,
        timestamp: e.timestamp,
        detail: `${e.action} — ${e.filePath}`,
        extra: {
          id: e.id,
          action: e.action,
          filePath: e.filePath,
          monitoredFolder: e.monitoredFolder,
          processName: e.processName,
          domain: e.domain,
        },
      })),
    ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      username,
      from,
      to,
      totalLogins: loginEvents.filter((e) => e.success).length,
      totalFailedLogins: loginEvents.filter((e) => !e.success).length,
      totalFileEvents: fileEvents.length,
      timeline,
    };
  }

  /**
   * Quem acessou uma pasta específica num período.
   * Agrupa por usuário e tipo de ação.
   */
  async getFolderActivity(folderPath: string, from: Date, to: Date) {
    const events = await this.prisma.fileEvent.findMany({
      where: {
        OR: [
          { monitoredFolder: { contains: folderPath, mode: 'insensitive' } },
          { filePath: { contains: folderPath, mode: 'insensitive' } },
        ],
        timestamp: { gte: from, lte: to },
      },
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        username: true,
        domain: true,
        filePath: true,
        monitoredFolder: true,
        action: true,
        processName: true,
        timestamp: true,
      },
    });

    // Agrupa por usuário
    const byUser = new Map<string, {
      username: string;
      actions: Record<string, number>;
      lastSeen: Date;
      count: number;
    }>();

    for (const e of events) {
      const key = e.username.toLowerCase();
      const current = byUser.get(key) ?? {
        username: e.username,
        actions: {},
        lastSeen: e.timestamp,
        count: 0,
      };
      current.actions[e.action] = (current.actions[e.action] ?? 0) + 1;
      current.count++;
      if (e.timestamp > current.lastSeen) current.lastSeen = e.timestamp;
      byUser.set(key, current);
    }

    return {
      folderPath,
      from,
      to,
      totalEvents: events.length,
      uniqueUsers: byUser.size,
      userSummary: Array.from(byUser.values()).sort((a, b) => b.count - a.count),
      events,
    };
  }

  /**
   * Quem realizou uma ação específica (ex: DELETE) numa pasta num período.
   */
  async getFolderActionReport(
    folderPath: string,
    action: string,
    from: Date,
    to: Date,
  ) {
    const events = await this.prisma.fileEvent.findMany({
      where: {
        OR: [
          { monitoredFolder: { contains: folderPath, mode: 'insensitive' } },
          { filePath: { contains: folderPath, mode: 'insensitive' } },
        ],
        action: action as never,
        timestamp: { gte: from, lte: to },
      },
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        username: true,
        domain: true,
        filePath: true,
        monitoredFolder: true,
        action: true,
        processName: true,
        timestamp: true,
      },
    });

    return {
      folderPath,
      action,
      from,
      to,
      total: events.length,
      events,
    };
  }

  private _loginType(
    eventId: number,
    success: boolean,
  ): UserActivityItem['type'] {
    if (eventId === 4634 || eventId === 4647) return 'LOGOFF';
    if (!success) return 'LOGIN_FAILED';
    return 'LOGIN';
  }

  private _loginDetail(e: {
    success: boolean;
    windowsEventId: number;
    logonTypeName?: string | null;
    sourceIp?: string | null;
    workstation?: string | null;
    failureReason?: string | null;
  }): string {
    if (e.windowsEventId === 4634 || e.windowsEventId === 4647) {
      return 'Logoff';
    }
    if (!e.success) {
      return `Falha de login${e.failureReason ? ` — ${e.failureReason}` : ''}${e.sourceIp ? ` (${e.sourceIp})` : ''}`;
    }
    const type = e.logonTypeName ? ` (${e.logonTypeName})` : '';
    const ip = e.sourceIp ? ` — ${e.sourceIp}` : '';
    return `Login bem-sucedido${type}${ip}`;
  }
}
