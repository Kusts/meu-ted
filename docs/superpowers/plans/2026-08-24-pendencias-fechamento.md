# Pendências Fechamento 2026-08-24 Implementation Plan

> **Atualização 2026-08-26:** ver `docs/superpowers/plans/2026-08-26-pendencias-atualizacao.md` e `docs/ESTADO-E-PROXIMOS-PASSOS.md:1.4` — reconciliação 2026-08-26T17:00Z detectou regressões `cutover tsconfig` (2 FAIL) e `CVE-2026-14456` (2 HIGH) e soak P3 39.03h/48h; Task 0 nova bloqueia PR, P5 voltou a EM REVISÃO.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encerrar as pendências verificadas em 2026-08-24 — push/CI da branch `fase-0-preparo` (112 commits), deploy V032/V033 na VPS, correção de VAL.9, higiene do working tree (226 untracked) e gate P3 — deixando `pnpm docs:lint`, `typecheck`, `test` e `governance:check` verdes e o roadmap P3/P4 avançado.

**Architecture:** Sequência fail-closed: primeiro prova que o CI E2E realmente roda (único jeito de validar correções de `ESTADO-E-PROXIMOS-PASSOS.md:46-58`), depois decide flakiness com amostra limpa, depois executa mutações de produção (V032/V033) com rehearsal e rollback. Higiene de working tree roda em paralelo mas nunca deleta sem inventário. Cada tarefa produz evidência executada antes de avançar.

**Tech Stack:** pnpm 10 workspaces, Node.js 20, Fastify 5, TypeScript 5.7, PostgreSQL 16, Next.js 16 / React 19, Vitest 3.2, Playwright E2E, GitHub Actions, Hostinger VPS (`pi-stack`), Cloudflare Pages/Workers.

## Global Constraints

- `Node.js >= 20.0.0` e `pnpm >= 9.0.0` (`package.json:62`)
- `pnpm install --frozen-lockfile` deve passar sem diff em `pnpm-lock.yaml` (VAL.1)
- `pnpm docs:lint`, `pnpm typecheck`, `pnpm test`, `pnpm governance:check` obrigatórios antes de concluir qualquer tarefa (`AGENTS.md:65`)
- TDD RED -> GREEN obrigatório para todo bugfix/feature (`AGENTS.md:58`)
- Todo isolamento por `workspace_id`/`household_id` e `Idempotency-Key` preservado (`AGENTS.md:62`)
- Nunca usar `../pi-finance-web` (`AGENTS.md:4`); produção é Hostinger VPS, não pm2 local (`AGENTS.md:5`)
- Proibido `git reset --hard`, `git clean -fd`, `git checkout -- .` sem diff prévio e autorização (`AGENTS.md:70`)
- Consultar `../vps-hostinger/` antes de afirmar origem produtiva (`AGENTS.md:6`)
- Commits com staging explícito, nunca `git add -A` (`docs/superpowers/specs/2026-08-16-project-pending-closure-design.md:186`)
- Pausar antes de mutação/deploy em produção, rotação de secrets, custo externo ou remoção irreversível (`docs/superpowers/specs/2026-08-16-project-pending-closure-design.md:184`)

---

## Arquivos e responsabilidades

