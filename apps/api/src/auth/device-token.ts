import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DEMO_HOUSEHOLD_ID } from '../read-models/demo-data.js';
import type { Pool } from 'pg';

export type DeviceContext = { deviceId: string; householdId: string };

export type RegisterDeviceTokenOptions = { userId?: string };

export type RotateDeviceTokenOptions = { userId?: string };

export type DeviceTokenStore = {
  resolve(token: string | undefined, householdId?: string): Promise<DeviceContext>;
  register(
    deviceName: string,
    householdId: string,
    opts?: RegisterDeviceTokenOptions,
  ): Promise<{ token: string; deviceId: string; householdId: string }>;
  revoke(token: string, householdId?: string): Promise<void>;
  /**
   * Rotation (SPEC §9 C4): issues a successor token and confines the
   * predecessor to the rotation window (`expires_at = now + window`).
   * `currentToken` undefined = session-authenticated rotation without a
   * predecessor (register-only). An expired/foreign predecessor rejects
   * before any INSERT (no resurrection, no cross-scope windowing).
   */
  rotate(
    currentToken: string | undefined,
    deviceName: string,
    householdId: string,
    opts?: RotateDeviceTokenOptions,
  ): Promise<{ token: string; deviceId: string; householdId: string }>;
};

export const DEVICE_TOKEN_HEADER = 'x-device-token';

/**
 * Opaque random device secret (SPEC §9 C1): 256 bits of entropy, no
 * household or structure embedded. Same-hash precedent as invites
 * (`hashInviteToken` in `invites.ts`).
 */
export const generateDeviceToken = (): string => randomBytes(32).toString('base64url');

export const hashDeviceToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/** Placeholder stored in the legacy `token` PK column for hashed rows: never a valid header. */
export const hashedTokenPlaceholder = (tokenHash: string): string => `v2:${tokenHash}`;

/**
 * Rotation window for the predecessor token (SPEC §9 C4): after rotation
 * the old token stays valid for this long, then lazy-expiry rejects it —
 * never two valid tokens beyond the window, no background job.
 * Read at call time so tests can override per case.
 */
export const DEFAULT_DEVICE_ROTATION_WINDOW_HOURS = 24;

export const getDeviceRotationWindowHours = (): number => {
  const raw = process.env.DEVICE_ROTATION_WINDOW_HOURS;
  if (raw === undefined) return DEFAULT_DEVICE_ROTATION_WINDOW_HOURS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEVICE_ROTATION_WINDOW_HOURS;
};

export const getDeviceRotationWindowMs = (): number => getDeviceRotationWindowHours() * 3_600_000;

export class AuthError extends Error {
  readonly statusCode: number; readonly code: string;
  constructor(message: string, statusCode: number, code: string) { super(message); this.statusCode = statusCode; this.code = code; }
}

