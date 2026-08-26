-- V024 — authenticated Web Push subscriptions for the PWA.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL,
    user_id       TEXT NOT NULL,
    endpoint      TEXT NOT NULL,
    p256dh        TEXT NOT NULL,
    auth          TEXT NOT NULL,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at  TIMESTAMPTZ,
    UNIQUE (workspace_id, user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_workspace_user_idx
    ON push_subscriptions (workspace_id, user_id);
