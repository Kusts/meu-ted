# PWA CRUD & Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/pwa` reliable for live JSON writes, explicit about degraded/read-only state, and complete the backend-supported CRUD/action surface across transactions, accounts, categories, subscriptions, payables, budgets, and goals.

**Architecture:** Keep `apps/pwa/src/lib/api/client.ts` as the single HTTP contract, `apps/pwa/src/lib/api/endpoints.ts` as the typed REST surface, and `apps/pwa/src/lib/state/app-state-context.tsx` as the only mutation coordinator. Add shared screen-level error/status primitives first, then expose domain CRUD via feature-level sheets/dialogs that call provider mutators only.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest + Testing Library, local component sheets/dialogs, deployed Fastify API behind device-token auth.

**Agent Orchestration:** Supervisor-Workers — Phase 1 is sequential foundation; Phase 2 splits into independent domain lanes after transactions.

**Spec:** `docs/superpowers/specs/2026-06-29-pwa-crud-reliability-spec.md`

---

## File map

**Shared/foundation**
- `apps/pwa/src/lib/api/client.ts`
- `apps/pwa/src/lib/api/endpoints.ts`
- `apps/pwa/src/lib/state/app-state-context.tsx`
- `apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx`
- `apps/pwa/src/components/StaleBanner.tsx`
- `apps/pwa/src/components/WriteErrorBanner.tsx`
- `apps/pwa/src/components/ConfirmActionDialog.tsx`

**Transactions**
- `apps/pwa/src/features/records/RecordsPage.tsx`
- `apps/pwa/src/features/records/components/TransactionActionSheet.tsx`
- `apps/pwa/src/features/records/components/TransactionEditSheet.tsx`
- `apps/pwa/src/features/records/__tests__/RecordsPage.test.tsx`

**Accounts/categories**
- `apps/pwa/src/features/accounts/AccountsPage.tsx`
- `apps/pwa/src/features/categories/CategoriesPage.tsx`
- matching `__tests__`

**Payables/budgets/goals/subscriptions/cards**
- `apps/pwa/src/features/payables/PayablesPage.tsx`
- `apps/pwa/src/features/budgets/BudgetsPage.tsx`
- `apps/pwa/src/features/goals/GoalsPage.tsx`
- `apps/pwa/src/features/subscriptions/SubscriptionsPage.tsx`
- `apps/pwa/src/features/cards/CardsPage.tsx`
- matching `__tests__`

**Hygiene**
- `nul`
- `apps/pwa/nul`
- `apps/pwa/src/features/records/RecordsPage.tsx`

---

## Locked order

1. Fase 1 — reliability / shared UX
2. Fase 2A — transactions
3. Fase 2B — accounts/categories
4. Fase 2C — payables/budgets/goals/subscriptions/cards

Do not start Phase 2 until Phase 1 passes full verification.

---

## Task 1: Gate `parentId` + stabilize date-fragile records test

**Files:**
- Inspect: `D:/projetos/pi-finance-api/src/routes/categories.ts`
- Modify: `apps/pwa/src/features/records/__tests__/RecordsPage.test.tsx`

- [ ] **Step 1: Verify category contract**
  - Outcome A: `parentId` verified → subcategory lane allowed in Phase 2B
  - Outcome B: not verified → executable scope remains category only

- [ ] **Step 2: Write failing regression with frozen time**

```ts
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-26T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
```

- [ ] **Step 3: Run focused test**
  - `cd apps/pwa && pnpm vitest run src/features/records/__tests__/RecordsPage.test.tsx`
  - Expected: current branch may fail on `7d` until freeze lands

- [ ] **Step 4: Apply freeze-based fix and re-run**
  - same command
  - Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/features/records/__tests__/RecordsPage.test.tsx
git commit -m "test: stabilize records period filter"
```

---

## Task 2: Fix JSON write contract in `apiFetch`

**Files:**
- `apps/pwa/src/lib/api/client.ts`
- `apps/pwa/src/lib/api/client.test.ts`

- [ ] **Step 1: Write failing client test**

```ts
it("adds application/json content-type when body is present", async () => {
  await apiFetch("/transactions/expense", {
    method: "POST",
    body: JSON.stringify({ description: "Mercado" }),
  });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
    }),
  );
});
```

- [ ] **Step 2: Run focused test**
  - `cd apps/pwa && pnpm vitest run src/lib/api/client.test.ts`
  - Expected: FAIL

- [ ] **Step 3: Implement minimal fix**

```ts
const requestHeaders: Record<string, string> = {
  Accept: "application/json",
  ...(rest.body ? { "Content-Type": "application/json" } : {}),
  ...(resolvedToken ? { "x-device-token": resolvedToken } : {}),
  ...((optsHeaders as Record<string, string>) ?? {}),
};
```

- [ ] **Step 4: Re-run focused test**
  - same command
  - Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/lib/api/client.ts apps/pwa/src/lib/api/client.test.ts
git commit -m "fix: send json content-type in api client"
```

