# ADR-016 — Descomissionamento do WorkspaceAgent

**Status:** Aceito  
**Data:** 2026-09-16

## Contexto

O `WorkspaceAgent` legado coexiste com o `FinanceChatAgent` no runtime
Cloudflare (binding `AGENT`, `apps/agent/wrangler.jsonc:9`; rota
`/agents/workspace/*`, `apps/agent/src/worker.ts:251`), mantendo um pipeline
alternativo de conversa e histórico. Enquanto existir, toda garantia de
runtime único (INV-07) depende de disciplina, não de estrutura. O
descomissionamento exige prova de 0 dependências antes do corte e plano de
rollback antes da remoção do binding, pois Durable Objects têm estado
persistente.

## Decisão

Inventário classificado (SPEC §11.E1, validado no checkout atual):

| Dependência | Classificação | Evidência |
|---|---|---|
| `exportFullWorkspaceHistory` | export/migração | `apps/agent/src/index.ts:452` |
| `syncLegacyHistory` + `importLegacyHistory` | migração | `apps/agent/src/worker.ts:41`; `apps/agent/src/finance-chat-agent.ts:1464` |
| Binding `AGENT` + fallthrough | fallback | `apps/agent/wrangler.jsonc:9`; `apps/agent/src/worker.ts:28,55,327`; `apps/agent/src/index.ts:610` |
| Rota `/agents/workspace/*` history/export/stream/abort | histórico/stream/fallback | `apps/agent/src/worker.ts:251`; `apps/agent/src/index.ts:151-155` |
| Re-roteamento `/message` → `/rpc/chat` | fallback | `apps/agent/src/worker.ts:280-317` |
| `/message/:id/process\|retry` (410) | morto | `apps/agent/src/index.ts:159-161` |
| Helpers legados na PWA (`agentRequestUrl`/`agentHistoryUrl`) | fallback | `apps/pwa/src/lib/api/agent-client.ts:330,335` |
| Testes de compatibilidade + scaffold que trava binding/migration | histórico | `apps/agent/tests/agent-scaffold.test.ts:12-21`; `legacy-history-*` |
| DO migrations `v1`/`v2` + SQL legado | histórico (não remover sem regra da plataforma) | `apps/agent/wrangler.jsonc:14-15`; `apps/agent/migrations/0001_workspace_agent.sql` |

A prova de 0 dependências usa dois checks de arquitetura: ARCH-V4-06a
(consumidores externos = 0, pré-condição da remoção) e ARCH-V4-06b
(referências estáticas proibidas = 0 em todo o repo, com allowlist vazia ou
expirada, pós-condição da remoção). A migração histórica é idempotente
(`exportFullWorkspaceHistory` → `importLegacyHistory`), e o relatório de
workspaces ainda dependentes sai do access-log do DO.

O rollback é planejado ANTES da remoção do binding: não remover as migration
tags históricas `v1`/`v2` sem confirmar as regras da Cloudflare; deployment
progressivo; reativação = redeploy do SHA anterior com o binding `AGENT`
restaurado por configuração.

Sequência de remoção: rota `/agents/workspace/*`, `syncLegacyHistory`,
export do `WorkspaceAgent`, binding `AGENT`, `LegacyAgentStub`, testes de
compatibilidade substituídos (inclui atualizar `agent-scaffold.test.ts`),
helpers legados da PWA (`agent-client.ts:330,335`).

## Consequências

FinanceChatAgent torna-se o único runtime de conversação; referências
estáticas ao legado passam a reprovar o gate. O histórico é preservado pela
migração idempotente antes do corte, e qualquer regressão de dependência é
detectada pelos checks ARCH-V4-06a/b integrados à validação final.
