-- V042: Align LLM provider kinds/aliases with the executable agent registry.
--
-- WHAT: expands agent_llm_providers kind/eligibility CHECKs to the kinds the
-- agent can execute end to end (see apps/agent/src/llm/provider-registry.ts
-- FIXED_ENDPOINTS + REGISTRY_UNSUPPORTED_KINDS), widens chk_secret_alias to
-- the contract allowlist, and enforces plain (NO ACTION) FKs on ALL FOUR
-- runtime reference columns (provider_id, model_id, fallback_provider_id,
-- fallback_model_id).
--
-- D1 RATIONALE (Fase 1b-FIX): single NO ACTION policy on all four columns
-- as a DB backstop; protection always happens in the API via 409
-- agent.runtime_in_use (Fase 0 policy). SET NULL was rejected because
-- nulling model_id alone violates the V034 active_pair CHECK and silently
-- half-nulls the active pair, and nulling fallback refs silently drops
-- contingency config. Bypass deletes are therefore rejected (23503),
-- matching the pre-existing provider_id FK from V034. In particular V041
-- created fallback_provider_id with ON DELETE SET NULL — V042 drops that
-- auto-named constraint and re-adds it as NO ACTION (see section 3).
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
--      fk_llm_runtime_model, fk_llm_runtime_fallback_model,
--      fk_llm_runtime_fallback_provider; optionally re-ADD the V041
--      fallback_provider_id REFERENCES ... ON DELETE SET NULL behavior if
--      the old application version depends on it.
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

-- (3) FKs for model references, plus D1 alignment of fallback_provider_id
-- from V041's ON DELETE SET NULL to the single NO ACTION policy.
-- NO ACTION on delete: bypass deletes are rejected (23503), never half-nulled.
-- The V041 inline REFERENCES got the deterministic auto-name
-- agent_llm_runtime_config_fallback_provider_id_fkey.
ALTER TABLE agent_llm_runtime_config
  DROP CONSTRAINT IF EXISTS agent_llm_runtime_config_fallback_provider_id_fkey;
ALTER TABLE agent_llm_runtime_config
  ADD CONSTRAINT fk_llm_runtime_model FOREIGN KEY (model_id) REFERENCES agent_llm_models(id),
  ADD CONSTRAINT fk_llm_runtime_fallback_model FOREIGN KEY (fallback_model_id) REFERENCES agent_llm_models(id),
  ADD CONSTRAINT fk_llm_runtime_fallback_provider FOREIGN KEY (fallback_provider_id) REFERENCES agent_llm_providers(id);
