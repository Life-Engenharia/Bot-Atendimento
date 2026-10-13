import { createTransport } from 'nodemailer';
import type { OperationalConfigurationStore } from '../../modules/internal_operations/application/administrative-menu-service.js';

export type SmtpConfiguration = {
  host: string;
  port: number;
  security: 'starttls' | 'ssl' | 'none';
  user: string;
  password: string;
  from: string;
};

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export class SmtpEmailSender {
  constructor(private readonly configuration: SmtpConfiguration) {}

  async send(message: OutboundEmail): Promise<void> {
    const transport = createTransport({
      host: this.configuration.host,
      port: this.configuration.port,
      secure: this.configuration.security === 'ssl',
      requireTLS: this.configuration.security === 'starttls',
      auth: { user: this.configuration.user, pass: this.configuration.password },
    });
    await transport.sendMail({
      from: this.configuration.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

export async function smtpConfigurationFromSettings(
  store: OperationalConfigurationStore,
  password: string,
): Promise<SmtpConfiguration | undefined> {
  const setting = (await store.listSettings()).find((item) => item.key === 'email');
  if (!setting) return undefined;

  const host = setting.value.host?.trim();
  const user = setting.value.user?.trim();
  const from = setting.value.from?.trim();
  const port = Number(setting.value.port);
  if (!host || !user || !from || !Number.isInteger(port) || port < 1 || port > 65_535)
    return undefined;

  return {
    host,
    port,
    security:
      setting.value.security === 'ssl' || setting.value.security === 'starttls'
        ? setting.value.security
        : 'none',
    user,
    password,
    from,
  };
}
