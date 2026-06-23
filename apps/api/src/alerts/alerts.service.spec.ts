import { Test } from '@nestjs/testing';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../prisma/prisma.service';

const mockAlert = {
  id: 'alert_1',
  ruleId: 'rule_1',
  serverId: 'srv_1',
  triggeredAt: new Date(),
  detail: '3 evento(s) detectado(s)',
  eventCount: 3,
  notified: false,
};

describe('AlertsService', () => {
  let service: AlertsService;
  let prisma: { alert: Record<string, jest.Mock> };

  beforeEach(async () => {
    const alertMock = {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: PrismaService, useValue: { alert: alertMock } },
      ],
    }).compile();

    service = module.get(AlertsService);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
  });

  describe('findAll', () => {
    it('deve retornar alertas paginados', async () => {
      prisma.alert.findMany.mockResolvedValue([mockAlert]);
      prisma.alert.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('deve filtrar por ruleId', async () => {
      prisma.alert.findMany.mockResolvedValue([]);
      prisma.alert.count.mockResolvedValue(0);
      await service.findAll({ ruleId: 'rule_1' });
      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ ruleId: 'rule_1' }) }),
      );
    });

    it('deve filtrar por serverId', async () => {
      prisma.alert.findMany.mockResolvedValue([]);
      prisma.alert.count.mockResolvedValue(0);
      await service.findAll({ serverId: 'srv_1' });
      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ serverId: 'srv_1' }) }),
      );
    });

    it('deve filtrar por intervalo de datas', async () => {
      prisma.alert.findMany.mockResolvedValue([]);
      prisma.alert.count.mockResolvedValue(0);
      await service.findAll({ from: '2026-01-01T00:00:00Z', to: '2026-12-31T23:59:59Z' });
      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ triggeredAt: expect.any(Object) }) }),
      );
    });
  });

  describe('create', () => {
    it('deve criar alerta', async () => {
      prisma.alert.create.mockResolvedValue(mockAlert);
      const result = await service.create({ ruleId: 'rule_1', serverId: 'srv_1', eventCount: 3, detail: 'teste' });
      expect(result.id).toBe('alert_1');
    });
  });

  describe('markNotified', () => {
    it('deve marcar alerta como notificado', async () => {
      prisma.alert.update.mockResolvedValue({ ...mockAlert, notified: true });
      await service.markNotified('alert_1');
      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert_1' },
        data: { notified: true },
      });
    });
  });
});
