import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const fromEmail = this.configService.get<string>('EMAIL_FROM');

    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    if (!fromEmail) {
      throw new Error('EMAIL_FROM is not configured');
    }

    this.resend = new Resend(apiKey);
    this.from = fromEmail;
  }

  async sendInviteEmail(email: string, inviteUrl: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Запрошення до системи документообігу',
      html: this.buildHtml(
        'Вас запрошено до системи документообігу',
        `Щоб завершити реєстрацію, перейдіть за посиланням: <a href="${inviteUrl}">${inviteUrl}</a>`,
      ),
    });
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Відновлення пароля',
      html: this.buildHtml(
        'Запит на відновлення пароля',
        `Щоб встановити новий пароль, перейдіть за посиланням: <a href="${resetUrl}">${resetUrl}</a>`,
      ),
    });
  }

  private async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      this.logger.error(`Failed to send email to ${params.to}: ${error.message}`);
      throw new Error(`Failed to send email via Resend: ${error.message}`);
    }

    this.logger.log(`Email sent to ${params.to} [id=${data?.id}] subject="${params.subject}"`);
  }

  private buildHtml(title: string, message: string): string {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2>${title}</h2>
        <p>${message}</p>
      </div>
    `;
  }
}