---

## Task 3: Canonical write-error banner across screens

**Files:**
- Create: `apps/pwa/src/components/WriteErrorBanner.tsx`
- Create: `apps/pwa/src/components/__tests__/WriteErrorBanner.test.tsx`
- Modify only screens with direct mutation or visible write-block paths: `RecordsPage`, `AccountsPage`, `CategoriesPage`, `PayablesPage`, `BudgetsPage`, `GoalsPage`, `SubscriptionsPage`, `CardsPage`

- [ ] **Step 1: Write failing banner test**

```tsx
render(<WriteErrorBanner message="Backend indisponível" onDismiss={vi.fn()} />);
expect(screen.getByText(/backend indisponível/i)).toBeInTheDocument();
```

- [ ] **Step 2: Implement banner**

Snippet estrutural; implementação final deve seguir tokens/classe visual do app (`bg-danger-tint`, `text-danger`, spacing padrão).

```tsx
export function WriteErrorBanner({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return <div>⚠ {message}<button onClick={onDismiss}>×</button></div>;
}
```

- [ ] **Step 3: Wire pattern on screens**

```tsx
const { writeError, clearWriteError } = useAppState();
<WriteErrorBanner message={writeError} onDismiss={clearWriteError} />
```

- [ ] **Step 4: Re-run banner + provider tests**
  - `cd apps/pwa && pnpm vitest run src/components/__tests__/WriteErrorBanner.test.tsx`
  - `cd apps/pwa && pnpm vitest run src/lib/state/__tests__/app-state-context.test.tsx`
  - Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/components/WriteErrorBanner.tsx apps/pwa/src/components/__tests__/WriteErrorBanner.test.tsx apps/pwa/src/features/*/*.tsx apps/pwa/src/lib/state/app-state-context.tsx
git commit -m "feat: surface write errors across pwa screens"
```

---

## Task 4: Consistent stale/unavailable/read-only banners

**Files:**
- Modify: `RecordsPage`, `AccountsPage`, `CategoriesPage`, `PayablesPage`, `BudgetsPage`, `GoalsPage`, `SubscriptionsPage`

- [ ] **Step 1: Write one failing Records test proving stale banner is missing**

```tsx
render(<RecordsPage />);
expect(screen.getByText(/modo somente leitura/i)).toBeInTheDocument();
```

- [ ] **Step 2: Wire `StaleBanner` on all affected screens**

```tsx
<StaleBanner domains={["transactions", "categories", "accounts"]} />
```

- [ ] **Step 3: If sync/readOnly setup starts repeating, factor a local helper in the affected test file**
  - Example: `defaultSync()` or `mockState({ sync, readOnly })`
  - Keep this local unless repetition proves broader extraction is needed

- [ ] **Step 4: Re-run records + full suite**
  - `cd apps/pwa && pnpm vitest run src/features/records/__tests__/RecordsPage.test.tsx`
  - `cd apps/pwa && pnpm test`
  - Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/features/*/*.tsx
