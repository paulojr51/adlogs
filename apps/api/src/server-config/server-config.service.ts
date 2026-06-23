import { Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class UpdateServerConfigDto {
  @IsOptional() @IsBoolean() collectLogins?: boolean;
  @IsOptional() @IsBoolean() collectFiles?: boolean;
  @IsOptional() @IsBoolean() collectProcesses?: boolean;
  @IsOptional() @IsBoolean() collectAccountChanges?: boolean;
  @IsOptional() @IsBoolean() collectSqlServer?: boolean;
}

const DEFAULTS = {
  collectLogins: true,
  collectFiles: true,
  collectProcesses: false,
  collectAccountChanges: false,
  collectSqlServer: false,
};

@Injectable()
export class ServerConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertServerExists(serverId: string) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new NotFoundException(`Servidor ${serverId} não encontrado`);
  }

  async getConfig(serverId: string) {
    await this.assertServerExists(serverId);

    const config = await this.prisma.serverConfig.findUnique({ where: { serverId } });
    if (!config) {
      return { serverId, ...DEFAULTS };
    }
    return config;
  }

  async updateConfig(serverId: string, dto: UpdateServerConfigDto) {
    await this.assertServerExists(serverId);

    return this.prisma.serverConfig.upsert({
      where: { serverId },
      update: { ...dto },
      create: { serverId, ...DEFAULTS, ...dto },
    });
  }
}
