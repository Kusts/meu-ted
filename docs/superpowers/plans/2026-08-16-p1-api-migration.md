# P1 API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir G6.2.1: toda capability registrada opera 1:1 por API autenticada, com workspace/actor server-side, idempotência/auditoria e zero acesso direto a banco nos boundaries ativos.

**Architecture:** Uma matriz executável é a fonte da paridade. Capabilities migram em tracer bullets por família: contrato OpenAPI → route/handler/store → testes auth/idempotência → adapter gerado → registro Pi. Código gerado nunca é editado manualmente; facades transitórias apenas delegam HTTP.

**Tech Stack:** Fastify, TypeBox/JSON Schema, OpenAPI JSON, PostgreSQL/in-memory stores, TypeScript generator, Pi extension tools, Vitest/node:test.

**Agent Orchestration:** **Supervisor-Workers** — uma lane por capability family; somente o supervisor altera os inventários/generator compartilhados e integra cada family após revisão.

**Prerequisite:** Gate P0 verde.

**Spec:** `docs/superpowers/specs/2026-08-16-project-pending-closure-design.md` §5 P1.

---

## Task 1: Tornar a matriz de capabilities a fonte executável

**Files:**
- Modify: `docs/architecture/tool-capability-inventory.md`
- Modify: `scripts/check-tool-capability-inventory.mjs`
- Modify: `scripts/check-tool-capability-inventory.test.mjs`
- Modify: `.pi/extensions/financial-tools/index.ts`
- Verify: `apps/api/src/routes/route-inventory.ts`
- Verify: `apps/api/openapi/agent-tools.openapi.json`

- [ ] **Step 1: RED com divergências atuais**

Run: `node scripts/check-tool-capability-inventory.mjs`
Expected: non-zero listando, no mínimo, registered tools sem row (`getPendingOperationTool`, `auditLogsTool`, `undoLastActionTool`, `refreshPayableStatusTool`) e rows não registradas (`get_balance`, `get_month_summary`, pending operations, recurring purchases, refresh/auto-create templates).

- [ ] **Step 2: Expandir o schema da matriz**

Cada row deve conter:

```markdown
| tool | kind | method | path | openapiOperationId | routeInventoryId | adapterExport | approval | status |
```

`kind`: `read|write`; `approval`: `none|policy`; `status`: `planned|api|frozen|retired`.

- [ ] **Step 3: Testar unicidade e cobertura bidirecional**

O checker deve falhar para duplicata e para qualquer ausência em uma destas relações:

- registered tool → matrix;
- matrix `api` → OpenAPI operation;
- OpenAPI operation → route inventory;
- matrix `api` → generated adapter export;
- write → idempotency/approval metadata.

- [ ] **Step 4: GREEN do checker sem fingir implementação**

Rows ainda não implementadas permanecem `planned`; somente `api` exige cadeia completa. O checker passa estruturalmente, mas o Gate P1 exige zero `planned`.

Run: `node --test scripts/check-tool-capability-inventory.test.mjs && node scripts/check-tool-capability-inventory.mjs`
Expected: PASS e resumo por status.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/tool-capability-inventory.md scripts/check-tool-capability-inventory.mjs scripts/check-tool-capability-inventory.test.mjs .pi/extensions/financial-tools/index.ts
git commit -m "test: make capability inventory executable"
```

## Task 2: Travar geração OpenAPI → adapters

**Files:**
- Modify: `scripts/generate-agent-tools.mjs`
- Modify: `scripts/generate-agent-tools.test.mjs`
- Modify: `scripts/agent-tools-schema-contract.test.mjs`
- Modify: `scripts/agent-tools-authoritative-query.test.mjs`
- Generate: `.pi/extensions/financial-tools/generated/http-tools.ts`
- Verify: `apps/api/openapi/agent-tools.openapi.json`

- [ ] **Step 1: RED de determinismo**

Adicionar teste que gera duas vezes em diretórios temporários e compara bytes, nomes/export, schemas required/optional, path params, query params e body.

- [ ] **Step 2: RED de erro autoritativo**

Operation duplicada, schema sem response, path param ausente ou write sem idempotency metadata deve abortar a geração; nenhum adapter parcial é gravado.

- [ ] **Step 3: Implementar geração atômica**

Gerar para arquivo temporário, validar o módulo e renomear somente após sucesso. O runtime comum deve usar `requestPiApiJson` e derivar auth/context; adapters não recebem `householdId` confiável do payload.

- [ ] **Step 4: GREEN e snapshot**

Run:

```bash
node --test scripts/generate-agent-tools.test.mjs scripts/agent-tools-schema-contract.test.mjs scripts/agent-tools-authoritative-query.test.mjs
node scripts/generate-agent-tools.mjs
node --test scripts/generate-agent-tools.test.mjs
```

Expected: PASS; segunda geração não altera `git diff` do arquivo gerado.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-agent-tools.mjs scripts/generate-agent-tools.test.mjs scripts/agent-tools-schema-contract.test.mjs scripts/agent-tools-authoritative-query.test.mjs apps/api/openapi/agent-tools.openapi.json .pi/extensions/financial-tools/generated/http-tools.ts
git commit -m "build: generate deterministic authenticated agent tools"
```

