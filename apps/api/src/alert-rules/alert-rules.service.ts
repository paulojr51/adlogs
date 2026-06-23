import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';

export class CreateAlertRuleDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() serverId?: string;
  @IsString() category!: string;
  @IsString({ each: true }) eventTypes!: string[];
  @IsString() condition!: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) threshold?: number;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) windowMinutes?: number;
  @IsString({ each: true }) emailTo!: string[];
  @IsOptional() @IsUrl() webhookUrl?: string;
}

export class UpdateAlertRuleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() serverId?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString({ each: true }) eventTypes?: string[];
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) threshold?: number;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) windowMinutes?: number;
  @IsOptional() @IsString({ each: true }) emailTo?: string[];
  @IsOptional() @IsUrl() webhookUrl?: string;
}

@Injectable()
export class AlertRulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.alertRule.findMany({
      include: { _count: { select: { alerts: true } }, server: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.alertRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Regra de alerta não encontrada');
    return rule;
  }

  async create(dto: CreateAlertRuleDto) {
    if (dto.condition === 'THRESHOLD' && !dto.threshold) {
      throw new BadRequestException('threshold é obrigatório para condição THRESHOLD');
    }
    return this.prisma.alertRule.create({
      data: {
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled ?? true,
        serverId: dto.serverId ?? null,
        category: dto.category as never,
        eventTypes: dto.eventTypes,
        condition: dto.condition as never,
        threshold: dto.threshold ?? null,
        windowMinutes: dto.windowMinutes ?? 5,
        emailTo: dto.emailTo,
        webhookUrl: dto.webhookUrl ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateAlertRuleDto) {
    await this.findOne(id);
    return this.prisma.alertRule.update({ where: { id }, data: dto as never });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.alertRule.delete({ where: { id } });
    return { message: 'Regra removida com sucesso' };
  }
}
