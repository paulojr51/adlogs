import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '@adlogs/shared';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto, requesterId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    // Impede SUPER_ADMIN de ser desativado
    if (user.role === Role.SUPER_ADMIN && dto.active === false) {
      throw new ForbiddenException('Não é possível desativar um SUPER_ADMIN');
    }

    // Impede auto-downgrade
    if (id === requesterId && dto.role && dto.role !== user.role) {
      throw new ForbiddenException('Não é possível alterar seu próprio role');
    }

    const data: Record<string, unknown> = {
      ...(dto.name && { name: dto.name }),
      ...(dto.role && { role: dto.role }),
      ...(dto.active !== undefined && { active: dto.active }),
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
      data.tokenVersion = { increment: 1 };
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new ForbiddenException('Não é possível remover o próprio usuário');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Não é possível remover um SUPER_ADMIN');
    }

    await this.prisma.user.delete({ where: { id } });
    return { message: 'Usuário removido com sucesso' };
  }
}
