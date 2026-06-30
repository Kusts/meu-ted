# PWA Backend Source-of-Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PWA treat `pi-finance-api` as the source of truth for financial data — no silent mock fallback when the API is configured, only an explicit per-domain backend snapshot in read-only mode when the backend is unavailable.

**Architecture:** A localStorage-backed per-domain snapshot store records the last successful backend response per domain. The `AppStateProvider` initializes empty (not mock) when the API is configured, loads each domain independently (`Promise.allSettled`), applies `2xx` results live + persists them, and on failure hydrates that domain from snapshot (or empty) — never mock. A `dataSource` flag per domain drives a `readOnly` mode that blocks writes. Runtime `401` is wired back to `AuthGate` via a React context callback (`AuthGate` is the parent of the provider), which also purges the snapshot. Two screens (`CardsPage`, `GoalsPage`) drop synthetic fallbacks.

**Tech Stack:** Next.js (App Router, see `apps/pwa/AGENTS.md` — read `node_modules/next/dist/docs/` before touching Next APIs), React 19, TypeScript, Vitest + Testing Library (`@/lib/test-utils`), localStorage.

**Spec:** `docs/superpowers/specs/2026-06-26-pwa-backend-source-of-truth-spec.md`

**Phase decisions (locked):**
- Partial fetch failure → **per-domain degradation** (spec §6.3, Opção B).
- Boot hydration strategy → **empty-init + snapshot-only-on-failure** (spec §7.1). No snapshot pre-hydration on boot this phase.
- Re-sync trigger → **full page reload only** this phase. `loadedRef` keeps `load()` running once; no pull-to-refresh / `visibilitychange` refetch (spec objetivo 4). This is a deliberate no-task note, not an omission.
- Stale-section signaling → ship a shared `StaleBanner` and wire **Home + Cards** only. Remaining screens (§9.x) are a named deferred follow-up (see end).

**Verified precondition (provider tree):** `apps/pwa/src/components/RootProviders.tsx` mounts `AuthGate → AppStateProvider → SheetProvider` (read it to confirm before starting). The provider only mounts after `AuthGate` reaches `unlocked`, so a valid token is present when `load()` runs. On device re-registration / session reset, `AuthGate` returns to `register`, **unmounting** `AppStateProvider` — so `loadedRef` resets on the next mount and a fresh `load()` runs. There is no "provider mounted before token" path in production. The provider's defensive init (Task 3b: configured + no token → empty, `loading=false`) covers any test that renders it standalone.

---

## File Structure

**Phase 1 — data/state layer**
- Create `apps/pwa/src/lib/state/snapshot-store.ts` — per-domain localStorage snapshot (read/write/clear), token-scoped, schema v1.
- Create `apps/pwa/src/lib/state/__tests__/snapshot-store.test.ts` — unit tests for the store.
- Create `apps/pwa/src/lib/auth/session-context.tsx` — React context exposing `expireSession()` from `AuthGate` to descendants.
- Modify `apps/pwa/src/features/auth/AuthGate.tsx` — provide `SessionContext` when unlocked; purge snapshot on session reset; runtime-401 entrypoint.
- Modify `apps/pwa/src/lib/state/app-state-context.tsx` — state model (`sync`, `readOnly`, configured-aware init), per-domain `load()`, runtime-401 handling, write gating.
- Modify `apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx` — rewrite init/failure tests to the new policy; add per-domain + read-only tests.

**Phase 2 — UI honesty**
- Modify `apps/pwa/src/features/cards/CardsPage.tsx` — remove synthetic statement history.
- Create `apps/pwa/src/features/cards/__tests__/CardsPage.test.tsx` — assert no synthetic history.
- Modify `apps/pwa/src/features/goals/GoalsPage.tsx` — debts tab shows "não implementado" empty state instead of mock when API configured.
- Create `apps/pwa/src/features/goals/__tests__/GoalsPage.test.tsx` — assert no mock debts in backend mode.
- Create `apps/pwa/src/components/StaleBanner.tsx` — self-contained banner reading `sync` from context.
- Create `apps/pwa/src/components/__tests__/StaleBanner.test.tsx` — banner visibility tests.
- Modify `apps/pwa/src/features/home/HomePage.tsx` + `apps/pwa/src/features/cards/CardsPage.tsx` — render `StaleBanner`.

---

## Shared type & constant reference (defined in Task 1 / Task 3)

These names are used across tasks. Defined once, referenced everywhere:

```ts
// snapshot-store.ts
export type DomainKey =
  | "accounts" | "categories" | "transactions" | "payables"
  | "budgets" | "goals" | "subscriptions" | "cardStatements";

// app-state-context.tsx
// "unavailable" = fetch failed AND no snapshot existed -> empty data, backend down.
export type DataSource = "live" | "snapshot" | "unavailable" | "mock";
export interface DomainSync { source: DataSource; syncedAt: string | null }

// Domains that force read-only when stale OR unavailable (subscriptions/cardStatements do NOT):
export const ESSENTIAL_DOMAINS: DomainKey[] = [
  "accounts", "categories", "transactions", "payables", "budgets", "goals",
];

// A domain blocks writes when it is serving stale snapshot OR has no data because the backend is down.
export const STALE_SOURCES: DataSource[] = ["snapshot", "unavailable"];
```

---

## Phase 1 — Data / State Layer

### Task 1: Snapshot store

