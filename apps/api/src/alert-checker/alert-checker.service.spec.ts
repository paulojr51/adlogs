import { Test } from '@nestjs/testing';
import { AlertCheckerService } from './alert-checker.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AlertsService } from '../alerts/alerts.service';

const makeRule = (overrides = {}) => ({
  id: 'rule_1',
  name: 'Teste',
  enabled: true,
  serverId: null,
  category: 'ACCOUNT',
  eventTypes: ['USER_LOCKED'],
  condition: 'ANY',
  threshold: null,
  windowMinutes: 5,
  emailTo: ['admin@test.com'],
  webhookUrl: null,
  ...overrides,
});

describe('AlertCheckerService', () => {
  let service: AlertCheckerService;
  let prisma: {
    alertRule: Record<string, jest.Mock>;
    alert: Record<string, jest.Mock>;
    loginEvent: Record<string, jest.Mock>;
    fileEvent: Record<string, jest.Mock>;
    accountEvent: Record<string, jest.Mock>;
    sqlEvent: Record<string, jest.Mock>;
  };
  let notification: { sendEmail: jest.Mock; sendWebhook: jest.Mock };
  let alertsService: { create: jest.Mock; markNotified: jest.Mock };

  beforeEach(async () => {
    const prismaMock = {
      alertRule: { findMany: jest.fn() },
      alert: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      loginEvent: { count: jest.fn() },
      fileEvent: { count: jest.fn() },
      accountEvent: { count: jest.fn() },
      sqlEvent: { count: jest.fn() },
      server: { findFirst: jest.fn().mockResolvedValue({ id: 'srv_1' }) },
    };

    const notificationMock = { sendEmail: jest.fn(), sendWebhook: jest.fn() };
    const alertsServiceMock = {
      create: jest.fn().mockResolvedValue({ id: 'alert_new' }),
      markNotified: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AlertCheckerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationService, useValue: notificationMock },
        { provide: AlertsService, useValue: alertsServiceMock },
      ],
    }).compile();

    service = module.get(AlertCheckerService);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
    notification = module.get(NotificationService) as unknown as typeof notification;
    alertsService = module.get(AlertsService) as unknown as typeof alertsService;
  });

  describe('evaluateRule — condição ANY', () => {
    it('deve disparar alerta quando count > 0', async () => {
      const rule = makeRule({ category: 'ACCOUNT', eventTypes: ['USER_LOCKED'], condition: 'ANY' });
      prisma.alert.findFirst.mockResolvedValue(null);
      prisma.accountEvent.count.mockResolvedValue(2);
      alertsService.create.mockResolvedValue({ id: 'alert_new' });

      await service.evaluateRule(rule as never);

      expect(alertsService.create).toHaveBeenCalled();
      expect(notification.sendEmail).toHaveBeenCalledWith(
        ['admin@test.com'],
        expect.stringContaining('Teste'),
        expect.any(String),
      );
    });

    it('deve NÃO disparar alerta quando count = 0', async () => {
      const rule = makeRule({ category: 'ACCOUNT', condition: 'ANY' });
      prisma.alert.findFirst.mockResolvedValue(null);
      prisma.accountEvent.count.mockResolvedValue(0);

      await service.evaluateRule(rule as never);

      expect(alertsService.create).not.toHaveBeenCalled();
    });
  });

  describe('evaluateRule — condição THRESHOLD', () => {
    it('deve disparar quando count >= threshold', async () => {
      const rule = makeRule({
        category: 'LOGIN',
        eventTypes: ['FAILED'],
        condition: 'THRESHOLD',
        threshold: 3,
      });
      prisma.alert.findFirst.mockResolvedValue(null);
      prisma.loginEvent.count.mockResolvedValue(5);
      alertsService.create.mockResolvedValue({ id: 'alert_new' });

      await service.evaluateRule(rule as never);

      expect(alertsService.create).toHaveBeenCalled();
    });

    it('deve NÃO disparar quando count < threshold', async () => {
      const rule = makeRule({
        category: 'LOGIN',
        condition: 'THRESHOLD',
        threshold: 10,
      });
      prisma.alert.findFirst.mockResolvedValue(null);
      prisma.loginEvent.count.mockResolvedValue(3);

      await service.evaluateRule(rule as never);

      expect(alertsService.create).not.toHaveBeenCalled();
    });
  });

  describe('dedup', () => {
    it('deve NÃO disparar quando alerta recente existe', async () => {
      const rule = makeRule();
      prisma.alert.findFirst.mockResolvedValue({ id: 'alert_existing' });

      await service.evaluateRule(rule as never);

      expect(prisma.accountEvent.count).not.toHaveBeenCalled();
      expect(alertsService.create).not.toHaveBeenCalled();
    });
  });

  describe('webhook', () => {
    it('deve chamar sendWebhook quando webhookUrl está definido', async () => {
      const rule = makeRule({
        category: 'ACCOUNT',
        condition: 'ANY',
        webhookUrl: 'https://hooks.example.com',
      });
      prisma.alert.findFirst.mockResolvedValue(null);
      prisma.accountEvent.count.mockResolvedValue(1);
      alertsService.create.mockResolvedValue({ id: 'alert_new' });

      await service.evaluateRule(rule as never);

      expect(notification.sendWebhook).toHaveBeenCalledWith(
        'https://hooks.example.com',
        expect.any(Object),
      );
    });
  });
});
