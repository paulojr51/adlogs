import { Injectable } from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import type { Server } from '@adlogs/shared';
import { PrismaService } from '../prisma/prisma.service';

export class UpdateConfigDto {
  @IsOptional() @IsBoolean() collectLogins?: boolean;
  @IsOptional() @IsBoolean() collectFiles?: boolean;
  @IsOptional() @IsBoolean() collectProcesses?: boolean;
  @IsOptional() @IsBoolean() collectAccountChanges?: boolean;
  @IsOptional() @IsBoolean() collectSqlServer?: boolean;
}

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

  @IsNumber()
  accountToday!: number;

  @IsNumber()
  sqlToday!: number;
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
        accountToday: data.accountToday,
        sqlToday: data.sqlToday,
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
        accountToday: data.accountToday,
        sqlToday: data.sqlToday,
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

  async updateConfig(serverId: string, dto: UpdateConfigDto) {
    const data: Record<string, boolean> = {};
    if (dto.collectLogins         !== undefined) data.collectLogins         = dto.collectLogins;
    if (dto.collectFiles          !== undefined) data.collectFiles          = dto.collectFiles;
    if (dto.collectProcesses      !== undefined) data.collectProcesses      = dto.collectProcesses;
    if (dto.collectAccountChanges !== undefined) data.collectAccountChanges = dto.collectAccountChanges;
    if (dto.collectSqlServer      !== undefined) data.collectSqlServer      = dto.collectSqlServer;

    return this.prisma.serverConfig.upsert({
      where: { serverId },
      update: data,
      create: {
        serverId,
        collectLogins:         dto.collectLogins         ?? true,
        collectFiles:          dto.collectFiles          ?? true,
        collectProcesses:      dto.collectProcesses      ?? false,
        collectAccountChanges: dto.collectAccountChanges ?? false,
        collectSqlServer:      dto.collectSqlServer      ?? false,
      },
    });
  }

  async getConfig(serverId: string) {
    const [folders, config] = await Promise.all([
      this.prisma.monitoredFolder.findMany({
        where: { active: true, OR: [{ serverId }, { serverId: null }] },
        select: { path: true },
      }),
      this.prisma.serverConfig.findUnique({ where: { serverId } }),
    ]);

    return {
      monitoredFolders: folders.map((f) => f.path),
      collectLogins:         config?.collectLogins         ?? true,
      collectFiles:          config?.collectFiles          ?? true,
      collectProcesses:      config?.collectProcesses      ?? false,
      collectAccountChanges: config?.collectAccountChanges ?? false,
      collectSqlServer:      config?.collectSqlServer      ?? false,
    };
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
