import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileEventsFilterDto } from './dto/events-filter.dto';

@Injectable()
export class FileEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: FileEventsFilterDto) {
    const where: Record<string, unknown> = {};

    if (filter.username) {
      where.username = { contains: filter.username, mode: 'insensitive' };
    }
    if (filter.filePath) {
      where.filePath = { contains: filter.filePath, mode: 'insensitive' };
    }
    if (filter.monitoredFolder) {
      where.monitoredFolder = filter.monitoredFolder;
    }
    if (filter.action) {
      where.action = filter.action;
    }
    if (filter.from || filter.to) {
      where.timestamp = {
        ...(filter.from && { gte: new Date(filter.from) }),
        ...(filter.to && { lte: new Date(filter.to) }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.fileEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: filter.limit ?? 50,
        skip: filter.offset ?? 0,
      }),
      this.prisma.fileEvent.count({ where }),
    ]);

    return { data, total, limit: filter.limit ?? 50, offset: filter.offset ?? 0 };
  }

  async findOne(id: string) {
    return this.prisma.fileEvent.findUnique({ where: { id } });
  }

  async getStats(from?: Date, to?: Date) {
    const dateFilter = from || to
      ? { timestamp: { ...(from && { gte: from }), ...(to && { lte: to }) } }
      : {};

    return this.prisma.fileEvent.groupBy({
      by: ['action'],
      where: dateFilter,
      _count: { action: true },
    });
  }
}
