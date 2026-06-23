import { Test } from '@nestjs/testing';
import { ProcessEventsService } from './process-events.service';
import { PrismaService } from '../prisma/prisma.service';

const mockEvent = {
  id: 'pe_1',
  serverId: 'srv_1',
  windowsEventId: 4688,
  username: 'joao',
  domain: 'EMPRESA',
  processName: 'powershell.exe',
  processPath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  commandLine: 'powershell.exe -Command Get-Date',
  parentProcessName: 'explorer.exe',
  parentProcessId: 1234,
  processId: 5678,
  timestamp: new Date('2026-06-23T10:00:00Z'),
  windowsRecordId: '99001',
  createdAt: new Date(),
};

describe('ProcessEventsService', () => {
  let service: ProcessEventsService;
  let prisma: { processEvent: Record<string, jest.Mock> };

  beforeEach(async () => {
    const processEventMock = {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
      findFirst: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ProcessEventsService,
        { provide: PrismaService, useValue: { processEvent: processEventMock } },
      ],
    }).compile();

    service = module.get(ProcessEventsService);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
  });

  describe('findAll', () => {
    it('deve retornar eventos paginados', async () => {
      prisma.processEvent.findMany.mockResolvedValue([mockEvent]);
      prisma.processEvent.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('deve filtrar por username', async () => {
      prisma.processEvent.findMany.mockResolvedValue([]);
      prisma.processEvent.count.mockResolvedValue(0);

      await service.findAll({ username: 'joao' });

      expect(prisma.processEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            username: expect.objectContaining({ contains: 'joao' }),
          }),
        }),
      );
    });

    it('deve filtrar por serverId', async () => {
      prisma.processEvent.findMany.mockResolvedValue([]);
      prisma.processEvent.count.mockResolvedValue(0);

      await service.findAll({ serverId: 'srv_1' });

      expect(prisma.processEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ serverId: 'srv_1' }),
        }),
      );
    });

    it('deve filtrar por processName', async () => {
      prisma.processEvent.findMany.mockResolvedValue([]);
      prisma.processEvent.count.mockResolvedValue(0);

      await service.findAll({ processName: 'powershell' });

      expect(prisma.processEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            processName: expect.objectContaining({ contains: 'powershell' }),
          }),
        }),
      );
    });
  });

  describe('ingestBatch', () => {
    it('deve inserir eventos novos e pular duplicatas', async () => {
      prisma.processEvent.findMany.mockResolvedValue([]);
      prisma.processEvent.createMany.mockResolvedValue({ count: 2 });

      const events = [
        { ...mockEvent, windowsRecordId: '1001' },
        { ...mockEvent, windowsRecordId: '1002' },
      ];

      const result = await service.ingestBatch('srv_1', events);
      expect(result.inserted).toBe(2);
    });

    it('deve retornar 0 quando lista vazia', async () => {
      const result = await service.ingestBatch('srv_1', []);
      expect(result.inserted).toBe(0);
    });
  });
});
