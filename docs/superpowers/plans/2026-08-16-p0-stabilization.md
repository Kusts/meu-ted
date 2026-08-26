# P0 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o working tree compreensível e obter uma baseline reproduzível para API, PWA, bridge, environments e documentação antes de iniciar G6.2.1.

**Architecture:** P0 primeiro preserva/classifica o WIP, depois corrige falhas de harness/composição sem antecipar a migração de capabilities. Cada correção nasce de uma reprodução RED focada, passa duas vezes e é seguida pelo gate do workspace.

**Tech Stack:** Git, Node.js, pnpm, TypeScript, Fastify, Vitest, PostgreSQL descartável.

**Agent Orchestration:** **Supervisor-Workers** — lanes independentes para repository state, API baseline, PWA runner, bridge e environment; um supervisor integra e executa o Gate P0.

**Spec:** `docs/superpowers/specs/2026-08-16-project-pending-closure-design.md` §5 P0.

---

## Task 1: Preservar e classificar o working tree

**Files:**
- Create: `docs/recovery/2026-08-16-working-tree-inventory.md`
- Create: `scripts/check-working-tree-inventory.mjs`
- Create: `scripts/check-working-tree-inventory.test.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: RED — contrato do inventário**

Criar teste que exige as seções `tracked-modified`, `untracked-project`, `untracked-generated`, `temporary`, `sensitive-review` e um owner P0–P5 para cada path não ignorado:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseInventory, validateInventory } from "./check-working-tree-inventory.mjs";

test("every current non-ignored path has class and owner", () => {
  const inventory = parseInventory(`docs/recovery/2026-08-16-working-tree-inventory.md`);
  const result = validateInventory(inventory, { status: process.env.STATUS_FIXTURE ?? "" });
  assert.deepEqual(result.errors, []);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test scripts/check-working-tree-inventory.test.mjs`
Expected: FAIL porque script/inventário ainda não existem.

- [ ] **Step 3: Implementar parser/validator**

O script lê `git status --porcelain=v1 --untracked-files=all`, normaliza `/`, ignora somente padrões versionados e falha para path sem linha no formato:

```markdown
| path | class | owner | action | rationale |
```

Classes permitidas: `tracked-modified`, `untracked-project`, `untracked-generated`, `temporary`, `sensitive-review`. Actions: `preserve`, `generate`, `ignore`, `delete-after-proof`, `consent-gate`.

- [ ] **Step 4: Produzir inventário sem apagar arquivos**

Run: `git status --porcelain=v1 --untracked-files=all`
Expected: snapshot completo. Classificar `.pi-subagents/`, `.tmp-*`, `NUL`, browser artifacts, generated tools, migrations, docs e código novo. Paths potencialmente sensíveis entram em `sensitive-review`; nenhum conteúdo de secret é impresso.

- [ ] **Step 5: GREEN**

Run twice: `node --test scripts/check-working-tree-inventory.test.mjs`
Expected: PASS duas vezes, mesma contagem e zero path sem owner.

- [ ] **Step 6: Commit explícito**

```bash
git add docs/recovery/2026-08-16-working-tree-inventory.md scripts/check-working-tree-inventory.mjs scripts/check-working-tree-inventory.test.mjs .gitignore
git commit -m "chore: inventory pending working tree"
```

## Task 2: Restaurar composição 1:1 das rotas de teste

**Files:**
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/tests/test-app.ts`
- Modify: `apps/api/tests/routes/route-authz-inventory.test.ts`
- Test: `apps/api/tests/routes/audit-logs.test.ts`
- Test: `apps/api/tests/auth/workspaces-http.test.ts`

- [ ] **Step 1: Reproduzir o 404 RED**

Run:

```bash
pnpm --dir apps/api exec vitest run \
  tests/routes/audit-logs.test.ts \
  tests/routes/route-authz-inventory.test.ts \
  tests/auth/workspaces-http.test.ts
