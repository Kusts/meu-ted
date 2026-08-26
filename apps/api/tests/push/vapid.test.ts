import { describe, expect, it } from 'vitest';
import { loadVapidConfig } from '../../src/push/vapid.js';

const publicKey = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url');
const privateKey = Buffer.alloc(32, 2).toString('base64url');

const env = (overrides: Record<string, string | undefined> = {}) => ({
  VAPID_SUBJECT: 'mailto:ops@example.test',
  VAPID_PUBLIC_KEY: publicKey,
  VAPID_PRIVATE_KEY: privateKey,
  ...overrides,
});

describe('VAPID configuration', () => {
  it('loads a complete VAPID subject and key pair', () => {
    expect(loadVapidConfig(env())).toEqual({ subject: 'mailto:ops@example.test', publicKey, privateKey });
  });

  it('rejects partial or malformed VAPID configuration', () => {
    expect(() => loadVapidConfig(env({ VAPID_PRIVATE_KEY: undefined }))).toThrow(/VAPID_PRIVATE_KEY/);
    expect(() => loadVapidConfig(env({ VAPID_PUBLIC_KEY: 'bad' }))).toThrow(/VAPID_PUBLIC_KEY/);
    expect(() => loadVapidConfig(env({ VAPID_SUBJECT: 'ops@example.test' }))).toThrow(/VAPID_SUBJECT/);
  });
});