git commit -m "feat: show stale banners on degraded screens"
```

---

## Task 5: Transactions correction loop (`Registros`)

**Files:**
- `apps/pwa/src/lib/api/endpoints.ts`
- `apps/pwa/src/lib/state/app-state-context.tsx`
- `apps/pwa/src/features/records/RecordsPage.tsx`
- `apps/pwa/src/features/records/components/TransactionActionSheet.tsx`
- `apps/pwa/src/features/records/components/TransactionEditSheet.tsx`
- matching tests

- [ ] **Step 1: Write failing endpoint/provider tests for transaction update**

```ts
export async function updateTransaction(id: string, input: {
  description?: string; date?: string; amountCents?: number; accountId?: string; categoryId?: string;
}): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}
```

- [ ] **Step 2: Add provider mutator with rollback**
  - Add `updateTransaction(...)`
  - Keep `deleteTransaction(...)` rollback behavior

- [ ] **Step 3: Write failing UI test for row tap → actions**

```tsx
fireEvent.click(screen.getByText("Supermercado Extra"));
expect(screen.getByText("Editar")).toBeInTheDocument();
expect(screen.getByText("Excluir")).toBeInTheDocument();
```

- [ ] **Step 4: Implement sheets**
  - expense/income: description/date/amount/account/category
  - transfer: description/date only

```tsx
const isTransfer = tx.kind === "transfer";
{!isTransfer && <AmountField />}
```

- [ ] **Step 5: Wire row click in `RecordsPage`**

```tsx
<div key={tx.id} onClick={() => setSelectedTx(tx)} className="cursor-pointer ...">
```

- [ ] **Step 6: Re-run focused tests**
  - `cd apps/pwa && pnpm vitest run src/features/records/__tests__/RecordsPage.test.tsx`
  - `cd apps/pwa && pnpm vitest run src/lib/state/__tests__/app-state-context.test.tsx`
  - Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/pwa/src/lib/api/endpoints.ts apps/pwa/src/lib/state/app-state-context.tsx apps/pwa/src/features/records apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx
git commit -m "feat: add transaction edit and delete flow"
```

---

## Task 6: Accounts + categories update/deactivate

**Files:**
- `apps/pwa/src/lib/api/endpoints.ts`
- `apps/pwa/src/lib/state/app-state-context.tsx`
- `apps/pwa/src/features/accounts/AccountsPage.tsx`
- `apps/pwa/src/features/categories/CategoriesPage.tsx`
- `apps/pwa/src/components/ConfirmActionDialog.tsx`
- matching tests

- [ ] **Step 1: Write failing wrappers/tests**

```ts
export async function updateAccount(id: string, input: { name: string }): Promise<Account> { /* PATCH /accounts/:id */ }
export async function deactivateAccount(id: string): Promise<void> { /* POST /accounts/:id/deactivate */ }
export async function updateCategory(id: string, input: { name: string; kind: "expense" | "income" }): Promise<Category> { /* PATCH */ }
export async function deactivateCategory(id: string): Promise<void> { /* POST deactivate */ }
```

- [ ] **Step 2: Add provider mutators + rollback tests**
  - `updateAccount`
  - `deactivateAccount`
  - `updateCategory`
  - `deactivateCategory`

- [ ] **Step 3: Add item-level UI affordances**

```tsx
<button onClick={() => setEditAccount(acc)}>Editar</button>
<button onClick={() => setConfirmDeactivate(acc)}>Desativar</button>
```

- [ ] **Step 4: If `parentId` was not verified, keep subcategory out of executable scope**

- [ ] **Step 5: Re-run focused tests**
  - `cd apps/pwa && pnpm vitest run src/features/accounts/__tests__/AccountsPage.test.tsx`
  - `cd apps/pwa && pnpm vitest run src/features/categories/__tests__/CategoriesPage.test.tsx`
  - `cd apps/pwa && pnpm vitest run src/lib/state/__tests__/app-state-context.test.tsx`
  - Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/lib/api/endpoints.ts apps/pwa/src/lib/state/app-state-context.tsx apps/pwa/src/features/accounts apps/pwa/src/features/categories apps/pwa/src/components/ConfirmActionDialog.tsx
