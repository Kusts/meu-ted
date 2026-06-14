import { randomUUID } from 'node:crypto';
import { DEMO_HOUSEHOLD_ID } from '../read-models/demo-data.js';
import type { Pool } from 'pg';

export type DeviceContext = { deviceId: string; householdId: string };

export type DeviceTokenStore = {
  resolve(token: string | undefined): Promise<DeviceContext>;
  register(deviceName: string, householdId: string): Promise<{ token: string; deviceId: string; householdId: string }>;
  revoke(token: string): Promise<void>;
};

export const DEVICE_TOKEN_HEADER = 'x-device-token';

export class AuthError extends Error {
  readonly statusCode: number; readonly code: string;
  constructor(message: string, statusCode: number, code: string) { super(message); this.statusCode = statusCode; this.code = code; }
}

export const createInMemoryDeviceTokenStore = (): DeviceTokenStore => {
  const tokens = new Map<string, DeviceContext>();
  tokens.set('dev-token-1', { deviceId: 'dev-device-1', householdId: DEMO_HOUSEHOLD_ID });
  tokens.set('dev-token-2', { deviceId: 'dev-device-2', householdId: DEMO_HOUSEHOLD_ID });
  return {
    async resolve(token) {
      if (!token || token.trim() === '') throw new AuthError('missing device token', 401, 'auth.missing_token');
      const ctx = tokens.get(token);
      if (!ctx) throw new AuthError('invalid or revoked device token', 401, 'auth.invalid_token');
      return ctx;
    },
    async register(deviceName, householdId) {
      const tok = randomUUID(); const devId = randomUUID();
      tokens.set(tok, { deviceId: devId, householdId });
      return { token: tok, deviceId: devId, householdId };
    },
    async revoke(token) { tokens.delete(token); },
  };
};

export const createPostgresDeviceTokenStore = (pool: Pool): DeviceTokenStore => ({
  async resolve(token) {
    if (!token || token.trim() === '') throw new AuthError('missing device token', 401, 'auth.missing_token');
    const res = await pool.query<{ device_id: string; household_id: string }>(
      `SELECT device_id, household_id FROM device_tokens WHERE token = $1 AND revoked_at IS NULL`, [token]);
    if (res.rowCount === 0) throw new AuthError('invalid or revoked device token', 401, 'auth.invalid_token');
    const row = res.rows[0]!;
    return { deviceId: row.device_id, householdId: row.household_id };
  },
  async register(deviceName, householdId) {
    const tok = randomUUID(); const devId = randomUUID();
    await pool.query(`INSERT INTO device_tokens (token, device_id, household_id) VALUES ($1, $2, $3)`, [tok, devId, householdId]);
    return { token: tok, deviceId: devId, householdId };
  },
  async revoke(token) {
    await pool.query(`UPDATE device_tokens SET revoked_at = NOW() WHERE token = $1`, [token]);
  },
});