export const createInMemoryDeviceTokenStore = (): DeviceTokenStore => {
  type MemTokenRecord = {
    deviceId: string;
    householdId: string;
    /** Absolute expiry (ms epoch) or null for no expiry. Rotation predecessors get now + window. */
    expiresAt: number | null;
    /** Last successful lookup (ms epoch) or null when never used. */
    lastUsedAt: number | null;
  };
  const tokens = new Map<string, MemTokenRecord>();
  tokens.set('dev-token-1', { deviceId: 'dev-device-1', householdId: DEMO_HOUSEHOLD_ID, expiresAt: null, lastUsedAt: null });
  tokens.set('dev-token-2', { deviceId: 'dev-device-2', householdId: DEMO_HOUSEHOLD_ID, expiresAt: null, lastUsedAt: null });

  const hasPredecessor = (currentToken: string | undefined): currentToken is string =>
    typeof currentToken === 'string' && currentToken.trim() !== '';

  const resolve = async (token: string | undefined, householdId?: string): Promise<DeviceContext> => {
    if (!token || token.trim() === '') throw new AuthError('missing device token', 401, 'auth.missing_token');
    const record = tokens.get(token);
    // Lazy expiry (SPEC §9 C4, no job): an observed-expired predecessor is
    // evicted on sight and rejects like a revoked token.
    if (record && record.expiresAt !== null && record.expiresAt <= Date.now()) {
      tokens.delete(token);
      throw new AuthError('invalid or revoked device token', 401, 'auth.invalid_token');
    }
    if (!record) throw new AuthError('invalid or revoked device token', 401, 'auth.invalid_token');
    if (householdId && record.householdId !== householdId) {
      throw new AuthError('invalid or revoked device token', 401, 'auth.invalid_token');
    }
    record.lastUsedAt = Date.now();
    return { deviceId: record.deviceId, householdId: record.householdId };
  };

  const register = async (
    _deviceName: string,
    householdId: string,
    _opts?: RegisterDeviceTokenOptions,
  ): Promise<{ token: string; deviceId: string; householdId: string }> => {
    const tok = generateDeviceToken(); const devId = randomUUID();
    tokens.set(tok, { deviceId: devId, householdId, expiresAt: null, lastUsedAt: null });
    return { token: tok, deviceId: devId, householdId };
  };

  const revoke = async (token: string, householdId?: string): Promise<void> => {
    const existing = tokens.get(token);
    if (householdId && existing && existing.householdId !== householdId) return;
    tokens.delete(token);
  };

  const rotate = async (
    currentToken: string | undefined,
    deviceName: string,
    householdId: string,
    opts?: RotateDeviceTokenOptions,
  ): Promise<{ token: string; deviceId: string; householdId: string }> => {
    if (hasPredecessor(currentToken)) {
      // Scoped validation first: expired or foreign predecessors reject
      // before any successor exists (fail-closed, no resurrection).
      await resolve(currentToken, householdId);
    }
    const created = await register(
      deviceName,
      householdId,
      opts?.userId ? { userId: opts.userId } : undefined,
    );
    if (hasPredecessor(currentToken)) {
      const prev = tokens.get(currentToken);
      if (prev) {
        const deadline = Date.now() + getDeviceRotationWindowMs();
        // Never extend a tighter pre-existing expiry (e.g. legacy 90d tail).
        prev.expiresAt = prev.expiresAt === null ? deadline : Math.min(prev.expiresAt, deadline);
      }
    }
    return created;
  };

  return { resolve, register, revoke, rotate };
};

type DeviceTokenRow = { device_id: string; household_id: string; expires_at: string | Date | null };

const invalidToken = (): AuthError => new AuthError('invalid or revoked device token', 401, 'auth.invalid_token');

const throwIfExpired = (row: DeviceTokenRow): void => {
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) throw invalidToken();
};