**Files:**
- Create: `apps/pwa/src/lib/state/snapshot-store.ts`
- Test: `apps/pwa/src/lib/state/__tests__/snapshot-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/pwa/src/lib/state/__tests__/snapshot-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { saveDomain, loadDomain, clearSnapshot } from "../snapshot-store";
import type { Account } from "../types";

const acc: Account = {
  id: "a1", name: "Backend Nubank", kind: "checking",
  balanceCents: 1000, status: "active",
};

describe("snapshot-store", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing saved", () => {
    expect(loadDomain("tok", "accounts")).toBeNull();
  });

  it("round-trips a domain stamped with syncedAt for the same token", () => {
    saveDomain("tok", "accounts", [acc]);
    const got = loadDomain("tok", "accounts");
    expect(got?.data).toEqual([acc]);
    expect(typeof got?.syncedAt).toBe("string");
  });

  it("does NOT return a snapshot saved under a different token", () => {
    saveDomain("tok-A", "accounts", [acc]);
    expect(loadDomain("tok-B", "accounts")).toBeNull();
  });

  it("discards prior snapshot when the token changes on save", () => {
    saveDomain("tok-A", "accounts", [acc]);
    saveDomain("tok-B", "categories", []);
    // tok-B save replaced the envelope; tok-A data is gone
    expect(loadDomain("tok-A", "accounts")).toBeNull();
  });

  it("clearSnapshot wipes everything", () => {
    saveDomain("tok", "accounts", [acc]);
    clearSnapshot();
    expect(loadDomain("tok", "accounts")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/snapshot-store.test.ts`
Expected: FAIL — "Cannot find module '../snapshot-store'".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/pwa/src/lib/state/snapshot-store.ts
import type {
  Account, Category, Transaction, Payable, Budget, Goal,
  Subscription, CardStatement,
} from "./types";

const SNAPSHOT_KEY = "pi-finance:snapshot:v1";

export type DomainKey =
  | "accounts" | "categories" | "transactions" | "payables"
  | "budgets" | "goals" | "subscriptions" | "cardStatements";

export interface SnapshotDomains {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  payables: Payable[];
  budgets: Budget[];
  goals: Goal[];
  subscriptions: Subscription[];
  cardStatements: CardStatement[];
}

interface SnapshotEnvelope {
  version: 1;
  token: string;
  syncedAt: Partial<Record<DomainKey, string>>;
  data: Partial<SnapshotDomains>;
}

function read(): SnapshotEnvelope | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SnapshotEnvelope;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function write(env: SnapshotEnvelope): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(env));
  } catch {
    /* noop — quota or storage unavailable */
  }
}

/** Persist one domain, stamped with token + ISO syncedAt. A token change discards the prior envelope. */
export function saveDomain<K extends DomainKey>(
  token: string,
  domain: K,
  data: SnapshotDomains[K],
): void {
  const existing = read();
  const base: SnapshotEnvelope =
    existing && existing.token === token
      ? existing
      : { version: 1, token, syncedAt: {}, data: {} };
  write({
    ...base,
    data: { ...base.data, [domain]: data },
    syncedAt: { ...base.syncedAt, [domain]: new Date().toISOString() },
  });
}

/** Read one domain if it belongs to the current token; null otherwise. */
export function loadDomain<K extends DomainKey>(
  token: string,
  domain: K,
): { data: SnapshotDomains[K]; syncedAt: string } | null {
  const env = read();
  if (!env || env.token !== token) return null;
  const data = env.data[domain];
  const syncedAt = env.syncedAt[domain];
  if (data === undefined || syncedAt === undefined) return null;
  return { data: data as SnapshotDomains[K], syncedAt };
}

/** Clear the entire snapshot (on 401 / device switch). */
export function clearSnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* noop */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/snapshot-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/lib/state/snapshot-store.ts apps/pwa/src/lib/state/__tests__/snapshot-store.test.ts
git commit -m "feat(pwa): add token-scoped per-domain snapshot store"
```

---

### Task 2: Session-expiry context + AuthGate wiring

**Files:**
- Create: `apps/pwa/src/lib/auth/session-context.tsx`
- Modify: `apps/pwa/src/features/auth/AuthGate.tsx`

> Why a context, not a module-level event emitter: a singleton emitter persists across Vitest tests (which reset via `vi.restoreAllMocks()` + `localStorage.clear()`, neither of which resets module state) and would bleed between tests. A context callback from `AuthGate` (the provider's parent) is testable and unmounts cleanly.

- [ ] **Step 1: Create the session context (no test yet — trivial module)**

```tsx
// apps/pwa/src/lib/auth/session-context.tsx
"use client";

import { createContext, useContext } from "react";

export interface SessionApi {
  /** Called by the data layer on a runtime 401: clears local session + snapshot, returns to device registration. */
  expireSession: (message?: string) => void;
}

const SessionContext = createContext<SessionApi | null>(null);

export const SessionProvider = SessionContext.Provider;

/** Defensive default: when rendered without AuthGate (e.g. unit tests), expireSession is a no-op. */
export function useSession(): SessionApi {
  return useContext(SessionContext) ?? { expireSession: () => {} };
}
```

- [ ] **Step 2: Write the failing AuthGate test**

```tsx
// append inside apps/pwa/src/features/auth/__tests__/AuthGate.test.tsx, within describe("AuthGate", ...)
it("clears snapshot when 'Trocar dispositivo' is used", async () => {
  const { clearSnapshot } = await import("@/lib/state/snapshot-store");
  const spy = vi.spyOn(
    await import("@/lib/state/snapshot-store"),
    "clearSnapshot",
  );
  // token present + pin set -> lands on unlock screen with the reset button
  store["pi-finance:token"] = "tok";
  store["pi-finance:pin"] = "hashed"; // pin-store presence marker
  render(
    <AuthGate>
      <div data-testid="app">App</div>
    </AuthGate>,
  );
  const resetBtn = await screen.findByText(/Trocar dispositivo/);
  await userEvent.click(resetBtn);
  expect(spy).toHaveBeenCalled();
  // silence unused import lint
  void clearSnapshot;
});
```

> Note: confirm the exact localStorage key `pin-store` uses to mark "pin set" by reading `apps/pwa/src/lib/auth/pin-store.ts`; adjust `store["pi-finance:pin"]` to match `isPinSet()`'s key. If `isPinSet()` reads a different key, set that key instead.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/pwa && npx vitest run src/features/auth/__tests__/AuthGate.test.tsx -t "clears snapshot"`
Expected: FAIL — `clearSnapshot` not called (AuthGate's `handleReset` doesn't purge the snapshot yet).

- [ ] **Step 4: Wire AuthGate**

In `apps/pwa/src/features/auth/AuthGate.tsx`:

Add imports near the top:

```tsx
import { SessionProvider } from "@/lib/auth/session-context";
import { clearSnapshot } from "@/lib/state/snapshot-store";
```