```

Expected: FAIL com rotas inventariadas retornando 404.

- [ ] **Step 2: Escrever invariante de composição**

Adicionar teste que compara `routeInventory` com `app.printRoutes()` após `buildTestApp().app.ready()`, excluindo apenas routes declaradas `public` ou `intentionally-disabled` pelo próprio inventário. A mensagem deve listar `METHOD path` ausentes.

- [ ] **Step 3: Registrar módulos ausentes**

Em `registerRoutes`, registrar audit, invites/workspaces/ownership/reconnect e demais módulos já implementados, recebendo stores/resolvers por `RouteDeps`. Em `buildTestApp`, fornecer doubles in-memory explícitos. Não criar lógica financeira dentro do composition root.

- [ ] **Step 4: GREEN focado**

Run o comando do Step 1 duas vezes.
Expected: três arquivos passam; nenhuma rota inventariada retorna 404.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/index.ts apps/api/tests/test-app.ts apps/api/tests/routes/route-authz-inventory.test.ts apps/api/tests/routes/audit-logs.test.ts apps/api/tests/auth/workspaces-http.test.ts
git commit -m "fix: compose inventoried api routes in tests"
```

## Task 3: Garantir auth/authz antes de validação e dependências

**Files:**
- Modify: `apps/api/src/routes/route-handlers.ts`
- Modify: route modules que ainda validam body/dependency antes de auth
- Modify: `apps/api/tests/routes/route-authz-inventory.test.ts`
- Test: `apps/api/tests/routes/workspace-membership-access.test.ts`

- [ ] **Step 1: RED parametrizado**

Manter a enumeração do inventário e exigir:

```ts
expect(unauthenticated.statusCode).toBe(401);
expect(nonMember.statusCode).toBe(403);
```

O payload propositalmente inválido não pode mudar o resultado de auth.

- [ ] **Step 2: Rodar RED**

Run: `pnpm --dir apps/api exec vitest run tests/routes/route-authz-inventory.test.ts tests/routes/workspace-membership-access.test.ts`
Expected: FAIL atual com 400/404/503 onde 401/403 são exigidos.

- [ ] **Step 3: Centralizar preHandlers**

Criar/reusar helpers de handler que executem na ordem: autenticar → resolver membership/role → validar selector de workspace → validar payload → acessar dependências. Schemas Fastify que antecipem 400 devem ser movidos para validação dentro do handler protegido quando a route for privada.

- [ ] **Step 4: Adversarial**

Cobrir body vazio, UUID inválido, workspace divergente, role `member` em owner-only e dependência opcional ausente. Todos devem respeitar precedência 401/403 antes de 400/503.

- [ ] **Step 5: GREEN e commit**

Run duas vezes: `pnpm --dir apps/api exec vitest run tests/routes/route-authz-inventory.test.ts tests/routes/workspace-membership-access.test.ts`
Expected: PASS.

```bash
git add apps/api/src/routes apps/api/tests/routes/route-authz-inventory.test.ts apps/api/tests/routes/workspace-membership-access.test.ts
git commit -m "fix: enforce api auth precedence"
```

## Task 4: Fixar relógio e stores da baseline API

**Files:**
- Modify: `apps/api/tests/fixtures/dates.ts`
- Modify: `apps/api/tests/test-app.ts`
- Modify: `apps/api/src/budgets/in-memory.ts`
- Modify: `apps/api/src/payables/in-memory.ts`
- Modify: `apps/api/src/routes/dashboard.ts`
- Test: `apps/api/tests/routes/budgets.test.ts`
- Test: `apps/api/tests/routes/dashboard.test.ts`
- Test: `apps/api/tests/routes/payables.test.ts`

- [ ] **Step 1: RED com relógio injetado**

Adicionar a `buildTestApp` opção nomeada `clock?: () => Date`; testes usam `() => new Date("2026-06-15T12:00:00Z")`. Proibir descoberta de dependência por `...optional: unknown[]`; migrar para objeto `TestAppOptions` tipado.

- [ ] **Step 2: Rodar RED**

Run: `pnpm --dir apps/api exec vitest run tests/routes/budgets.test.ts tests/routes/dashboard.test.ts tests/routes/payables.test.ts`
Expected: FAIL mostrando agregados zero/recorrência ausente antes da injeção.

- [ ] **Step 3: Propagar clock**

Stores e handlers que calculam mês, vencimento, recorrência e status recebem `clock`; nenhum teste altera relógio global. Helpers `thisMonth/lastMonth/nextMonth/today` aceitam `now: Date` opcional.

- [ ] **Step 4: Adversarial temporal**

Cobrir virada de mês/ano, dia 31→mês curto, timezone São Paulo e pagamento recorrente sem duplicação.

- [ ] **Step 5: GREEN e commit**

Run duas vezes o comando do Step 2.
Expected: PASS com totais determinísticos.

