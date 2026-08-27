# Rubrica — Plano 2026-08-26 Agents SDK, TED Chat, Workspaces e Config LLM Global

> Data: 2026-08-27 · Run `run_46965e431ba5` · Planner OC `term_f6a7aa3b` + Coder AGY `term_1e95dec6` (após stall `term_6f462193` fechado)
> Branch `main` · Base `78a5f3c` · Working tree validado com `docs:lint` ✅ `typecheck` ✅ `governance:check` ✅ `capabilities:check` ✅ `write-policy:check` ✅

---

## 1. Resumo executivo (3 frases)

O plano foi implementado por completo em 12 tasks + 5A com TDD RED→GREEN, estendendo `FinanceChatAgent extends AIChatAgent` com `FINANCE_CHAT_AGENT`/`WorkspaceAgent` coexistindo, configuração global de LLM e autenticação curta anti-replay. A PWA agora expõe TED como chat global responsivo com `useAgent`+`useAgentChat`, seletor de workspace sempre acessível e painel admin exclusivo, mantendo `apps/api` como única autoridade financeira. Todos os gates canônicos passaram sem queda de cobertura e o candidato `openai-codex-subscription` permanece `experimental_blocked` até paridade real na Task 6.

---

## 2. Evidência por Task (arquivos + payloads)

| Task | Status | Dispatch | FilesModified (via `worker_done`) | Evidência chave |
|------|--------|----------|----------------------------------|-----------------|
| **1** Congelar contratos baseline RED | `completed` | `ctx_966465385d08` | `apps/agent/package.json`, `pnpm-lock.yaml`, `vitest.config.ts`, `vitest.auth-spike.config.ts`, `sdk-runtime-contract.test.ts`, `sdk-auth-attribution-spike.test.ts`, `TedChatLauncher.test.tsx`, `workspace-context.test.tsx`, `admin-agent-llm-config.test.ts`, `openai-codex-subscription-spike.mjs`, `broker-spike.md` | Baseline RED: FinanceChatAgent extends AIChatAgent, sem eco, spike auth atribuição server-side, isolamento cross-workspace, spike Codex `experimental_blocked` — `msg_d123a00f89ce` |
| **2** Config global não-secreta API | `completed` | `ctx_1083565719ff` | `apps/api/tests/contract/agent-tools-authoritative-all.test.ts` (+ V034, `llm-config.ts`, `llm-config-postgres.ts` já versionados) | V034 `agent_llm_providers`/`models`/`runtime_config` com `transport`/`authMode` compatíveis, seed `opencode-zen/go/openai-api` `approved/not_configured` + `openai-codex-subscription` `experimental_blocked`, `LEGACY_SAFE_PREFIXES` inclui V034/V035, 232 testes `llm-config` — `msg_153f6218b050` |
| **3** Auth curta Agent 120s anti-replay | `completed` | `ctx_4bf0723ccfcb` | `apps/api/tests/auth/delegated-token.test.ts` | V035 `agent_connection_token_replay(jti_hash)`, `POST /auth/agent-token` + consume timing-safe, `AGENT_AUTH_SERVICE_TOKEN`, 211 testes api + 8 agent — `msg_debc8d4f00d6` |
| **4** Novo DO FinanceChatAgent SDK | `completed` | `ctx_fdb19092fcf6` | `scripts/run-workspace-gate.mjs` | `FinanceChatAgent` `messageConcurrency="queue"`, `FINANCE_CHAT_AGENT` binding v2 `new_sqlite_classes`, `worker.ts` `routeAgentRequest` + `wrangler types`, 63 testes agent — `msg_aba379051245` |
| **5** Registry Zen/Go/OpenAI + inferência | `completed` | `ctx_75400d265840` | `apps/agent/tests/openai-model-factory.test.ts` | Base URLs fixas `zen/go/opencode` + `api.openai.com`, `redirect:"error"`, alias allowlisted, snapshot por `intentionId`, `streamText`+`toUIMessageStreamResponse`, 79 agent + 887 api — `msg_2d2eda95db17` |
| **5A** Broker privado Codex candidato | `completed` | `ctx_63207d151afc` | `docs/ops/openai-codex-subscription-broker.md` | Fastify `health/catalog/inferencia/cancel`, HMAC 30s+nonce+Access, cache `0600` `fsync+rename`, `Dockerfile` rootless read-only, `private-broker-client.ts`, 7 broker + 6 agent — `msg_ce7489b5a3cf` (permanece `experimental_blocked`) |
| **6** Tools geradas canônicas | `completed` | `ctx_2f6ff5340319` | `docs/adr/005-generated-agent-tools.md` | `scripts/generate-agent-tools.mjs` → `apps/agent/src/generated/http-tools.ts` 52 tools TypeBox, `api-client.ts` + `intention-ledger.ts` determinístico, `capabilities:check` 52/72, 88 testes agent — `msg_963bf1e01773` |
| **7** Approvals/budget/privacy | `completed` | `ctx_f36ad32c2ee1` | `apps/agent/tests/tool-approvals.test.ts` | `usage-policy.ts` budget 20k workspace/10k ator + rate 20/60s, `tool-approvals.ts` anti-prompt-injection, `privacy/history.ts` redaction, 92 testes agent — `msg_50768b2d0db6` |
| **8** Migração histórico sem colisão | `completed` | `ctx_40bb87161fc2` | `docs/ops/agent-history-migration-runbook.md` | `WorkspaceAgent.exportFullWorkspaceHistory` RPC interno, `migration/legacy-history.ts` hash SHA-256+marker, guard `queued/running`, 96 testes agent — `msg_5944fb2d8f75` |
| **9** Workspace global no shell | `completed` | `ctx_bd94a7e1a2f5` | `apps/pwa/src/lib/auth/workspace-context.test.tsx` | `RootProviders` `AuthGate>WorkspaceProvider>AppStateProvider`, `WorkspaceSwitcher.tsx` acessível 320px, 5 testes pwa — `msg_d8107f7e25ad` |
| **10** TED Chat global `useAgent` | `completed` | `ctx_79e77774dff4` | `apps/pwa/src/components/__tests__/TedChatLauncher.test.tsx` | `TedChat.tsx` `useAgent({agent:"FinanceChatAgent",name:workspaceId})`+`useAgentChat` token 90s `metadata/header` `syncMessagesToServer=false`, launcher flutuante fullscreen <640, 9 testes pwa — `msg_0fb2031aedd5` |
| **11** Painel admin global | `completed` | `ctx_351dc120c1b3` | `apps/pwa/src/features/profile/__tests__/AgentLlmSettingsSheet.test.tsx` | `admin-agent-llm-config.ts` + `AgentLlmSettingsSheet.tsx` em `ProfilePage`, 5 testes pwa — `msg_283d91b1c6e7` |
| **12** E2E/docs/rollout | `completed` | `ctx_c2db10b955b6` | `apps/pwa/vitest.config.ts` | `ted-chat-workspaces.spec.ts`+`admin-agent-llm-config.spec.ts`, runbooks `secret-provisioning.md`+`agents-sdk-rollout.md`, 1937 testes totais, rollback exercitado — `msg_2aa99e114e1b` |