| Responsabilidade | Arquivo |
|---|---|
| Inventário working tree | `docs/recovery/2026-08-23-working-tree-inventory.md` (substituir por `2026-08-24`), `scripts/check-working-tree-inventory.mjs`, `scripts/check-working-tree-inventory.test.mjs` |
| Gates locais | `scripts/lint-docs.mjs`, `scripts/check-decision-governance.mjs`, `scripts/run-workspace-gate.mjs`, `scripts/security-secrets.mjs`, `scripts/security-containers.mjs` |
| CI | `.github/workflows/ci.yml`, `.github/workflows/pwa-ci.yml`, `.github/workflows/production-smoke.yml`, `apps/pwa/e2e/support/harness.ts`, `apps/pwa/e2e/fixtures/app.ts` |
| Migrações | `apps/api/src/read-models/sql/V032__legacy_card_purchases_household_id.sql`, `apps/api/src/read-models/sql/V033__card_purchase_cancellation.sql`, `apps/api/src/read-models/sql/migrate.ts`, `apps/api/tests/cards/card-purchase-cancellation-migration.test.ts`, `apps/api/tests/cards/legacy-card-purchases-migration.test.ts`, `scripts/rehearse-migration.mjs`, `scripts/cutover-check.ts` |
| Cards / cancelamento | `apps/api/src/cards/store.ts`, `apps/api/src/cards/postgres.ts`, `apps/api/src/cards/legacy-postgres.ts`, `apps/api/src/cards/in-memory.ts`, `apps/api/src/routes/cards.ts`, `apps/api/tests/routes/cards.test.ts` |
| Bridge / P3 | `apps/whatsapp-bridge/`, `.pi/extensions/financial-tools/`, `scripts/plan-legacy-retirement.mjs`, `scripts/g6-soak-status.mjs`, `docs/ROADMAP.md`, `docs/ARCHITECTURE-CURRENT.md` |
| Docs canônicos | `docs/ESTADO-E-PROXIMOS-PASSOS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE-TARGET.md`, `docs/architecture/runtime-facts.json`, `docs/goals/2026-08-16-project-pending-closure-master.md` |

---

### Task 1: Higiene e re-inventário do working tree (226 untracked)

**Files:**
- Modify: `docs/recovery/2026-08-23-working-tree-inventory.md` -> Create: `docs/recovery/2026-08-24-working-tree-inventory.md`
- Modify: `scripts/check-working-tree-inventory.mjs`
- Test: `scripts/check-working-tree-inventory.test.mjs`

**Interfaces:**
- Consumes: `git status --porcelain=v1 --untracked-files=all` (262 paths em 2026-08-23, 226 em 2026-08-24)
- Produces: `docs/recovery/2026-08-24-working-tree-inventory.md` com colunas `path|class|owner|action|rationale` e `Inventory count: 226`

- [ ] **Step 1: Capturar estado atual sem mutação**

```bash
git status --porcelain=v1 --untracked-files=all > /tmp/porcelain-2026-08-24.txt
wc -l /tmp/porcelain-2026-08-24.txt
# Expected: 226 linhas, 0 linhas com "^ M" ou "^M " (confirmado em 2026-08-24)
git diff --stat HEAD
# Expected: vazio (fase-0-preparo já commitada, só untracked resta)
```

- [ ] **Step 2: Escrever teste RED para inventário desatualizado**

```typescript
// scripts/check-working-tree-inventory.test.mjs — adicionar caso
import { test } from 'node:test';
import assert from 'node:assert';
import { checkInventory } from './check-working-tree-inventory.mjs';

test('fails when porcelain count != inventory count', () => {
  const result = checkInventory({
    porcelainPaths: Array(226).fill('a/b.txt'),
    inventoryCount: 262, // valor antigo de 2026-08-23
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /count mismatch/);
});
```

Run: `node --test scripts/check-working-tree-inventory.test.mjs`
Expected: FAIL — `count mismatch` não implementado ainda mantém ok=true

- [ ] **Step 3: Gerar novo inventário 2026-08-24**

Criar `docs/recovery/2026-08-24-working-tree-inventory.md` copiando o header de `2026-08-23` mas com:
- `Inventory count: 226`
- Tabela regenerada a partir de `/tmp/porcelain-2026-08-24.txt` com enums `class: project-wip|generated-artifact|tooling|documentation|temporary|secret-sensitive`, `action: preserve|preserve-redacted|review`, `owner: P0-P5`
- Manter rationale de `2026-08-23` para paths ainda presentes; novos paths `.opencode/opencode-loop/ses_*.json` => `project-wip|P0|preserve|Tracked project WIP is preserved exactly as found`
- Nunca incluir conteúdo de `apps/pwa/.tmp-inspect-browser-cookies.mjs` (marcar `secret-sensitive|preserve-redacted`)

