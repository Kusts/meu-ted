import type { Pool } from "pg";
import type {
  PushSubscription,
  PushSubscriptionStore,
  UpsertPushSubscriptionInput,
} from "./store.js";

type Row = Record<string, unknown>;

const asIso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value);

const mapRow = (row: Row): PushSubscription => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  userId: String(row.user_id),
  endpoint: String(row.endpoint),
  p256dh: String(row.p256dh),
  auth: String(row.auth),
  ...(row.user_agent ? { userAgent: String(row.user_agent) } : {}),
  createdAt: asIso(row.created_at),
  updatedAt: asIso(row.updated_at),
  ...(row.last_used_at ? { lastUsedAt: asIso(row.last_used_at) } : {}),
});

export const createPostgresPushSubscriptionStore = (
  pool: Pool,
): PushSubscriptionStore => ({
  async upsert(input: UpsertPushSubscriptionInput) {
    const result = await pool.query<Row>(
      `INSERT INTO push_subscriptions (workspace_id, user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, user_id, endpoint) DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = NOW()
       RETURNING id, workspace_id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at, last_used_at`,
      [
        input.workspaceId,
        input.userId,
        input.endpoint,
        input.p256dh,
        input.auth,
        input.userAgent ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Push subscription insert returned no row");
    return mapRow(row);
  },
  async list(workspaceId) {
    const result = await pool.query<Row>(
      `SELECT id, workspace_id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at, last_used_at
       FROM push_subscriptions WHERE workspace_id = $1 ORDER BY created_at ASC`,
      [workspaceId],
    );
    return result.rows.map(mapRow);
  },
  async listPending(workspaceId, deliveryKey) {
    const result = await pool.query<Row>(
      `SELECT s.id, s.workspace_id, s.user_id, s.endpoint, s.p256dh, s.auth, s.user_agent, s.created_at, s.updated_at, s.last_used_at
       FROM push_subscriptions s
       WHERE s.workspace_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM push_delivery_attempts a
           WHERE a.workspace_id = s.workspace_id AND a.user_id = s.user_id AND a.endpoint = s.endpoint AND a.delivery_key = $2 AND a.status IN ('claimed', 'delivered')
         )
       ORDER BY s.created_at ASC`,
      [workspaceId, deliveryKey],
    );
    return result.rows.map(mapRow);
  },
  async claimDelivery(workspaceId, userId, endpoint, deliveryKey) {
    const result = await pool.query(
      `INSERT INTO push_delivery_attempts (workspace_id, user_id, endpoint, delivery_key, status)
       VALUES ($1, $2, $3, $4, 'claimed')
       ON CONFLICT (workspace_id, user_id, endpoint, delivery_key) DO NOTHING
       RETURNING delivery_key`,
      [workspaceId, userId, endpoint, deliveryKey],
    );
    return result.rowCount === 1;
  },
  async markDelivered(workspaceId, userId, endpoint, deliveryKey) {
    await pool.query(
      `UPDATE push_delivery_attempts SET status = 'delivered', delivered_at = NOW()
       WHERE workspace_id = $1 AND user_id = $2 AND endpoint = $3 AND delivery_key = $4`,
      [workspaceId, userId, endpoint, deliveryKey],
    );
  },
  async releaseDelivery(workspaceId, userId, endpoint, deliveryKey) {
    await pool.query(
      `DELETE FROM push_delivery_attempts
       WHERE workspace_id = $1 AND user_id = $2 AND endpoint = $3 AND delivery_key = $4 AND status = 'claimed'`,
      [workspaceId, userId, endpoint, deliveryKey],
    );
  },
  async remove(workspaceId, userId, endpoint) {
    const result = await pool.query(
      "DELETE FROM push_subscriptions WHERE workspace_id = $1 AND user_id = $2 AND endpoint = $3",
      [workspaceId, userId, endpoint],
    );
    return (result.rowCount ?? 0) > 0;
  },
});
