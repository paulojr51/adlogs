import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async sendEmail(to: string[], subject: string, body: string): Promise<void> {
    if (to.length === 0) return;
    const host = process.env['SMTP_HOST'];
    if (!host) {
      this.logger.warn('SMTP_HOST não configurado — e-mail não enviado');
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env['SMTP_PORT'] ?? 587),
      secure: Number(process.env['SMTP_PORT'] ?? 587) === 465,
      auth: {
        user: process.env['SMTP_USER'],
        pass: process.env['SMTP_PASS'],
      },
    });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;overflow:hidden">
        <tr>
          <td style="background:#1d4ed8;padding:20px 28px">
            <span style="color:#fff;font-size:18px;font-weight:bold">&#x26A0;&#xFE0F; ADLogs — Alerta de Segurança</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px">
            <p style="color:#94a3b8;font-size:13px;margin:0 0 16px">Este alerta foi gerado automaticamente pelo sistema ADLogs.</p>
            <div style="background:#0f172a;border-radius:8px;padding:16px;white-space:pre-wrap;color:#e2e8f0;font-size:13px;line-height:1.6">${body}</div>
            <p style="color:#475569;font-size:11px;margin:20px 0 0">Não responda este e-mail. Para gerenciar alertas acesse o painel ADLogs.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await transporter.sendMail({
        from: process.env['SMTP_FROM'] ?? 'ADLogs Alertas <noreply@adlogs.com>',
        to: to.join(', '),
        subject,
        text: body,
        html,
      });
      this.logger.log(`E-mail enviado para: ${to.join(', ')}`);
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
