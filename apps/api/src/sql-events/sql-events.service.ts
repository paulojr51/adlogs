import { Injectable } from '@nestjs/common';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import type { SqlEventType } from '@adlogs/shared';
import { PrismaService } from '../prisma/prisma.service';

export class SqlEventsFilterDto {
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() eventType?: string;
  @IsOptional() @IsString() serverId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsInt() @Min(1) @Max(200) @Type(() => Number) limit?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) offset?: number;
}

export interface SqlEventInput {
  windowsEventId: number;
  eventType: string;
  username?: string;
  clientIp?: string;
  database?: string;
  detail?: string;
  success?: boolean;
  timestamp: string;
  windowsRecordId?: string;
}

@Injectable()
export class SqlEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: SqlEventsFilterDto) {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const where: Record<string, unknown> = {};
    if (filter.username) where['username'] = { contains: filter.username, mode: 'insensitive' };
    if (filter.eventType) where['eventType'] = filter.eventType;
    if (filter.serverId) where['serverId'] = filter.serverId;
    if (filter.from || filter.to) {
      where['timestamp'] = {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to   ? { lte: new Date(filter.to) }   : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.sqlEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.sqlEvent.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  async ingestBatch(serverId: string, events: SqlEventInput[]) {
    if (events.length === 0) return { inserted: 0 };

    const recordIds = events
      .map((e) => e.windowsRecordId)
      .filter((r): r is string => typeof r === 'string');

    const existingIds = new Set<string>();
    if (recordIds.length > 0) {
      const existing = await this.prisma.sqlEvent.findMany({
        where: { serverId, windowsRecordId: { in: recordIds } },
        select: { windowsRecordId: true },
      });
      existing.forEach((e) => { if (e.windowsRecordId) existingIds.add(e.windowsRecordId); });
    }

    const toInsert = events.filter(
      (e) => !e.windowsRecordId || !existingIds.has(e.windowsRecordId),
    );
    if (toInsert.length === 0) return { inserted: 0 };

    const result = await this.prisma.sqlEvent.createMany({
      data: toInsert.map((e) => ({
        serverId,
        windowsEventId: e.windowsEventId,
        eventType: e.eventType as SqlEventType,
        username: e.username,
        clientIp: e.clientIp,
        database: e.database,
        detail: e.detail,
        success: e.success ?? false,
        timestamp: new Date(e.timestamp),
        windowsRecordId: e.windowsRecordId,
      })),
      skipDuplicates: true,
    });

    return { inserted: result.count };
  }
}
