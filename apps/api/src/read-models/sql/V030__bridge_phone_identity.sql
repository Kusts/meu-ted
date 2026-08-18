-- V030 — bridge phone identity resolution
CREATE TABLE IF NOT EXISTS user_phone_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(32) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES households(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_phone_bindings_phone_unique UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS user_phone_bindings_phone_idx
  ON user_phone_bindings (phone)
  WHERE status = 'active';
