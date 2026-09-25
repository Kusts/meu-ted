import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DEMO_HOUSEHOLD_ID } from '../read-models/demo-data.js';
import { withTransaction } from '../db/pool.js';
import { resolveRequiredApplicationUserId } from './resolve-user-id.js';
import type { Pool } from 'pg';

export type DeviceContext = { deviceId: string; householdId: string; userId?: string | null };

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
   * Membership-revocation cleanup (V4.1 task 1.6, defense-in-depth): revokes
   * every token bound to a user in a workspace, including rotation
   * successors (they inherit the predecessor owner lineage). Resolves the
   * user id stored at registration, which may be the application user id or
   * the Better Auth id. Returns the revoked count. Primary enforcement stays
   * dynamic membership validation at request time.
   */
  revokeAllForUserWorkspace(userId: string, householdId: string): Promise<number>;
  /**
   * Rotation (SPEC §9 C4): issues a successor token and confines the
   * predecessor to the rotation window (`expires_at = now + window`).
   * `currentToken` undefined = session-authenticated rotation without a
   * predecessor (register-only). An expired/foreign predecessor rejects
   * before any INSERT (no resurrection, no cross-scope windowing).
   * The predecessor is single-use for rotation: a second `rotate` with an
   * already-rotated predecessor rejects with 409
   * (`auth.token_already_rotated`) even inside the window — the caller must
   * rotate the successor instead. This bounds every rotation to exactly one
   * successor, including parallel/concurrent callers.
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
    /**
     * Rotation consumption flag (FIX-ROT): the synchronous claim in `rotate`
     * makes the predecessor single-use, so concurrent rotates serialize to
     * exactly one successor. Auth (`resolve`) ignores this flag — a rotated
     * predecessor stays valid until its windowed expiry.
     */
    rotated: boolean;
    /** Owner lineage (FIX-USERID-LINEAGE): inherited by rotation successors. */
    userId: string | null;
  };
  const tokens = new Map<string, MemTokenRecord>();
  tokens.set('dev-token-1', { deviceId: 'dev-device-1', householdId: DEMO_HOUSEHOLD_ID, expiresAt: null, lastUsedAt: null, rotated: false, userId: null });
  tokens.set('dev-token-2', { deviceId: 'dev-device-2', householdId: DEMO_HOUSEHOLD_ID, expiresAt: null, lastUsedAt: null, rotated: false, userId: null });

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
    return { deviceId: record.deviceId, householdId: record.householdId, userId: record.userId };
  };

  const register = async (
    _deviceName: string,
    householdId: string,
    _opts?: RegisterDeviceTokenOptions,
  ): Promise<{ token: string; deviceId: string; householdId: string }> => {
    const tok = generateDeviceToken(); const devId = randomUUID();
    tokens.set(tok, { deviceId: devId, householdId, expiresAt: null, lastUsedAt: null, rotated: false, userId: _opts?.userId ?? null });
    return { token: tok, deviceId: devId, householdId };
  };

  const revoke = async (token: string, householdId?: string): Promise<void> => {
    const existing = tokens.get(token);
    if (householdId && existing && existing.householdId !== householdId) return;
    tokens.delete(token);
  };

  const revokeAllForUserWorkspace = async (userId: string, householdId: string): Promise<number> => {
    let revoked = 0;
    for (const [token, record] of tokens) {
      if (record.userId === userId && record.householdId === householdId) {
        tokens.delete(token);
        revoked += 1;
      }
    }
    return revoked;
  };

  const rotate = async (
    currentToken: string | undefined,
    deviceName: string,
    householdId: string,
    opts?: RotateDeviceTokenOptions,
  ): Promise<{ token: string; deviceId: string; householdId: string }> => {
    // FIX-USERID-LINEAGE: owner carried from the predecessor; the session
    // user (when present) only verifies. Resolved before the claim so a
    // mismatch rejects without consuming the predecessor.
    const predecessorUserId = hasPredecessor(currentToken)
      ? (tokens.get(currentToken)?.userId ?? null)
      : null;
    if (hasPredecessor(currentToken)) {
      // Scoped validation first: expired or foreign predecessors reject
      // before any successor exists (fail-closed, no resurrection).
      await resolve(currentToken, householdId);
      // Synchronous consume-check-then-claim (FIX-ROT): no await between the
      // flag read and the flag write, so two concurrent rotates of the same
      // predecessor serialize here — exactly one wins, the other gets 409.
      const prev = tokens.get(currentToken);
      if (prev && prev.rotated) throw alreadyRotatedToken();
      if (opts?.userId && predecessorUserId && opts.userId !== predecessorUserId) {
        throw userMismatchToken();
      }
      if (prev) prev.rotated = true;
    }
    const successorUserId = resolveRotationSuccessorUserId(opts?.userId, predecessorUserId);
    let created: { token: string; deviceId: string; householdId: string };
    try {
      created = await register(
        deviceName,
        householdId,
        successorUserId ? { userId: successorUserId } : undefined,
      );
    } catch (err) {
      // No successor was issued: release the claim so the predecessor stays
      // rotatable instead of wedged.
      if (hasPredecessor(currentToken)) {
        const prev = tokens.get(currentToken);
        if (prev) prev.rotated = false;
      }
      throw err;
    }
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

  return { resolve, register, revoke, revokeAllForUserWorkspace, rotate };
};