export const createPostgresDeviceTokenStore = (pool: Pool): DeviceTokenStore => {
  // Nullable scope binding (SPEC §9 C5): every credential query carries an
  // explicit household_id parameter. Callers without a scope pass NULL (no
  // filter, e.g. the central AuthResolver); callers with a workspace confine
  // the lookup. Never a tautology; kept inline so static scope audits see it.
  const scope = (householdId?: string): string | null => householdId ?? null;

  const hasPredecessor = (currentToken: string | undefined): currentToken is string =>
    typeof currentToken === 'string' && currentToken.trim() !== '';

  const resolve = async (token: string | undefined, householdId?: string): Promise<DeviceContext> => {
      if (!token || token.trim() === '') throw new AuthError('missing device token', 401, 'auth.missing_token');
      const scopeParam = scope(householdId);
      const tokenHash = hashDeviceToken(token);

      // Hashed path (V053 rows): the DB never sees the raw secret.
      const hashed = await pool.query<DeviceTokenRow>(
        `SELECT device_id, household_id, expires_at FROM device_tokens WHERE token_hash = $1 AND (household_id = $2 OR $2 IS NULL) AND revoked_at IS NULL`,
        [tokenHash, scopeParam],
      );
      if ((hashed.rowCount ?? 0) > 0) {
        const row = hashed.rows[0]!;
        throwIfExpired(row);
        await pool.query(`UPDATE device_tokens SET last_used_at = NOW() WHERE token_hash = $1 AND (household_id = $2 OR $2 IS NULL)`, [tokenHash, scopeParam]);
        return { deviceId: row.device_id, householdId: row.household_id };
      }

      // Legacy path (coexistence window C6/R4): plaintext rows backfilled by
      // V053 with legacy = TRUE and a 90-day expires_at. Expired rows reject.
      const legacy = await pool.query<DeviceTokenRow>(
        `SELECT device_id, household_id, expires_at FROM device_tokens WHERE token = $1 AND legacy = TRUE AND (household_id = $2 OR $2 IS NULL) AND revoked_at IS NULL`,
        [token, scopeParam],
      );
      if ((legacy.rowCount ?? 0) > 0) {
        const row = legacy.rows[0]!;
        throwIfExpired(row);
        await pool.query(
          `UPDATE device_tokens SET last_used_at = NOW() WHERE token = $1 AND legacy = TRUE AND (household_id = $2 OR $2 IS NULL)`,
          [token, scopeParam],
        );
        return { deviceId: row.device_id, householdId: row.household_id };
      }

      throw invalidToken();
  };

  const register = async (
      deviceName: string,
      householdId: string,
      opts?: RegisterDeviceTokenOptions,
  ): Promise<{ token: string; deviceId: string; householdId: string }> => {
      const tok = generateDeviceToken();
      const tokenHash = hashDeviceToken(tok);
      const devId = randomUUID();
      await pool.query(
        `INSERT INTO device_tokens (token, device_id, household_id, token_hash, name, user_id, legacy)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
        [hashedTokenPlaceholder(tokenHash), devId, householdId, tokenHash, deviceName, opts?.userId ?? null],
      );
      return { token: tok, deviceId: devId, householdId };
  };

  const revoke = async (token: string, householdId?: string): Promise<void> => {
      const scopeParam = scope(householdId);
      const tokenHash = hashDeviceToken(token);
      await pool.query(
        `UPDATE device_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND (household_id = $2 OR $2 IS NULL)`,
        [tokenHash, scopeParam],
      );
      await pool.query(
        `UPDATE device_tokens SET revoked_at = NOW() WHERE token = $1 AND legacy = TRUE AND (household_id = $2 OR $2 IS NULL)`,
        [token, scopeParam],
      );
  };

  const rotate = async (
    currentToken: string | undefined,
    deviceName: string,
    householdId: string,
    opts?: RotateDeviceTokenOptions,
  ): Promise<{ token: string; deviceId: string; householdId: string }> => {
    // Scoped predecessor validation first: expired or foreign tokens reject
    // before any successor row exists (fail-closed, no resurrection). The
    // resolved household anchors every write below (C5: explicit parameter).
    let anchor = householdId;
    if (hasPredecessor(currentToken)) {
      const prev = await resolve(currentToken, householdId);
      anchor = prev.householdId;
    }
    // Successor rows follow the V053 register policy: opaque random secret,
    // hash at rest, no forced expires_at (scoped lifecycle, per-token
    // revocation — never a table-wide logout).
    const created = await register(
      deviceName,
      anchor,
      opts?.userId ? { userId: opts.userId } : undefined,
    );
    if (hasPredecessor(currentToken)) {
      const deadline = new Date(Date.now() + getDeviceRotationWindowMs()).toISOString();
      const oldHash = hashDeviceToken(currentToken);
      // LEAST never extends a tighter pre-existing expiry (legacy 90d tail).
      await pool.query(
        `UPDATE device_tokens SET expires_at = LEAST(COALESCE(expires_at, $3::timestamptz), $3::timestamptz) WHERE token_hash = $1 AND (household_id = $2 OR $2 IS NULL) AND revoked_at IS NULL`,
        [oldHash, anchor, deadline],
      );
      await pool.query(
        `UPDATE device_tokens SET expires_at = LEAST(COALESCE(expires_at, $3::timestamptz), $3::timestamptz) WHERE token = $1 AND legacy = TRUE AND (household_id = $2 OR $2 IS NULL) AND revoked_at IS NULL`,
        [currentToken, anchor, deadline],
      );
    }
    return created;
  };

  return { resolve, register, revoke, rotate };
};