## Task 3: Migrar pending operations, audit e undo

**Files:**
- Modify: `apps/api/openapi/agent-tools.openapi.json`
- Modify: `apps/api/src/routes/pending-operations.ts`
- Modify: `apps/api/src/routes/audit.ts`
- Create: `apps/api/src/routes/undo.ts`
- Modify: `apps/api/src/approvals/pending.ts`
- Modify: `apps/api/src/approvals/guard.ts`
- Modify: `apps/api/src/approvals/executor.ts`
- Modify: `apps/api/src/approvals/policy.ts`
- Test: `apps/api/tests/routes/pending-operations.test.ts`
- Test: `apps/api/tests/routes/audit-logs.test.ts`
- Test: `apps/api/tests/approvals/pending.test.ts`
- Test: `apps/api/tests/approvals/pending-postgres.test.ts`
- Create: `apps/api/tests/routes/undo.test.ts`
- Create: `apps/api/tests/integration/postgres-undo.test.ts`
- Replace facade: `.pi/extensions/financial-tools/tools/get_pending_operation.ts`
- Replace facade: `.pi/extensions/financial-tools/tools/confirm_pending_operation.ts`
- Replace facade: `.pi/extensions/financial-tools/tools/cancel_pending_operation.ts`
- Replace facade: `.pi/extensions/financial-tools/tools/audit_logs.ts`
- Replace facade: `.pi/extensions/financial-tools/tools/undo_last_action.ts`

- [ ] **Step 1: RED de contratos**

Exigir list/details/get/approve/reject e undo server-owned. Aprovação/undo por actor ou workspace diferente retorna 403; retry retorna resultado canônico sem executar duas vezes.

- [ ] **Step 2: Implementar routes e executor transacional**

A API resolve actor/workspace, faz claim condicional de pending operation e executa uma vez dentro da unidade transacional disponível. Undo seleciona a última ação elegível do actor/workspace e grava reversal/audit; o cliente não escolhe outro workspace.

- [ ] **Step 3: Regenerar adapters**

Adicionar operações OpenAPI, route inventory e matrix; gerar adapters. Facades Pi exportam somente adapters gerados ou wrappers de compatibilidade sem `pg`/SQL.

- [ ] **Step 4: Adversarial**

Cobrir concorrência approve/approve, approve/reject, requestor diferente, status já final, payload inválido, executor falhando no meio e retry da mesma idempotency key.

- [ ] **Step 5: GREEN**

Run:

```bash
pnpm --dir apps/api exec vitest run tests/approvals/pending.test.ts tests/approvals/pending-postgres.test.ts tests/routes/pending-operations.test.ts tests/routes/audit-logs.test.ts tests/routes/undo.test.ts tests/integration/postgres-undo.test.ts
node --test .pi/extensions/financial-tools/pending-tools.test.ts .pi/extensions/financial-tools/pending-write-adapters.test.ts
```

Expected: PASS, zero skip.

- [ ] **Step 6: Commit tracer bullet**

Stage somente arquivos listados e commit: `feat: migrate approval audit and undo tools to api`.

## Task 4: Migrar accounts, categories, transactions e transfers

