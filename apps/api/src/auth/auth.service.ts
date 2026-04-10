import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

function parseExpiresIn(value: string | undefined, defaultSeconds: number): number {
  if (!value) return defaultSeconds;
  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return defaultSeconds;
  const num = parseInt(match[1], 10);
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return num * (multipliers[match[2]] ?? 60);
}

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tokenVersion: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Atualiza lastLoginAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: parseExpiresIn(process.env.JWT_EXPIRES_IN, 900),
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: parseExpiresIn(process.env.JWT_REFRESH_EXPIRES_IN, 604800),
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async refresh(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, tokenVersion: true, active: true },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuário não encontrado ou inativo');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: parseExpiresIn(process.env.JWT_EXPIRES_IN, 900),
      }),
    };
  }

  async logout(userId: string) {
    // Incrementa tokenVersion para invalidar todos os tokens existentes
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    return user;
  }
}
