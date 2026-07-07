import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [
      totalLoginToday,
      failedLoginToday,
      totalFileToday,
      totalProcessToday,
      totalAccountToday,
      totalSqlToday,
      collectors,
      recentAlerts,
      recentLoginEvents,
      recentFileEvents,
    ] = await Promise.all([
      this.prisma.loginEvent.count({ where: { timestamp: { gte: today }, success: true } }),
      this.prisma.loginEvent.count({ where: { timestamp: { gte: today }, success: false } }),
      this.prisma.fileEvent.count({ where: { timestamp: { gte: today } } }),
      this.prisma.processEvent.count({ where: { timestamp: { gte: today } } }),
      this.prisma.accountEvent.count({ where: { timestamp: { gte: today } } }),
      this.prisma.sqlEvent.count({ where: { timestamp: { gte: today } } }),
      this.prisma.collectorStatus.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { server: { select: { id: true, name: true, hostname: true } } },
      }),
      this.prisma.alert.findMany({
        orderBy: { triggeredAt: 'desc' },
        take: 5,
        select: {
          id: true,
          triggeredAt: true,
          detail: true,
          eventCount: true,
          notified: true,
          rule: { select: { id: true, name: true, category: true } },
          server: { select: { id: true, name: true } },
        },
      }),
      this.prisma.loginEvent.findMany({
        where: {
          logonType: { notIn: [4, 5] },
          NOT: [
            { username: { startsWith: 'DWM-' } },
            { username: { startsWith: 'UMFD-' } },
            { username: { in: ['SYSTEM', 'LOCAL SERVICE', 'NETWORK SERVICE'] } },
          ],
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          id: true,
          serverId: true,
          username: true,
          domain: true,
          sourceIp: true,
          success: true,
          logonType: true,
          logonTypeName: true,
          timestamp: true,
          server: { select: { name: true } },
        },
      }),
      this.prisma.fileEvent.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          id: true,
          username: true,
          filePath: true,
          action: true,
          timestamp: true,
        },
      }),
    ]);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    return {
      today: {
        logins: totalLoginToday,
        failedLogins: failedLoginToday,
        fileEvents: totalFileToday,
        processEvents: totalProcessToday,
        accountEvents: totalAccountToday,
        sqlEvents: totalSqlToday,
      },
      collectors: collectors.map((c) => ({
        ...c,
        isRunning: c.lastSeenAt > tenMinutesAgo,
      })),
      recentAlerts,
      recentLoginEvents,
      recentFileEvents,
    };
  }

  async getLoginChart(days: number = 7) {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    const events = await this.prisma.loginEvent.findMany({
      where: { timestamp: { gte: from } },
      select: { timestamp: true, success: true },
    });

    const byDay = new Map<string, { success: number; failed: number }>();
    for (const event of events) {
      const day = event.timestamp.toISOString().slice(0, 10);
      const current = byDay.get(day) ?? { success: 0, failed: 0 };
      if (event.success) {
        current.success++;
      } else {
        current.failed++;
      }
      byDay.set(day, current);
    }

    return Array.from(byDay.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getTopUsers(limit: number = 10) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.loginEvent.groupBy({
      by: ['username'],
      where: { timestamp: { gte: today } },
      _count: { username: true },
      orderBy: { _count: { username: 'desc' } },
      take: limit,
    });

    return result.map((r) => ({ username: r.username, count: r._count.username }));
  }
}
