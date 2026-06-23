import { Test } from '@nestjs/testing';
import { CollectorService } from './collector.service';
import { PrismaService } from '../prisma/prisma.service';

const mockServer = { id: 'srv_1', name: 'Servidor A', hostname: 'WIN-A', active: true };

describe('CollectorService', () => {
  let service: CollectorService;
  let prisma: {
    collectorStatus: Record<string, jest.Mock>;
    monitoredFolder: Record<string, jest.Mock>;
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
            collectorStatus: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
            },
            monitoredFolder: { findMany: jest.fn() },
            loginEvent: {
              findMany: jest.fn(),
              createMany: jest.fn(),
            },
            fileEvent: {
              findMany: jest.fn(),
              createMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get(CollectorService);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
  });

  describe('heartbeat', () => {
    it('deve fazer upsert do status por serverId', async () => {
      prisma.collectorStatus.upsert.mockResolvedValue({ id: 'cs_1' });

      await service.heartbeat(mockServer, {
        version: '1.0.0',
        hostname: 'WIN-A',
        eventsToday: 10,
        loginToday: 8,
        fileToday: 2,
        processToday: 0,
      });

      expect(prisma.collectorStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serverId: 'srv_1' },
        }),
      );
    });
  });

  describe('getConfig', () => {
    it('deve retornar pastas globais (serverId null) e do servidor', async () => {
      prisma.monitoredFolder.findMany.mockResolvedValue([
        { path: 'C:\\Docs' },
        { path: 'D:\\Share' },
      ]);

      const result = await service.getConfig('srv_1');
      expect(result.monitoredFolders).toEqual(['C:\\Docs', 'D:\\Share']);
    });
  });

  describe('ingestLoginEvents', () => {
    it('deve inserir eventos de login sem duplicatas', async () => {
      prisma.loginEvent.findMany.mockResolvedValue([]);
      prisma.loginEvent.createMany.mockResolvedValue({ count: 2 });

      const events = [
        {
          windowsEventId: 4624,
          username: 'joao',
          success: true,
          timestamp: '2026-06-23T10:00:00Z',
          windowsRecordId: '1001',
        },
        {
          windowsEventId: 4634,
          username: 'joao',
          success: true,
          timestamp: '2026-06-23T10:30:00Z',
          windowsRecordId: '1002',
        },
      ];

      const result = await service.ingestLoginEvents('srv_1', events);
      expect(result.inserted).toBe(2);
    });
  });
});
