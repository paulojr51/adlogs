import { Test } from '@nestjs/testing';
import { SqlEventsService } from './sql-events.service';
import { PrismaService } from '../prisma/prisma.service';

const mockEvent = {
  id: 'se_1',
  serverId: 'srv_1',
  windowsEventId: 18456,
  eventType: 'LOGIN_FAILED' as const,
  username: 'sa',
  clientIp: '192.168.1.50',
  database: null,
  detail: "Login failed for user 'sa'. Reason: Password did not match",
  success: false,
  timestamp: new Date('2026-06-23T11:00:00Z'),
  windowsRecordId: '77001',
  createdAt: new Date(),
};

describe('SqlEventsService', () => {
  let service: SqlEventsService;
  let prisma: { sqlEvent: Record<string, jest.Mock> };

  beforeEach(async () => {
    const mock = {
      findMany: jest.fn(),
      count: jest.fn(),
      createMany: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        SqlEventsService,
        { provide: PrismaService, useValue: { sqlEvent: mock } },
      ],
    }).compile();

    service = module.get(SqlEventsService);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
  });

  describe('findAll', () => {
    it('deve retornar eventos paginados', async () => {
      prisma.sqlEvent.findMany.mockResolvedValue([mockEvent]);
      prisma.sqlEvent.count.mockResolvedValue(1);

      const result = await service.findAll({});
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('deve filtrar por username', async () => {
      prisma.sqlEvent.findMany.mockResolvedValue([]);
      prisma.sqlEvent.count.mockResolvedValue(0);

      await service.findAll({ username: 'sa' });

      expect(prisma.sqlEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            username: expect.objectContaining({ contains: 'sa' }),
          }),
        }),
      );
    });

    it('deve filtrar por eventType', async () => {
      prisma.sqlEvent.findMany.mockResolvedValue([]);
      prisma.sqlEvent.count.mockResolvedValue(0);

      await service.findAll({ eventType: 'LOGIN_FAILED' });

      expect(prisma.sqlEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ eventType: 'LOGIN_FAILED' }),
        }),
      );
    });

    it('deve filtrar por serverId', async () => {
      prisma.sqlEvent.findMany.mockResolvedValue([]);
      prisma.sqlEvent.count.mockResolvedValue(0);

      await service.findAll({ serverId: 'srv_1' });

      expect(prisma.sqlEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ serverId: 'srv_1' }),
        }),
      );
    });
  });

  describe('ingestBatch', () => {
    it('deve inserir eventos novos', async () => {
      prisma.sqlEvent.findMany.mockResolvedValue([]);
      prisma.sqlEvent.createMany.mockResolvedValue({ count: 2 });

      const events = [
        { ...mockEvent, windowsRecordId: '2001' },
        { ...mockEvent, windowsRecordId: '2002' },
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
