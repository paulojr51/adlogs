import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AlertRulesService } from './alert-rules.service';
import { PrismaService } from '../prisma/prisma.service';

const mockRule = {
  id: 'rule_1',
  name: 'Login falhado',
  description: null,
  enabled: true,
  serverId: null,
  category: 'ACCOUNT' as const,
  eventTypes: ['USER_LOCKED'],
  condition: 'ANY' as const,
  threshold: null,
  windowMinutes: 5,
  emailTo: ['admin@test.com'],
  webhookUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AlertRulesService', () => {
  let service: AlertRulesService;
  let prisma: { alertRule: Record<string, jest.Mock> };

  beforeEach(async () => {
    const alertRuleMock = {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AlertRulesService,
        { provide: PrismaService, useValue: { alertRule: alertRuleMock } },
      ],
    }).compile();

    service = module.get(AlertRulesService);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
  });

  describe('findAll', () => {
    it('deve retornar lista de regras com contagem de alertas', async () => {
      prisma.alertRule.findMany.mockResolvedValue([{ ...mockRule, _count: { alerts: 3 } }]);
      const result = await service.findAll();
      expect(Array.isArray(result)).toBe(true);
      expect(prisma.alertRule.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('deve retornar regra existente', async () => {
      prisma.alertRule.findUnique.mockResolvedValue(mockRule);
      const result = await service.findOne('rule_1');
      expect(result.id).toBe('rule_1');
    });

    it('deve lançar NotFoundException para id inexistente', async () => {
      prisma.alertRule.findUnique.mockResolvedValue(null);
      await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar regra ANY sem threshold', async () => {
      prisma.alertRule.create.mockResolvedValue(mockRule);
      const result = await service.create({
        name: 'Conta bloqueada',
        category: 'ACCOUNT',
        condition: 'ANY',
        eventTypes: ['USER_LOCKED'],
        windowMinutes: 5,
        emailTo: ['admin@test.com'],
      });
      expect(result.id).toBe('rule_1');
    });

    it('deve lançar BadRequestException quando condition=THRESHOLD sem threshold', async () => {
      await expect(
        service.create({
          name: 'Muitos logins',
          category: 'LOGIN',
          condition: 'THRESHOLD',
          eventTypes: ['FAILED'],
          windowMinutes: 5,
          emailTo: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve criar regra THRESHOLD com threshold válido', async () => {
      prisma.alertRule.create.mockResolvedValue({ ...mockRule, condition: 'THRESHOLD', threshold: 5 });
      const result = await service.create({
        name: 'Muitos logins',
        category: 'LOGIN',
        condition: 'THRESHOLD',
        threshold: 5,
        eventTypes: ['FAILED'],
        windowMinutes: 10,
        emailTo: [],
      });
      expect(result.condition).toBe('THRESHOLD');
    });
  });

  describe('update', () => {
    it('deve atualizar campos da regra', async () => {
      prisma.alertRule.findUnique.mockResolvedValue(mockRule);
      prisma.alertRule.update.mockResolvedValue({ ...mockRule, enabled: false });
      const result = await service.update('rule_1', { enabled: false });
      expect(result.enabled).toBe(false);
    });

    it('deve lançar NotFoundException para id inexistente', async () => {
      prisma.alertRule.findUnique.mockResolvedValue(null);
      await expect(service.update('inexistente', { enabled: false })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deve deletar regra existente', async () => {
      prisma.alertRule.findUnique.mockResolvedValue(mockRule);
      prisma.alertRule.delete.mockResolvedValue(mockRule);
      await service.remove('rule_1');
      expect(prisma.alertRule.delete).toHaveBeenCalledWith({ where: { id: 'rule_1' } });
    });

    it('deve lançar NotFoundException para id inexistente', async () => {
      prisma.alertRule.findUnique.mockResolvedValue(null);
      await expect(service.remove('inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