type DeviceTokenRow = { device_id: string; household_id: string; expires_at: string | Date | null; legacy?: boolean | null; user_id?: string | null };

const invalidToken = (): AuthError => new AuthError('invalid or revoked device token', 401, 'auth.invalid_token');

const alreadyRotatedToken = (): AuthError =>
  new AuthError('device token already rotated, use the successor', 409, 'auth.token_already_rotated');

const userMismatchToken = (): AuthError =>
  new AuthError('device token belongs to a different user', 403, 'auth.user_mismatch');

/**
 * FIX-USERID-LINEAGE: the successor keeps the predecessor's owner. An
 * explicit session user (never the request body — rotateInput carries no
 * userId) is an additional verification: a foreign session rotating another
 * user's device token rejects; a missing predecessor owner adopts the
 * verified session user (session-only path registers directly with it).
 */
const resolveRotationSuccessorUserId = (
  sessionUserId: string | undefined,
  predecessorUserId: string | null,
): string | null => {
  if (sessionUserId && predecessorUserId && sessionUserId !== predecessorUserId) {
    throw userMismatchToken();
  }
  return sessionUserId ?? predecessorUserId;
};

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
        `SELECT device_id, household_id, expires_at, user_id FROM device_tokens WHERE token_hash = $1 AND (household_id = $2 OR $2 IS NULL) AND revoked_at IS NULL`,
        [tokenHash, scopeParam],
      );
      if ((hashed.rowCount ?? 0) > 0) {
        const row = hashed.rows[0]!;
        throwIfExpired(row);
        await pool.query(`UPDATE device_tokens SET last_used_at = NOW() WHERE token_hash = $1 AND (household_id = $2 OR $2 IS NULL)`, [tokenHash, scopeParam]);
        return { deviceId: row.device_id, householdId: row.household_id, userId: row.user_id ?? null };
      }

      // Legacy path (coexistence window C6/R4): plaintext rows backfilled by
      // V053 with legacy = TRUE and a 90-day expires_at. Expired rows reject.
      const legacy = await pool.query<DeviceTokenRow>(
        `SELECT device_id, household_id, expires_at, user_id FROM device_tokens WHERE token = $1 AND legacy = TRUE AND (household_id = $2 OR $2 IS NULL) AND revoked_at IS NULL`,
        [token, scopeParam],
      );
      if ((legacy.rowCount ?? 0) > 0) {
        const row = legacy.rows[0]!;
        throwIfExpired(row);
        await pool.query(
          `UPDATE device_tokens SET last_used_at = NOW() WHERE token = $1 AND legacy = TRUE AND (household_id = $2 OR $2 IS NULL)`,
          [token, scopeParam],
        );
        return { deviceId: row.device_id, householdId: row.household_id, userId: row.user_id ?? null };
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
      // Onda 1 item 1 (fail-closed device boundary): a session user id MUST
      // resolve to the application users.id. A missing users row or a
      // rejected SELECT throws auth.identity_unavailable (503, sanitized)
      // BEFORE the INSERT, so no token is minted without lineage.
      // Anonymous bootstrap (no opts.userId) stays NULL — a separate
      // contract from authenticated registration. Audit lineage in
      // writes/postgres.ts keeps its own nullable resolver, untouched here.
      const lineageUserId = opts?.userId
        ? await resolveRequiredApplicationUserId(pool, opts.userId)
        : null;
      await pool.query(
        `INSERT INTO device_tokens (token, device_id, household_id, token_hash, name, user_id, legacy)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
        [hashedTokenPlaceholder(tokenHash), devId, householdId, tokenHash, deviceName, lineageUserId],
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

  const revokeAllForUserWorkspace = async (userId: string, householdId: string): Promise<number> => {
      // Dual identity match: registration stores either the application user
      // id or the Better Auth id; rotation successors inherit it, so lineage
      // is covered by the same predicate. Text comparison avoids UUID-cast
      // failures for non-UUID Better Auth ids.
      const result = await pool.query(
        `UPDATE device_tokens
            SET revoked_at = NOW()
          WHERE household_id = $2
            AND revoked_at IS NULL
            AND user_id IS NOT NULL
            AND (user_id::text = $1
              OR user_id::text IN (SELECT auth_user_id FROM users WHERE id::text = $1))`,
        [userId, householdId],
      );
      return result.rowCount ?? 0;
  };

  const rotate = async (
    currentToken: string | undefined,
    deviceName: string,
    householdId: string,
    opts?: RotateDeviceTokenOptions,
  ): Promise<{ token: string; deviceId: string; householdId: string }> => {
    if (!hasPredecessor(currentToken)) {
      // Session-authenticated rotation without a predecessor: register-only,
      // a single INSERT is already atomic — no transaction needed.
      return register(
        deviceName,
        householdId,
        opts?.userId ? { userId: opts.userId } : undefined,
      );
    }
    const predecessor: string = currentToken;
    // FIX-ROT: the whole rotation is ONE transaction. SELECT ... FOR UPDATE
    // takes the predecessor row lock, so two concurrent rotates of the same
    // token serialize: the loser re-reads the winner's committed windowing
    // and rejects with 409 instead of minting a second successor.
    return withTransaction(pool, async (client) => {
      const scopeParam = scope(householdId);
      const oldHash = hashDeviceToken(predecessor);

      // 1. Lock the predecessor (hashed path first, legacy fallback).
      const hashed = await client.query<DeviceTokenRow>(
        `SELECT device_id, household_id, expires_at, legacy, user_id FROM device_tokens WHERE token_hash = $1 AND (household_id = $2 OR $2 IS NULL) AND revoked_at IS NULL FOR UPDATE`,
        [oldHash, scopeParam],
      );
      let row: DeviceTokenRow | undefined =
        (hashed.rowCount ?? 0) > 0 ? hashed.rows[0]! : undefined;
      let isLegacy = false;
      if (!row) {
        const legacy = await client.query<DeviceTokenRow>(
          `SELECT device_id, household_id, expires_at, legacy, user_id FROM device_tokens WHERE token = $1 AND legacy = TRUE AND (household_id = $2 OR $2 IS NULL) AND revoked_at IS NULL FOR UPDATE`,
          [predecessor, scopeParam],
        );
        if ((legacy.rowCount ?? 0) === 0) throw invalidToken();
        row = legacy.rows[0]!;
        isLegacy = true;
      }

      // 2. Fail-closed expiry: an expired predecessor rejects before any
      // successor row exists (no resurrection).
      const windowedAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
      if (windowedAt !== null && windowedAt <= Date.now()) throw invalidToken();

      // The resolved household anchors every write below (C5).
      const anchor = row.household_id;

      // 3. Single-use: an already-rotated predecessor rejects even inside the
      // window — the caller must rotate the successor instead. No new schema:
      // modern rows are born with expires_at NULL, so any set expiry means
      // consumed. Legacy rows carry the V053 90-day backfill expiry, so only
      // a windowed (<= now + window) expiry means consumed; a far-future
      // expiry is a never-rotated legacy token and rotates once.
      const deadlineMs = Date.now() + getDeviceRotationWindowMs();
      const consumed = isLegacy
        ? windowedAt !== null && windowedAt <= deadlineMs
        : windowedAt !== null;
      if (consumed) throw alreadyRotatedToken();

      // 4. INSERT the successor in the same transaction (V053 register
      // policy: opaque random secret, hash at rest, no forced expires_at).
      // FIX-USERID-LINEAGE: the successor inherits the predecessor's owner
      // read above under FOR UPDATE; a session user only verifies.
      // Identity space: the session carries the Better-Auth TEXT id while the
      // row stores the application users.id (UUID). Resolve the session user
      // into the application space BEFORE the mismatch check and the successor
      // insert — otherwise TEXT-vs-UUID always mismatches (403) or the raw
      // TEXT id crashes the UUID insert (22P02). Fail-closed (Onda 1 item 1):
      // with opts.userId, a missing users row or a rejected SELECT throws
      // auth.identity_unavailable (503, sanitized) here, so the transaction
      // rolls back with no successor INSERT and the predecessor untouched.
      const sessionAppUserId = opts?.userId
        ? await resolveRequiredApplicationUserId(client, opts.userId)
        : null;
      const successorUserId = resolveRotationSuccessorUserId(
        sessionAppUserId ?? undefined,
        row.user_id ?? null,
      );
      const tok = generateDeviceToken();
      const tokenHash = hashDeviceToken(tok);
      const devId = randomUUID();
      const deadline = new Date(deadlineMs).toISOString();
      await client.query(
        `INSERT INTO device_tokens (token, device_id, household_id, token_hash, name, user_id, legacy)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
        [hashedTokenPlaceholder(tokenHash), devId, anchor, tokenHash, deviceName, successorUserId],
      );

      // 5. Confine the predecessor. LEAST never extends a tighter
      // pre-existing expiry (legacy 90d tail).
      if (!isLegacy) {
        await client.query(
          `UPDATE device_tokens SET expires_at = LEAST(COALESCE(expires_at, $3::timestamptz), $3::timestamptz) WHERE token_hash = $1 AND (household_id = $2 OR $2 IS NULL) AND revoked_at IS NULL`,
          [oldHash, anchor, deadline],
        );
      } else {
        await client.query(
          `UPDATE device_tokens SET expires_at = LEAST(COALESCE(expires_at, $3::timestamptz), $3::timestamptz) WHERE token = $1 AND legacy = TRUE AND (household_id = $2 OR $2 IS NULL) AND revoked_at IS NULL`,
          [predecessor, anchor, deadline],
        );
      }
      return { token: tok, deviceId: devId, householdId: anchor };
    });
  };

  return { resolve, register, revoke, revokeAllForUserWorkspace, rotate };
};