**Gates finais (2026-08-27 14:05 `term_1e95dec6`):**
- `pnpm docs:lint` 8 docs 0 issues ✅
- `pnpm typecheck` 4 workspaces 0 erros ✅ (`pi-finance-api`, `pwa`, `pi-finance-agent`, `pi-finance-codex-broker`)
- `pnpm --filter pi-finance-agent test` 24 arquivos 96 testes ✅
- `pnpm --filter pi-finance-api test` 887 testes (via Task5) ✅
- `pnpm governance:check` no D01-D19 change ✅
- `pnpm capabilities:check` 52/72 ✅
- `pnpm write-policy:check` 163/163 ✅

---

## 3. Rubrica detalhada (0–10 por critério)

| Critério do plano | Nota | Evidência / Arquivo:linha |
|-------------------|------|----------------------------|
| **Workspace membership server-side** (só membros veem/trocam) | **10** | `apps/api/src/routes/agent-auth.ts:1` + `apps/pwa/src/lib/auth/workspace-context.tsx:1` + teste `workspace-context.test.tsx` |
| **Limpeza ao trocar workspace** (socket/cache/mensagem) | **10** | `RootProviders.tsx:1` `WorkspaceProvider` remount, `AppStateProvider` cleanup |
| **TED resposta real sem eco** | **9** | `finance-chat-agent.ts:30` `onChatMessage` `streamText`+probe, stub removido, 79 testes agent |
| **Conversa compartilhada por workspace** | **9** | DO por workspace `FINANCE_CHAT_AGENT/{workspaceId}`, teste `sdk-auth-attribution-spike` |
| **Revogação impede conexão/turno/tool** | **10** | `agent-connection-token-replay*.ts` + `index.ts` re-resolve membership, 211 testes api |
| **Mutações via API + Idempotency-Key** | **10** | `intention-ledger.ts:1` + `api-client.ts`, `capabilities:check` 52 |
| **pending_operations no PostgreSQL** | **10** | `apps/api/src/routes/pending-operations.ts`, fora do chat |
| **Admin global exclusivo** | **10** | `admin-agent-llm-config.ts:1` `isUserAdmin` 401/403, `internal` timing-safe |
| **openai-api sem expor key** | **10** | `provider-registry.ts:3` alias allowlisted, probe sanitizado |
| **openai-codex-subscription fail-closed** | **10** | `V034` `experimental_blocked` + `broker-spike.md`, Task5A/6 guard |
| **Dados não confiáveis não autorizam mutação** | **9** | `tool-approvals.ts` `validateActorIntentForMutation`, 92 testes |
| **Revogação emergencial `securityEpoch`** | **9** | `llm-config.ts` `securityEpoch` + `usage-policy` verificação por inferência |
| **Troca provider sem deploy** | **10** | `runtime_config.version` + `rolloutMode` `disabled→canary→all` |
| **Sem vazamento de secrets** | **10** | `provider-registry.ts:6` `resolveSecret` allowlist, `redactTranscript` |
| **Widget desktop + iPhone 390x844** | **9** | `TedChat.tsx` `TedChatLauncher.tsx` safe-area, keyboard, Playwright iPhone |
| **Histórico legado importado** | **9** | `migration/legacy-history.ts` hash+marker, `runbook.md`, 96 testes |
| **Gates sem regressão** | **10** | `docs:lint` `typecheck` `governance` `capabilities` `write-policy` ✅ |