Replace `handleReset` so it also purges the snapshot:

```tsx
const handleReset = useCallback(() => {
  resetLocalSession();
  clearSnapshot();
  setState("register");
  setError("Sessão limpa. Registre o dispositivo novamente.");
}, []);
```

Add an `expireSession` callback (place next to the other `useCallback`s):

```tsx
const expireSession = useCallback((message?: string) => {
  resetLocalSession();
  clearSnapshot();
  setError(message ?? "Sessão expirada. Registre o dispositivo novamente.");
  setState("register");
}, []);
```

Wrap the unlocked render with the provider:

```tsx
if (state === "unlocked")
  return (
    <SessionProvider value={{ expireSession }}>{children}</SessionProvider>
  );
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/pwa && npx vitest run src/features/auth/__tests__/AuthGate.test.tsx`
Expected: PASS (existing AuthGate tests + the new one).

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/lib/auth/session-context.tsx apps/pwa/src/features/auth/AuthGate.tsx apps/pwa/src/features/auth/__tests__/AuthGate.test.tsx
git commit -m "feat(pwa): session-expiry context + snapshot purge on device reset"
```

---

### Task 3a: Provider state model (additive — sync + readOnly + configured-aware debts)

**Files:**
- Modify: `apps/pwa/src/lib/state/app-state-context.tsx`
- Test: `apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx`

> Additive only. Does NOT change the mock-vs-empty init for the data arrays (that is Task 3b) — only adds the new fields and makes `debts` configured-aware.

- [ ] **Step 1: Write the failing test**

```tsx
// add inside describe("AppStateProvider — API read path", ...) in app-state-context.test.tsx
it("exposes per-domain sync and a readOnly flag", async () => {
  const { result } = renderHook(() => useAppState(), {
    wrapper: AppStateProvider,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.sync.accounts.source).toBe("live");
  expect(result.current.readOnly).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "per-domain sync"`
Expected: FAIL — `result.current.sync` is undefined.

- [ ] **Step 3: Implement the state model**

In `app-state-context.tsx`:

Add imports (Task 3a only needs the type + session hook; `saveDomain`/`loadDomain` are added in Task 4, `ApiError` in Task 5 — do NOT import unused symbols here or lint fails):

```ts
import { useMemo } from "react";
import { type DomainKey } from "./snapshot-store";
import { useSession } from "@/lib/auth/session-context";
```

Add the types + constants above `AppStateProvider`:

```ts
export type DataSource = "live" | "snapshot" | "unavailable" | "mock";
export interface DomainSync { source: DataSource; syncedAt: string | null }

const ESSENTIAL_DOMAINS: DomainKey[] = [
  "accounts", "categories", "transactions", "payables", "budgets", "goals",
];

const ALL_DOMAINS: DomainKey[] = [
  ...ESSENTIAL_DOMAINS, "subscriptions", "cardStatements",
];

// Sources that mean "this domain is not currently backed by a fresh backend response".
const STALE_SOURCES: DataSource[] = ["snapshot", "unavailable"];

function initialSync(source: DataSource): Record<DomainKey, DomainSync> {
  return Object.fromEntries(
    ALL_DOMAINS.map((d) => [d, { source, syncedAt: null }]),
  ) as Record<DomainKey, DomainSync>;
}
```

Extend the `AppState` interface (add fields after `cardStatements`):

```ts
  // Sync / mode
  sync: Record<DomainKey, DomainSync>;
  readOnly: boolean;
```

Inside `AppStateProvider`, add state + derived value (place after the existing `cardStatements` state, before the refs):

```ts
  const [sync, setSync] = useState<Record<DomainKey, DomainSync>>(() =>
    initialSync(isApiConfigured() ? "live" : "mock"),
  );
  const setSyncFor = useCallback((domain: DomainKey, s: DomainSync) => {
    setSync((prev) => ({ ...prev, [domain]: s }));
  }, []);
  const readOnly = useMemo(
    () => ESSENTIAL_DOMAINS.some((d) => STALE_SOURCES.includes(sync[d].source)),
    [sync],
  );
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const { expireSession } = useSession();
```

Make `debts` configured-aware (replace its `useState` line):

```ts
  const [debts] = useState<Debt[]>(isApiConfigured() ? [] : mockDebts);
```

Add `sync` and `readOnly` to the context `value={{ ... }}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "per-domain sync"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/lib/state/app-state-context.tsx apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx
git commit -m "feat(pwa): add per-domain sync state + readOnly flag to provider"
```

---

### Task 3b: Configured-aware init (empty when API configured, mock only when not)

**Files:**
- Modify: `apps/pwa/src/lib/state/app-state-context.tsx`
- Test: `apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx`

> This is the disruptive flip. It rewrites the *init* tests only. Failure-path tests belong to Task 4.

- [ ] **Step 1: Rewrite the no-token init test**

Replace the existing test `it("skips API when token is missing", ...)` (currently asserts 5 mock accounts) with:

```tsx
it("initializes empty (not mock) and not loading when configured without token", () => {
  localStorage.removeItem("pi-finance:token");
  const { result } = renderHook(() => useAppState(), {
    wrapper: AppStateProvider,
  });
  // configured -> no mock leak; no token -> no fetch -> not stuck loading
  expect(result.current.loading).toBe(false);
  expect(result.current.accounts).toHaveLength(0);
  expect(result.current.debts).toHaveLength(0);
});
```

Add a companion test for the configured+token happy path init:

```tsx
it("initializes empty + loading=true when configured with token", () => {
  vi.mocked(endpoints.fetchAccounts).mockImplementation(
    () => new Promise(() => {}), // never resolves -> stays loading
  );
  const { result } = renderHook(() => useAppState(), {
    wrapper: AppStateProvider,
  });
  expect(result.current.loading).toBe(true);
  expect(result.current.accounts).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "configured"`
Expected: FAIL — provider still inits with `mockAccounts` (length 5).

- [ ] **Step 3: Flip the init**

In `app-state-context.tsx`, replace the data-array initializers. Compute `configured` once at the top of `AppStateProvider`:

```ts
  const configured = isApiConfigured();
  const [accounts, setAccounts] = useState<Account[]>(configured ? [] : mockAccounts);
  const [categories, setCategories] = useState<Category[]>(configured ? [] : mockCategories);
  const [transactions, setTransactions] = useState<Transaction[]>(
    configured ? [] : ALL_MOCK_TRANSACTIONS,
  );
  const [payables, setPayables] = useState<Payable[]>(configured ? [] : mockPayables);
  const [budgets, setBudgets] = useState<Budget[]>(configured ? [] : mockBudgets);
  const [goals, setGoals] = useState<Goal[]>(configured ? [] : mockGoals);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(
    configured ? [] : mockSubscriptions,
  );
  const [cardStatements, setCardStatements] = useState<CardStatement[]>([]);
```

Replace the `loading` initializer so it is true only when a fetch will actually run (configured AND token present):

```ts
  const [loading, setLoading] = useState(apiUsable());
```

> `apiUsable()` already = `isApiConfigured() && getAuthToken() !== undefined`. Configured + no token → `loading=false`, empty — no hang (resolves the §7.1 contradiction). Configured + token → `loading=true` until `load()` finishes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "configured"`
Expected: PASS (both new init tests).

- [ ] **Step 5: Run the mock-path suite to confirm no regression**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "mock-data path"`
Expected: PASS — these run under `apiNotConfigured()`, so init still uses mock.

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/lib/state/app-state-context.tsx apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx
git commit -m "feat(pwa): init empty (not mock) when API configured"
```

---

### Task 4: Per-domain load with snapshot fallback

**Files:**
- Modify: `apps/pwa/src/lib/state/app-state-context.tsx`
- Test: `apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx`

- [ ] **Step 1: Rewrite the failure test (was "keeps mock data")**

Replace the existing `it("sets error on fetch failure and keeps mock data", ...)` with two tests:

```tsx
it("on fetch failure with NO snapshot: empty, unavailable, read-only, never mock", async () => {
  vi.mocked(endpoints.fetchAccounts).mockRejectedValue(new Error("Network error"));
  const { result } = renderHook(() => useAppState(), {
    wrapper: AppStateProvider,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  // failed domain is empty (NOT the 5 mock accounts)
  expect(result.current.accounts).toHaveLength(0);
  expect(result.current.error).not.toBeNull();
  // essential domain down with no snapshot -> unavailable -> read-only ON
  expect(result.current.sync.accounts.source).toBe("unavailable");
  expect(result.current.readOnly).toBe(true);
  // a healthy domain still applied live
  expect(result.current.sync.categories.source).toBe("live");
});

it("on fetch failure WITH a prior snapshot: hydrates snapshot in read-only", async () => {
  const { saveDomain } = await import("@/lib/state/snapshot-store");
  saveDomain("test-token-abc", "accounts", [mockAccount("snap-1", "Snapshot Nubank")]);
  vi.mocked(endpoints.fetchAccounts).mockRejectedValue(new Error("Network error"));

  const { result } = renderHook(() => useAppState(), {
    wrapper: AppStateProvider,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.accounts).toHaveLength(1);
  expect(result.current.accounts[0].name).toBe("Snapshot Nubank");
  expect(result.current.sync.accounts.source).toBe("snapshot");
  expect(result.current.readOnly).toBe(true);
});
```

> The token in `apiReady()` is `"test-token-abc"` — the snapshot must be saved under that exact token to be readable.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "fetch failure"`
Expected: FAIL — current `Promise.all` leaves mock data and has no snapshot logic.

- [ ] **Step 3: Add snapshot imports to the provider**

In `app-state-context.tsx`, extend the snapshot-store import added in Task 3a:

```ts
import { saveDomain, loadDomain, type DomainKey } from "./snapshot-store";
import { ApiError } from "@/lib/api/client";
```

- [ ] **Step 4: Update the test helper `mockApiReads` to also mock `fetchStatements`**

`cardStatements` becomes a first-class domain in the `allSettled` flow, so the shared helper must stub it or every API-path test hits a real fetch. In `app-state-context.test.tsx`, add to `mockApiReads`:

```ts
  vi.spyOn(endpoints, "fetchStatements").mockResolvedValue([]);
```

- [ ] **Step 5: Replace the `load()` effect**

In `app-state-context.tsx`, replace the entire fetch `useEffect` (currently the `Promise.all` block) with a per-domain `allSettled` version. Add a typed helper just above the effect:

```ts
  // Applies one settled list-domain result: live on success (+persist), snapshot if cached,
  // else "unavailable" (empty + backend-down). NEVER mock.
  const applyListDomain = useCallback(
    function <K extends Exclude<DomainKey, "transactions">>(
      domain: K,
      result: PromiseSettledResult<unknown>,
      token: string,
      setData: (d: unknown) => void,
    ): void {
      if (result.status === "fulfilled") {
        const value = result.value as never;
        setData(value);
        saveDomain(token, domain, value);
        setSyncFor(domain, { source: "live", syncedAt: new Date().toISOString() });
        return;
      }
      const snap = loadDomain(token, domain);
      if (snap) {
        setData(snap.data);
        setSyncFor(domain, { source: "snapshot", syncedAt: snap.syncedAt });
      } else {
        setData([]);
        setSyncFor(domain, { source: "unavailable", syncedAt: null });
      }
    },
    [setSyncFor],
  );
```

Replace the effect body. Note: `fetchCards()` is dropped — its result never fed `accounts` (a pre-existing fact; `setAccounts` was only ever fed by `fetchAccounts`). `fetchStatements()` is now a first-class settled domain, so its 401/failure is handled uniformly and it can hydrate from snapshot:

```ts
  useEffect(() => {
    if (!apiUsable() || loadedRef.current) return;
    loadedRef.current = true;

    let cancelled = false;

    const load = async () => {
      const token = getAuthToken();
      if (!token) return;
      setLoading(true);
      setError(null);

      const results = await Promise.allSettled([
        endpoints.fetchAccounts(),
        endpoints.fetchCategories(),
        endpoints.fetchTransactions({ limit: 200 }),
        endpoints.fetchPayables(),
        endpoints.fetchBudgets(),
        endpoints.fetchGoals(),
        endpoints.fetchSubscriptions(),
        endpoints.fetchStatements(),
      ]);
      if (cancelled) return;

      // Runtime 401 short-circuit across ALL domains (Task 5 wires the side-effect).
      const unauthorized = results.some(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof ApiError &&
          r.reason.status === 401,
      );
      if (unauthorized) {
        expireSession();
        setLoading(false);
        return;
      }

      applyListDomain("accounts", results[0], token, (d) => setAccounts(d as Account[]));
      applyListDomain("categories", results[1], token, (d) => setCategories(d as Category[]));
      // transactions has shape { items, total }: unwrap before applying
      if (results[2].status === "fulfilled") {
        const items = (results[2].value as { items: Transaction[] }).items;
        setTransactions(items);
        saveDomain(token, "transactions", items);
        setSyncFor("transactions", { source: "live", syncedAt: new Date().toISOString() });
      } else {
        const snap = loadDomain(token, "transactions");
        if (snap) {
          setTransactions(snap.data);
          setSyncFor("transactions", { source: "snapshot", syncedAt: snap.syncedAt });
        } else {
          setTransactions([]);
          setSyncFor("transactions", { source: "unavailable", syncedAt: null });
        }
      }
      applyListDomain("payables", results[3], token, (d) => setPayables(d as Payable[]));
      applyListDomain("budgets", results[4], token, (d) => setBudgets(d as Budget[]));
      applyListDomain("goals", results[5], token, (d) => setGoals(d as Goal[]));
      applyListDomain("subscriptions", results[6], token, (d) => setSubscriptions(d as Subscription[]));
      applyListDomain("cardStatements", results[7], token, (d) => setCardStatements(d as CardStatement[]));

      const anyFailed = results.some((r) => r.status === "rejected");
      if (anyFailed) setError("Alguns dados não puderam ser atualizados.");
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

> `cardStatements` is non-essential (not in `ESSENTIAL_DOMAINS`), so a statements failure shows the banner but does not force global read-only.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "fetch failure"`
Expected: PASS (both new failure tests).

- [ ] **Step 7: Run the full provider suite**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx`
Expected: PASS. If the existing "replaces mock data with API data" test still asserts `accounts[0].name === "API Nubank"`, it stays green (live path unchanged in behavior).

- [ ] **Step 8: Commit**

```bash
git add apps/pwa/src/lib/state/app-state-context.tsx apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx
git commit -m "feat(pwa): per-domain load with snapshot fallback, never mock"
```

---

### Task 5: Runtime 401 → expire session

**Files:**
- Modify: `apps/pwa/src/lib/state/app-state-context.tsx` (write-path 401 handling)
- Test: `apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx`

> The load-path 401 short-circuit was added in Task 4. This task verifies it and extends 401 handling to write failures.

- [ ] **Step 1: Write the failing test**

```tsx
// new describe block in app-state-context.test.tsx
import { ApiError } from "@/lib/api/client";
import { SessionProvider } from "@/lib/auth/session-context";

describe("AppStateProvider — runtime 401", () => {
  beforeEach(() => {
    apiReady();
    mockApiReads();
  });

  it("calls expireSession when a read returns 401", async () => {
    const expireSession = vi.fn();
    vi.mocked(endpoints.fetchAccounts).mockRejectedValue(
      new ApiError(401, "auth.error", "Token inválido"),
    );
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SessionProvider value={{ expireSession }}>
        <AppStateProvider>{children}</AppStateProvider>
      </SessionProvider>
    );
    const { result } = renderHook(() => useAppState(), { wrapper });
    await waitFor(() => expect(expireSession).toHaveBeenCalled());
    // never falls back to mock on 401
    expect(result.current.accounts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (load path) or fails (write path)**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "runtime 401"`
Expected: PASS for the read-path test (implemented in Task 4). This step confirms the Task 4 wiring through the real `SessionProvider`.

- [ ] **Step 3: Add 401 handling to write failures**

In `app-state-context.tsx`, add a helper and use it in mutator `catch` blocks. Add near the other helpers:

```ts
  const handleWriteError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        expireSession();
        return;
      }
      if (e instanceof Error) setWriteError(e.message);
    },
    [expireSession],
  );
```

Replace `if (e instanceof Error) setWriteError(e.message);` in each mutator `catch` with `handleWriteError(e);`. (Mutators: `addTransaction`, `deleteTransaction`, `markPayablePaid`, `addAccount`, `addCategory`, `addCard`, `updateCard`, `addSubscription`, `cancelSubscription`, `createTransfer`, `payStatement`, `createInstallments`.)

> Because mutators are `useCallback([])`, add `handleWriteError` to their dependency arrays, or read it via a ref (`const handleWriteErrorRef = useRef(handleWriteError); handleWriteErrorRef.current = handleWriteError;` then call `handleWriteErrorRef.current(e)`). Use the ref approach to avoid re-creating every mutator.

- [ ] **Step 4: Add the write-path 401 test**

```tsx
// inside describe("AppStateProvider — runtime 401", ...)
it("calls expireSession (not writeError) when a write returns 401", async () => {
  const expireSession = vi.fn();
  vi.spyOn(endpoints, "createExpenseTransaction").mockRejectedValue(
    new ApiError(401, "auth.error", "Token inválido"),
  );
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SessionProvider value={{ expireSession }}>
      <AppStateProvider>{children}</AppStateProvider>
    </SessionProvider>
  );
  const { result } = renderHook(() => useAppState(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() =>
    result.current.addTransaction({
      id: "tx-401", description: "x", amountCents: 100, date: "2026-06-25",
      kind: "expense", categoryId: "cat1", accountId: "acc1",
    }),
  );
  expect(expireSession).toHaveBeenCalled();
  expect(result.current.writeError).toBeNull();
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "runtime 401"`
Expected: PASS (both 401 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/lib/state/app-state-context.tsx apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx
git commit -m "feat(pwa): runtime 401 expires session on read and write paths"
```

---

### Task 6: Block writes in read-only (snapshot) mode

**Files:**
- Modify: `apps/pwa/src/lib/state/app-state-context.tsx`
- Test: `apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// inside describe("AppStateProvider — API read path", ...) or a new read-only describe
it("refuses writes (no optimistic change) when in snapshot read-only mode", async () => {
  const { saveDomain } = await import("@/lib/state/snapshot-store");
  saveDomain("test-token-abc", "accounts", [mockAccount("snap-1", "Snap")]);
  vi.mocked(endpoints.fetchAccounts).mockRejectedValue(new Error("down"));
  const createSpy = vi
    .spyOn(endpoints, "createExpenseTransaction")
    .mockResolvedValue({} as Transaction);

  const { result } = renderHook(() => useAppState(), {
    wrapper: AppStateProvider,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.readOnly).toBe(true);
  const txCountBefore = result.current.transactions.length;

  await act(() =>
    result.current.addTransaction({
      id: "tx-ro", description: "blocked", amountCents: 100, date: "2026-06-25",
      kind: "expense", categoryId: "cat1", accountId: "acc1",
    }),
  );

  // no optimistic insert, no API call, explicit writeError
  expect(result.current.transactions).toHaveLength(txCountBefore);
  expect(createSpy).not.toHaveBeenCalled();
  expect(result.current.writeError).toMatch(/somente leitura|indisponível/i);
});

it("refuses writes when an essential domain is unavailable (backend down, no snapshot)", async () => {
  // No snapshot saved -> failed essential domain becomes "unavailable" -> readOnly ON.
  vi.mocked(endpoints.fetchAccounts).mockRejectedValue(new Error("down"));
  const createSpy = vi
    .spyOn(endpoints, "createExpenseTransaction")
    .mockResolvedValue({} as Transaction);

  const { result } = renderHook(() => useAppState(), {
    wrapper: AppStateProvider,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.readOnly).toBe(true);
  const txCountBefore = result.current.transactions.length;

  await act(() =>
    result.current.addTransaction({
      id: "tx-unavail", description: "blocked", amountCents: 100, date: "2026-06-25",
      kind: "expense", categoryId: "cat1", accountId: "acc1",
    }),
  );

  expect(result.current.transactions).toHaveLength(txCountBefore);
  expect(createSpy).not.toHaveBeenCalled();
  expect(result.current.writeError).toMatch(/somente leitura|indisponível/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "refuses writes"`
Expected: FAIL — mutator currently inserts optimistically and calls the API.

- [ ] **Step 3: Add a read-only guard at the top of each mutator**

Add a guard helper:

```ts
  const guardReadOnly = useCallback((): boolean => {
    if (readOnlyRef.current) {
      setWriteError("Backend indisponível — modo somente leitura.");
      return true;
    }
    return false;
  }, []);
  const guardReadOnlyRef = useRef(guardReadOnly);
  guardReadOnlyRef.current = guardReadOnly;
```

At the very first line of every mutator body (before any optimistic `setX`), add:

```ts
    if (guardReadOnlyRef.current()) return;
```

Apply to all 12 mutators listed in Task 5 Step 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "refuses writes"`
Expected: PASS.

- [ ] **Step 5: Run the full provider suite**

Run: `cd apps/pwa && npx vitest run src/lib/state/__tests__/app-state-context.test.tsx`
Expected: PASS. (Existing write tests run in the live path where `readOnly === false`, so the guard is a no-op for them.)

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/lib/state/app-state-context.tsx apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx
git commit -m "feat(pwa): block writes in snapshot read-only mode"
```

---

## Phase 2 — UI Honesty

### Task 7: Remove synthetic statement history from CardsPage

**Files:**
- Modify: `apps/pwa/src/features/cards/CardsPage.tsx:602-622`
- Test: `apps/pwa/src/features/cards/__tests__/CardsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/pwa/src/features/cards/__tests__/CardsPage.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import CardsPage from "../CardsPage";

// Runs in mock mode (no API configured in jsdom): mockAccounts has credit cards,
// cardStatements starts empty -> history section must show the honest empty state.
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", undefined as unknown as string);
});

describe("CardsPage — statement history", () => {
  it("shows an honest empty state instead of synthetic months when no statements", async () => {
    render(<CardsPage />);
    // open the first card detail
    await userEvent.click(screen.getByText("Nubank Crédito"));
    expect(
      screen.getByText(/Nenhuma fatura anterior registrada/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pwa && npx vitest run src/features/cards/__tests__/CardsPage.test.tsx`
Expected: FAIL — synthetic month rows render; the empty-state text is absent.

- [ ] **Step 3: Replace the synthetic fallback**

In `CardsPage.tsx`, replace the `else` branch of the statement-history block (the `[1, 2, 3, 4, 5].map(...)` synthetic generator) with:

```tsx
                    ) : (
                      <div className="px-4 py-6 text-center text-[12px] text-text-muted">
                        Nenhuma fatura anterior registrada.
                      </div>
                    )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pwa && npx vitest run src/features/cards/__tests__/CardsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/features/cards/CardsPage.tsx apps/pwa/src/features/cards/__tests__/CardsPage.test.tsx
git commit -m "fix(pwa): drop synthetic statement history in CardsPage"
```

---

### Task 8: GoalsPage debts — honest empty when API configured

**Files:**
- Modify: `apps/pwa/src/features/goals/GoalsPage.tsx`
- Test: `apps/pwa/src/features/goals/__tests__/GoalsPage.test.tsx`

> With Task 3a/3b, `debts` is already `[]` when the API is configured. This task makes the debts tab render an honest "not implemented" empty state (no endpoint exists yet) instead of relying on whatever `debts` holds.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/pwa/src/features/goals/__tests__/GoalsPage.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GoalsPage from "../GoalsPage";
import * as ctx from "@/lib/state/app-state-context";

// Stub the context so the test does not depend on the provider/API (no flake, fully deterministic).
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(ctx, "useAppState").mockReturnValue({
    goals: [],
    debts: [], // backend mode -> debts empty (no endpoint)
    loading: false,
    error: null,
  } as unknown as ctx.AppState);
});

describe("GoalsPage — debts tab", () => {
  it("shows 'não implementado' state, never mock debts, in backend mode", async () => {
    render(<GoalsPage />);
    await userEvent.click(screen.getByText("Dívidas"));
    expect(screen.getByText(/não disponível|em breve|não implementad/i)).toBeInTheDocument();
  });
});
```

> Read `GoalsPage.tsx` around the debts tab (line ~139) to confirm the exact button label is `Dívidas` and that the stub provides every field `GoalsPage` destructures from `useAppState()` (currently `goals, debts, loading, error`). Add any missing field to the stub.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pwa && npx vitest run src/features/goals/__tests__/GoalsPage.test.tsx`
Expected: FAIL — current debts empty branch shows a generic message, not an explicit "não implementado" one (or shows mock when not configured).

- [ ] **Step 3: Update the debts empty branch**

In `GoalsPage.tsx`, find the debts list render (`debts.length === 0 ? (...)` around line 139) and set its empty state to an explicit not-implemented message:

```tsx
          ) : debts.length === 0 ? (
            <div className="py-[50px] text-center text-text-muted">
              <div className="text-[14px] font-semibold">Dívidas em breve</div>
              <div className="mt-1 text-[12px]">
                O acompanhamento de dívidas ainda não está disponível.
              </div>
            </div>
          ) : (
```

> Keep the existing `debts.map(...)` branch unchanged — it only renders when real debts exist (future endpoint).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pwa && npx vitest run src/features/goals/__tests__/GoalsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/features/goals/GoalsPage.tsx apps/pwa/src/features/goals/__tests__/GoalsPage.test.tsx
git commit -m "fix(pwa): honest not-implemented state for debts tab"
```

---

### Task 9: StaleBanner + wire into Home and Cards

**Files:**
- Create: `apps/pwa/src/components/StaleBanner.tsx`
- Test: `apps/pwa/src/components/__tests__/StaleBanner.test.tsx`
- Modify: `apps/pwa/src/features/home/HomePage.tsx`, `apps/pwa/src/features/cards/CardsPage.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/pwa/src/components/__tests__/StaleBanner.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaleBanner } from "../StaleBanner";
import * as ctx from "@/lib/state/app-state-context";

beforeEach(() => vi.restoreAllMocks());

function stub(accountsSource: "live" | "snapshot" | "unavailable") {
  vi.spyOn(ctx, "useAppState").mockReturnValue({
    readOnly: accountsSource !== "live",
    sync: {
      accounts: { source: accountsSource, syncedAt: "2026-06-20T10:00:00.000Z" },
      categories: { source: "live", syncedAt: null },
      transactions: { source: "live", syncedAt: null },
      payables: { source: "live", syncedAt: null },
      budgets: { source: "live", syncedAt: null },
      goals: { source: "live", syncedAt: null },
      subscriptions: { source: "live", syncedAt: null },
      cardStatements: { source: "live", syncedAt: null },
    },
  } as unknown as ctx.AppState);
}

describe("StaleBanner", () => {
  it("renders nothing when the watched domains are all live", () => {
    stub("live");
    const { container } = render(<StaleBanner domains={["accounts"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a stale read-only warning when a watched domain is snapshot", () => {
    stub("snapshot");
    render(<StaleBanner domains={["accounts"]} />);
    expect(screen.getByText(/desatualizados/i)).toBeInTheDocument();
  });

  it("renders a backend-unavailable warning when a watched domain is unavailable", () => {
    stub("unavailable");
    render(<StaleBanner domains={["accounts"]} />);
    expect(screen.getByText(/não foi possível carregar|indisponível/i)).toBeInTheDocument();
  });

  it("ignores domains the screen does not watch", () => {
    stub("snapshot"); // accounts is snapshot, but we only watch goals
    const { container } = render(<StaleBanner domains={["goals"]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pwa && npx vitest run src/components/__tests__/StaleBanner.test.tsx`
Expected: FAIL — "Cannot find module '../StaleBanner'".

- [ ] **Step 3: Implement StaleBanner**

```tsx
// apps/pwa/src/components/StaleBanner.tsx
"use client";

import { useAppState } from "@/lib/state/app-state-context";
import type { DomainKey } from "@/lib/state/snapshot-store";

interface StaleBannerProps {
  /** Which domains this screen depends on. Banner shows if any is served from snapshot. */
  domains: DomainKey[];
}

export function StaleBanner({ domains }: StaleBannerProps) {
  const { sync } = useAppState();
  const snapshotted = domains.filter((d) => sync[d].source === "snapshot");
  const unavailable = domains.filter((d) => sync[d].source === "unavailable");
  if (snapshotted.length === 0 && unavailable.length === 0) return null;

  // Prefer the "stale snapshot" message when we have cached data to show;
  // otherwise it's a hard "could not load" (unavailable, empty).
  if (snapshotted.length > 0) {
    const oldest = snapshotted
      .map((d) => sync[d].syncedAt)
      .filter((s): s is string => s !== null)
      .sort()[0];
    const when = oldest
      ? new Date(oldest).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
      : null;
    return (
      <div className="mx-5 mb-3 rounded-[12px] bg-fill-light px-4 py-2.5 text-[12px] font-semibold text-text-secondary">
        ⚠ Dados desatualizados — modo somente leitura.
        {when ? ` Última sincronização: ${when}.` : ""}
      </div>
    );
  }

  return (
    <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">
      ⚠ Não foi possível carregar os dados — backend indisponível (modo somente leitura).
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pwa && npx vitest run src/components/__tests__/StaleBanner.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into CardsPage**

In `CardsPage.tsx`, add the import:

```tsx
import { StaleBanner } from "@/components/StaleBanner";
```

Immediately after the existing `{error && (...)}` block (after the danger banner near the top of `<main>`), add:

```tsx
        <StaleBanner domains={["accounts", "cardStatements", "transactions"]} />
```

- [ ] **Step 6: Wire into HomePage**

In `HomePage.tsx`, add the import:

```tsx
import { StaleBanner } from "@/components/StaleBanner";
```

In the main return (the non-loading branch), immediately after the first `<StatusBar />`, add:

```tsx
      <StaleBanner domains={["accounts", "transactions", "payables", "budgets"]} />
```

> Read the surrounding JSX first to place it inside the scrollable container and match indentation. Do not alter layout otherwise (Não-objetivo #1: no redesign).

- [ ] **Step 7: Run the affected suites**

Run: `cd apps/pwa && npx vitest run src/components/__tests__/StaleBanner.test.tsx src/features/cards/__tests__/CardsPage.test.tsx`
Expected: PASS. (CardsPage test runs in mock mode → all domains live → banner renders nothing → no interference.)

- [ ] **Step 8: Commit**

```bash
git add apps/pwa/src/components/StaleBanner.tsx apps/pwa/src/components/__tests__/StaleBanner.test.tsx apps/pwa/src/features/home/HomePage.tsx apps/pwa/src/features/cards/CardsPage.tsx
git commit -m "feat(pwa): stale-data read-only banner on Home and Cards"
```

---

## Phase 3 — Verification

### Task 10: Full suite + typecheck + manual integrated verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full PWA test suite**

Run: `cd apps/pwa && npx vitest run`
Expected: PASS — all suites green, including the rewritten provider tests.

- [ ] **Step 2: Typecheck and lint**

Run: `cd apps/pwa && npx tsc --noEmit && npm run lint`
Expected: no type errors, no lint errors.

- [ ] **Step 3: Manual integrated verification (spec §11.3)**

With a real/local backend configured (`NEXT_PUBLIC_PI_FINANCE_API_BASE_URL` set, device registered, PIN unlocked):

1. Write a record directly in the backend (e.g. insert a transaction via the API or DB).
2. Reload the PWA.
3. Confirm the record appears in the PWA (backend is source of truth).
4. Stop/break the backend (simulate 5xx/offline), reload.
5. Confirm: previously-synced domains show snapshot data with the StaleBanner ("modo somente leitura"); a write attempt is refused with a clear message; no synthetic/mock data appears anywhere.
6. Invalidate the device token server-side, trigger any fetch/write → confirm the app returns to `AuthGate` registration (runtime 401) and no stale financial data remains visible.

- [ ] **Step 4: Commit (if any verification-driven fixups were needed)**

```bash
git add -A
git commit -m "chore(pwa): verification fixups for backend source-of-truth"
```

---

## Deferred follow-ups (named, not silently dropped)

1. **Wire `StaleBanner` into the remaining screens** (spec §9.2–9.10): Records, Accounts, Subscriptions, Payables, Categories, Wallet, Goals, Budgets — each with its relevant `domains`. Deferred to keep this phase reviewable and honor Não-objetivo #1 (no redesign). Home + Cards ship now as the highest-risk surfaces.
2. **Re-sync trigger beyond full reload** (spec objetivo 4): pull-to-refresh or `visibilitychange` refetch. This phase relies on full page reload only (`loadedRef` runs `load()` once).
3. **Debts endpoint**: when `pi-finance-api` exposes debts, add `fetchDebts`, a `setDebts` setter, include it in `load()`/snapshot, and replace the GoalsPage "em breve" empty state with real data.

---

## Self-Review

**1. Spec coverage:**
- §6.3 per-domain failure → Task 4. ✓
- §6.4 runtime 401 → Tasks 2 (channel), 4 (read path), 5 (write path). ✓
- §6.5 configured-no-token invariant → Task 3b (empty, loading=false). ✓
- §7.1 init keyed by `isApiConfigured()` → Task 3b. ✓
- §7.2 snapshot (token-scoped, schema v1, syncedAt) → Task 1; snapshot purge on session reset → Task 2. ✓
- §7.3 `dataSource`/`readOnly` + write block → Tasks 3a, 6. ✓
- §8 writes: live optimistic+rollback unchanged; read-only refused → Task 6. ✓
- §9.4 CardsPage synthetic history → Task 7. ✓
- §9.9 debts leak → Tasks 3a/3b (empty when configured) + 8 (honest empty). ✓
- §11.1 provider tests → Tasks 3a–6. §11.2 screen tests → Tasks 7, 8. §11.3 integrated → Task 10. ✓
- Stale signaling → Task 9 (Home + Cards), rest deferred (named). ✓

**2. Placeholder scan:** No "TBD"/"similar to Task N". Each code step shows full code. The "read the surrounding file first" notes (AuthGate pin key, HomePage anchor, GoalsPage label/stub fields) are verification instructions, not missing content.

**3. Type consistency:** `DomainKey` (snapshot-store) reused everywhere; `DataSource = "live" | "snapshot" | "unavailable" | "mock"` + `DomainSync` defined in Task 3a and used by Tasks 4, 6, 9. `STALE_SOURCES` defined in Task 3a, drives `readOnly` (Task 3a) and `StaleBanner` parity (Task 9). `expireSession` signature `(message?: string) => void` consistent across session-context, AuthGate, provider. `saveDomain(token, domain, data)` / `loadDomain(token, domain)` signatures stable across Tasks 1, 4, 6. Provider imports are split per task (Task 3a: `type DomainKey` + `useSession`; Task 4: `saveDomain`/`loadDomain` + `ApiError`) — no unused-import lint failures.

**4. Code-review fixes applied (Codex pass):**
- **readOnly leak (Task 4+6):** failure without snapshot now sets `source: "unavailable"` (not `"live"`), and `readOnly` derives from `STALE_SOURCES = ["snapshot", "unavailable"]`, so writes are blocked when an essential domain is down with no cache. Added Task 6 test "refuses writes when an essential domain is unavailable".
- **statements outside allSettled (Task 4):** `fetchStatements()` is now a first-class settled domain (index 7); `fetchCards()` dropped (it never fed `accounts`). 401 and snapshot hydration handled uniformly. `mockApiReads` updated to stub `fetchStatements`.
- **provider tree (Medium):** verified `RootProviders.tsx` order + remount-on-reset behavior; documented above.
- **GoalsPage test flake (Medium):** Task 8 now stubs `useAppState`, no provider/API dependency.
- **dead import (Nit):** Task 3a imports only `type DomainKey` + `useSession`; `clearSnapshot` lives only in AuthGate (Task 2).

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-26-pwa-backend-source-of-truth.md`.**
