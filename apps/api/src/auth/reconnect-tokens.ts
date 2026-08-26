import { randomUUID } from 'node:crypto';

export type ReconnectTokenStore = {
  issue(sessionId: string, ttlMs?: number, userId?: string): string;
  validate(token: string, sessionId: string): boolean;
  resolve(token: string): string | null;
  invalidateSession(sessionId: string): void;
  invalidateUser(userId: string): void;
  sessionsForUser(userId: string): string[];
};

type TokenRecord = { sessionId: string; userId?: string; expiresAt: number };

export const createReconnectTokenStore = (deps: { now?: () => number } = {}): ReconnectTokenStore => {
  const now = deps.now ?? Date.now;
  const tokens = new Map<string, TokenRecord>();

  return {
    issue(sessionId, ttlMs = 5 * 60_000, userId) {
      const token = randomUUID();
      tokens.set(token, { sessionId, expiresAt: now() + ttlMs, ...(userId ? { userId } : {}) });
      return token;
    },

    validate(token, sessionId) {
      const record = tokens.get(token);
      if (!record || record.sessionId !== sessionId || record.expiresAt <= now()) {
        tokens.delete(token);
        return false;
      }
      return true;
    },

    resolve(token) {
      const record = tokens.get(token);
      if (!record || record.expiresAt <= now()) {
        tokens.delete(token);
        return null;
      }
      return record.sessionId;
    },

    invalidateSession(sessionId) {
      for (const [token, record] of tokens) {
        if (record.sessionId === sessionId) tokens.delete(token);
      }
    },

    invalidateUser(userId) {
      for (const [token, record] of tokens) {
        if (record.userId === userId) tokens.delete(token);
      }
    },

    sessionsForUser(userId) {
      return [...new Set([...tokens.values()].filter((record) => record.userId === userId).map((record) => record.sessionId))];
    },
  };
};
