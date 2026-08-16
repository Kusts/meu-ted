# P2 Runtime Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir G6.2.2–G6.2.7: shadow Agent sem interferência, bridge→Agent com identidade server-side, ownership único, freeze de writes Pi, aceite por capability e soak técnico com rollback.

**Architecture:** O bridge é o roteador de entrada durante a transição, mas a API resolve identidade/workspace e emite contexto delegado. Uma state machine explícita seleciona um único runtime para resposta e side effects. Shadow recebe cópia sanitizada, nunca credenciais de write, e emite apenas métricas de divergência.

**Tech Stack:** Cloudflare Agent Worker, Node WhatsApp bridge, Fastify API, context/delegated tokens, PostgreSQL, feature flags, Vitest.

**Agent Orchestration:** **Supervisor-Workers** — lanes shadow, identity, bridge e ownership; integração sequencial por estágios A→B→C→freeze→soak.

**Prerequisite:** Gate P1 verde.

**Spec:** `docs/superpowers/specs/2026-08-16-project-pending-closure-design.md` §5 P2.

---

## Task 1: Fechar contrato read-only do shadow

**Files:**
- Modify: `.pi/extensions/financial-tools/shadow/shadow-config.ts`
- Modify: `.pi/extensions/financial-tools/shadow/shadow-runner.ts`
- Modify: `.pi/extensions/financial-tools/shadow/shadow-read.ts`
- Modify: `.pi/extensions/financial-tools/shadow/shadow-filters.ts`
- Test: `.pi/extensions/financial-tools/shadow/{shadow-runner,shadow-read,legacy-readers}.test.ts`
- Modify: `.pi/extensions/financial-tools/api-migration.test.ts`

- [ ] **Step 1: RED — shadow não produz side effect**

Criar spy que lança se shadow invocar método HTTP diferente de GET ou qualquer adapter `kind=write`. Exigir que a resposta do Pi seja byte-equivalente com shadow on/off.

- [ ] **Step 2: RED — nenhum secret no evento**

Payload/log de shadow não pode conter headers auth, device/context token, documento, telefone completo ou descrição financeira bruta. Exigir hashes estáveis e campos allowlisted.

- [ ] **Step 3: Implementar capability allowlist**

Somente rows `kind=read`, `status=api` e `shadowEligible=true` na matriz podem executar shadow. Filtros não suportados geram `skipped_with_reason`, não query aproximada.

- [ ] **Step 4: Adversarial**

Cobrir timeout, API error, legacy error, divergência, filtro desconhecido e shadow desligado. Nenhum caso altera resposta/latência limite do owner além do budget configurado.

- [ ] **Step 5: GREEN e commit**

Run: `node --test .pi/extensions/financial-tools/shadow/*.test.ts .pi/extensions/financial-tools/api-migration.test.ts`
Expected: PASS, zero side effect.

Commit: `feat: enforce read-only agent shadow`.

## Task 2: Persistir métricas sanitizadas de divergência

**Files:**
- Create: `apps/api/src/observability/shadow-divergence.ts`
- Create: `apps/api/src/observability/shadow-divergence-postgres.ts`
- Create: `apps/api/src/read-models/sql/V029__shadow_divergence.sql`
- Create: `apps/api/src/routes/shadow-observability.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/routes/route-inventory.ts`
- Test: `apps/api/tests/observability/shadow-divergence.test.ts`
- Test: `apps/api/tests/integration/postgres-shadow-divergence.test.ts`

- [ ] **Step 1: RED — schema mínimo**

Exigir evento `{capability, outcome, requestHash, apiHash?, legacyHash?, durationMs, createdAt}` sem payload financeiro.

- [ ] **Step 2: Implementar store e route autenticada**

POST interno exige contexto delegado válido e workspace derivado do token; GET agregada owner-only retorna contagens/taxa por capability, nunca hashes individuais fora de debug local.

- [ ] **Step 3: Migration aditiva**

Tabela scoped por workspace, índice `(workspace_id, capability, created_at)` e retenção definida. Rodar somente em DB descartável nesta fase.

- [ ] **Step 4: Adversarial**

Cross-workspace 403, payload extra rejeitado, hash inválido 400, retry deduped e falha DB não interfere na resposta owner.

- [ ] **Step 5: GREEN**

Run: `pnpm --dir apps/api exec vitest run tests/observability/shadow-divergence.test.ts tests/integration/postgres-shadow-divergence.test.ts` com `DATABASE_URL_TEST` e `DB_TEST_MARKER`; expected 2 arquivos verdes, zero skip.

Commit: `feat: record sanitized shadow divergence`.

## Task 3: Resolver phone → user → workspace na API

