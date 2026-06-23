import { Test } from '@nestjs/testing';
import { CollectorService } from './collector.service';
import { PrismaService } from '../prisma/prisma.service';

const mockServer = { id: 'srv_1', name: 'Servidor A', hostname: 'WIN-A', active: true };

describe('CollectorService', () => {
  let service: CollectorService;
  let prisma: {
    collectorStatus: Record<string, jest.Mock>;
    monitoredFolder: Record<string, jest.Mock>;
    serverConfig: Record<string, jest.Mock>;
    loginEvent: Record<string, jest.Mock>;
    fileEvent: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CollectorService,
        {
          provide: PrismaService,
          useValue: {
            collectorStatus: { upsert: jest.fn(), findMany: jest.fn() },
            monitoredFolder: { findMany: jest.fn() },
            serverConfig: { findUnique: jest.fn() },
            loginEvent: { findMany: jest.fn(), createMany: jest.fn() },
            fileEvent: { findMany: jest.fn(), createMany: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get(CollectorService);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
  });

  describe('heartbeat', () => {
    it('deve fazer upsert do status por serverId com novos contadores', async () => {
      prisma.collectorStatus.upsert.mockResolvedValue({ id: 'cs_1' });

      await service.heartbeat(mockServer, {
        version: '2.0.0',
        hostname: 'WIN-A',
        eventsToday: 15,
        loginToday: 8,
        fileToday: 2,
        processToday: 3,
        accountToday: 1,
        sqlToday: 1,
      });

      expect(prisma.collectorStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serverId: 'srv_1' },
          update: expect.objectContaining({ accountToday: 1, sqlToday: 1 }),
        }),
      );
    });
  });

  describe('getConfig', () => {
    it('deve retornar pastas e flags de coleta do servidor', async () => {
      prisma.monitoredFolder.findMany.mockResolvedValue([
        { path: 'C:\\Docs' },
        { path: 'D:\\Share' },
      ]);
      prisma.serverConfig.findUnique.mockResolvedValue({
        collectLogins: true,
        collectFiles: true,
        collectProcesses: true,
        collectAccountChanges: false,
        collectSqlServer: false,
      });

      const result = await service.getConfig('srv_1');
      expect(result.monitoredFolders).toEqual(['C:\\Docs', 'D:\\Share']);
      expect(result.collectLogins).toBe(true);
      expect(result.collectProcesses).toBe(true);
      expect(result.collectAccountChanges).toBe(false);
    });

    it('deve usar defaults quando config não existe', async () => {
      prisma.monitoredFolder.findMany.mockResolvedValue([]);
      prisma.serverConfig.findUnique.mockResolvedValue(null);

      const result = await service.getConfig('srv_1');
      expect(result.collectLogins).toBe(true);
      expect(result.collectFiles).toBe(true);
      expect(result.collectProcesses).toBe(false);
      expect(result.collectSqlServer).toBe(false);
    });
  });

  describe('ingestLoginEvents', () => {
    it('deve inserir eventos de login sem duplicatas', async () => {
      prisma.loginEvent.findMany.mockResolvedValue([]);
      prisma.loginEvent.createMany.mockResolvedValue({ count: 2 });

      const events = [
        { windowsEventId: 4624, username: 'joao', success: true, timestamp: '2026-06-23T10:00:00Z', windowsRecordId: '1001' },
        { windowsEventId: 4634, username: 'joao', success: true, timestamp: '2026-06-23T10:30:00Z', windowsRecordId: '1002' },
      ];

      const result = await service.ingestLoginEvents('srv_1', events);
      expect(result.inserted).toBe(2);
    });
  });
});
