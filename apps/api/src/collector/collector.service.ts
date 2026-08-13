import { Injectable } from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import type { Server } from '@adlogs/shared';
import { PrismaService } from '../prisma/prisma.service';
import { withCollectorHealth } from './collector-health';

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

  /**
   * Horário do evento mais recente que o coletor conseguiu entregar.
   * Opcional: coletores anteriores à correção não enviam este campo.
   */
  @IsOptional()
  @IsString()
  lastEventAt?: string;
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
    const common = {
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
    };

    // Só grava lastEventAt quando o coletor informa. Coletores anteriores à
    // correção omitem o campo — sobrescrever com null apagaria a última
    // referência conhecida de coleta.
    const lastEvent = data.lastEventAt
      ? { lastEventAt: new Date(data.lastEventAt) }
      : {};

    return this.prisma.collectorStatus.upsert({
      where: { serverId: server.id },
      update: { ...common, ...lastEvent },
      create: { serverId: server.id, ...common, ...lastEvent },
    });
  }

  async getStatus(serverId?: string) {
    const where = serverId ? { serverId } : undefined;
    const statuses = await this.prisma.collectorStatus.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
    });

    return statuses.map((s) => withCollectorHealth(s));
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

    const existingKeys = new Set<string>();
    if (recordIds.length > 0) {
      const existing = await this.prisma.loginEvent.findMany({
        where: { serverId, windowsRecordId: { in: recordIds } },
        select: { windowsRecordId: true, timestamp: true },
      });
      existing.forEach((e) => {
        if (e.windowsRecordId) {
          existingKeys.add(this._dedupKey(e.windowsRecordId, e.timestamp));
        }
      });
    }

    const toInsert = events.filter(
      (e) =>
        !e.windowsRecordId ||
        !existingKeys.has(this._dedupKey(e.windowsRecordId, e.timestamp)),
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

    const existingKeys = new Set<string>();
    if (recordIds.length > 0) {
      const existing = await this.prisma.fileEvent.findMany({
        where: { serverId, windowsRecordId: { in: recordIds } },
        select: { windowsRecordId: true, timestamp: true },
      });
      existing.forEach((e) => {
        if (e.windowsRecordId) {
          existingKeys.add(this._dedupKey(e.windowsRecordId, e.timestamp));
        }
      });
    }

    const toInsert = events.filter(
      (e) =>
        !e.windowsRecordId ||
        !existingKeys.has(this._dedupKey(e.windowsRecordId, e.timestamp)),
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

  /**
   * Chave de deduplicação de eventos do Windows.
   *
   * O RecordNumber do Event Log NÃO é estável ao longo do tempo: quando o log é
   * limpo ou arquivado por tamanho (AutoBackupLogFiles), o Windows reinicia a
   * contagem em 1. Deduplicar só por windowsRecordId faria eventos novos
   * legítimos colidirem com eventos antigos e serem descartados em silêncio —
   * e quebraria a reimportação de arquivos .evtx históricos.
   *
   * O timestamp desempata: o mesmo servidor não gera dois eventos distintos
   * com o mesmo RecordNumber no mesmo instante.
   */
  private _dedupKey(recordId: string, timestamp: Date | string): string {
    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return `${recordId}|${ts.toISOString()}`;
  }
}
