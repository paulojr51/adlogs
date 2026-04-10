import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoginEventsFilterDto } from './dto/events-filter.dto';

@Injectable()
export class LoginEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: LoginEventsFilterDto) {
    const where: Record<string, unknown> = {};

    if (filter.username) {
      where.username = { contains: filter.username, mode: 'insensitive' };
    }
    if (filter.sourceIp) {
      where.sourceIp = { contains: filter.sourceIp };
    }
    if (filter.success !== undefined) {
      where.success = filter.success;
    }
    if (filter.from || filter.to) {
      where.timestamp = {
        ...(filter.from && { gte: new Date(filter.from) }),
        ...(filter.to && { lte: new Date(filter.to) }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.loginEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: filter.limit ?? 50,
        skip: filter.offset ?? 0,
      }),
      this.prisma.loginEvent.count({ where }),
    ]);

    return { data, total, limit: filter.limit ?? 50, offset: filter.offset ?? 0 };
  }

  async findOne(id: string) {
    return this.prisma.loginEvent.findUnique({ where: { id } });
  }

  async getStats(from?: Date, to?: Date) {
    const dateFilter = from || to
      ? { timestamp: { ...(from && { gte: from }), ...(to && { lte: to }) } }
      : {};

    const [total, success, failed] = await Promise.all([
      this.prisma.loginEvent.count({ where: dateFilter }),
      this.prisma.loginEvent.count({ where: { ...dateFilter, success: true } }),
      this.prisma.loginEvent.count({ where: { ...dateFilter, success: false } }),
    ]);

    return { total, success, failed };
  }
}