```bash
git add apps/api/tests/fixtures/dates.ts apps/api/tests/test-app.ts apps/api/src/budgets/in-memory.ts apps/api/src/payables/in-memory.ts apps/api/src/routes/dashboard.ts apps/api/tests/routes/budgets.test.ts apps/api/tests/routes/dashboard.test.ts apps/api/tests/routes/payables.test.ts
git commit -m "test: make api time-dependent baseline deterministic"
```

## Task 5: Estabilizar o runner Vitest da PWA por experimento

**Files:**
- Modify: `apps/pwa/vitest.config.ts`
- Create: `scripts/pwa-vitest-runner-benchmark.mjs`
- Create: `scripts/pwa-vitest-runner-benchmark.test.mjs`
- Modify: `apps/pwa/package.json`

- [ ] **Step 1: Registrar baseline RED**

Run: `pnpm --dir apps/pwa test`
Expected atual: 348 testes passam, mas workers falham ao iniciar/expiram.

- [ ] **Step 2: Criar benchmark de duas configurações**

O script executa em processo filho:

- A: `pool=threads`, `maxWorkers=2`, `fileParallelism=true`;
- B: `pool=threads`, `maxWorkers=1`, `fileParallelism=false`.

Cada opção roda duas vezes, registra exit code/duração e escolhe apenas configuração com duas passagens. Se ambas passarem, escolhe a mediana mais rápida; se nenhuma passar, o script falha.

- [ ] **Step 3: Testar o seletor**

Run: `node --test scripts/pwa-vitest-runner-benchmark.test.mjs`
Expected: PASS com fixtures de subprocesso verde, instável e timeout.

- [ ] **Step 4: Executar experimento real**

Run: `node scripts/pwa-vitest-runner-benchmark.mjs`
Expected: relatório A/B e uma configuração estável selecionada.

- [ ] **Step 5: Aplicar somente o resultado vencedor**

Configurar `maxWorkers`/`fileParallelism` em `apps/pwa/vitest.config.ts` e adicionar `test:stable` ao package da PWA. Não trocar pool por intuição.

- [ ] **Step 6: GREEN**

Run twice: `pnpm --dir apps/pwa test:stable`
Expected: exit 0 duas vezes, zero worker timeout.

- [ ] **Step 7: Commit**

```bash
git add apps/pwa/vitest.config.ts apps/pwa/package.json scripts/pwa-vitest-runner-benchmark.mjs scripts/pwa-vitest-runner-benchmark.test.mjs
git commit -m "test: stabilize pwa vitest workers"
```

## Task 6: Corrigir o typecheck do bridge sem cast inseguro

**Files:**
- Modify: `apps/whatsapp-bridge/src/webhook-bridge.test.ts`

- [ ] **Step 1: RED**

Run: `pnpm --dir apps/whatsapp-bridge typecheck`
Expected: TS2345 em `webhook-bridge.test.ts:500` (`Buffer` não atribuível a `string`).

- [ ] **Step 2: Implementar conversão explícita**

Alterar somente o parse do payload JWT:

```ts
const tokenPayload = JSON.parse(
  Buffer.from(call.context.contextToken!.split(".")[1]!, "base64url").toString("utf8"),
) as Record<string, unknown>;
```

- [ ] **Step 3: GREEN e teste focado**

Run:

