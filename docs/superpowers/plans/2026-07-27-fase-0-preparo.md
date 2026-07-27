# Fase 0 — Preparo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir o risco das Fases 1–4 sem mudar nada do comportamento visível em produção — centralizar o setup de auth dos E2E, tirar o lembrete semanal da máquina de desenvolvimento, e resolver a incógnita de autenticação.

**Architecture:** Quatro frentes independentes. Tarefas 1–3 consolidam ~35 linhas duplicadas por spec E2E em um único `harness.ts`, para que a troca de auth da Fase 1 toque um arquivo em vez de 18. Tarefa 4 move o lembrete semanal para fora do PC. Tarefas 5–6 produzem decisão documentada e fechamento, não código de produção.

**Tech Stack:** Playwright, Vitest, TypeScript, PM2, cloudflared, Fastify, Cloudflare Access.

**Spec:** `docs/superpowers/specs/2026-07-27-pwa-centralizado-workspaces-design.md` (§6.1)

---

## Escopo

Cobre os itens 0.1, 0.2 e 0.4 de §6.1 da spec.

**Item 0.3 (portar as 8 features do `.pi` para `apps/api`) NÃO está aqui.** São 8 features
independentes com TDD próprio; vira `docs/superpowers/plans/2026-07-27-fase-0-port-tools.md`.
Misturar produziria um plano inexecutável.

**Nada nesta fase muda comportamento visível.** Todo commit deve manter os 40 specs E2E verdes.

---

## Pré-requisito — subir os serviços de E2E uma vez

A suíte E2E precisa de **três** serviços. `apps/pwa/e2e/run-ci.sh` sobe todos, mas roda
`pnpm build:next:cloudflare` a cada execução — inviável para as 18 iterações da Task 3.

Suba-os **uma vez** em terminais separados e deixe rodando durante toda a Task 3:

> **`NEXT_PUBLIC_PI_FINANCE_API_BASE_URL` é obrigatória — no build e no start.**
> `apps/pwa/src/lib/api/client.ts:13-22`: sem ela, e fora do host de produção, `baseUrl()`
> retorna `undefined` → `isApiConfigured()` é `false` → o PWA sobe em **modo mock**, nunca
> mostra a tela de registro, e **toda** a suíte falha com `getByRole('button', { name:
> 'Registrar' })` não encontrado (timeout de 15s por teste).
>
> Verificado: sem a env, 121 testes falham; com a env, `accounts.spec.ts` passa 6/6 em 10,8s.
> Por ser `NEXT_PUBLIC_*`, o valor é embutido em build time — **rebuildar** não basta reiniciar.
>
> **E o rebuild precisa ser limpo: `rm -rf .next` antes.** Observado em 2026-07-27: um build
> incremental por cima de um `.next` gerado sem a variável mantém chunks antigos, e a suíte volta
> ao modo mock mesmo com a env exportada — `accounts.spec.ts` passou 6/6, regrediu para 0/6 após
> um rebuild incremental, e voltou a 6/6 só depois de `rm -rf .next`. Sintoma de diagnóstico:
> o fixture API não recebe requisição nenhuma.
>
> `apps/pwa/e2e/run-ci.sh` e `.github/workflows/pwa-ci.yml` **não setam essa variável**. Ver
> Task 0 abaixo.

```bash
export NEXT_PUBLIC_PI_FINANCE_API_BASE_URL=http://127.0.0.1:4010

# Terminal 1 — fixture API (:4010)
cd apps/pwa && pnpm exec tsx e2e/fixture-api/server.ts

# Terminal 2 — build uma vez, depois Next (:3001)
cd apps/pwa && NEXT_PUBLIC_PI_FINANCE_API_BASE_URL=http://127.0.0.1:4010 \
  pnpm build:next:cloudflare && \
  NEXT_PUBLIC_PI_FINANCE_API_BASE_URL=http://127.0.0.1:4010 pnpm exec next start --port 3001

# Terminal 3 — SW harness (:3000, proxia para :3001)
cd apps/pwa && pnpm exec tsx e2e/sw-harness/server.ts
```