**Files:**
- Modify: `apps/api/openapi/agent-tools.openapi.json`
- Modify: `apps/api/src/routes/route-inventory.ts`
- Modify: `docs/architecture/tool-capability-inventory.md`
- Modify: `apps/api/src/routes/accounts.ts`
- Modify: `apps/api/src/routes/categories.ts`
- Modify: `apps/api/src/routes/transactions.ts`
- Modify: `apps/api/src/routes/transactions-write.ts`
- Modify: `apps/api/src/routes/dashboard.ts`
- Modify: `apps/api/src/writes/store.ts`
- Modify: `apps/api/src/writes/in-memory.ts`
- Modify: `apps/api/src/writes/idempotency.ts`
- Modify: `apps/api/src/read-models/store.ts`
- Test: `apps/api/tests/routes/accounts-read.test.ts`
- Test: `apps/api/tests/routes/accounts-write.test.ts`
- Test: `apps/api/tests/routes/accounts-categories.test.ts`
- Test: `apps/api/tests/routes/categories-write.test.ts`
- Test: `apps/api/tests/routes/transactions.test.ts`
- Test: `apps/api/tests/routes/transactions-write.test.ts`
- Test: `apps/api/tests/routes/month-summary.test.ts`
- Test: `apps/api/tests/contract/idempotency-routes.test.ts`
- Test: `apps/api/tests/contract/idor-cross-household.test.ts`
- Replace facades: `list_accounts.ts`, `list_categories.ts`, `get_balance.ts`, `get_month_summary.ts`, `list_recent_transactions.ts`, `create_account.ts`, `create_category.ts`, `create_expense.ts`, `create_income.ts`, `create_transfer.ts`, `update_account.ts`, `deactivate_account.ts`, `update_category.ts`, `deactivate_category.ts`, `update_transaction.ts`, `delete_transaction.ts` under `.pi/extensions/financial-tools/tools/`

- [ ] **Step 1: RED para cada operação ainda `planned` da família.**
- [ ] **Step 2: Implementar route/store mantendo domínio server-side.**
- [ ] **Step 3: Cobrir 401, 403 cross-workspace, 409 duplicate, 422 domínio e retry idempotente.**
- [ ] **Step 4: Atualizar OpenAPI/matrix, regenerar adapters e remover SQL das facades da família.**
- [ ] **Step 5: Rodar testes focados duas vezes e os checks de idempotência/IDOR.**
- [ ] **Step 6: Commit:** `feat: migrate core ledger tools to api`.

## Task 5: Migrar payables, templates, recurring e status

**Files:**
- Modify: `apps/api/src/routes/payables.ts`
- Modify: `apps/api/src/payables/{store,in-memory,postgres}.ts`
- Modify: `apps/api/openapi/agent-tools.openapi.json`
- Modify: `apps/api/src/routes/route-inventory.ts`
- Modify: `docs/architecture/tool-capability-inventory.md`
- Test: `apps/api/tests/routes/{payables,payable-automation,payable-status-refresh,recurring-purchases}.test.ts`
- Create: `apps/api/tests/integration/postgres-payable-automation.test.ts`
- Replace facades: `create_account_payable.ts`, `list_accounts_payable.ts`, `mark_account_paid.ts`, `cancel_account_payable.ts`, `check_payable_reminders.ts`, `refresh_payable_status.ts`, `create_payable_template.ts`, `create_payable_from_template.ts`, `list_payable_templates.ts`, `auto_create_from_templates.ts`, `create_recurring_purchase.ts`, `list_recurring_purchases.ts` under `.pi/extensions/financial-tools/tools/`

- [ ] **Step 1: RED para create/list/pay/cancel/templates/from-template/auto-create/refresh/reminders/recurring.**
- [ ] **Step 2: Implementar stores com clock injetado, ownership e transações.**
- [ ] **Step 3: Cobrir concorrência pay/pay, auto-create duplicado, virada de mês, cancelada/overdue e retry.**
- [ ] **Step 4: Atualizar contratos e gerar adapters.**
- [ ] **Step 5: Rodar unit/contract e integração real com DB descartável; zero skip.**
- [ ] **Step 6: Commit:** `feat: migrate payable automation tools to api`.

## Task 6: Migrar cards, statements, installments, limits e insights

**Files:**
- Modify: `apps/api/src/routes/cards.ts`
- Modify: `apps/api/src/cards/{store,in-memory,postgres,legacy-postgres}.ts`
- Create/Modify: `apps/api/src/cards/insights.ts`
- Create/Modify: `apps/api/src/cards/limits.ts`
- Create/Modify: `apps/api/src/cards/installments.ts`
- Modify: `apps/api/openapi/agent-tools.openapi.json`
- Modify: `apps/api/src/routes/route-inventory.ts`
- Modify: `docs/architecture/tool-capability-inventory.md`
- Test: `apps/api/tests/routes/cards.test.ts`
- Test: `apps/api/tests/contract/card-store-id-or.test.ts`
- Test: `apps/api/tests/integration/card-store-idor.test.ts`
- Replace facades: `create_credit_card_account.ts`, `create_card_purchase.ts`, `create_card_installments.ts`, `pay_statement.ts`, `list_statements.ts`, `get_statement_details.ts`, `card_insights.ts`, `check_card_limits.ts`, `refresh_statements.ts`, `create_installment_plan.ts`, `list_installment_plans.ts`, `pay_installment.ts`, `list_due_installments.ts`, `check_due_soon.ts`, `prepay_installments.ts`, `simulate_prepayment.ts` under `.pi/extensions/financial-tools/tools/`

