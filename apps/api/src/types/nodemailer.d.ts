declare module 'nodemailer' {
  export type SentMessageInfo = unknown;
  export type Transporter = {
    sendMail: (options: Record<string, unknown>) => Promise<SentMessageInfo>;
  };
  export function createTransport(options: Record<string, unknown>): Transporter;
  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}