Confirme antes de começar:

```bash
curl -sf http://127.0.0.1:4010/__e2e/health && curl -sf http://127.0.0.1:3001/ && curl -sf http://127.0.0.1:3000/ && echo OK
```
Expected: `OK`

Rebuilde o Next (Terminal 2) apenas se tocar em código de aplicação — a Task 3 só toca em
arquivos de teste, então o build inicial serve para as 18 migrações.

Ao fechar a fase, valide com o runner oficial: `bash apps/pwa/e2e/run-ci.sh`.

> **A suíte é flaky em ~1–3%. Uma rodada única não é sinal.**
>
> Baseline medido em 2026-07-27 (após o fix da env var): run 1 = 3 falhas/121,
> run 2 = 1 falha/121, **sem nenhuma sobreposição** entre as duas — `accounts:ACC-06`,
> `cards:CARD-05`, `categories:CAT-02` numa; `subscriptions:SUB-05` na outra. Desktop 121/121,
> pwa-runtime 6/6, matrix gate ok. Nenhum teste falha de forma determinística.
>
> **Consequência para a Task 3:** ao verificar um spec migrado, rode **duas vezes**. Só trate
> como regressão o teste que falhar nas duas. Uma falha isolada que passa na repetição é flake
> pré-existente, não efeito da migração — mas confirme que o teste também falhava/passava assim
> **antes** da migração antes de descartar.
>
> Estabilizar a flakiness **não** é escopo da Fase 0. Registrar aqui evita que quem executa
> confunda ruído com regressão.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `apps/pwa/e2e/support/harness.ts` | Setup único de E2E: CSP, reset de fixture, clock, header, guard, **autenticação** | Criar |
| `apps/pwa/e2e/support/harness.test.ts` | Testes unitários do harness (sem Playwright runtime) | Criar |
| `apps/pwa/e2e/fixtures/app.ts` | Fixture Playwright (`test`, `expect`, `guard`) | Modificar — remover helpers mortos |
| `apps/pwa/e2e/specs/*.spec.ts` | Specs de comportamento | Modificar — 18 arquivos, remover helpers locais |
| `apps/whatsapp-bridge/ecosystem.reminder.cjs` | Config PM2 do lembrete agendado | Criar |
| `docs/superpowers/spikes/2026-07-27-cloudflare-access.md` | Resultado do spike de auth | Criar |

**Por que `harness.ts` e não estender `fixtures/app.ts`:** `app.ts` exporta o objeto `test` do
Playwright. Misturar o objeto de fixtures com helpers de setup força todo spec a importar o
módulo pesado só para usar um helper. Separar mantém uma responsabilidade por arquivo.

---

## Task 1: Harness E2E — núcleo puro e testável

**Files:**
- Create: `apps/pwa/e2e/support/harness.ts`
- Test: `apps/pwa/e2e/support/harness.test.ts`

O núcleo testável é a transformação do header CSP. Hoje ela está copiada literalmente em cada
spec (ver `apps/pwa/e2e/specs/accounts.spec.ts:21-27`) e nunca foi testada.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/pwa/e2e/support/harness.test.ts
/**
 * Unit tests for the E2E harness. Pure functions only — no Playwright runtime.
 */
import { describe, it, expect } from "vitest";
import { rewriteCspForFixture } from "./harness";

