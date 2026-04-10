import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CollectorHeartbeatDto {
  version: string;
  hostname: string;
  eventsToday: number;
  loginToday: number;
  fileToday: number;
}

@Injectable()
export class CollectorService {
  constructor(private readonly prisma: PrismaService) {}

  async heartbeat(data: CollectorHeartbeatDto) {
    const existing = await this.prisma.collectorStatus.findFirst();

    if (existing) {
      return this.prisma.collectorStatus.update({
        where: { id: existing.id },
        data: {
          isRunning: true,
          lastSeenAt: new Date(),
          version: data.version,
          hostname: data.hostname,
          eventsToday: data.eventsToday,
          loginToday: data.loginToday,
          fileToday: data.fileToday,
        },
      });
    }

    return this.prisma.collectorStatus.create({
      data: {
        isRunning: true,
        lastSeenAt: new Date(),
        version: data.version,
        hostname: data.hostname,
        eventsToday: data.eventsToday,
        loginToday: data.loginToday,
        fileToday: data.fileToday,
      },
    });
  }

  async getStatus() {
    const status = await this.prisma.collectorStatus.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!status) {
      return { isRunning: false, lastSeenAt: null };
    }

    // Considera offline se não bateu heartbeat há mais de 10 minutos
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const isRunning = status.lastSeenAt > tenMinutesAgo;

    return { ...status, isRunning };
  }

  async getConfig() {
    const folders = await this.prisma.monitoredFolder.findMany({
      where: { active: true },
      select: { path: true, description: true },
    });

    return { monitoredFolders: folders.map((f) => f.path) };
  }
}
