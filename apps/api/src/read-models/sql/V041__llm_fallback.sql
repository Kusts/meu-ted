-- V041: Add fallback provider/model to LLM runtime config
ALTER TABLE agent_llm_runtime_config
  ADD COLUMN IF NOT EXISTS fallback_provider_id TEXT REFERENCES agent_llm_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fallback_model_id TEXT;
