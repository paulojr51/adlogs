import { Injectable } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';

export class AlertsFilterDto {
  @IsOptional() @IsString() ruleId?: string;
  @IsOptional() @IsString() serverId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsInt() @Min(1) @Max(200) @Type(() => Number) limit?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) offset?: number;
}

export interface CreateAlertData {
  ruleId: string;
  serverId: string;
  eventCount: number;
  detail?: string;
}

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: AlertsFilterDto) {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const where: Record<string, unknown> = {};
    if (filter.ruleId) where['ruleId'] = filter.ruleId;
    if (filter.serverId) where['serverId'] = filter.serverId;
    if (filter.from || filter.to) {
      where['triggeredAt'] = {
        ...(filter.from ? { gte: new Date(filter.from) } : {}),
        ...(filter.to ? { lte: new Date(filter.to) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        include: { rule: { select: { id: true, name: true, category: true } }, server: { select: { id: true, name: true } } },
        orderBy: { triggeredAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.alert.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  create(data: CreateAlertData) {
    return this.prisma.alert.create({ data });
  }

  markNotified(id: string) {
    return this.prisma.alert.update({ where: { id }, data: { notified: true } });
  }
}
