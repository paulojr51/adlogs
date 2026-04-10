import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMonitoredFolderDto, UpdateMonitoredFolderDto } from './dto/monitored-folder.dto';

@Injectable()
export class MonitoredFoldersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.monitoredFolder.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const folder = await this.prisma.monitoredFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException('Pasta não encontrada');
    return folder;
  }

  async create(dto: CreateMonitoredFolderDto) {
    const existing = await this.prisma.monitoredFolder.findUnique({
      where: { path: dto.path },
    });
    if (existing) throw new ConflictException('Pasta já cadastrada');

    return this.prisma.monitoredFolder.create({ data: dto });
  }

  async update(id: string, dto: UpdateMonitoredFolderDto) {
    await this.findOne(id);
    return this.prisma.monitoredFolder.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.monitoredFolder.delete({ where: { id } });
    return { message: 'Pasta removida com sucesso' };
  }
}
