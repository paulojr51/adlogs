import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessEventsFilterDto } from './dto/process-events-filter.dto';

export interface ProcessEventInput {
  windowsEventId?: number;
  username: string;
  domain?: string;
  processName: string;
  processPath?: string;
  commandLine?: string;
  parentProcessName?: string;
  parentProcessId?: number;
  processId?: number;
  timestamp: string;
  windowsRecordId?: string;
}

@Injectable()
export class ProcessEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: ProcessEventsFilterDto) {
    const where: Record<string, unknown> = {};

    if (filter.username) {
      where.username = { contains: filter.username, mode: 'insensitive' };
    }
    if (filter.processName) {
      where.processName = { contains: filter.processName, mode: 'insensitive' };
    }
    if (filter.serverId) {
      where.serverId = filter.serverId;
    }
    if (filter.from || filter.to) {
      where.timestamp = {
        ...(filter.from && { gte: new Date(filter.from) }),
        ...(filter.to && { lte: new Date(filter.to) }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.processEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: filter.limit ?? 50,
        skip: filter.offset ?? 0,
      }),
      this.prisma.processEvent.count({ where }),
    ]);

    return { data, total, limit: filter.limit ?? 50, offset: filter.offset ?? 0 };
  }

  async ingestBatch(serverId: string, events: ProcessEventInput[]) {
    if (events.length === 0) return { inserted: 0 };

    const recordIds = events
      .map((e) => e.windowsRecordId)
      .filter((r): r is string => typeof r === 'string');

    const existingIds = new Set<string>();
    if (recordIds.length > 0) {
      const existing = await this.prisma.processEvent.findMany({
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

    const result = await this.prisma.processEvent.createMany({
      data: toInsert.map((e) => ({
        serverId,
        windowsEventId: e.windowsEventId ?? 4688,
        username: e.username,
        domain: e.domain,
        processName: e.processName,
        processPath: e.processPath,
        commandLine: e.commandLine,
        parentProcessName: e.parentProcessName,
        parentProcessId: e.parentProcessId,
        processId: e.processId,
        timestamp: new Date(e.timestamp),
        windowsRecordId: e.windowsRecordId,
      })),
      skipDuplicates: true,
    });

    return { inserted: result.count };
  }
}