- [ ] **Step 1: RED para todas as operações cards ainda `planned`.**
- [ ] **Step 2: Implementar período de fatura, parcelas, limite e insights server-side.**
- [ ] **Step 3: Cobrir closing day, ano bissexto, 31→mês curto, pagamento parcial, limite >100%, retry e IDOR.**
- [ ] **Step 4: Atualizar contratos e gerar adapters.**
- [ ] **Step 5: Rodar testes focados e integração PostgreSQL duas vezes.**
- [ ] **Step 6: Commit:** `feat: migrate card and installment tools to api`.

## Task 7: Migrar goals, budgets, suggestions e spending insights

**Files:**
- Modify: `apps/api/src/routes/{goals,budgets,insights}.ts`
- Modify: `apps/api/src/goals/store.ts`
- Modify: `apps/api/src/goals/in-memory.ts`
- Modify: `apps/api/src/goals/postgres.ts`
- Modify: `apps/api/src/budgets/store.ts`
- Modify: `apps/api/src/budgets/in-memory.ts`
- Modify: `apps/api/src/budgets/postgres.ts`
- Modify: `apps/api/src/lib/spending-insights.ts`
- Modify: `apps/api/openapi/agent-tools.openapi.json`
- Modify: `apps/api/src/routes/route-inventory.ts`
- Modify: `docs/architecture/tool-capability-inventory.md`
- Test: `apps/api/tests/routes/{goals,budgets,insights}.test.ts`
- Replace legacy modules: `.pi/extensions/financial-tools/tools/goals-budgets.ts`, `.pi/extensions/financial-tools/tools/goals_budgets.ts`, `.pi/extensions/financial-tools/tools/spending-analysis.ts`, `.pi/extensions/financial-tools/tools/spending_insights.ts`; capability exports come from `.pi/extensions/financial-tools/generated/http-tools.ts`

- [ ] **Step 1: RED para CRUD, contribute/cancel, trends, suggestion, comparison, anomaly e income-share.**
- [ ] **Step 2: Implementar cálculos na API com datas/denominadores explícitos.**
- [ ] **Step 3: Cobrir renda zero, histórico vazio, outlier, concorrência de contribuição e cross-workspace.**
- [ ] **Step 4: Atualizar contratos e gerar adapters.**
- [ ] **Step 5: GREEN duas vezes e commit:** `feat: migrate goal budget and insight tools to api`.

## Task 8: Migrar notifications, projection, scores e price alerts

**Files:**
- Create/Modify: `apps/api/src/routes/notifications.ts`
- Create/Modify: `apps/api/src/routes/finance-analytics.ts`
- Create/Modify: `apps/api/src/notifications/service.ts`
- Create/Modify: `apps/api/src/analytics/monthly-projection.ts`
- Create/Modify: `apps/api/src/analytics/payment-score.ts`
- Create/Modify: `apps/api/src/analytics/installment-score.ts`
- Create/Modify: `apps/api/src/analytics/price-alerts.ts`
- Modify: `apps/api/openapi/agent-tools.openapi.json`
- Modify: `apps/api/src/routes/route-inventory.ts`
- Modify: `docs/architecture/tool-capability-inventory.md`
- Create: `apps/api/tests/routes/notifications.test.ts`
- Create: `apps/api/tests/routes/finance-analytics.test.ts`
- Create: `apps/api/tests/integration/postgres-notification-processing.test.ts`
- Create: `apps/api/tests/integration/postgres-score-projection.test.ts`
- Replace legacy modules: `.pi/extensions/financial-tools/tools/notifications.ts`, `.pi/extensions/financial-tools/tools/notification_tools.ts`, `.pi/extensions/financial-tools/tools/payable_template_automation.ts`, `.pi/extensions/financial-tools/tools/monthly_projection.ts`, `.pi/extensions/financial-tools/tools/payment-score.ts`, `.pi/extensions/financial-tools/tools/payment_score.ts`, `.pi/extensions/financial-tools/tools/installment-score.ts`, `.pi/extensions/financial-tools/tools/installment_score.ts`, `.pi/extensions/financial-tools/tools/price-alerts.ts`; exports passam a vir do arquivo gerado