- [ ] **Step 4: Implementar validação e rodar GREEN**

Atualizar `scripts/check-working-tree-inventory.mjs` para comparar `porcelain count` vs `inventory count` e validar enums.

Run: `node --test scripts/check-working-tree-inventory.test.mjs`
Expected: PASS — 2 runs consecutivos com mesma contagem 226, zero path sem owner

- [ ] **Step 5: Verificar docs lint**

Run: `pnpm docs:lint`
Expected: PASS — `Documents Checked: 8, Issues Found: 0` (já verificado em 2026-08-24)

- [ ] **Step 6: Commit com staging explícito**

```bash
git add docs/recovery/2026-08-24-working-tree-inventory.md scripts/check-working-tree-inventory.mjs scripts/check-working-tree-inventory.test.mjs
git diff --check
git commit -m "docs(recovery): regenerate working tree inventory 2026-08-24 (226 paths)"
```

---

### Task 2: Provar CI E2E roda — push fase-0-preparo + monitoramento

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/pwa-ci.yml` (apenas se gate falhar — não antecipar)
- Modify: `apps/pwa/e2e/support/harness.ts`, `apps/pwa/e2e/fixtures/app.ts` (já corrigidos em 9af6071/388f918)
- Test: `apps/pwa/e2e/specs/*.spec.ts` (121 testes)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL` exportado em `scripts/run-ci.sh` e workflow; `harness.authenticate()` como única fronteira de auth (`docs/ESTADO-E-PROXIMOS-PASSOS.md:78`)
- Produces: CI run verde no `e2e` job além do matrix gate; log com `121 tests` executados

- [ ] **Step 1: Gates locais pré-push (evidência obrigatória)**

```bash
pnpm docs:lint
# Expected: PASS (0 issues)

pnpm governance:check
# Expected: "no D01-D19 change detected"

pnpm typecheck 2>&1 | tail -20
# Expected: 0 errors (ou 5 pré-existentes em src/features/records/__tests__/ já documentados em ESTADO:66)

pnpm --filter pi-finance-api test 2>&1 | tail -20
# Expected: PASS (unit/contract sem DB externo)
```

Se qualquer gate falhar, criar entrega de remediação antes do push — não mascarar.

- [ ] **Step 2: Teste RED — simular gate quebrado (prova que harness gate funciona)**

Injetar violação temporária em branch local descartável:

```typescript
// apps/pwa/e2e/specs/budgets.spec.ts — temporário
// Adicionar fora do harness:
await page.getByRole('button', { name: 'Registrar' }).click();
```

Run: `pnpm --filter pwa test -- budgets.spec.ts 2>&1 | grep -i "invariant"`
Expected: FAIL com mensagem do gate `proíbe clicar no botão Registrar fora da fronteira` (`docs/ESTADO-E-PROXIMOS-PASSOS.md:82`). Reverter imediatamente após.

- [ ] **Step 3: Push com bypass de GH_TOKEN inválida**

```bash
env -u GH_TOKEN git push origin fase-0-preparo
# Expected: remote atualiza, 112 commits à frente de main
env -u GH_TOKEN gh run list --branch fase-0-preparo --limit 5
# Capturar run_id do workflow CI
```

- [ ] **Step 4: Monitorar CI até e2e executar**

```bash
env -u GH_TOKEN gh run watch <run_id> --exit-status
# Expected: job "e2e" passa do matrix gate (antes morria exit 9 por Node 20 + --experimental-strip-types)
env -u GH_TOKEN gh run view <run_id> --log | grep -E "e2e|matrix|NEXT_PUBLIC"
```

Critério de aceite Task 2: log mostra `e2e` executando `121 tests` (verde ou vermelho — ambos são informação útil per `ESTADO:145`). Se ainda falhar no gate, voltar ao Step 1 e corrigir `ci.yml` (`tsx --test` vs `node --experimental-strip-types` per `ESTADO:47`).

- [ ] **Step 5: Registrar evidência**

Atualizar `docs/ESTADO-E-PROXIMOS-PASSOS.md` §1.2 com resultado CI (run_id, exit codes, contagem de testes) e `docs/superpowers/goal-runs/2026-08-24-ci-e2e.md` com transcript completo.

```bash
git add docs/ESTADO-E-PROXIMOS-PASSOS.md docs/superpowers/goal-runs/2026-08-24-ci-e2e.md
git commit -m "ci(e2e): prove E2E runs in CI after harness fixes (run <id>)"
```

---

### Task 3: Corrigir VAL.9 — security:check (secrets + deps + containers)

**Files:**
- Modify: `scripts/security-secrets.mjs`, `scripts/security-containers.mjs`, `package.json` (overrides se necessário)
- Test: `scripts/security-gates.test.mjs`, `scripts/security-secrets.mjs --self-test`

**Interfaces:**
- Consumes: `pnpm security:check` = `security:secrets && audit --audit-level=critical && security:containers` (`package.json:32`)
- Produces: `pnpm security:check` exit 0; `docs/reports/2026-08-16-final-validation.md` VAL.9 = PASS

- [ ] **Step 1: Reproduzir falha exata**

```bash
pnpm security:check 2>&1 | tee /tmp/val9-2026-08-24.log
echo "EXIT:$?"
# Expected: FAIL (exit 1) como em docs/reports/2026-08-16-final-validation.md:19
cat /tmp/val9-2026-08-24.log | grep -E "CRITICAL|secret|trivy|CVE"
```

Classificar: `audit` CRITICAL vs `gitleaks` secret vs `trivy` container.

- [ ] **Step 2: Escrever teste RED para o caso encontrado**

Exemplo se for `pnpm audit`:

```typescript
// scripts/security-gates.test.mjs — adicionar
import { test } from 'node:test';
import assert from 'node:assert';
test('audit allowlist blocks CRITICAL without override', () => {
  const result = evaluateAudit({ vulnerabilities: [{ severity: 'critical', package: 'qs' }] });
  assert.equal(result.ok, false);
});
```

Run: `node --test scripts/security-gates.test.mjs`
Expected: FAIL até allowlist/override ser aplicado

- [ ] **Step 3: Implementar correção mínima**

- Se `audit` CRITICAL: atualizar `pnpm.overrides` em `package.json:49` para versão patched (ex: `qs >=6.15.2` já existe) ou `pnpm update <pkg>` + `pnpm audit` re-check
- Se `gitleaks`: mover secret para `.env` + `.gitleaks.toml` allowlist com justificativa, nunca commit de secret
- Se `trivy`: atualizar base image ou pin em `Dockerfile`/`docker-compose.yml` e re-run `node scripts/security-containers.mjs`

- [ ] **Step 4: GREEN**

```bash
pnpm security:check 2>&1 | tail -20
# Expected: PASS (exit 0)
node --test scripts/security-gates.test.mjs
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/security-secrets.mjs scripts/security-containers.mjs scripts/security-gates.test.mjs .gitleaks.toml
git diff --check
git commit -m "fix(security): resolve VAL.9 CRITICAL (audit/secrets/containers)"
```

---

### Task 4: Deploy V032/V033 na VPS com rehearsal e rollback

**Files:**
- Modify: `apps/api/src/read-models/sql/migrate.ts` (allowlist `LEGACY_SAFE_PREFIXES` já inclui V032/V033 em `ca3cbd2`)
- Test: `apps/api/tests/cards/legacy-card-purchases-migration.test.ts`, `apps/api/tests/cards/card-purchase-cancellation-migration.test.ts`, `apps/api/tests/routes/cards.test.ts`
- Tool: `scripts/rehearse-migration.mjs`, `scripts/cutover-check.ts`, `scripts/backup-db.mjs`, `scripts/restore-db.mjs`

**Interfaces:**
- Consumes: `V032__legacy_card_purchases_household_id.sql` (backfill household_id/account_id), `V033__card_purchase_cancellation.sql` (transaction_id, deleted_at, FK, índice parcial)
- Produces: VPS com `card_purchases.household_id` NOT NULL backfill + `deleted_at IS NULL` índice; `DELETE /cards/purchases/:id` 204/404/409 conforme `docs/superpowers/plans/2026-08-22-card-purchase-cancellation.md:183`

- [ ] **Step 1: Rehearsal local com DB descartável (fail-closed guard)**

```bash
# Sem DATABASE_URL_TEST deve falhar, não skip silencioso (per docs/goals/2026-08-14-pi-goal-resume.md:22)
env -u DATABASE_URL_TEST -u DB_TEST_MARKER pnpm --filter pi-finance-api exec vitest run tests/cards/legacy-card-purchases-migration.test.ts
# Expected: FAIL (fail-closed), não SKIP

# Com DB descartável (docker ou VPS staging):
DATABASE_URL_TEST=postgres://... DB_TEST_MARKER=ci node --test scripts/rehearse-migration.test.mjs
node scripts/rehearse-migration.mjs --dry-run
# Expected: mostra V032 e V033 como pending, sem mutação
```

- [ ] **Step 2: Backup pré-migração na VPS (consent gate)**

Pausar e pedir autorização explícita. Apresentar:

```bash
# Inspecionar VPS sem assumir
cat ../vps-hostinger/docs/*.md 2>/dev/null | head -40
ssh <vps> "pg_dump --schema-only | grep card_purchases"
node scripts/backup-db.mjs --vps --out /tmp/pi-backup-2026-08-24.sql
ls -lh /tmp/pi-backup-2026-08-24.sql
```

Registrar hash do backup em `docs/superpowers/goal-runs/2026-08-24-v032-v033.md`.

- [ ] **Step 3: Aplicar V032 e V033 na VPS**

```bash
ssh <vps> "cd /opt/pi-stack && pnpm --filter pi-finance-api exec tsx src/read-models/sql/migrate.ts --apply V032 V033"
# Expected: V032 backfill 0 orphans ou abort com "unresolvable household_id" (V032:53); V033 cria FK e índice parcial
ssh <vps> "psql -c '\d card_purchases'" | grep -E "household_id|transaction_id|deleted_at"
ssh <vps> "psql -c 'SELECT count(*) FROM card_purchases WHERE household_id IS NULL'"
# Expected: 0
```

- [ ] **Step 4: Verificação de contrato + IDOR**

```bash
pnpm --filter pi-finance-api exec vitest run tests/routes/cards.test.ts
# Expected: PASS — DELETE /cards/purchases/:id 204 (ativo), 204 idempotente, 404 cross-household, 409 fatura não aberta
npx tsx scripts/cutover-check.ts
# Expected: PASS (monotonic migrations, VAL.6)
```

- [ ] **Step 5: E2E isolado pós-deploy (sem SQL direto)**

Manual via API (como em `docs/superpowers/plans/2026-08-22-card-purchase-cancellation.md:183`):

```bash
# Criar cartão E2E-*, compra E2E-*, DELETE /cards/purchases/:id, GET /cards/statements/:id -> total recalculado, compra ausente
# Desativar cartão E2E-* e confirmar zero compras ativas
```

Registrar em `docs/superpowers/goal-runs/2026-08-24-v032-v033.md` e atualizar `docs/architecture/runtime-facts.json:33` se necessário.

```bash
git add docs/architecture/runtime-facts.json docs/superpowers/goal-runs/2026-08-24-v032-v033.md
git commit -m "feat(cards): deploy V032/V033 to VPS with rehearsal and IDOR check"
```

---

### Task 5: P3 — Gate T+36h e retirada controlada do bridge

**Files:**
- Modify: `scripts/plan-legacy-retirement.mjs`, `scripts/g6-soak-status.mjs`, `docs/ROADMAP.md:13`, `docs/ARCHITECTURE-CURRENT.md:36`
- Test: `scripts/plan-legacy-retirement.test.mjs`, `scripts/g6-soak-status.test.mjs`

**Interfaces:**
- Consumes: `apps/whatsapp-bridge/` + `.pi/extensions/financial-tools/` como fonte legada; `docs/ESTADO-E-PROXIMOS-PASSOS.md:37-42` como runtime facts
- Produces: `ROADMAP.md` P3 = CONCLUÍDO quando `g6-soak-status.mjs` reporta 48h sem dependência WhatsApp

- [ ] **Step 1: Inventariar o que será removido (sem remover)**

```bash
node scripts/plan-legacy-retirement.mjs --inventory | tee /tmp/legacy-inventory-2026-08-24.txt
cat /tmp/legacy-inventory-2026-08-24.txt
# Expected: lista arquivos, webhooks Evolution, secrets, referências em código/config ativos
node --test scripts/plan-legacy-retirement.test.mjs
# Expected: PASS
```

- [ ] **Step 2: Criar checkpoint de rollback antes de qualquer remoção**

```bash
git tag rollback-pre-p3-2026-08-24 HEAD
git push origin rollback-pre-p3-2026-08-24
# Documentar em docs/superpowers/goal-runs/2026-08-24-p3.md: hash, tag, como restaurar
```

Pausar para consent gate: apresentar conjunto exato a remover + rollback (`docs/superpowers/specs/2026-08-16-project-pending-closure-design.md:184`).

- [ ] **Step 3: Executar T+36h check (não remover ainda)**

```bash
node scripts/g6-soak-status.mjs --gate T+36h
# Expected: mede 36h sem tráfego WhatsApp; se falhar, registrar blocker e não avançar para T+48h
```

Atualizar `docs/ROADMAP.md` apenas quando gate passar. Não arquivar `.pi/` nem deletar `apps/whatsapp-bridge/` nesta task — apenas provar independência.

- [ ] **Step 4: Commit de evidência P3**

```bash
git add docs/superpowers/goal-runs/2026-08-24-p3.md docs/ROADMAP.md
git commit -m "docs(p3): T+36h soak check with rollback checkpoint"
```

---

### Task 6: Decidir flakiness E2E com amostra CI limpa

**Files:**
- Modify: `apps/pwa/e2e/support/harness.ts` (se hipótese confirmada), `apps/pwa/e2e/specs/*.spec.ts`
- Test: `apps/pwa/e2e/` — 8 testes instáveis conhecidos (`docs/ESTADO-E-PROXIMOS-PASSOS.md:67`)

**Interfaces:**
- Consumes: CI run da Task 2 (amostra limpa Linux); `harness.authenticate()` + `waitForLoadState`
- Produces: flakiness <1% em CI ou fix + evidência de 2 runs verdes consecutivos

- [ ] **Step 1: Coletar amostra CI**

```bash
env -u GH_TOKEN gh run view <run_id> --log > /tmp/ci-e2e-2026-08-24.log
grep -E "ACC-06|CAT-01|CAT-02|CARD-05|GOAL-02|PAY-04|SUB-05|UI-03|journal" /tmp/ci-e2e-2026-08-24.log
# Se CI verde: flakiness era artefato Windows local (ESTADO:70) — nada a fazer, documentar e encerrar task
# Se CI vermelho nos 8: seguir Step 2
```

- [ ] **Step 2: Hipótese testável — journal polling vs networkidle**

Hipótese inicial `ESTADO:154` é polling do journal; alternativa `ESTADO:157` é `waitForLoadState("networkidle")` faltando em `authenticate()`.

Escrever teste RED de timing:

```typescript
// apps/pwa/e2e/specs/flakiness-repro.spec.ts (temporário, deletar após)
import { test, expect } from '@playwright/test';
test('journal appears within 2s after create', async ({ page }) => {
  await harness.authenticate(page);
  await createExpense(page, { amount: 100 });
  await expect(page.getByTestId('journal-entry')).toBeVisible({ timeout: 2000 });
});
```

Run: `pnpm --filter pwa test -- flakiness-repro.spec.ts --repeat-each=10`
Expected: FAIL intermitente se hipótese correta

- [ ] **Step 3: Fix mínimo (um por vez)**

Opção A — aumentar polling/timeout no `harness.ts` journal waiter
Opção B — adicionar `await page.waitForLoadState('networkidle')` em `harness.authenticate()` após login

Aplicar apenas uma, re-rodar 10x, medir. Não aplicar ambas sem evidência.

- [ ] **Step 4: GREEN + remoção do repro**

```bash
pnpm --filter pwa test -- flakiness-repro.spec.ts --repeat-each=20
# Expected: 20/20 PASS
rm apps/pwa/e2e/specs/flakiness-repro.spec.ts
git add apps/pwa/e2e/support/harness.ts
git commit -m "fix(e2e): stabilize journal polling after CI sample"
```

---

### Task 7: Spike Cloudflare Access (timebox 1 dia) + decisão Fase 1

**Files:**
- Create: `scripts/access-spike/installed-pwa-harness.mjs` (já existe), `docs/superpowers/goal-runs/2026-08-24-access-spike.md`
- Modify: `docs/ESTADO-E-PROXIMOS-PASSOS.md:161`, `docs/adr/002-better-auth-fallback-after-access-spike.md`

**Interfaces:**
- Consumes: dashboard Cloudflare Access, Worker `apps/agent` com `request.cf.access`
- Produces: decisão binária — Access repassa identidade do usuário final para `apps/api` (via header/JWT) ou é descartado em favor de `better-auth` self-hosted (`ESTADO:171`)

- [ ] **Step 1: Definir critério de aceite antes do spike**

Critério (`ESTADO:165`): Worker consegue chamar `apps/api` com identidade Access do usuário final, e `apps/api` valida **o usuário**, não service token, preservando `ADR-003` (workspace server-side).

Escrever em `docs/superpowers/goal-runs/2026-08-24-access-spike.md`:

```markdown
## Critério
- PWA -> Access -> Worker (cf.access) -> API com header X-Access-Jwt
- API valida JWT Access contra JWKS Cloudflare e resolve workspace_id
- Falha se API só vê service token (quebra ADR-003)
```

- [ ] **Step 2: Executar spike (máx 1 dia)**

```bash
# Criar Access application para api.synkroo.com.br + PWA
# Worker lê request.cf.access e repassa JWT
# API valida em endpoint /auth/access-verify (temporário, deletar após spike)
node scripts/access-spike/installed-pwa-harness.mjs --verify
# Expected: PASS se identidade propaga, FAIL se só service token
```

- [ ] **Step 3: Registrar decisão e arquivar spike**

Se aprovado: Fase 1 encolhe (sem tabela `sessions`); se reprovado: manter `better-auth` e documentar fallback `better-auth -> Clerk/WorkOS -> auth próprio` (`ESTADO:169`).

Atualizar `docs/adr/002-better-auth-fallback-after-access-spike.md` e `docs/ESTADO-E-PROXIMOS-PASSOS.md:188` (marcar bloqueio 2 como resolvido).

```bash
git add docs/adr/002-better-auth-fallback-after-access-spike.md docs/ESTADO-E-PROXIMOS-PASSOS.md docs/superpowers/goal-runs/2026-08-24-access-spike.md
git commit -m "docs(adr): decide Cloudflare Access spike outcome"
```

---

### Task 8: Sincronizar docs canônicos e fechar P4/P5 parcial

**Files:**
- Modify: `docs/PRODUCT.md`, `docs/ARCHITECTURE-CURRENT.md`, `docs/ARCHITECTURE-TARGET.md`, `docs/ROADMAP.md`, `docs/architecture/runtime-facts.json`, `docs/ESTADO-E-PROXIMOS-PASSOS.md`
- Test: `pnpm docs:lint`, `pnpm governance:check`, `node scripts/generate-documentation-facts.mjs`

**Interfaces:**
- Consumes: runtime-facts.json counts (`apiRoutes:95`, `databaseMigrations:33`, `capabilitiesTotal:72` — `docs/architecture/runtime-facts.json:32`)
- Produces: `docs:lint` PASS com `Last verified: 2026-08-24`; `ROADMAP.md` com P3/P4 status correto

- [ ] **Step 1: Atualizar fatos contáveis**

```bash
node scripts/generate-documentation-facts.mjs --check
# Expected: pode falhar se counts desatualizados após V032/V033
node scripts/generate-documentation-facts.mjs --write
cat docs/architecture/runtime-facts.json
# Verificar: databaseMigrations=33, latestMigration=V033, apiRoutes atualizado
```

- [ ] **Step 2: Sincronizar ROADMAP e ESTADOS**

Atualizar `docs/ROADMAP.md:13-14`:
- P3 = CONCLUÍDO se Task 5 T+36h passou e T+48h agendado
- P4 = CONCLUÍDO quando docs lint + ADRs + archive ok
- P5 = EM PROGRESSO com VAL.9 corrigido (Task 3) e VAL.1-8 verdes

Atualizar `docs/ESTADO-E-PROXIMOS-PASSOS.md:3-4` para `Data: 2026-08-24` e `Branch: fase-0-preparo (112 commits à frente)`.

- [ ] **Step 3: Gates finais**

```bash
pnpm docs:lint
# Expected: Documents Checked: 8, Issues Found: 0
pnpm governance:check
# Expected: no D01-D19 change
pnpm typecheck
pnpm --filter pi-finance-api test && pnpm --filter pwa test 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add docs/ docs/architecture/runtime-facts.json
git diff --check
git commit -m "docs(p4): sync canonical docs to 2026-08-24 (V033, P3 gate)"
```

---

## Critérios de aceite do plano

- Task 1: `docs/recovery/2026-08-24-working-tree-inventory.md` com 226 paths, `check-working-tree-inventory.test.mjs` verde 2x, `pnpm docs:lint` PASS
- Task 2: CI run em `fase-0-preparo` mostra `e2e` além do matrix gate com 121 testes executados (log anexado)
- Task 3: `pnpm security:check` exit 0, VAL.9 PASS no próximo `run-final-validation`
- Task 4: V032/V033 aplicadas na VPS, `card_purchases.household_id` sem orphans, `DELETE /cards/purchases/:id` 204/404/409, `cutover-check.ts` PASS, backup hash registrado
- Task 5: inventário legacy + tag `rollback-pre-p3-2026-08-24` + T+36h check registrado, sem remoção prematura
- Task 6: flakiness decidida com amostra CI (artefato Windows vs fix com 20/20 PASS)
- Task 7: spike Access com critério binário documentado em ADR-002, bloqueio 2 resolvido
- Task 8: `runtime-facts.json` com `V033`, `Last verified: 2026-08-24`, `docs:lint` e `governance:check` PASS

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Push quebra `main` | CI já corrigido para `tsx --test` e `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL`; push em branch isolada `fase-0-preparo`, não `main` |
| V032 abort por orphans | `DO $$ RAISE EXCEPTION` já em `V032:50`; rehearsal + backup antes; rollback via `restore-db.mjs` |
| `GH_TOKEN` inválida bloqueia push | `env -u GH_TOKEN` documentado em `ESTADO:197` |
| Flakiness mascara bug real | Decisão só após amostra CI limpa; hipótese testável com repro 10x |
| Remoção prematura bridge | Checkpoint tag + consent gate antes de qualquer `rm` |

