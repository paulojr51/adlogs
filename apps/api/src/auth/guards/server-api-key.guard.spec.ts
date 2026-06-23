import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import { ServerApiKeyGuard, SERVER_KEY_HEADER } from './server-api-key.guard';
import { PrismaService } from '../../prisma/prisma.service';

const mockServer = { id: 'srv_1', name: 'Teste', active: true, apiKeyHash: '' };

function makeContext(headers: Record<string, string> = {}) {
  const request: Record<string, unknown> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    _request: request,
  } as unknown as import('@nestjs/common').ExecutionContext;
}

describe('ServerApiKeyGuard', () => {
  let guard: ServerApiKeyGuard;
  let prisma: jest.Mocked<Pick<PrismaService, 'server'>>;

  beforeEach(async () => {
    const findFirst = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        ServerApiKeyGuard,
        {
          provide: PrismaService,
          useValue: { server: { findFirst } },
        },
      ],
    }).compile();

    guard = module.get(ServerApiKeyGuard);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
  });

  it('deve lançar UnauthorizedException quando header ausente', async () => {
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('deve lançar UnauthorizedException quando key inválida', async () => {
    (prisma.server.findFirst as jest.Mock).mockResolvedValue(null);
    const ctx = makeContext({ [SERVER_KEY_HEADER]: 'chave-invalida' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('deve injetar req.server e retornar true com key válida', async () => {
    const rawKey = 'adlogs_abc123';
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const server = { ...mockServer, apiKeyHash: hash };
    (prisma.server.findFirst as jest.Mock).mockResolvedValue(server);

    const ctx = makeContext({ [SERVER_KEY_HEADER]: rawKey });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    const req = (ctx as unknown as { _request: Record<string, unknown> })._request;
    expect(req['server']).toEqual(server);
  });
});
