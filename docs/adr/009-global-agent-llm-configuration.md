# ADR-009: Configuração Global de LLM para o Agent TED

**Status:** accepted
**Date:** 2026-08-26
**Decision:** D06

## Contexto
O plano `2026-08-26-agents-sdk-chat-workspaces-llm-config` exige chat TED global sobre Cloudflare Agents SDK com uma conversa por workspace e seleção de provider/modelo controlada exclusivamente por administradores globais. A configuração não pode ser per-workspace nem BYOK, e segredos não podem ser persistidos no PostgreSQL.

## Decisão
1. Configuração de runtime LLM é policy de plataforma global: tabelas `agent_llm_providers`, `agent_llm_models` e `agent_llm_runtime_config` (singleton `active`) sem `workspace_id`.
2. Providers permitem `opencode-zen`, `opencode-go`, `openai-api` (direct/api-key) e candidato `openai-codex-subscription` (private-broker/chatgpt-browser, `experimental_blocked` até Task 5A/Task 6 provarem gates).
3. Cada modelo declara `protocol` (`responses|messages|chat-completions|google-generative-ai`) e `privacy_class`; modelos sem classificação ou com `training_allowed` são bloqueados para ativação.
4. Segredos (`OPENCODE_ZEN_API_KEY`, `OPENCODE_GO_API_KEY`, `OPENAI_API_KEY`) são provisionados como Cloudflare Secrets; API persiste apenas aliases allowlisted. Credenciais ChatGPT/Codex nunca entram em Cloudflare/PWA/PostgreSQL/logs.
5. Rollout `disabled|canary|all` com `securityEpoch` e `canary_allowlist`; alteração ativa usa compare-and-swap de `version` e afeta apenas a próxima intenção.
6. Esta decisão preserva ADR-003 para identidade server-side; ADR-005 será atualizada na Task 6 quando o output gerado migrar para `apps/agent/src/generated/http-tools.ts`.

## Consequências
- Admin global definido por `ADMIN_EMAILS` é o único ator que pode sincronizar catálogo, habilitar e ativar provider/modelo.
- `AGENT_RUNTIME_ORIGIN` e `AGENT_RUNTIME_ADMIN_TOKEN` conectam API↔Worker para catálogo/probe sem expor API keys.
