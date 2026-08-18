-- v5: append-only, payload-free access records for transcript privacy operations.
CREATE TABLE IF NOT EXISTS access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('history_export', 'history_delete', 'access_log_read', 'retention_purge')),
    record_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS access_log_actor_created_idx ON access_log(actor_id, created_at);
CREATE INDEX IF NOT EXISTS access_log_created_idx ON access_log(created_at);
