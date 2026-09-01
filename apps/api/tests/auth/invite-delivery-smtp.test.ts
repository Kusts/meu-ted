import { describe, expect, it, vi } from 'vitest';
import { createSmtpInviteDelivery } from '../../src/auth/invite-delivery-smtp.js';

describe('SMTP invite delivery', () => {
  it('sends an email with the accept link containing the token', async () => {
    const sendMail = vi.fn(async () => ({}));
    const delivery = createSmtpInviteDelivery({
      host: 'smtp.example.test',
      port: 587,
      from: 'no-reply@example.test',
      acceptUrlBase: 'https://pwa.example.test/convite',
      transporter: { sendMail },
    });

    await delivery({
      inviteId: 'invite-1',
      householdId: 'household-1',
      email: 'member@example.com',
      token: 'a'.repeat(64),
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const args = sendMail.mock.calls[0]![0] as { from: string; to: string; subject: string; text: string; html: string };
    expect(args.from).toBe('no-reply@example.test');
    expect(args.to).toBe('member@example.com');
    expect(args.subject).toMatch(/Convite/);
    expect(args.text).toContain('a'.repeat(64));
    expect(args.html).toContain('a'.repeat(64));
    expect(args.text).toContain('https://pwa.example.test/convite?token=');
    expect(args.html).toContain('https://pwa.example.test/convite?token=');
  });

  it('builds accept link correctly when base already has query', async () => {
    const sendMail = vi.fn(async () => ({}));
    const delivery = createSmtpInviteDelivery({
      host: 'smtp.example.test',
      port: 587,
      from: 'no-reply@example.test',
      acceptUrlBase: 'https://pwa.example.test/convite?foo=bar',
      transporter: { sendMail },
    });
    await delivery({
      inviteId: 'invite-2',
      householdId: 'household-2',
      email: 'other@example.com',
      token: 'b'.repeat(64),
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    const args = sendMail.mock.calls[0]![0] as { text: string };
    expect(args.text).toContain('foo=bar');
    expect(args.text).toContain(`token=${'b'.repeat(64)}`);
  });

  it('throws when transporter sendMail fails', async () => {
    const sendMail = vi.fn(async () => {
      throw new Error('SMTP connection timed out');
    });
    const delivery = createSmtpInviteDelivery({
      host: 'smtp.example.test',
      port: 587,
      from: 'no-reply@example.test',
      acceptUrlBase: 'https://pwa.example.test/convite',
      transporter: { sendMail },
    });
    await expect(
      delivery({
        inviteId: 'invite-3',
        householdId: 'household-3',
        email: 'fail@example.com',
        token: 'c'.repeat(64),
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
    ).rejects.toThrow('SMTP connection timed out');
  });
});