- [ ] **Step 1: RED para settings CRUD, process/test/log, projection, payment/installment score e price alerts.**
- [ ] **Step 2: Implementar queries e side effects server-owned; WhatsApp não define workspace.**
- [ ] **Step 3: Cobrir dedupe, agrupamento, timezone, threshold boundary, histórico insuficiente e corrida do scheduler.**
- [ ] **Step 4: Atualizar contratos e gerar adapters.**
- [ ] **Step 5: GREEN:** `pnpm --dir apps/api exec vitest run tests/routes/notifications.test.ts tests/routes/finance-analytics.test.ts tests/integration/postgres-notification-processing.test.ts tests/integration/postgres-score-projection.test.ts`; depois commit `feat: migrate notification and score tools to api`.

## Task 9: Substituir registro manual e congelar boundary ativo

**Files:**
- Modify: `.pi/extensions/financial-tools/index.ts`
- Modify: `.pi/extensions/financial-tools/tools/capability-flags.ts`
- Modify: `.pi/extensions/financial-tools/tools/api-client.ts`
- Modify: `.pi/extensions/financial-tools/api-migration.test.ts`
- Modify: `scripts/check-write-policy.mjs`
- Modify: `scripts/check-pwa-command-boundary.mjs`
- Modify: `scripts/check-write-policy.test.mjs`
- Modify: `scripts/check-pwa-command-boundary.test.mjs`
- Modify: `scripts/agent-tools-schema-contract.test.mjs`

- [ ] **Step 1: RED — registro 1:1**

Exigir que o conjunto registrado seja exatamente o conjunto `status=api` da matriz e que cada export resolva em `generatedHttpTools`.

- [ ] **Step 2: Substituir registro manual**

`index.ts` registra `generatedHttpTools` como fonte principal. Wrappers especiais só permanecem com justificativa na matriz e sem DB access.

- [ ] **Step 3: Boundary transitivo**

O checker percorre imports alcançáveis de `index.ts` e rejeita `pg`, `DATABASE_URL`, SQL verbs, pool construction e imports de `shadow/**` no response/write path. Test/script/shadow aparecem em seção separada, não são silenciosamente ignorados.

- [ ] **Step 4: Fechar command-boundary PWA**

Mover chamadas listadas pelo checker para transports/endpoints/commands aprovados ou documentar exceção estritamente infra. O checker deve chegar a zero violações.

- [ ] **Step 5: GREEN**

Run:

```bash
pnpm capabilities:check
pnpm write-policy:check
pnpm boundary:check
node --test .pi/extensions/financial-tools/api-migration.test.ts
pnpm --dir .pi/extensions/financial-tools typecheck
```

Expected: todos exit 0; zero `planned`; zero boundary ativo com DB access.

- [ ] **Step 6: Commit:** `refactor: make generated http tools authoritative`.

## Task 10: Gate P1

**Files:**
- Modify: `docs/architecture/{tool-capability-inventory,pi-api-migration,write-mutator-policy}.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`

- [ ] **Step 1: Paridade**

Run: `pnpm capabilities:check`
Expected: registered = matrix = OpenAPI = route inventory = generated adapters; zero `planned`.

- [ ] **Step 2: Boundaries**

Run: `pnpm write-policy:check && pnpm boundary:check`
Expected: zero SQL/pg/DATABASE_URL/shadow no boundary ativo e zero PWA command violation.

- [ ] **Step 3: API**

Run: `pnpm --dir apps/api typecheck && pnpm --dir apps/api test`
Expected: exit 0, zero failed.

- [ ] **Step 4: Financial tools**

Run:

```bash
pnpm --dir .pi/extensions/financial-tools typecheck
node --test .pi/extensions/financial-tools/*.test.ts
```

Expected: exit 0, tools registradas chamam API, workspace não é confiado ao payload.

- [ ] **Step 5: PostgreSQL integration**

Rodar families com stores Postgres em DB descartável e marker; zero skip. Provar idempotência, transação e IDOR.

- [ ] **Step 6: Review adversarial**

Reviewer independente tenta achar tool sem route, auth depois de validation, write sem idempotency, cross-workspace e DB access transitivo.

- [ ] **Step 7: Checkpoint/handoff**

Atualizar docs arquiteturais, evidência mestre e próximo `/goal` G6.2.2. Criar checkpoint somente com Gate P1 verde.

**Gate P1:** cadeia 1:1 completa, API/financial-tools verdes e boundaries ativos sem acesso direto a banco.
