import { Injectable } from '@nestjs/common';
import { IsNumber, IsString } from 'class-validator';
import type { Server } from '@adlogs/shared';
import { PrismaService } from '../prisma/prisma.service';

export class CollectorHeartbeatDto {
  @IsString()
  version!: string;

  @IsString()
  hostname!: string;

  @IsNumber()
  eventsToday!: number;

  @IsNumber()
  loginToday!: number;

  @IsNumber()
  fileToday!: number;

  @IsNumber()
  processToday!: number;
}

export interface LoginEventInput {
  windowsEventId: number;
  username: string;
  domain?: string;
  sourceIp?: string;
  workstation?: string;
  logonType?: number;
  logonTypeName?: string;
  success: boolean;
  failureReason?: string;
  timestamp: string;
  windowsRecordId?: string;
}

export interface FileEventInput {
  windowsEventId: number;
  username: string;
  domain?: string;
  filePath: string;
  monitoredFolder?: string;
  action: string;
  processName?: string;
  processId?: number;
  timestamp: string;
  windowsRecordId?: string;
}

@Injectable()
export class CollectorService {
  constructor(private readonly prisma: PrismaService) {}

  async heartbeat(server: Server, data: CollectorHeartbeatDto) {
    return this.prisma.collectorStatus.upsert({
      where: { serverId: server.id },
      update: {
        isRunning: true,
        lastSeenAt: new Date(),
        version: data.version,
        hostname: data.hostname,
        eventsToday: data.eventsToday,
        loginToday: data.loginToday,
        fileToday: data.fileToday,
        processToday: data.processToday,
      },
      create: {
        serverId: server.id,
        isRunning: true,
        lastSeenAt: new Date(),
        version: data.version,
        hostname: data.hostname,
        eventsToday: data.eventsToday,
        loginToday: data.loginToday,
        fileToday: data.fileToday,
        processToday: data.processToday,
      },
    });
  }

  async getStatus(serverId?: string) {
    const where = serverId ? { serverId } : undefined;
    const statuses = await this.prisma.collectorStatus.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
    });

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    return statuses.map((s) => ({
      ...s,
      isRunning: s.lastSeenAt > tenMinutesAgo,
    }));
  }

  async getConfig(serverId: string) {
    const folders = await this.prisma.monitoredFolder.findMany({
      where: {
        active: true,
        OR: [{ serverId }, { serverId: null }],
      },
      select: { path: true },
    });

    return { monitoredFolders: folders.map((f) => f.path) };
  }

  async ingestLoginEvents(serverId: string, events: LoginEventInput[]) {
    if (events.length === 0) return { inserted: 0 };

    const recordIds = events
      .map((e) => e.windowsRecordId)
      .filter((r): r is string => typeof r === 'string');

    const existingIds = new Set<string>();
    if (recordIds.length > 0) {
      const existing = await this.prisma.loginEvent.findMany({
        where: { serverId, windowsRecordId: { in: recordIds } },
        select: { windowsRecordId: true },
      });
      existing.forEach((e) => {
        if (e.windowsRecordId) existingIds.add(e.windowsRecordId);
      });
    }

    const toInsert = events.filter(
      (e) => !e.windowsRecordId || !existingIds.has(e.windowsRecordId),
    );
    if (toInsert.length === 0) return { inserted: 0 };

    const result = await this.prisma.loginEvent.createMany({
      data: toInsert.map((e) => ({
        serverId,
        windowsEventId: e.windowsEventId,
        username: e.username,
        domain: e.domain,
        sourceIp: e.sourceIp,
        workstation: e.workstation,
        logonType: e.logonType,
        logonTypeName: e.logonTypeName,
        success: e.success,
        failureReason: e.failureReason,
        timestamp: new Date(e.timestamp),
        windowsRecordId: e.windowsRecordId,
      })),
      skipDuplicates: true,
    });

    return { inserted: result.count };
  }

  async ingestFileEvents(serverId: string, events: FileEventInput[]) {
    if (events.length === 0) return { inserted: 0 };

    const recordIds = events
      .map((e) => e.windowsRecordId)
      .filter((r): r is string => typeof r === 'string');

    const existingIds = new Set<string>();
    if (recordIds.length > 0) {
      const existing = await this.prisma.fileEvent.findMany({
        where: { serverId, windowsRecordId: { in: recordIds } },
        select: { windowsRecordId: true },
      });
      existing.forEach((e) => {
        if (e.windowsRecordId) existingIds.add(e.windowsRecordId);
      });
    }

    const toInsert = events.filter(
      (e) => !e.windowsRecordId || !existingIds.has(e.windowsRecordId),
    );
    if (toInsert.length === 0) return { inserted: 0 };

    const result = await this.prisma.fileEvent.createMany({
      data: toInsert.map((e) => ({
        serverId,
        windowsEventId: e.windowsEventId,
        username: e.username,
        domain: e.domain,
        filePath: e.filePath,
        monitoredFolder: e.monitoredFolder,
        action: e.action as import('@adlogs/shared').FileAction,
        processName: e.processName,
        processId: e.processId,
        timestamp: new Date(e.timestamp),
        windowsRecordId: e.windowsRecordId,
      })),
      skipDuplicates: true,
    });

    return { inserted: result.count };
  }
}