**Files:**
- Create: `apps/api/src/auth/phone-workspace.ts`
- Create: `apps/api/src/auth/phone-workspace-postgres.ts`
- Create: `apps/api/src/routes/bridge-context.ts`
- Create: `apps/api/src/read-models/sql/V030__bridge_phone_identity.sql`
- Modify: `apps/api/src/auth/delegated-token.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/routes/route-inventory.ts`
- Test: `apps/api/tests/auth/phone-workspace.test.ts`
- Test: `apps/api/tests/routes/bridge-context.test.ts`
- Test: `apps/api/tests/integration/postgres-phone-workspace.test.ts`

- [ ] **Step 1: RED — telefone é selector não confiável**

Bridge envia telefone normalizado e provider message id; API resolve user/workspace ativo. Ausente/ambíguo/inativo retorna erro explícito, sem fallback para default household.

- [ ] **Step 2: Implementar resolver Postgres**

Mapear telefone normalizado para user ativo e membership ativa. Mais de um workspace exige selector já aprovado no vínculo do chat; nunca escolhe primeiro registro por ordem acidental.

- [ ] **Step 3: Emitir token delegado curto**

Claims: `sub`, `workspace`, `role`, `chatId`, `providerMessageId`, `requestId`, `jti`, `iat`, `exp`, `aud=agent`. TTL curto; assinatura e replay guard existentes.

- [ ] **Step 4: Adversarial**

Telefone equivalente com pontuação, dois users, membership revogada, workspace transferido, replay e provider message divergente.

- [ ] **Step 5: GREEN e commit**

Run: `pnpm --dir apps/api exec vitest run tests/auth/phone-workspace.test.ts tests/routes/bridge-context.test.ts tests/integration/postgres-phone-workspace.test.ts` com DB descartável guardado; expected 3 arquivos verdes, zero skip.

Commit: `feat: resolve bridge identity server side`.

## Task 4: Criar client bridge → Agent

**Files:**
- Create: `apps/whatsapp-bridge/src/agent-client.ts`
- Create: `apps/whatsapp-bridge/src/agent-client.test.ts`
- Modify: `apps/whatsapp-bridge/src/pi-client-factory.ts`
- Modify: `apps/whatsapp-bridge/src/webhook-handler.ts`
- Modify: `apps/whatsapp-bridge/src/env.ts`
- Test: `apps/whatsapp-bridge/src/webhook-bridge.test.ts`
- Verify: `apps/agent/src/index.ts`
- Verify: `apps/agent/tests/agent-auth.test.ts`

- [ ] **Step 1: RED — contrato do client**

Agent client só aceita `{content, delegatedToken, requestId}`; não aceita `userId`/`workspaceId` vindos do webhook. Timeout e retry preservam request id.

- [ ] **Step 2: Implementar client**

Bridge chama route de bridge-context, recebe token delegado e envia ao Agent. Headers/logs são sanitizados; retries de 429/5xx usam backoff limitado e não repetem side effect confirmado.

- [ ] **Step 3: Verificar Agent**

Agent valida assinatura/aud/exp/replay antes de resolver Durable Object e vincula conversa ao workspace claim.

- [ ] **Step 4: Adversarial**

Token expirado, audience errada, bridge timeout, Agent timeout, duplicate provider message, logout/revocation e workspace mismatch.

- [ ] **Step 5: GREEN**

Run: `pnpm --dir apps/whatsapp-bridge exec vitest run src/agent-client.test.ts src/webhook-bridge.test.ts && pnpm --dir apps/agent test`
Expected: PASS.

Commit: `feat: route whatsapp bridge messages to agent`.

## Task 5: Implementar state machine de ownership único

**Files:**
- Create: `apps/whatsapp-bridge/src/runtime-ownership.ts`
- Create: `apps/whatsapp-bridge/src/runtime-ownership.test.ts`
- Modify: `apps/whatsapp-bridge/src/webhook-handler.ts`
- Modify: `apps/whatsapp-bridge/src/env.ts`
- Create: `docs/architecture/runtime-ownership-matrix.md`

- [ ] **Step 1: RED — tabela de estados**

Estados válidos:

| stage | responder | executar writes | shadow |
|---|---|---|---|
| `pi_owner` | Pi | Pi/API tools | Agent read-only |
| `agent_owner` | Agent | Agent/API tools | Pi none |
| `agent_owner_pi_read_fallback` | Agent | Agent/API tools | Pi read-only sob fallback explícito |
| `frozen` | Agent | Agent/API tools | Pi disabled |

Qualquer combinação diferente falha no startup.

- [ ] **Step 2: Implementar parser fail-closed**

Uma única env `FINANCE_RUNTIME_STAGE` seleciona estado; flags antigas conflitantes abortam startup e são removidas após migração.

- [ ] **Step 3: Provar exactly-once response**

Teste concorrente injeta mesma mensagem em Pi/Agent e exige um único `sender.sendText` e uma única idempotency key executada.

- [ ] **Step 4: Provar rollback**

Troca `agent_owner → pi_owner` antes de nova mensagem; mensagem em voo permanece no owner original pelo request id, sem resposta dupla.

