import type { InviteDelivery } from './invites.js';

export type SmtpInviteDeliveryConfig = {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  acceptUrlBase: string;
  secure?: boolean;
  transporter?: SmtpTransporter;
};

export type SmtpTransporter = {
  sendMail: (options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<unknown>;
};

const buildAcceptLink = (base: string, token: string): string => {
  try {
    const url = new URL(base);
    url.searchParams.set('token', token);
    return url.toString();
  } catch {
    // fallback simple concatenation if base is not a valid URL (e.g. relative path)
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}token=${encodeURIComponent(token)}`;
  }
};

export const createSmtpInviteDelivery = (config: SmtpInviteDeliveryConfig): InviteDelivery => {
  const { host, port, user, pass, from, acceptUrlBase, secure, transporter: injectedTransporter } = config;

  let cachedTransporter: SmtpTransporter | undefined = injectedTransporter;

  const getTransporter = async (): Promise<SmtpTransporter> => {
    if (cachedTransporter) return cachedTransporter;
    try {
      // Dynamic import so unit tests can inject a mock without needing nodemailer installed.
      const nodemailer = await import('nodemailer') as unknown as {
        createTransport: (opts: unknown) => SmtpTransporter;
      };
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: secure ?? port === 465,
        ...(user && pass ? { auth: { user, pass } } : {}),
      });
      cachedTransporter = transport;
      return transport;
    } catch (error) {
      throw new Error(`SMTP transporter not available: ${(error as Error).message}`);
    }
  };

  return async (message) => {
    const transporter = await getTransporter();
    const acceptLink = buildAcceptLink(acceptUrlBase, message.token);
    const expiresLabel = message.expiresAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const subject = 'Convite para workspace compartilhado — Pi Financeiro';
    const text = [
      `Você foi convidado para participar de um workspace compartilhado no Pi Financeiro.`,
      ``,
      `E-mail do convite: ${message.email}`,
      `Expira em: ${expiresLabel}`,
      ``,
      `Para aceitar, acesse o link abaixo (válido uma única vez):`,
      acceptLink,
      ``,
      `Se você não esperava este convite, pode ignorar este e-mail.`,
      `Este link contém um token único — não o compartilhe.`,
    ].join('\n');
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#111">
        <p>Você foi convidado para participar de um workspace compartilhado no <strong>Pi Financeiro</strong>.</p>
        <p><strong>E-mail do convite:</strong> ${message.email}<br/><strong>Expira em:</strong> ${expiresLabel}</p>
        <p><a href="${acceptLink}" style="display:inline-block;padding:10px 16px;background:#0E8C5A;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Aceitar convite</a></p>
        <p style="font-size:12px;color:#666">Se o botão não funcionar, copie e cole este link no navegador:<br/><span style="word-break:break-all">${acceptLink}</span></p>
        <p style="font-size:12px;color:#666">Este link contém um token único — não o compartilhe. Se você não esperava este convite, pode ignorar.</p>
      </div>
    `;
    await transporter.sendMail({
      from,
      to: message.email,
      subject,
      text,
      html,
    });
  };
};

export const isSmtpInviteDeliveryConfigured = (config: {
  smtpHost?: string | null;
  smtpFrom?: string | null;
  inviteAcceptUrl?: string | null;
}): boolean => Boolean(config.smtpHost && config.smtpFrom && config.inviteAcceptUrl);
