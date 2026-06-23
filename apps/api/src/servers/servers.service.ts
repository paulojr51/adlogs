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

    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        hostname: dto.hostname,
        ipAddress: dto.ipAddress,
        description: dto.description,
        apiKeyHash: keyHash,
      },
      select: SAFE_SELECT,
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
    await this.findOne(id);
    await this.prisma.server.update({
      where: { id },
      data: { active: false },
    });
    return { message: 'Servidor desativado com sucesso' };
  }

  private _generateKey(): { rawKey: string; keyHash: string } {
    const rawKey = `adlogs_${randomBytes(16).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    return { rawKey, keyHash };
  }
}
