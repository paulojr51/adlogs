import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServerDto, UpdateServerDto } from './dto/server.dto';

const SAFE_SELECT = {
  id: true,
  name: true,
  hostname: true,
  ipAddress: true,
  description: true,
  active: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class ServersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.server.findMany({
      select: { ...SAFE_SELECT, _count: { select: { loginEvents: true, fileEvents: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const server = await this.prisma.server.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
    if (!server) throw new NotFoundException('Servidor não encontrado');
    return server;
  }

  async create(dto: CreateServerDto) {
    const existing = await this.prisma.server.findFirst({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Já existe um servidor com este nome');

    const { rawKey, keyHash } = this._generateKey();

    const server = await this.prisma.$transaction(async (tx) => {
      const created = await tx.server.create({
        data: {
          name: dto.name,
          hostname: dto.hostname,
          ipAddress: dto.ipAddress,
          description: dto.description,
          apiKeyHash: keyHash,
        },
        select: SAFE_SELECT,
      });
      await tx.serverConfig.create({
        data: {
          serverId: created.id,
          collectLogins: true,
          collectFiles: true,
          collectProcesses: false,
          collectAccountChanges: false,
          collectSqlServer: false,
        },
      });
      return created;
    });

    return { server, apiKey: rawKey };
  }

  async update(id: string, dto: UpdateServerDto) {
    await this.findOne(id);
    return this.prisma.server.update({
      where: { id },
      data: dto,
      select: SAFE_SELECT,
    });
  }

  async rotateKey(id: string) {
    await this.findOne(id);
    const { rawKey, keyHash } = this._generateKey();

    await this.prisma.server.update({
      where: { id },
      data: { apiKeyHash: keyHash },
    });

    return { apiKey: rawKey };
  }

  async remove(id: string) {
    const server = await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.alert.deleteMany({ where: { serverId: id } });
      await tx.alertRule.deleteMany({ where: { serverId: id } });
      await tx.collectorStatus.deleteMany({ where: { serverId: id } });
      await tx.monitoredFolder.deleteMany({ where: { serverId: id } });
      await tx.serverConfig.deleteMany({ where: { serverId: id } });
      await tx.loginEvent.deleteMany({ where: { serverId: id } });
      await tx.fileEvent.deleteMany({ where: { serverId: id } });
      await tx.processEvent.deleteMany({ where: { serverId: id } });
      await tx.accountEvent.deleteMany({ where: { serverId: id } });
      await tx.sqlEvent.deleteMany({ where: { serverId: id } });
      await tx.server.delete({ where: { id } });
    });

    return { message: `Servidor "${server.name}" excluído permanentemente` };
  }

  private _generateKey(): { rawKey: string; keyHash: string } {
    const rawKey = `adlogs_${randomBytes(16).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    return { rawKey, keyHash };
  }
}
