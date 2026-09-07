-- V044: Kimi (Moonshot) provider kind for the fixed LLM catalog.
--
-- WHAT: widens the chk_llm_provider_kind CHECK with 'kimi' and binds the
-- per-kind alias pair (kimi + KIMI_API_KEY) in chk_llm_secret_alias, mirroring
-- KIND_SECRET_ALIASES in @pi-finance/llm-contracts. Seeds the catalog row
-- (disabled, approved, not_configured) so the "Gerenciador de IA" lists Kimi
-- without an arbitrary provider create.
--
-- OPERATIONAL ROLLBACK (forward-only runner, no down migrations):
--   1. DELETE FROM agent_llm_providers WHERE id = 'kimi' (only when no model
--      or runtime row references it; otherwise 409/23503 by design).
--   2. ALTER TABLE agent_llm_providers DROP CONSTRAINT IF EXISTS
--      chk_llm_provider_kind / chk_llm_secret_alias; re-ADD the V042
--      equivalents if the old application version requires them.
--   3. Roll back application code first; constraints second.

ALTER TABLE agent_llm_providers DROP CONSTRAINT IF EXISTS chk_llm_provider_kind;
ALTER TABLE agent_llm_providers DROP CONSTRAINT IF EXISTS chk_llm_secret_alias;

ALTER TABLE agent_llm_providers ADD CONSTRAINT chk_llm_provider_kind CHECK (
  kind IN ('opencode-zen','opencode-go','openai-api','openai-codex-subscription','openai','anthropic','deepseek','qwen','glm','minimax','kimi','google','openrouter')
);

ALTER TABLE agent_llm_providers ADD CONSTRAINT chk_llm_secret_alias CHECK (
  (kind = 'opencode-zen' AND secret_alias = 'OPENCODE_ZEN_API_KEY') OR
  (kind = 'opencode-go' AND secret_alias = 'OPENCODE_GO_API_KEY') OR
  (kind = 'openai-api' AND secret_alias = 'OPENAI_API_KEY') OR
  (kind = 'openai' AND secret_alias = 'OPENAI_API_KEY') OR
  (kind = 'anthropic' AND secret_alias = 'ANTHROPIC_API_KEY') OR
  (kind = 'deepseek' AND secret_alias = 'DEEPSEEK_API_KEY') OR
  (kind = 'qwen' AND secret_alias = 'QWEN_API_KEY') OR
  (kind = 'glm' AND secret_alias = 'GLM_API_KEY') OR
  (kind = 'minimax' AND secret_alias = 'MINIMAX_API_KEY') OR
  (kind = 'kimi' AND secret_alias = 'KIMI_API_KEY') OR
  (kind = 'google' AND secret_alias = 'GOOGLE_API_KEY') OR
  (kind = 'openrouter' AND secret_alias = 'OPENROUTER_API_KEY') OR
  (kind = 'openai-codex-subscription' AND secret_alias IS NULL)
);

INSERT INTO agent_llm_providers (id, kind, transport, auth_mode, secret_alias, eligibility, runtime_status, enabled) VALUES
  ('kimi','kimi','direct','api-key','KIMI_API_KEY','approved','not_configured', false),
  ('openai','openai','direct','api-key','OPENAI_API_KEY','approved','not_configured', false)
ON CONFLICT (id) DO NOTHING;
