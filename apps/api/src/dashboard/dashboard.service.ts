import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const [
      totalLoginToday,
      failedLoginToday,
      totalFileToday,
      collectorStatus,
      recentLoginEvents,
      recentFileEvents,
    ] = await Promise.all([
      this.prisma.loginEvent.count({
        where: { timestamp: { gte: today }, success: true },
      }),
      this.prisma.loginEvent.count({
        where: { timestamp: { gte: today }, success: false },
      }),
      this.prisma.fileEvent.count({
        where: { timestamp: { gte: today } },
      }),
      this.prisma.collectorStatus.findFirst({
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.loginEvent.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          id: true,
          username: true,
          domain: true,
          sourceIp: true,
          success: true,
          logonTypeName: true,
          timestamp: true,
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

    return {
      today: {
        logins: totalLoginToday,
        failedLogins: failedLoginToday,
        fileEvents: totalFileToday,
      },
      collector: collectorStatus ? {
        ...collectorStatus,
        isRunning: collectorStatus.lastSeenAt > new Date(Date.now() - 10 * 60 * 1000),
      } : null,
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

    // Agrupar por dia
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
