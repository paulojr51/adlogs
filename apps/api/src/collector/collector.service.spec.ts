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
    const baseHeartbeat = {
      version: '2.0.0',
      hostname: 'WIN-A',
      eventsToday: 15,
      loginToday: 8,
      fileToday: 2,
      processToday: 3,
      accountToday: 1,
      sqlToday: 1,
    };

    it('deve fazer upsert do status por serverId com novos contadores', async () => {
      prisma.collectorStatus.upsert.mockResolvedValue({ id: 'cs_1' });

      await service.heartbeat(mockServer, baseHeartbeat);

      expect(prisma.collectorStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serverId: 'srv_1' },
          update: expect.objectContaining({ accountToday: 1, sqlToday: 1 }),
        }),
      );
    });

    it('deve gravar o ultimo evento entregue informado pelo coletor', async () => {
      prisma.collectorStatus.upsert.mockResolvedValue({ id: 'cs_1' });

      await service.heartbeat(mockServer, {
        ...baseHeartbeat,
        lastEventAt: '2026-08-13T10:00:00Z',
      });

      expect(prisma.collectorStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            lastEventAt: new Date('2026-08-13T10:00:00Z'),
          }),
        }),
      );
    });

    it('deve manter lastEventAt intacto quando o coletor nao informa', async () => {
      // Coletor antigo (pre-correcao) nao envia o campo. Sobrescrever com null
      // apagaria a ultima referencia conhecida de coleta.
      prisma.collectorStatus.upsert.mockResolvedValue({ id: 'cs_1' });

      await service.heartbeat(mockServer, baseHeartbeat);

      const chamada = prisma.collectorStatus.upsert.mock.calls[0][0];
      expect(chamada.update).not.toHaveProperty('lastEventAt');
    });
  });

  describe('getStatus', () => {
    const agora = new Date('2026-08-13T12:00:00Z');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(agora);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('deve marcar como coletando quando ha evento recente', async () => {
      prisma.collectorStatus.findMany.mockResolvedValue([
        {
          serverId: 'srv_1',
          lastSeenAt: new Date('2026-08-13T11:59:00Z'),
          lastEventAt: new Date('2026-08-13T11:30:00Z'),
        },
      ]);

      const [status] = await service.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.isCollecting).toBe(true);
    });

    it('deve marcar coleta parada quando o heartbeat esta vivo mas nao chegam eventos', async () => {
      // O caso que ficou 23 dias invisivel: processo vivo, ingestao parada.
      prisma.collectorStatus.findMany.mockResolvedValue([
        {
          serverId: 'srv_1',
          lastSeenAt: new Date('2026-08-13T11:59:00Z'),
          lastEventAt: new Date('2026-07-21T08:00:00Z'),
        },
      ]);

      const [status] = await service.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.isCollecting).toBe(false);
    });

    it('deve reportar coleta desconhecida quando o coletor nao informa lastEventAt', async () => {
      prisma.collectorStatus.findMany.mockResolvedValue([
        {
          serverId: 'srv_1',
          lastSeenAt: new Date('2026-08-13T11:59:00Z'),
          lastEventAt: null,
        },
      ]);

      const [status] = await service.getStatus();

      expect(status.isCollecting).toBeNull();
    });

    it('nao deve acusar coleta parada quando o proprio coletor esta offline', async () => {
      // Sem heartbeat o problema e' outro — nao poluir com dois alarmes.
      prisma.collectorStatus.findMany.mockResolvedValue([
        {
          serverId: 'srv_1',
          lastSeenAt: new Date('2026-08-10T10:00:00Z'),
          lastEventAt: new Date('2026-07-21T08:00:00Z'),
        },
      ]);

      const [status] = await service.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.isCollecting).toBeNull();
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

    it('deve descartar evento com mesmo windowsRecordId e mesmo timestamp', async () => {
      prisma.loginEvent.findMany.mockResolvedValue([
        { windowsRecordId: '1001', timestamp: new Date('2026-06-23T10:00:00Z') },
      ]);
      prisma.loginEvent.createMany.mockResolvedValue({ count: 0 });

      const events = [
        { windowsEventId: 4624, username: 'joao', success: true, timestamp: '2026-06-23T10:00:00Z', windowsRecordId: '1001' },
      ];

      const result = await service.ingestLoginEvents('srv_1', events);
      expect(result.inserted).toBe(0);
      expect(prisma.loginEvent.createMany).not.toHaveBeenCalled();
    });

    it('deve inserir evento com mesmo windowsRecordId mas timestamp diferente (reset do Security log)', async () => {
      // Após arquivamento por tamanho, o RecordNumber do Windows reinicia em 1.
      // O evento novo colide com um antigo, mas é um evento distinto.
      prisma.loginEvent.findMany.mockResolvedValue([
        { windowsRecordId: '1001', timestamp: new Date('2026-06-23T10:00:00Z') },
      ]);
      prisma.loginEvent.createMany.mockResolvedValue({ count: 1 });

      const events = [
        { windowsEventId: 4624, username: 'maria', success: true, timestamp: '2026-08-13T09:00:00Z', windowsRecordId: '1001' },
      ];

      const result = await service.ingestLoginEvents('srv_1', events);
      expect(result.inserted).toBe(1);
      expect(prisma.loginEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ username: 'maria', windowsRecordId: '1001' })],
        }),
      );
    });
  });

  describe('ingestFileEvents', () => {
    it('deve descartar evento com mesmo windowsRecordId e mesmo timestamp', async () => {
      prisma.fileEvent.findMany.mockResolvedValue([
        { windowsRecordId: '2001', timestamp: new Date('2026-06-23T10:00:00Z') },
      ]);
      prisma.fileEvent.createMany.mockResolvedValue({ count: 0 });

      const events = [
        { windowsEventId: 4663, username: 'joao', filePath: 'C:\\Docs\\a.txt', action: 'READ', timestamp: '2026-06-23T10:00:00Z', windowsRecordId: '2001' },
      ];

      const result = await service.ingestFileEvents('srv_1', events);
      expect(result.inserted).toBe(0);
      expect(prisma.fileEvent.createMany).not.toHaveBeenCalled();
    });

    it('deve inserir evento com mesmo windowsRecordId mas timestamp diferente (reset do Security log)', async () => {
      prisma.fileEvent.findMany.mockResolvedValue([
        { windowsRecordId: '2001', timestamp: new Date('2026-06-23T10:00:00Z') },
      ]);
      prisma.fileEvent.createMany.mockResolvedValue({ count: 1 });

      const events = [
        { windowsEventId: 4663, username: 'maria', filePath: 'C:\\Docs\\b.txt', action: 'WRITE', timestamp: '2026-08-13T09:00:00Z', windowsRecordId: '2001' },
      ];

      const result = await service.ingestFileEvents('srv_1', events);
      expect(result.inserted).toBe(1);
    });
  });
});
