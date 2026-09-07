import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthCacheManager } from './auth-status.js';

export const LoginBeginSchema = z
  .object({ callbackUrl: z.string().trim().url().max(500).optional() })
  .strict();

export const LoginCallbackSchema = z
  .object({
    code: z.string().trim().min(4).max(500),
    state: z.string().trim().min(8).max(128).optional(),
  })
  .strict();

export type CodeExchangeResult = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  email?: string;
};

export type PendingLogin = {
  state: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
};

const LOGIN_TTL_MS = 10 * 60_000;

const newUserCode = (): string => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
};

/**
 * Minimal viable browser login (refactor item 6): the operator starts a login
 * on the broker, completes authorization in the browser (ChatGPT Coding plan,
 * same flow as pi dev / opencode), and the broker persists the resulting
 * session via the atomic 0600 cache write. Tokens NEVER appear in logs or
 * responses — only the opaque state/userCode travel the wire.
 *
 * The real ChatGPT OAuth exchange is injected (`exchangeCode`); the default
 * rejects with `exchange_not_configured` so a bare broker cannot pretend a
 * login succeeded. Tests and ops tooling inject the real exchange.
 */
export class BrowserLoginManager {
  private readonly pending = new Map<string, PendingLogin>();

  constructor(
    private readonly authManager: AuthCacheManager,
    private readonly exchangeCode: (code: string) => Promise<CodeExchangeResult> = async () => {
      throw new Error('exchange_not_configured');
    },
  ) {}

  beginLogin(callbackUrl?: string): PendingLogin {
    const state = randomUUID().replace(/-/g, '');
    const deviceCode = randomUUID().replace(/-/g, '');
    const login: PendingLogin = {
      state,
      deviceCode,
      userCode: newUserCode(),
      verificationUri: `https://chatgpt.com/auth/login?state=${encodeURIComponent(state)}${
        callbackUrl ? `&callback=${encodeURIComponent(callbackUrl)}` : ''
      }`,
      expiresAt: Date.now() + LOGIN_TTL_MS,
    };
    this.pending.set(state, login);
    return login;
  }

  pendingCount(): number {
    return this.pending.size;
  }

  async completeLogin(code: string, state?: string): Promise<{ email?: string; expiresAt?: number }> {
    let login: PendingLogin | undefined;
    if (state) {
      login = this.pending.get(state);
      if (!login) throw Object.assign(new Error('unknown login state'), { statusCode: 400, code: 'login_unknown_state' });
      if (Date.now() >= login.expiresAt) {
        this.pending.delete(state);
        throw Object.assign(new Error('login session expired'), { statusCode: 410, code: 'login_expired' });
      }
    }
    // The opaque code is exchanged server-side; it is never logged or stored.
    const exchanged = await this.exchangeCode(code);
    if (!exchanged.accessToken || exchanged.accessToken.trim() === '') {
      throw Object.assign(new Error('code exchange returned no token'), { statusCode: 502, code: 'login_exchange_failed' });
    }
    this.authManager.saveAuthCacheAtomic({
      accessToken: exchanged.accessToken,
      ...(exchanged.refreshToken ? { refreshToken: exchanged.refreshToken } : {}),
      ...(typeof exchanged.expiresIn === 'number' ? { expiresAt: Date.now() + exchanged.expiresIn * 1000 } : {}),
      ...(exchanged.email ? { email: exchanged.email } : {}),
    });
    if (login && state) this.pending.delete(state);
    const status = this.authManager.getAuthStatus();
    return { ...(status.email ? { email: status.email } : {}), ...(status.expiresAt ? { expiresAt: status.expiresAt } : {}) };
  }

  revokeLocalSession(): void {
    this.authManager.saveAuthCacheAtomic({ reauthRequired: true });
  }
}
