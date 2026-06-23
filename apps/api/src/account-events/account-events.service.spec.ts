import { Test } from '@nestjs/testing';
import { AccountEventsService } from './account-events.service';
import { PrismaService } from '../prisma/prisma.service';

const mockEvent = {
  id: 'ae_1',
  serverId: 'srv_1',
  windowsEventId: 4720,
  eventType: 'USER_CREATED' as const,
  targetUsername: 'novo.usuario',
  targetDomain: 'EMPRESA',
  actorUsername: 'admin',
  actorDomain: 'EMPRESA',
  groupName: null,
  detail: null,
  timestamp: new Date('2026-06-23T10:00:00Z'),
  windowsRecordId: '55001',
  createdAt: new Date(),
};

describe('AccountEventsService', () => {
  let service: AccountEventsService;
  let prisma: { accountEvent: Record<string, jest.Mock> };

  beforeEach(async () => {
    const mock = {
      findMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AccountEventsService,
        { provide: PrismaService, useValue: { accountEvent: mock } },
      ],
    }).compile();

    service = module.get(AccountEventsService);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
  });

  describe('findAll', () => {
    it('deve retornar eventos paginados', async () => {
      prisma.accountEvent.findMany.mockResolvedValue([mockEvent]);
      prisma.accountEvent.count.mockResolvedValue(1);

      const result = await service.findAll({});
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('deve filtrar por targetUsername', async () => {
      prisma.accountEvent.findMany.mockResolvedValue([]);
      prisma.accountEvent.count.mockResolvedValue(0);

      await service.findAll({ targetUsername: 'novo' });

      expect(prisma.accountEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            targetUsername: expect.objectContaining({ contains: 'novo' }),
          }),
        }),
      );
    });

    it('deve filtrar por eventType', async () => {
      prisma.accountEvent.findMany.mockResolvedValue([]);
      prisma.accountEvent.count.mockResolvedValue(0);

      await service.findAll({ eventType: 'USER_LOCKED' });

      expect(prisma.accountEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ eventType: 'USER_LOCKED' }),
        }),
      );
    });

    it('deve filtrar por serverId', async () => {
      prisma.accountEvent.findMany.mockResolvedValue([]);
      prisma.accountEvent.count.mockResolvedValue(0);

      await service.findAll({ serverId: 'srv_1' });

      expect(prisma.accountEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ serverId: 'srv_1' }),
        }),
      );
    });
  });

  describe('ingestBatch', () => {
    it('deve inserir eventos novos e pular duplicatas', async () => {
      prisma.accountEvent.findMany.mockResolvedValue([]);
      prisma.accountEvent.createMany.mockResolvedValue({ count: 2 });

      const events = [
        { ...mockEvent, windowsRecordId: '1001' },
        { ...mockEvent, windowsRecordId: '1002' },
      ];

      const result = await service.ingestBatch('srv_1', events);
      expect(result.inserted).toBe(2);
    });

    it('deve pular eventos com windowsRecordId já existente', async () => {
      prisma.accountEvent.findMany.mockResolvedValue([
        { windowsRecordId: '1001' },
      ]);
      prisma.accountEvent.createMany.mockResolvedValue({ count: 1 });

      const events = [
        { ...mockEvent, windowsRecordId: '1001' },
        { ...mockEvent, windowsRecordId: '1002' },
      ];

      const result = await service.ingestBatch('srv_1', events);
      expect(result.inserted).toBe(1);
    });

    it('deve retornar 0 quando lista vazia', async () => {
      const result = await service.ingestBatch('srv_1', []);
      expect(result.inserted).toBe(0);
    });
  });
});
