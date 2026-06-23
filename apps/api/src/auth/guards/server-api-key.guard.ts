import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const SERVER_KEY_HEADER = 'x-server-key';

@Injectable()
export class ServerApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string>;
    const rawKey = headers[SERVER_KEY_HEADER];

    if (!rawKey) {
      throw new UnauthorizedException('X-Server-Key ausente');
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const server = await this.prisma.server.findFirst({
      where: { apiKeyHash: keyHash, active: true },
    });

    if (!server) {
      throw new UnauthorizedException('API Key inválida ou servidor inativo');
    }

    request['server'] = server;
    return true;
  }
}
