-- V034: Global LLM configuration for TED Agent
-- Policy: global, not workspace-scoped. No secrets stored.
CREATE TABLE IF NOT EXISTS agent_llm_providers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('opencode-zen','opencode-go','openai-api','openai-codex-subscription')),
  transport TEXT NOT NULL CHECK (transport IN ('direct','private-broker')),
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('api-key','chatgpt-browser')),
  secret_alias TEXT,
  service_alias TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  eligibility TEXT NOT NULL CHECK (eligibility IN ('experimental_blocked','approved')) DEFAULT 'approved',
  runtime_status TEXT NOT NULL CHECK (runtime_status IN ('not_configured','ready','reauth_required','unavailable')) DEFAULT 'not_configured',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS agent_llm_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES agent_llm_providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('responses','messages','chat-completions','google-generative-ai')),
  privacy_class TEXT NOT NULL CHECK (privacy_class IN ('training_prohibited','training_allowed')),
  retention TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id, model_id)
);
CREATE TABLE IF NOT EXISTS agent_llm_runtime_config (
  singleton TEXT PRIMARY KEY CHECK (singleton = 'active'),
  provider_id TEXT REFERENCES agent_llm_providers(id),
  model_id TEXT,
  rollout_mode TEXT NOT NULL CHECK (rollout_mode IN ('disabled','canary','all')) DEFAULT 'disabled',
  canary_allowlist TEXT[] NOT NULL DEFAULT '{}',
  security_epoch INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT active_pair CHECK ((provider_id IS NULL AND model_id IS NULL) OR (provider_id IS NOT NULL AND model_id IS NOT NULL))
);
-- Constraint: transport/auth compatibility
ALTER TABLE agent_llm_providers ADD CONSTRAINT chk_transport_auth CHECK (
  (transport = 'direct' AND auth_mode = 'api-key') OR
  (transport = 'private-broker' AND auth_mode = 'chatgpt-browser')
);
ALTER TABLE agent_llm_providers ADD CONSTRAINT chk_secret_alias CHECK (
  (kind IN ('opencode-zen','opencode-go','openai-api') AND secret_alias IN ('OPENCODE_ZEN_API_KEY','OPENCODE_GO_API_KEY','OPENAI_API_KEY')) OR
  (kind = 'openai-codex-subscription' AND secret_alias IS NULL)
);
-- Seed: openai-api direct approved not_configured, openai-codex-subscription blocked
INSERT INTO agent_llm_providers (id, kind, transport, auth_mode, secret_alias, eligibility, runtime_status, enabled) VALUES
  ('opencode-zen','opencode-zen','direct','api-key','OPENCODE_ZEN_API_KEY','approved','not_configured', false),
  ('opencode-go','opencode-go','direct','api-key','OPENCODE_GO_API_KEY','approved','not_configured', false),
  ('openai-api','openai-api','direct','api-key','OPENAI_API_KEY','approved','not_configured', false),
  ('openai-codex-subscription','openai-codex-subscription','private-broker','chatgpt-browser', NULL,'experimental_blocked','not_configured', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO agent_llm_runtime_config (singleton, rollout_mode, security_epoch, version) VALUES ('active','disabled',1,1)
ON CONFLICT (singleton) DO NOTHING;
