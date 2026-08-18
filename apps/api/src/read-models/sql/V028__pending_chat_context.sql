-- V028 — server-owned chat context for durable pending-operation compatibility.
-- V027 is reserved for context-token replay; keep migration versions monotonic.
ALTER TABLE pending_operations
  ADD COLUMN IF NOT EXISTS chat_id TEXT;

CREATE INDEX IF NOT EXISTS pending_operations_workspace_chat_status_expiry_idx
  ON pending_operations (workspace_id, chat_id, status, expires_at)
  WHERE chat_id IS NOT NULL;
