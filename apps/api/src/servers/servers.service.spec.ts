import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ServersService } from './servers.service';
import { PrismaService } from '../prisma/prisma.service';

const mockServer = {
  id: 'srv_1',
  name: 'Servidor A',
  hostname: 'WIN-SRV-A',
  ipAddress: '192.168.1.10',
  description: null,
  apiKeyHash: 'hash123',
  active: true,
  lastSeenAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ServersService', () => {
  let service: ServersService;
  let prisma: { server: Record<string, jest.Mock> };

  beforeEach(async () => {
    const serverMock = {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ServersService,
        { provide: PrismaService, useValue: { server: serverMock } },
      ],
    }).compile();

    service = module.get(ServersService);
    prisma = module.get(PrismaService) as unknown as typeof prisma;
  });

  describe('findAll', () => {
    it('deve retornar lista de servidores sem apiKeyHash', async () => {
      prisma.server.findMany.mockResolvedValue([mockServer]);
      const result = await service.findAll();
      expect(prisma.server.findMany).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('findOne', () => {
    it('deve retornar servidor existente', async () => {
      prisma.server.findUnique.mockResolvedValue(mockServer);
      const result = await service.findOne('srv_1');
      expect(result.id).toBe('srv_1');
    });

    it('deve lançar NotFoundException para id inexistente', async () => {
      prisma.server.findUnique.mockResolvedValue(null);
      await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar servidor e retornar apiKey plaintext uma vez', async () => {
      prisma.server.findFirst.mockResolvedValue(null);
      prisma.server.create.mockResolvedValue({ ...mockServer, id: 'srv_new' });

      const result = await service.create({ name: 'Servidor A', hostname: 'WIN-A' });

      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toMatch(/^adlogs_/);
      expect(result.server.id).toBe('srv_new');
      expect(prisma.server.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Servidor A' }),
        }),
      );
    });

    it('deve lançar ConflictException quando nome já existe', async () => {
      prisma.server.findFirst.mockResolvedValue(mockServer);
      await expect(service.create({ name: 'Servidor A' })).rejects.toThrow(ConflictException);
    });
  });

  describe('rotateKey', () => {
    it('deve gerar nova apiKey e retornar plaintext', async () => {
      prisma.server.findUnique.mockResolvedValue(mockServer);
      prisma.server.update.mockResolvedValue({ ...mockServer });

      const result = await service.rotateKey('srv_1');

      expect(result.apiKey).toMatch(/^adlogs_/);
      expect(prisma.server.update).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('deve atualizar campos permitidos', async () => {
      prisma.server.findUnique.mockResolvedValue(mockServer);
      prisma.server.update.mockResolvedValue({ ...mockServer, name: 'Novo Nome' });

      const result = await service.update('srv_1', { name: 'Novo Nome' });
      expect(result.name).toBe('Novo Nome');
    });
  });

  describe('remove', () => {
    it('deve desativar servidor (soft delete)', async () => {
      prisma.server.findUnique.mockResolvedValue(mockServer);
      prisma.server.update.mockResolvedValue({ ...mockServer, active: false });

      await service.remove('srv_1');
      expect(prisma.server.update).toHaveBeenCalledWith({
        where: { id: 'srv_1' },
        data: { active: false },
      });
    });
  });
});