describe("rewriteCspForFixture", () => {
  it("prepends the fixture origin to connect-src", () => {
    const input = "default-src 'self'; connect-src 'self' https://api.synkroo.com.br";
    expect(rewriteCspForFixture(input)).toContain(
      "connect-src http://127.0.0.1:4010 'self' https://api.synkroo.com.br",
    );
  });

  it("adds unsafe-eval to script-src", () => {
    const input = "script-src 'self'";
    expect(rewriteCspForFixture(input)).toBe("script-src 'unsafe-eval' 'self'");
  });

  it("returns the policy unchanged when neither directive is present", () => {
    const input = "default-src 'self'";
    expect(rewriteCspForFixture(input)).toBe("default-src 'self'");
  });

  it("rewrites both directives when both are present", () => {
    const input = "connect-src 'self'; script-src 'self'";
    const out = rewriteCspForFixture(input);
    expect(out).toContain("connect-src http://127.0.0.1:4010 'self'");
    expect(out).toContain("script-src 'unsafe-eval' 'self'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pwa && pnpm vitest run e2e/support/harness.test.ts`
Expected: FAIL — `Failed to resolve import "./harness"`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/pwa/e2e/support/harness.ts
/**
 * Single entry point for E2E test setup.
 *
 * Replaces the ~35 lines of helpers that were copy-pasted into every spec
 * (allowCsp, resetFixture, getJournal, expectJournal, registerDevice, init).
 *
 * AUTH BOUNDARY: `authenticate()` is the only place that knows how a session
 * is established. Phase 1 swaps device registration for user login by editing
 * that one function — no spec file changes.
 */

// Single source of truth for the fixture origin — reuse, do not redeclare.
// `support/reset.ts` already exports FIXTURE_URL; a second constant would drift.
import { FIXTURE_URL } from "./reset";

export { FIXTURE_URL };

/**
 * Rewrite a CSP header so the browser may reach the local fixture API
 * and evaluate the Next.js dev runtime.
 *
 * Returns the policy unchanged when neither directive is present.
 */
export function rewriteCspForFixture(csp: string): string {
  return csp
    .replace(/connect-src\s+([^;]+)/, `connect-src ${FIXTURE_URL} $1`)
    .replace(/script-src\s+([^;]+)/, "script-src 'unsafe-eval' $1");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pwa && pnpm vitest run e2e/support/harness.test.ts`
Expected: PASS — 4 passed

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/e2e/support/harness.ts apps/pwa/e2e/support/harness.test.ts
git commit -m "test: add E2E harness core with tested CSP rewrite"
```

---

## Task 2: Harness E2E — fronteira de autenticação e `initSpec`

**Files:**
- Modify: `apps/pwa/e2e/support/harness.ts`

Esta task cria a função que a Fase 1 vai reescrever. É o objetivo inteiro do item 0.1.

- [ ] **Step 1: Add the auth boundary and setup orchestration**

Anexar ao final de `apps/pwa/e2e/support/harness.ts`:

```typescript
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  createGuard,
  attachGuard,
  allowFailure,
  type GuardState,
} from "./failure-guard";

// Reused from ./reset — do not redeclare these values here.
import { FIXED_CLOCK, E2E_TEST_ID_HEADER } from "./reset";

export { FIXED_CLOCK, E2E_TEST_ID_HEADER };

/** Failures every spec tolerates. Previously redeclared in each spec file. */
const BASELINE_ALLOWED = [
  { message: "reading 'waiting'", reason: "SW blocked" },
  { url: "/profile", reason: "fixture has no /profile" },
  { url: "/pwa-control", reason: "fixture has no /pwa-control" },
  { url: "/auth/devices/me", reason: "intermittent cross-test token" },
] as const;

/**
 * Establish an authenticated session.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PHASE 1 AUTH SWAP HAPPENS HERE AND NOWHERE ELSE.
 * Today: device registration (button "Registrar" → POST /auth/devices/register).
 * Phase 1: invite-based user login. Rewrite this body only.
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function authenticate(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Registrar" })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 15000 });
}

/** Reset the fixture store for a test id. */
export async function resetFixture(testId: string): Promise<void> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [E2E_TEST_ID_HEADER]: testId },
    body: JSON.stringify({ testId, seed: "populated" }),
  });
  if (!res.ok) throw new Error(`Fixture reset failed: ${res.status}`);
}

export type JournalEntry = { method: string; path: string; status: number };

/** Read the fixture request journal for a test id. */
export async function getJournal(testId: string): Promise<JournalEntry[]> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${testId}`, {
    headers: { [E2E_TEST_ID_HEADER]: testId },
  });
  return res.ok ? res.json() : [];
}

/** Assert the journal eventually contains a matching request. */
export async function expectJournal(
  testId: string,
  method: string,
  path: string | RegExp,
  status: number,
): Promise<void> {
  await expect
    .poll(() => getJournal(testId), { timeout: 8000 })
    .toContainEqual(expect.objectContaining({ method, path, status }));
}

export type InitOptions = {
  /** Path to navigate to after authenticating. Defaults to "/". */
  navigateTo?: string;
  /** Extra tolerated failures on top of BASELINE_ALLOWED. */
  allow?: ReadonlyArray<{ message?: string; url?: string; reason: string }>;
};

/**
 * Full per-test setup: guard, CSP rewrite, fixture reset, fixed clock,
 * test-id header, authentication, navigation.
 *
 * Returns the guard so the spec can call assertNoUndeclaredFailures().
 */
export async function initSpec(
  page: Page,
  testId: string,
  options: InitOptions = {},
): Promise<GuardState> {
  const guard = createGuard();
  attachGuard(page, guard);

  await page.route("**/*", async (route) => {
    try {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      const csp = headers["content-security-policy"];
      if (csp) headers["content-security-policy"] = rewriteCspForFixture(csp);
      await route.fulfill({ response, headers });
    } catch {
      /* route already handled or page closed */
    }
  });

  await resetFixture(testId);
  await page.clock.setFixedTime(FIXED_CLOCK);
  await page.context().setExtraHTTPHeaders({ [E2E_TEST_ID_HEADER]: testId });

  for (const entry of BASELINE_ALLOWED) allowFailure(guard, entry);
  for (const entry of options.allow ?? []) allowFailure(guard, entry);

  await page.goto("/");
  await authenticate(page);
  if (options.navigateTo && options.navigateTo !== "/") {
    await page.goto(options.navigateTo);
  }

  return guard;
}
```

- [ ] **Step 2: Verify the harness typechecks**

Run: `cd apps/pwa && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `e2e/support/harness.ts`

- [ ] **Step 3: Verify the unit tests still pass**

Run: `cd apps/pwa && pnpm vitest run e2e/support/harness.test.ts`
Expected: PASS — 4 passed

- [ ] **Step 4: Commit**

```bash
git add apps/pwa/e2e/support/harness.ts
git commit -m "test: add authenticate() boundary and initSpec to E2E harness"
```

---

## Task 3: Migrar os specs para o harness

**Files:**
- Modify: `apps/pwa/e2e/specs/accounts.spec.ts` (e os demais 17, um commit por arquivo)
- Modify: `apps/pwa/e2e/fixtures/app.ts`

**Faça um spec por vez, rodando a suíte entre cada um.** Migrar os 18 de uma vez torna
impossível saber qual quebrou.

### 3a — `accounts.spec.ts` (piloto)

- [ ] **Step 1: Run the spec before touching it, to record the baseline**

Run: `cd apps/pwa && pnpm exec playwright test --config=e2e/playwright.config.ts specs/accounts.spec.ts`
Expected: PASS — 6 passed. Anote o número; ele não pode mudar.

- [ ] **Step 2: Replace the local helper block with the harness import**

Substituir as linhas **10–55** de `apps/pwa/e2e/specs/accounts.spec.ts` — da linha
`import { test, expect } from "@playwright/test";` até a chave de fechamento da função `init`
(inclusive), preservando o docblock das linhas 1–9 — por:

```typescript
import { test, expect } from "@playwright/test";
import { assertNoUndeclaredFailures } from "../support/failure-guard";
import { initSpec, expectJournal } from "../support/harness";

let c = 0;
function tid(): string {
  c += 1;
  return `acc-${c}`;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function init(page: import("@playwright/test").Page, id: string, nav = "/contas") {
  return initSpec(page, id, { navigateTo: nav });
}
```

Manter o wrapper `init` local preserva as ~40 chamadas existentes sem editá-las. As constantes
`SW`, `PROFILE`, `PWACTRL`, `AUTH_ME` e as funções `allowCsp`, `resetFixture`, `getJournal`,
`registerDevice` são deletadas — agora vêm do harness.

- [ ] **Step 3: Run the spec to verify identical results**

Run: `cd apps/pwa && pnpm exec playwright test --config=e2e/playwright.config.ts specs/accounts.spec.ts`
Expected: PASS — 6 passed (mesmo número do Step 1)

- [ ] **Step 4: Commit**

```bash
git add apps/pwa/e2e/specs/accounts.spec.ts
git commit -m "test: migrate accounts spec to shared E2E harness"
```

### 3b — Repetir para os 17 specs restantes

> **Os specs NÃO são uniformes.** Não presuma a assinatura de `accounts.spec.ts`.
> Verificado no repo: `navigation.spec.ts` usa `setup(page, id)` retornando `void`;
> `records.spec.ts` e `wallet.spec.ts` usam `init(page, id)` **sem** parâmetro `nav`;
> só `accounts.spec.ts` tem `nav = "/contas"`. Descubra a forma de cada arquivo antes de editar.

**Antes de migrar cada arquivo, rode:**

```bash
cd apps/pwa && grep -n "async function init\|async function setup\|await page.goto" e2e/specs/<arquivo>.spec.ts
```

Use o `page.goto` observado como `navigateTo`. **Não** invente a rota a partir do nome do spec.

**Nove specs constroem guard próprio dentro de test bodies** e por isso **precisam manter**
`createGuard` / `attachGuard` / `allowFailure` nos imports, mesmo após a migração:

`auth.spec.ts` (4), `home.spec.ts` (2), `navigation.spec.ts` (25), `profile.spec.ts` (2),
`records.spec.ts` (8), `reports.spec.ts` (2), `shared-ui.spec.ts` (6),
`transaction-sheet.spec.ts` (2), `wallet.spec.ts` (2).

Confirme por arquivo antes de remover qualquer import:

```bash
cd apps/pwa && awk 'NR>60 && /createGuard|attachGuard/ {print NR": "$0}' e2e/specs/<arquivo>.spec.ts
```

Se retornar linhas, o import fica. Se vazio, pode remover — como em `accounts.spec.ts`.

- [ ] `budgets.spec.ts`
- [ ] `cards.spec.ts`
- [ ] `categories.spec.ts`
- [ ] `goals.spec.ts`
- [ ] `payables.spec.ts`
- [ ] `subscriptions.spec.ts`
- [ ] `home.spec.ts` — mantém imports de guard
- [ ] `profile.spec.ts` — mantém imports de guard
- [ ] `reports.spec.ts` — mantém imports de guard
- [ ] `transaction-sheet.spec.ts` — mantém imports de guard
- [ ] `wallet.spec.ts` — mantém imports de guard
- [ ] `shared-ui.spec.ts` — mantém imports de guard
- [ ] `records.spec.ts` — mantém imports de guard
- [ ] `navigation.spec.ts` — helper chama-se `setup()` e retorna `void`, não `GuardState`.
      Manter a assinatura local; trocar só o miolo por `initSpec`. 25 usos de guard nos testes.
- [ ] `pwa-runtime.spec.ts` — projeto Playwright separado (service worker). Migrar por último
      entre os normais; passar `allow` extra se a suíte acusar falha nova.
- [ ] `production-smoke.spec.ts` — **não migrar.** Projeto Playwright separado que roda contra
      produção, não contra a fixture local (`e2e/playwright.config.ts:65`).
- [ ] `auth.spec.ts` — **migrar por último** (ver ressalva abaixo)

> **`auth.spec.ts` é diferente.** Ele testa o próprio fluxo de autenticação
> (`TOKEN_KEY = "pi-finance:token"`, token expirado, volta para registro). Não deve chamar
> `authenticate()` — ele **é** o teste de `authenticate()`. Migrar apenas CSP/reset/clock e
> deixar as asserções de auth inline. Este spec será reescrito na Fase 1 de qualquer forma.

Para cada arquivo, repetir os 4 steps de 3a, ajustando o nome do spec no comando de execução.

### 3c — Limpar `fixtures/app.ts`

- [ ] **Step 1: Confirm the dead helpers have no callers**

Run: `cd apps/pwa && grep -rn "e2eSetup\|allowFixtureCsp\|getJournalEntries\|registerDevice" e2e/ --include=*.ts`
Expected: matches only inside `e2e/fixtures/app.ts` itself

- [ ] **Step 2: Delete the dead helpers**

Remover de `apps/pwa/e2e/fixtures/app.ts` as funções `allowFixtureCsp`, `registerDevice`,
`getJournalEntries`, `e2eSetup` e o `generateTestId`/`testCounter` se ficarem órfãos. Manter
apenas o `test` estendido, os re-exports (`FIXTURE_URL`, `createGuard`, `GuardState`) e `expect`.

- [ ] **Step 3: Run the full E2E suite**

Run: `bash apps/pwa/e2e/run-ci.sh`
Expected: PASS — 40 passed

- [ ] **Step 4: Commit**

```bash
git add apps/pwa/e2e/fixtures/app.ts
git commit -m "test: remove dead helpers superseded by E2E harness"
```

### 3d — Trancar o resultado

- [ ] **Step 1: Write a test asserting auth lives in exactly one place**

```typescript
// append to apps/pwa/e2e/support/harness.test.ts
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// `__dirname` does not exist in ESM; the PWA package is ESM.
const HERE = dirname(fileURLToPath(import.meta.url));

describe("auth centralization invariant", () => {
  it("no spec clicks the Registrar button directly", () => {
    const dir = join(HERE, "..", "specs");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".spec.ts") && f !== "auth.spec.ts")
      .filter((f) => readFileSync(join(dir, f), "utf8").includes('name: "Registrar"'));

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/pwa && pnpm vitest run e2e/support/harness.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 3: Commit**

```bash
git add apps/pwa/e2e/support/harness.test.ts
git commit -m "test: lock auth setup to a single harness function"
```

---

## Task 4: Lembrete semanal fora da máquina de desenvolvimento

**Files:**
- Create: `apps/whatsapp-bridge/ecosystem.reminder.cjs`
- Modify: `README.md` (seção "Reminder Semanal (Task Scheduler)")

O script `apps/whatsapp-bridge/scripts/reminder.ts` precisa de `DATABASE_URL` (Postgres na VPS) e
`EVOLUTION_GO_API_URL` (Evolution na VPS). **Ambas as dependências já vivem na VPS** — o script
pode rodar lá, independente do PC. GitHub Actions não serve: o Postgres não tem porta pública.

- [ ] **Step 1: Verify the reminder runs standalone before scheduling it**

Run: `cd apps/whatsapp-bridge && pnpm reminder`
Expected: log `[reminder] Enviado com sucesso para <chatId>` e exit 0.
Se falhar por env faltando, resolva antes de agendar — agendar um script quebrado só esconde a falha.

- [ ] **Step 2: Create the PM2 scheduled config**

```javascript
// apps/whatsapp-bridge/ecosystem.reminder.cjs
// Weekly reminder, scheduled by PM2 instead of Windows Task Scheduler.
// Deploy target: the Hostinger VPS (Postgres + Evolution already live there),
// so the reminder no longer depends on a developer machine being powered on.
//
// Usage on the VPS:
//   pm2 start ecosystem.reminder.cjs
//   pm2 save
module.exports = {
  apps: [
    {
      name: 'pi-reminder-weekly',
      script: 'scripts/reminder.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: __dirname,
      // One-shot job: run, exit, wait for the next cron tick.
      autorestart: false,
      // Mondays at 09:00 in the container/host timezone.
      cron_restart: '0 9 * * 1',
      time: true,
    },
  ],
};
```

- [ ] **Step 3: Verify the config parses**

Run: `cd apps/whatsapp-bridge && node -e "console.log(JSON.stringify(require('./ecosystem.reminder.cjs').apps[0].cron_restart))"`
Expected: `"0 9 * * 1"`

- [ ] **Step 4: Replace the Task Scheduler section in the README**

Substituir a seção "**Task Scheduler — agendar toda segunda-feira às 09:00 (Windows)**" do
`README.md` por:

```markdown
**Agendamento (VPS, via PM2):**

```bash
cd apps/whatsapp-bridge
pm2 start ecosystem.reminder.cjs
pm2 save
```

Roda toda segunda às 09:00. Logs: `pm2 logs pi-reminder-weekly`.

Não usar Task Scheduler do Windows: o job passaria a depender de uma máquina de
desenvolvimento ligada. Postgres e Evolution já vivem na VPS.
```

- [ ] **Step 5: Commit**

```bash
git add apps/whatsapp-bridge/ecosystem.reminder.cjs README.md
git commit -m "chore: schedule weekly reminder via PM2 on the VPS"
```

- [ ] **Step 6: Verify acceptance criterion A1 on the VPS**

Rodar na VPS: `pm2 start ecosystem.reminder.cjs && pm2 list`
Expected: `pi-reminder-weekly` listado com status `stopped` e cron agendado.
Desligar a máquina de desenvolvimento e confirmar que a próxima execução ocorre.

---

## Task 5: Spike — Cloudflare Access repassa identidade do usuário?

**Files:**
- Create: `docs/superpowers/spikes/2026-07-27-cloudflare-access.md`

Define a forma da Fase 1 (spec §7). Timebox: **1 dia**. Produz decisão, não código de produção.

**Critério de aceitação, literal (spec §7.1):** o Worker rodando `AIChatAgent` consegue repassar a
identidade Access do chamador para `apps/api` de modo que a API valide o **usuário final**, não um
service token. Se não conseguir, o Access quebra a propriedade de autorização-num-lugar-só
(§4.4) e é descartado.

- [ ] **Step 1: Read the current docs — do not answer from memory**

Consultar `https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/`
e `https://developers.cloudflare.com/agents/api-reference/cross-domain-authentication/`.

- [ ] **Step 2: Put a throwaway Access application in front of a test endpoint**

Proteger uma rota descartável com Access, e confirmar que `apps/api` recebe e valida o header
`Cf-Access-Jwt-Assertion` com a identidade do usuário final.

Expected: o JWT contém uma claim de e-mail correspondente ao usuário que fez login.

- [ ] **Step 3: Test the decisive path — Worker → API**

Fazer um Worker chamar a rota protegida **repassando a identidade do usuário original**.

Expected: `apps/api` valida o usuário final, não uma identidade de serviço.
**Este step é o spike inteiro.** Se falhar, o resultado é "descartar Access".

- [ ] **Step 4: Record the outcome**

```markdown
# Spike — Cloudflare Access para autenticação (Fase 1)

**Data:** 2026-07-27
**Timebox:** 1 dia
**Pergunta:** o Worker do agente consegue repassar a identidade Access do usuário final
para `apps/api`, de modo que a API valide o usuário e não um service token?

## Resultado

<APROVADO | DESCARTADO>

## Evidência

<comandos executados, headers observados, claims do JWT>

## Decisão

<Se APROVADO: Fase 1 usa Access; a tabela `sessions` de §4.1 não é criada.>
<Se DESCARTADO: Fase 1 usa o fallback 1 de §7.2 (`better-auth` em `apps/api`).>
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/spikes/2026-07-27-cloudflare-access.md
git commit -m "docs: record Cloudflare Access spike outcome"
```

---

## Task 6: Fechar a Fase 0

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, sem regressão

- [ ] **Step 2: Run the full E2E suite**

Run: `bash apps/pwa/e2e/run-ci.sh`
Expected: PASS — 40 passed

- [ ] **Step 3: Verify the Fase 0 acceptance criteria**

| Critério | Como verificar | Task |
|---|---|---|
| A1 — lembrete sem máquina de dev | `pm2 list` na VPS mostra `pi-reminder-weekly` agendado | 4 |
| A3 — troca de auth toca 1 arquivo | `harness.test.ts` "auth centralization invariant" passa | 3d |

A2 (portar as 8 features) pertence ao plano separado e **não** é verificado aqui.

- [ ] **Step 4: Update the spec status**

Marcar em `docs/superpowers/specs/2026-07-27-pwa-centralizado-workspaces-design.md` §6.1 os itens
0.1, 0.2 e 0.4 como concluídos, e registrar o resultado do spike em §7.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-27-pwa-centralizado-workspaces-design.md
git commit -m "docs: mark Fase 0 items complete"
```
