import { Test } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

const today = new Date();
today.setUTCHours(0, 0, 0, 0);

const mockCollectorStatuses = [
  {
    id: 'cs_1',
    serverId: 'srv_1',
    isRunning: true,
    lastSeenAt: new Date(),
    version: '1.0.0',
    hostname: 'WIN-SRV-01',
    eventsToday: 50,
    loginToday: 20,
    fileToday: 15,
    processToday: 5,
    accountToday: 2,
    sqlToday: 8,
    updatedAt: new Date(),
    server: { id: 'srv_1', name: 'Servidor Principal', hostname: 'WIN-SRV-01' },
  },
];

const mockAlert = {
  id: 'alert_1',
  ruleId: 'rule_1',
  serverId: 'srv_1',
  triggeredAt: new Date(),
  detail: '2 evento(s) detectado(s)',
  eventCount: 2,
  notified: true,
  rule: { id: 'rule_1', name: 'Bloqueios de conta', category: 'ACCOUNT' },
  server: { id: 'srv_1', name: 'Servidor Principal' },
};

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const prismaMock = {
      loginEvent: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      fileEvent: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      processEvent: {
        count: jest.fn().mockResolvedValue(0),
      },
      accountEvent: {
        count: jest.fn().mockResolvedValue(0),
      },
      sqlEvent: {
        count: jest.fn().mockResolvedValue(0),
      },
      collectorStatus: {
        findMany: jest.fn().mockResolvedValue(mockCollectorStatuses),
      },
      alert: {
        findMany: jest.fn().mockResolvedValue([mockAlert]),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(DashboardService);
    prisma = module.get(PrismaService);
  });

  describe('getSummary', () => {
    it('deve retornar contagens de hoje para todos os tipos de evento', async () => {
      (prisma.loginEvent.count as jest.Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3);
      (prisma.fileEvent.count as jest.Mock).mockResolvedValueOnce(7);
      (prisma.processEvent.count as jest.Mock).mockResolvedValueOnce(4);
      (prisma.accountEvent.count as jest.Mock).mockResolvedValueOnce(1);
      (prisma.sqlEvent.count as jest.Mock).mockResolvedValueOnce(2);

      const result = await service.getSummary();

      expect(result.today.logins).toBe(10);
      expect(result.today.failedLogins).toBe(3);
      expect(result.today.fileEvents).toBe(7);
      expect(result.today.processEvents).toBe(4);
      expect(result.today.accountEvents).toBe(1);
      expect(result.today.sqlEvents).toBe(2);
    });

    it('deve retornar status de múltiplos coletores', async () => {
      const result = await service.getSummary();

      expect(prisma.collectorStatus.findMany).toHaveBeenCalled();
      expect(result.collectors).toHaveLength(1);
      expect(result.collectors[0].server.name).toBe('Servidor Principal');
    });

    it('deve sinalizar coleta parada quando o coletor esta vivo mas nao entrega eventos', async () => {
      // Mesmo criterio do endpoint de status: heartbeat recente nao significa
      // que a ingestao esta funcionando.
      (prisma.collectorStatus.findMany as jest.Mock).mockResolvedValueOnce([
        {
          ...mockCollectorStatuses[0],
          lastSeenAt: new Date(),
          lastEventAt: new Date('2026-07-21T08:00:00Z'),
        },
      ]);

      const result = await service.getSummary();

      expect(result.collectors[0].isRunning).toBe(true);
      expect(result.collectors[0].isCollecting).toBe(false);
    });

    it('deve reportar coleta desconhecida quando o coletor nao informa lastEventAt', async () => {
      const result = await service.getSummary();

      expect(result.collectors[0].isRunning).toBe(true);
      expect(result.collectors[0].isCollecting).toBeNull();
    });

    it('deve retornar alertas recentes', async () => {
      const result = await service.getSummary();

      expect(prisma.alert.findMany).toHaveBeenCalled();
      expect(result.recentAlerts).toHaveLength(1);
      expect(result.recentAlerts[0].rule.name).toBe('Bloqueios de conta');
    });

    it('deve incluir eventos recentes de login e arquivo', async () => {
      const loginEvent = { id: 'le_1', username: 'paulo', domain: 'AD', sourceIp: '10.0.0.1', success: true, logonTypeName: 'Interactive', timestamp: new Date() };
      const fileEvent = { id: 'fe_1', username: 'paulo', filePath: 'C:\\dados\\test.txt', action: 'READ', timestamp: new Date() };
      (prisma.loginEvent.findMany as jest.Mock).mockResolvedValueOnce([loginEvent]);
      (prisma.fileEvent.findMany as jest.Mock).mockResolvedValueOnce([fileEvent]);

      const result = await service.getSummary();

      expect(result.recentLoginEvents).toHaveLength(1);
      expect(result.recentFileEvents).toHaveLength(1);
    });
  });

  describe('getLoginChart', () => {
    it('deve agrupar logins por dia', async () => {
      const d1 = new Date('2026-06-20T10:00:00Z');
      const d2 = new Date('2026-06-20T12:00:00Z');
      const d3 = new Date('2026-06-21T09:00:00Z');
      (prisma.loginEvent.findMany as jest.Mock).mockResolvedValueOnce([
        { timestamp: d1, success: true },
        { timestamp: d2, success: false },
        { timestamp: d3, success: true },
      ]);

      const result = await service.getLoginChart(7);

      expect(result).toHaveLength(2);
      const day1 = result.find((r) => r.date === '2026-06-20');
      expect(day1).toEqual({ date: '2026-06-20', success: 1, failed: 1 });
      const day2 = result.find((r) => r.date === '2026-06-21');
      expect(day2).toEqual({ date: '2026-06-21', success: 1, failed: 0 });
    });
  });

  describe('getTopUsers', () => {
    it('deve retornar usuários com mais logins hoje', async () => {
      (prisma.loginEvent as unknown as Record<string, jest.Mock>)['groupBy'] = jest.fn().mockResolvedValueOnce([
        { username: 'admin', _count: { username: 15 } },
        { username: 'paulo', _count: { username: 8 } },
      ]);

      const result = await service.getTopUsers(10);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ username: 'admin', count: 15 });
    });
  });
});