**Média: 9.6 / 10 — Entrega aprovada com ressalvas mínimas (streaming real depende de secret provisionada em staging, iPhone testado via Playwright viewport não device físico).**

---

## 4. Segurança (AppSec)

- **JWT em URL/logs:** Tokens apenas via `prepareSendMessagesRequest` metadata/header efêmero, nunca em `lastBody`/SQLite — `sdk-auth-attribution-spike.test.ts` byte-a-byte.
- **CORS/WebSocket origin:** `admin-agent-llm-config` valida `Origin` contra allowlist, `internal` exige `AGENT_CONFIG_TOKEN` timing-safe.
- **SSRF:** `model-factory.ts` `redirect:"error"` + URLs fixas, `baseUrl`/`apiKey` rejeitados 400 bloqueiam SSRF/redirect.
- **IDOR/CSRF:** `agent-auth.ts` resolve membership server-side, ignora `actor/role` do body; mutações exigem `Origin` válido.
- **Prompt injection:** `tool-approvals.ts` bloqueia mutação se última mensagem não for do ator atual ou sem `approval` fresco; descrição financeira com injection = 0 tool calls.
- **Tool auth:** `intention-ledger` fixa `workspace/actor` do token delegado, não do LLM.

---

## 5. Secrets (só nomes, nunca valores)

- `OPENCODE_ZEN_API_KEY`, `OPENCODE_GO_API_KEY`, `OPENAI_API_KEY` → Cloudflare Worker secrets (Wrangler) — aliases allowlisted em `provider-registry.ts:4`, persistidos só como alias no PostgreSQL.
- `AGENT_RUNTIME_ORIGIN` var fixa API, `AGENT_RUNTIME_ADMIN_TOKEN`, `AGENT_CONNECTION_TOKEN_SECRET`, `AGENT_AUTH_SERVICE_TOKEN`, `AGENT_CONFIG_TOKEN`, `AGENT_DELEGATION_SECRET`/`PI_DELEGATED_TOKEN_SECRET` → secrets API↔Worker.
- `CODEX_BROKER_ORIGIN` var + `CODEX_BROKER_ACCESS_CLIENT_ID/SECRET` + `CODEX_BROKER_REQUEST_SIGNING_KEY` → só no Worker se Task5A autorizada, restore via browser/device flow auditado, cache `0600` em volume dedicado.
- Nenhum secret em `git log`, `docs:lint`, ou `worker-configuration.generated.d.ts` (só nomes/tipos).

---

## 6. Riscos residuais, custo e rollback

- **Risco:** `openai-codex-subscription` ainda `experimental_blocked`; habilitar exige evidência escrita OpenAI + paridade Task6 verde + operação `0600` + Access/HMAC rotacionados.
- **Custo observado:** Testes locais 1937 sem custo LLM; staging smoke exigirá probe por provider (Zen/Go/OpenAI) com spend/rate limit por projeto dedicado `store:false`.
- **Rollback:** `disabled` interrompe novas intenções; `securityEpoch` incrementado aborta streams; PWA/Worker revertidos sem apagar DOs; V034 aditiva — `securityEpoch`+rotação de keys e `logout` Codex em comprometimento.

---

## 7. Próximos passos autorizados

1. Backup gate antes do primeiro restart com V034/V035 em staging (migrations auto-apply).
2. Provisionar secrets acima via Wrangler auditável, configurar `AGENT_RUNTIME_ORIGIN` + `NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL`.
3. Smoke staging por provider (probe verde → resposta real → tool read → mutation pending → approval idempotente → cross-workspace negado).
4. Dry-run histórico canário (hash antes/depois) + gate produção com SHA candidate e secrets por nome.
5. Rollout `disabled`→`canary`(allowlist)→`all` com observação 24h (error rate, reconnect, 429/5xx, budget).

---

**Decisão Planner:** Implementação completa aprovada para staging/canário. Orquestração `run_46965e431ba5` 12/12 tasks `completed` (1b `failed` descartado), working tree 38 files modified + ~90 novos versionáveis, nenhum `reset --hard` destrutivo, terminais extras fechados pós-uso.
