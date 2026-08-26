import type { Pool } from "pg";
import type { ReminderDedupeStore } from "./reminder-scheduler.js";

const keyParts = (key: string) => {
  const [householdId, notificationId, localDate, notificationType] =
    key.split(":");
  if (!householdId || !notificationId || !localDate || !notificationType) {
    return undefined;
  }
  return { householdId, notificationId, localDate, notificationType };
};

export const createPostgresReminderDedupeStore = (
  pool: Pool,
): ReminderDedupeStore => ({
  async claim(key) {
    const parts = keyParts(key);
    if (!parts) return false;
    const result = await pool.query<{ id: string }>(
      `INSERT INTO push_reminder_deliveries (household_id, notification_id, local_date, notification_type)
       VALUES ($1, $2, $3::date, $4)
       ON CONFLICT (household_id, notification_id, local_date, notification_type) DO UPDATE
       SET status = 'claimed', claimed_at = NOW(), error_message = NULL
       WHERE push_reminder_deliveries.status = 'failed'
       RETURNING id`,
      [
        parts.householdId,
        parts.notificationId,
        parts.localDate,
        parts.notificationType,
      ],
    );
    return result.rowCount === 1;
  },
  async release(key) {
    const parts = keyParts(key);
    if (!parts) return;
    await pool.query(
      `UPDATE push_reminder_deliveries
       SET status = 'failed', error_message = COALESCE(error_message, 'delivery failed')
       WHERE household_id = $1 AND notification_id = $2 AND local_date = $3::date AND notification_type = $4 AND status = 'claimed'`,
      [
        parts.householdId,
        parts.notificationId,
        parts.localDate,
        parts.notificationType,
      ],
    );
  },
  async recoverStale(now) {
    const result = await pool.query(
      `UPDATE push_reminder_deliveries
       SET status = 'quarantined', error_message = COALESCE(error_message, 'stale claim recovered')
       WHERE status = 'claimed' AND claimed_at < $1::timestamptz - INTERVAL '15 minutes'`,
      [now],
    );
    return result.rowCount ?? 0;
  },
  async quarantine(key, error) {
    const parts = keyParts(key);
    if (!parts) return;
    await pool.query(
      `UPDATE push_reminder_deliveries
       SET status = 'quarantined', error_message = COALESCE(error_message, $5)
       WHERE household_id = $1 AND notification_id = $2 AND local_date = $3::date AND notification_type = $4 AND status = 'claimed'`,
      [
        parts.householdId,
        parts.notificationId,
        parts.localDate,
        parts.notificationType,
        error,
      ],
    );
  },
  async record(key, state, executedAt) {
    const parts = keyParts(key);
    if (!parts) return;
    await pool.query(
      `UPDATE push_reminder_deliveries
       SET status = CASE
           WHEN status IN ('sent', 'quarantined') THEN status
           ELSE $5
         END,
         sent_count = CASE
           WHEN status IN ('sent', 'quarantined') THEN sent_count
           ELSE $6
         END,
         removed_count = CASE
           WHEN status IN ('sent', 'quarantined') THEN removed_count
           ELSE $7
         END,
         error_message = CASE
           WHEN status IN ('sent', 'quarantined') THEN error_message
           ELSE $8
         END,
         sent_at = CASE
           WHEN status IN ('sent', 'quarantined') THEN sent_at
           WHEN $5 = 'sent' THEN $9::timestamptz
           ELSE sent_at
         END
       WHERE household_id = $1 AND notification_id = $2 AND local_date = $3::date AND notification_type = $4`,
      [
        parts.householdId,
        parts.notificationId,
        parts.localDate,
        parts.notificationType,
        state.status,
        state.sent,
        state.removed,
        state.error ?? null,
        executedAt,
      ],
    );
  },
});
