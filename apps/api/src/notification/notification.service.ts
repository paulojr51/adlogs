import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async sendEmail(to: string[], subject: string, body: string): Promise<void> {
    if (to.length === 0) return;
    const host = process.env['SMTP_HOST'];
    if (!host) return;

    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env['SMTP_PORT'] ?? 587),
      auth: {
        user: process.env['SMTP_USER'],
        pass: process.env['SMTP_PASS'],
      },
    });

    try {
      await transporter.sendMail({
        from: process.env['SMTP_FROM'] ?? 'ADLogs <noreply@adlogs.com>',
        to: to.join(', '),
        subject,
        text: body,
        html: `<pre style="font-family:sans-serif">${body}</pre>`,
      });
    } catch (err) {
      this.logger.warn(`Falha ao enviar e-mail: ${String(err)}`);
    }
  }

  async sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      this.logger.warn(`Falha ao enviar webhook para ${url}: ${String(err)}`);
    }
  }
}