```bash
pnpm --dir apps/whatsapp-bridge typecheck
pnpm --dir apps/whatsapp-bridge exec vitest run src/webhook-bridge.test.ts
```

Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/whatsapp-bridge/src/webhook-bridge.test.ts
git commit -m "test: decode bridge context token as utf8"
```

## Task 7: Reconciliar G6.1.2 por integração real

**Files:**
- Modify: `docs/goals/2026-08-14-pi-goal-resume.md`
- Modify: `docs/superpowers/specs/2026-08-14-master-goal-g6-g7-validation-design.md`
- Modify: `docs/superpowers/goal-runs/G6.1.2.md` (create if absent)
- Verify: `scripts/require-reminder-integration-env.mjs`
- Verify: `apps/api/tests/integration/postgres-reminder-dedupe.test.ts`
- Verify: `apps/api/tests/integration/postgres-reminder-lock.test.ts`

- [ ] **Step 1: Guard fail-closed**

Run without env: `pnpm --dir apps/api test:integration`
Expected: non-zero com mensagem estável exigindo `DATABASE_URL_TEST` e `DB_TEST_MARKER`; zero skip silencioso.

- [ ] **Step 2: Executar PostgreSQL descartável**

Com URL/marker do ambiente descartável, sem imprimir credenciais:

```bash
pnpm --dir apps/api test:integration
```

Expected: 2 arquivos, 3 testes, zero skip; dedupe durável e advisory lock real passam.

- [ ] **Step 3: Resolver conflito documental**

Se Step 2 passar, marcar G6.1.2 concluído nas duas fontes e anexar output sanitizado no goal-run. Se falhar, manter `blocked` com causa e não permitir P1 assumir conclusão.

- [ ] **Step 4: Commit**

```bash
git add docs/goals/2026-08-14-pi-goal-resume.md docs/superpowers/specs/2026-08-14-master-goal-g6-g7-validation-design.md docs/superpowers/goal-runs/G6.1.2.md
git commit -m "docs: reconcile reminder scheduler evidence"
```

## Task 8: Criar interface root dos gates

**Files:**
- Modify: `package.json`
- Modify: `apps/api/package.json`
- Modify: `scripts/check-tool-capability-inventory.mjs`
- Modify: `scripts/check-write-policy.mjs`
- Modify: `scripts/check-pwa-command-boundary.mjs`
- Modify: `scripts/security-secrets.mjs`
- Modify: `scripts/security-containers.mjs`
- Modify: `scripts/production-smoke-contract.test.mjs`
- Test: `scripts/root-scripts.test.mjs`
- Test: `scripts/root-ci-workflow.test.mjs`

- [ ] **Step 1: RED dos aliases obrigatórios**

Exigir scripts root: `lint`, `typecheck`, `test:unit`, `test:coverage`, `test:integration`, `test:e2e`, `build:all`, `security:check`, `capabilities:check`, `write-policy:check`, `boundary:check`, `production:smoke:contract`.

Run: `node --test scripts/root-scripts.test.mjs scripts/root-ci-workflow.test.mjs`
Expected: FAIL listando aliases ausentes/inconsistentes.

- [ ] **Step 2: Implementar composição explícita**

Cada alias chama workspaces/scripts existentes; integração permanece fail-closed; `security:check` compõe secrets, deps e containers sem mascarar exit codes. Não adicionar deploy.

- [ ] **Step 3: GREEN**

Run twice: `node --test scripts/root-scripts.test.mjs scripts/root-ci-workflow.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json apps/api/package.json pnpm-lock.yaml scripts/root-scripts.test.mjs scripts/root-ci-workflow.test.mjs
git commit -m "build: expose canonical project gates"
```

## Task 9: Gate P0

**Files:**
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`

- [ ] **Step 1: Estado do repositório**

Run:

```bash
node --test scripts/check-working-tree-inventory.test.mjs
node scripts/check-working-tree-inventory.mjs
```

Expected: zero path sem class/owner; nenhuma exclusão sensível automática.

- [ ] **Step 2: API baseline**

Run: `pnpm --dir apps/api test`
Expected: exit 0, zero failed, skips apenas de integração explicitamente separada.

- [ ] **Step 3: PWA baseline**

Run twice: `pnpm --dir apps/pwa test:stable`
Expected: exit 0 duas vezes, zero worker timeout.

- [ ] **Step 4: Typecheck dos quatro workspaces**

Run:

```bash
pnpm --dir apps/api typecheck
pnpm --dir apps/pwa typecheck
pnpm --dir apps/agent typecheck
pnpm --dir apps/whatsapp-bridge typecheck
```

Expected: quatro exits 0.

- [ ] **Step 5: Guards estruturais informativos**

Run:

```bash
node scripts/check-api-route-inventory.mjs
node scripts/check-tool-capability-inventory.mjs
node scripts/check-pwa-command-boundary.mjs
```

Expected: route inventory verde. Capability e command-boundary podem permanecer vermelhos somente se cada gap estiver atribuído a uma entrega P1/PWA explícita no `pi-tasks`; nenhum gap desconhecido.

- [ ] **Step 6: Environment baseline**

Confirmar banco descartável guardado, comandos CI/security localizados e topologia de produção documentada a partir de `../vps-hostinger/`, sem imprimir secrets.

- [ ] **Step 7: Review e checkpoint**

Executar revisão independente do diff P0 e `git diff --check`. Anexar outputs ao goal-run, criar checkpoint e atualizar o próximo `/goal` para a primeira entrega P1.

**Gate P0:** working tree classificado, API/PWA/typechecks verdes, G6.1.2 explícito e nenhum blocker desconhecido para P1.
