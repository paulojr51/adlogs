import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ServerConfigService } from './server-config.service';
import { PrismaService } from '../prisma/prisma.service';

const mockConfig = {
  id: 'cfg_1',
  serverId: 'srv_1',
  collectLogins: true,
  collectFiles: true,
  collectProcesses: false,
  collectAccountChanges: false,
  collectSqlServer: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ServerConfigService', () => {
  let service: ServerConfigService;
  let prisma: {
    server: Record<string, jest.Mock>;
    serverConfig: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ServerConfigService,
        {
          provide: PrismaService,
          useValue: {
            server: { findUnique: jest.fn() },
            serverConfig: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get(ServerConfigService);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
  });

  describe('getConfig', () => {
    it('deve retornar a config do servidor', async () => {
      prisma.server.findUnique.mockResolvedValue({ id: 'srv_1' });
      prisma.serverConfig.findUnique.mockResolvedValue(mockConfig);

      const result = await service.getConfig('srv_1');
      expect(result).toEqual(mockConfig);
    });

    it('deve retornar defaults quando config não existe', async () => {
      prisma.server.findUnique.mockResolvedValue({ id: 'srv_1' });
      prisma.serverConfig.findUnique.mockResolvedValue(null);

      const result = await service.getConfig('srv_1');
      expect(result.collectLogins).toBe(true);
      expect(result.collectFiles).toBe(true);
      expect(result.collectProcesses).toBe(false);
      expect(result.collectAccountChanges).toBe(false);
      expect(result.collectSqlServer).toBe(false);
    });

    it('deve lançar NotFoundException se servidor não existe', async () => {
      prisma.server.findUnique.mockResolvedValue(null);

      await expect(service.getConfig('nao-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateConfig', () => {
    it('deve atualizar flags de coleta', async () => {
      prisma.server.findUnique.mockResolvedValue({ id: 'srv_1' });
      const updated = { ...mockConfig, collectProcesses: true };
      prisma.serverConfig.upsert.mockResolvedValue(updated);

      const result = await service.updateConfig('srv_1', { collectProcesses: true });
      expect(result.collectProcesses).toBe(true);
    });

    it('deve lançar NotFoundException se servidor não existe', async () => {
      prisma.server.findUnique.mockResolvedValue(null);

      await expect(
        service.updateConfig('nao-existe', { collectLogins: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
