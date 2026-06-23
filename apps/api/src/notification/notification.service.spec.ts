import { Test } from '@nestjs/testing';
import { NotificationService } from './notification.service';

const mockTransporter = {
  sendMail: jest.fn(),
};

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => mockTransporter),
}));

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env['SMTP_HOST'] = 'smtp.test.com';
    const module = await Test.createTestingModule({
      providers: [NotificationService],
    }).compile();
    service = module.get(NotificationService);
  });

  afterEach(() => {
    delete process.env['SMTP_HOST'];
  });

  describe('sendEmail', () => {
    it('deve enviar e-mail quando destinatários são fornecidos', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'abc' });
      await service.sendEmail(['user@test.com'], 'Assunto', 'Corpo');
      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'user@test.com', subject: 'Assunto' }),
      );
    });

    it('deve ser silencioso quando lista de e-mails está vazia', async () => {
      await service.sendEmail([], 'Assunto', 'Corpo');
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('deve ser silencioso quando SMTP_HOST não está configurado', async () => {
      const original = process.env['SMTP_HOST'];
      delete process.env['SMTP_HOST'];
      await service.sendEmail(['user@test.com'], 'Assunto', 'Corpo');
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
      process.env['SMTP_HOST'] = original;
    });

    it('deve não lançar exceção quando sendMail falha', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));
      await expect(service.sendEmail(['user@test.com'], 'Assunto', 'Corpo')).resolves.not.toThrow();
    });
  });

  describe('sendWebhook', () => {
    it('deve fazer POST para a URL fornecida', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      await service.sendWebhook('https://hooks.example.com/test', { event: 'ALERT' });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.example.com/test',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('deve não lançar exceção quando fetch falha', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      await expect(
        service.sendWebhook('https://hooks.example.com/test', { event: 'ALERT' }),
      ).resolves.not.toThrow();
    });
  });
});