git commit -m "feat: add account and category maintenance flows"
```

---

## Task 7: Payables / budgets / goals / subscriptions / cards alignment

**Files:**
- `apps/pwa/src/lib/api/endpoints.ts`
- `apps/pwa/src/lib/state/app-state-context.tsx`
- `apps/pwa/src/features/payables/PayablesPage.tsx`
- `apps/pwa/src/features/budgets/BudgetsPage.tsx`
- `apps/pwa/src/features/goals/GoalsPage.tsx`
- `apps/pwa/src/features/subscriptions/SubscriptionsPage.tsx`
- `apps/pwa/src/features/cards/CardsPage.tsx`
- matching tests

### 7.1 Payables
- [ ] Add wrappers/mutators: `createPayable`, `cancelPayable`
- [ ] Replace placeholder create sheet with real form bound to `createPayable`
- [ ] Add cancel action with confirmation next to existing pay flow
- [ ] Run: `cd apps/pwa && pnpm vitest run src/features/payables/__tests__/PayablesPage.test.tsx`

### 7.2 Budgets
- [ ] Add wrappers/mutators: `createBudget`, `updateBudget`
- [ ] Replace no-op create sheet with real form; add edit path from list/card item
- [ ] Run: `cd apps/pwa && pnpm vitest run src/features/budgets/__tests__/BudgetsPage.test.tsx`

### 7.3 Goals
- [ ] Add wrappers/mutators: `createGoal`, `contributeToGoal`, `cancelGoal`
- [ ] Replace placeholder create sheet; add contribution + cancel actions
- [ ] Run: `cd apps/pwa && pnpm vitest run src/features/goals/__tests__/GoalsPage.test.tsx`

### 7.4 Subscriptions
- [ ] Reuse/verify `cancelSubscription` mutator path
- [ ] Add visible cancel action with confirmation and cancelled-state movement
- [ ] Run: `cd apps/pwa && pnpm vitest run src/features/subscriptions/__tests__/SubscriptionsPage.test.tsx`

### 7.5 Cards alignment
- [ ] Verify existing `updateCard`, `payStatement`, and installment flows still work with shared JSON-client fix
- [ ] Add/adjust focused tests proving those flows remain aligned
- [ ] Do not add destructive card actions without verified contract
- [ ] Run: `cd apps/pwa && pnpm vitest run src/features/cards/__tests__/CardsPage.test.tsx`

- [ ] **Step 1: Implement sub-blocks in order and keep provider tests updated**
  - Prefer one domain at a time: payables → budgets → goals → subscriptions → cards

- [ ] **Step 2: Re-run focused domain tests + provider tests**
  - `cd apps/pwa && pnpm vitest run src/lib/state/__tests__/app-state-context.test.tsx`
  - plus each domain command above
  - Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/pwa/src/lib/api/endpoints.ts apps/pwa/src/lib/state/app-state-context.tsx apps/pwa/src/features/payables apps/pwa/src/features/budgets apps/pwa/src/features/goals apps/pwa/src/features/subscriptions apps/pwa/src/features/cards
git commit -m "feat: complete supported pwa domain actions"
```

---

## Task 8: Hygiene + full verification

**Files:**
- Remove: `nul`
- Remove: `apps/pwa/nul`
- Modify: `apps/pwa/src/features/records/RecordsPage.tsx`

- [ ] **Step 1: Remove junk files and fix import order**

```bash
rm -f nul apps/pwa/nul
```

Move `import type { Transaction }` to the top import block in `RecordsPage.tsx`.

- [ ] **Step 2: Run full verification**
  - `cd apps/pwa && pnpm test`
  - `cd apps/pwa && pnpm build`
  - Expected: both pass

- [ ] **Step 3: Optional runtime smoke**
  - `cd apps/pwa && pnpm start`
  - `curl -I http://localhost:3000/`
  - Expected: `200 OK`

- [ ] **Step 4: Commit**

```bash
git add apps/pwa
git add .gitignore  # only if touched
git commit -m "chore: finalize pwa crud reliability scope"
```

---

## Verification matrix

| Area | Command |
|---|---|
| Records | `cd apps/pwa && pnpm vitest run src/features/records/__tests__/RecordsPage.test.tsx` |
| API client | `cd apps/pwa && pnpm vitest run src/lib/api/client.test.ts` |
| Provider | `cd apps/pwa && pnpm vitest run src/lib/state/__tests__/app-state-context.test.tsx` |
| Accounts | `cd apps/pwa && pnpm vitest run src/features/accounts/__tests__/AccountsPage.test.tsx` |
| Categories | `cd apps/pwa && pnpm vitest run src/features/categories/__tests__/CategoriesPage.test.tsx` |
| Payables | `cd apps/pwa && pnpm vitest run src/features/payables/__tests__/PayablesPage.test.tsx` |
| Budgets | `cd apps/pwa && pnpm vitest run src/features/budgets/__tests__/BudgetsPage.test.tsx` |
| Goals | `cd apps/pwa && pnpm vitest run src/features/goals/__tests__/GoalsPage.test.tsx` |
| Subscriptions | `cd apps/pwa && pnpm vitest run src/features/subscriptions/__tests__/SubscriptionsPage.test.tsx` |
| Cards | `cd apps/pwa && pnpm vitest run src/features/cards/__tests__/CardsPage.test.tsx` |
| Full suite | `cd apps/pwa && pnpm test` |
| Build | `cd apps/pwa && pnpm build` |

---

## Notes for executor

- Do not bypass provider mutators with direct component fetch calls.
- Do not implement subcategory mutation UX unless `parentId` contract is verified first.
- Do not expose destructive card actions without verified API support.
- Keep canonical error UX: generic write/read-only errors at screen level; form validation errors inside active form.
- Preserve optimistic update + rollback behavior in every new mutator.
