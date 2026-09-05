-- V042: Align LLM provider kinds/aliases with the executable agent registry.
--
-- WHAT: expands agent_llm_providers kind/eligibility CHECKs to the kinds the
-- agent can execute end to end (see apps/agent/src/llm/provider-registry.ts
-- FIXED_ENDPOINTS + REGISTRY_UNSUPPORTED_KINDS), widens chk_secret_alias to
-- the contract allowlist, and adds plain (NO ACTION) FKs from
-- agent_llm_runtime_config.model_id / fallback_model_id to
-- agent_llm_models(id). NO ACTION on purpose: SET NULL on model_id alone
-- would violate the V034 active_pair CHECK and silently half-null the active
-- pair; blocking bypass deletes (23503, surfaced as 409 runtime_in_use)
-- matches the existing provider_id FK. fallback_provider_id already
-- references agent_llm_providers(id) ON DELETE SET NULL since V041
-- (confirmed, not duplicated).
--
-- Per-kind secret mapping (KIND_SECRET_ALIASES) stays enforced at the route
-- layer (validateProvider, Fase 1a); the DB keeps the global allowlist so
-- this migration can never fail on legacy rows that paired an old kind with
-- a different allowlisted alias.
--
-- 'openai-codex-subscription' is RETAINED in the kind CHECK (it already
-- exists via V034 seeds): it is not newly released — activation stays
-- blocked by eligibility=experimental_blocked and the agent documents it as
-- registry-unsupported (private-broker transport, no direct execution path).
--
-- PREFLIGHT (idempotent, runs first): orphan runtime/fallback references are
-- nulled so the new FKs validate. The active pair is nulled together to
-- respect the active_pair CHECK from V034.
--
-- OPERATIONAL ROLLBACK (forward-only runner, no down migrations):
--   1. Restore agent_llm_runtime_config nulled references from the pre-deploy
--      pg_dump (backfill is lossy by design). Take the dump BEFORE deploying.
--   2. ALTER TABLE agent_llm_providers DROP CONSTRAINT IF EXISTS
--      chk_llm_provider_kind, chk_llm_provider_eligibility, chk_llm_secret_alias;
--      re-ADD the V034 equivalents if the old application version requires them.
--   3. ALTER TABLE agent_llm_runtime_config DROP CONSTRAINT IF EXISTS
--      fk_llm_runtime_model, fk_llm_runtime_fallback_model.
--   4. Roll back application code to the pre-V042 release first; constraints
--      second. Never roll back schema while new code is serving traffic.

-- (1) Preflight: null orphan references (idempotent).
UPDATE agent_llm_runtime_config SET provider_id = NULL, model_id = NULL
WHERE singleton = 'active'
  AND (
    (provider_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM agent_llm_providers p WHERE p.id = agent_llm_runtime_config.provider_id))
    OR
    (model_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM agent_llm_models m WHERE m.id = agent_llm_runtime_config.model_id))
  );

UPDATE agent_llm_runtime_config SET fallback_provider_id = NULL
WHERE singleton = 'active'
  AND fallback_provider_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_llm_providers p WHERE p.id = agent_llm_runtime_config.fallback_provider_id);

UPDATE agent_llm_runtime_config SET fallback_model_id = NULL
WHERE singleton = 'active'
  AND fallback_model_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_llm_models m WHERE m.id = agent_llm_runtime_config.fallback_model_id);

-- (2) Replace the anonymous V034 column CHECKs with named, widened ones.
ALTER TABLE agent_llm_providers DROP CONSTRAINT IF EXISTS agent_llm_providers_kind_check;
ALTER TABLE agent_llm_providers DROP CONSTRAINT IF EXISTS agent_llm_providers_eligibility_check;
ALTER TABLE agent_llm_providers DROP CONSTRAINT IF EXISTS chk_secret_alias;

ALTER TABLE agent_llm_providers ADD CONSTRAINT chk_llm_provider_kind CHECK (
  kind IN ('opencode-zen','opencode-go','openai-api','openai-codex-subscription','openai','anthropic','deepseek','qwen','glm','minimax','google','openrouter')
);

ALTER TABLE agent_llm_providers ADD CONSTRAINT chk_llm_provider_eligibility CHECK (
  eligibility IN ('approved','candidate','experimental_blocked')
);

ALTER TABLE agent_llm_providers ADD CONSTRAINT chk_llm_secret_alias CHECK (
  (kind <> 'openai-codex-subscription' AND secret_alias IN ('OPENCODE_ZEN_API_KEY','OPENCODE_GO_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','QWEN_API_KEY','GLM_API_KEY','MINIMAX_API_KEY','GOOGLE_API_KEY','OPENROUTER_API_KEY')) OR
  (kind = 'openai-codex-subscription' AND secret_alias IS NULL)
);

-- (3) FKs for model references (provider FKs already exist since V034/V041).
-- NO ACTION on delete: bypass deletes are rejected (23503), never half-nulled.
ALTER TABLE agent_llm_runtime_config
  ADD CONSTRAINT fk_llm_runtime_model FOREIGN KEY (model_id) REFERENCES agent_llm_models(id),
  ADD CONSTRAINT fk_llm_runtime_fallback_model FOREIGN KEY (fallback_model_id) REFERENCES agent_llm_models(id);