- [ ] **Step 5: GREEN e commit**

Run ownership + webhook suites duas vezes.
Expected: PASS.

Commit: `feat: enforce single runtime ownership`.

## Task 6: Congelar writes Pi e preservar read fallback

**Files:**
- Modify: `.pi/extensions/financial-tools/tools/capability-flags.ts`
- Modify: `.pi/extensions/financial-tools/tools/api-tool-helpers.ts`
- Modify: `.pi/extensions/financial-tools/generated/http-tools.ts` via generator
- Modify: `scripts/generate-agent-tools.mjs`
- Test: `.pi/extensions/financial-tools/api-migration.test.ts`
- Test: `scripts/check-write-policy.test.mjs`

- [ ] **Step 1: RED — frozen write**

Com stage `agent_owner_pi_read_fallback`, qualquer tool `kind=write` do Pi retorna erro estável `runtime.write_frozen` antes de HTTP; reads allowlisted continuam funcionando.

- [ ] **Step 2: Implementar policy gerada**

Generator incorpora `kind`; helper consulta runtime stage. Nenhuma tool decide policy individualmente.

- [ ] **Step 3: Adversarial**

Alias de write, wrapper legado, pending approval, undo e recurring automation também bloqueiam; shadow/read continuam sem side effect.

- [ ] **Step 4: GREEN**

Run migration/write-policy suites.
Expected: zero caminho Pi write executável no estado frozen.

Commit: `feat: freeze legacy pi writes`.

## Task 7: Aceite capability por capability

**Files:**
- Create: `docs/ops/g6-capability-acceptance.md`
- Create: `scripts/check-capability-acceptance.mjs`
- Create: `scripts/check-capability-acceptance.test.mjs`
- Modify: `docs/architecture/tool-capability-inventory.md`

- [ ] **Step 1: RED — nenhuma capability sem prova**

Checker exige para cada row ativa: API contract test, adapter test, authz evidence, idempotency evidence quando write, owner-stage smoke e decisão `approved|rejected`.

- [ ] **Step 2: Gerar checklist da matriz**

Não preencher `approved` automaticamente. Evidências têm command/artifact/commit; reads não exigem idempotency.

- [ ] **Step 3: Executar checks técnicos**

Preencher resultados reproduzíveis e marcar apenas `ready-for-human`.

- [ ] **Step 4: Consent gate humano**

Apresentar checklist completa e solicitar aceite capability por capability ou aceite do lote com exceções explícitas. Rejeitadas viram blocker/remediação.

- [ ] **Step 5: GREEN e commit**

Run checker; expected zero `rejected`/missing e aceite registrado.

Commit: `docs: approve runtime capability parity`.

## Task 8: Soak técnico e rollback

**Files:**
- Create: `scripts/runtime-transition-soak.mjs`
- Create: `scripts/runtime-transition-soak.test.mjs`
- Create: `docs/ops/g6-runtime-soak.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`

- [ ] **Step 1: RED — critérios do soak**

Script consome log/event fixture e falha para duplicate response/write, cross-workspace, unknown capability, error rate acima do limiar aprovado, missing heartbeat ou rollback não exercitado.

- [ ] **Step 2: Implementar coletor read-only**

Entradas: janela, stage, expected owner, métricas sanitizadas e marker de rollback. Saída JSON + resumo markdown; nenhum secret/payload bruto.

- [ ] **Step 3: Executar staging/local integrado**

Rodar `pi_owner` com shadow, trocar para `agent_owner_pi_read_fallback`, injetar corpus de reads/writes/duplicates/errors e reverter para `pi_owner`.

- [ ] **Step 4: GREEN**

Expected: um owner, zero duplicate/cross-workspace/unknown tool, rollback marker presente.

- [ ] **Step 5: Commit**

Commit: `test: exercise runtime transition soak and rollback`.

## Task 9: Gate P2

**Files:**
- Modify: `docs/architecture/runtime-ownership-matrix.md`
- Modify: `docs/ops/g6-capability-acceptance.md`
- Modify: `docs/ops/g6-runtime-soak.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`

- [ ] **Step 1:** Rodar suites shadow, bridge, Agent, ownership, freeze e acceptance checker.
- [ ] **Step 2:** Rodar integração Postgres de identity/divergence/replay com DB descartável; zero skip.
- [ ] **Step 3:** Executar soak e rollback; anexar JSON/resumo sanitizado.
- [ ] **Step 4:** Confirmar aceite humano capability por capability.
- [ ] **Step 5:** Reviewer adversarial tenta resposta/write duplo, token replay, workspace spoof, shadow side effect e rollback em mensagem em voo.
- [ ] **Step 6:** `git diff --check`, checkpoint e próximo `/goal` P3.

**Gate P2:** shadow não interfere, bridge→Agent usa identidade server-side, exatamente um runtime responde/executa, Pi writes congelados, paridade aceita e rollback exercitado.
