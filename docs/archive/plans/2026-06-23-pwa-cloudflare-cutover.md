# PWA Cloudflare Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/pwa` production-usable inside `pi-financeiro`, ready for Cloudflare preview deploy, and positioned to replace `../pi-finance-web`.

**Architecture:** Keep the frontend in `apps/pwa`, keep financial/backend logic in sibling `../pi-finance-api`, and keep `apps/whatsapp-bridge` transport-only. Deliver in slices: auth/session first, then real API parity on core screens, then Cloudflare deployment config, then installable PWA assets/offline, then smoke/E2E hardening.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Cloudflare-compatible Next deployment target, sibling `pi-finance-api` REST backend.

**Agent Orchestration:** Supervisor-Workers — planner owns strategy/review, `worker1` implements slice-by-slice.

---

### Agentic Design Patterns for Plan Execution

| Pattern | Best For | Structure |
|---------|----------|-----------|
| **Supervisor-Workers** | Multiple sequential slices across auth, data, deploy, and PWA runtime | 1 planner delegates implementation slices to 1 coder and validates between slices |

---

## Constraints

- Frontend stays in `apps/pwa`; no move to `../pi-finance-web`.
- Financial domain/backend stays out of `apps/whatsapp-bridge`.
- Real backend target is sibling repo `../pi-finance-api`.
- TDD per slice.
- Every slice must end with local verification in `apps/pwa`.
- Planner does not edit product code; planner may write/update plan docs only.

## Target Outcomes

1. `apps/pwa` has device registration + PIN unlock flow.
2. Core pages read/write against real API when envs exist.
3. `apps/pwa` can build for Cloudflare preview from monorepo path `apps/pwa`.
4. App is installable as a PWA with manifest/icons/basic offline behavior.
5. Critical smoke path is test-covered.

## Slice Order

1. **Slice A — Auth/session parity**
2. **Slice B — Real API integration for core flows**
3. **Slice C — Cloudflare deploy target**
4. **Slice D — Installable PWA runtime**
5. **Slice E — Smoke/E2E hardening**

---

## Slice A — Auth/session parity

**Goal:** Port the old `pi-finance-web` device token + PIN gate into `apps/pwa`.

**Files likely touched:**
- Create: `apps/pwa/src/features/auth/AuthGate.tsx`
- Create: `apps/pwa/src/features/auth/__tests__/AuthGate.test.tsx`
- Create: `apps/pwa/src/lib/auth/token-store.ts`
- Create: `apps/pwa/src/lib/auth/token-store.test.ts`
- Create: `apps/pwa/src/lib/auth/pin-store.ts`
- Create: `apps/pwa/src/lib/auth/pin-store.test.ts`
- Create: `apps/pwa/src/lib/reset-session.ts`
- Modify: `apps/pwa/src/app/layout.tsx`
- Modify: `apps/pwa/src/lib/api/client.ts`
- Modify: `apps/pwa/src/lib/test-utils.tsx`

**Acceptance:**
- No token → register screen.
- Valid token + no PIN → setup PIN.
- Valid token + PIN → unlock screen before app content.
- Invalid token on `/auth/devices/me` → local session reset + re-register prompt.
- Existing app tests stay green.

**Verification:**
- `cd apps/pwa && pnpm test src/features/auth/__tests__/AuthGate.test.tsx src/lib/auth/token-store.test.ts src/lib/auth/pin-store.test.ts`
- `cd apps/pwa && pnpm test && pnpm build && pnpm lint`

---

## Slice B — Real API integration for core flows

**Goal:** Replace practical dependence on mock-only state for the most important user actions.

**Files likely touched:**
- Modify: `apps/pwa/src/lib/api/endpoints.ts`
- Modify: `apps/pwa/src/lib/state/app-state-context.tsx`
- Modify: `apps/pwa/src/components/AppShell.tsx`
- Modify: core features under `apps/pwa/src/features/{home,records,payables,cards,budgets,goals,wallet,accounts,categories}/**`
- Add tests near affected features/context

**Acceptance:**
- Reads from API when envs are present.
- Writes use real endpoints for expense/income/delete/payable-paid and any already-supported core CRUD.
- Mock fallback remains safe when envs are absent.
- Loading/error/empty states surface per page where needed.

**Verification:**
- targeted tests per touched feature
- `cd apps/pwa && pnpm test && pnpm build && pnpm lint`

---

## Slice C — Cloudflare deploy target

**Goal:** Make `apps/pwa` deployable from monorepo path `apps/pwa` to Cloudflare preview/production.

**Files likely touched:**
- Modify: `apps/pwa/package.json`
- Modify: `apps/pwa/next.config.ts`
- Create: `apps/pwa/wrangler.jsonc` or `apps/pwa/wrangler.toml`
- Create/modify: `apps/pwa/README.md` or root deploy notes
- Optional: `.github/workflows/*` if repo CI should deploy later

**Acceptance:**
- Build target for Cloudflare is explicit and documented.
- Required env vars are documented:
  - `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL`
  - `NEXT_PUBLIC_PI_FINANCE_API_DEVICE_TOKEN`
- Monorepo root/subdir deploy steps are written down.

**Verification:**
- local production build command exits 0
- deploy config file parses

---

## Slice D — Installable PWA runtime

**Goal:** Add manifest/icons/runtime metadata/basic offline strategy.

**Files likely touched:**
- Create: `apps/pwa/public/*` icons
- Create: `apps/pwa/src/app/manifest.ts` or `public/manifest.webmanifest`
- Modify: `apps/pwa/src/app/layout.tsx`
- Create/modify: service worker registration/runtime files depending on chosen Cloudflare/Next-compatible approach

**Acceptance:**
- App exposes manifest + icons.
- Metadata has theme color/name.
- Basic offline/read-only behavior documented or implemented.

**Verification:**
- build output includes manifest assets
- browser smoke confirms install metadata present

---

## Slice E — Smoke/E2E hardening

**Goal:** Cover the production-critical happy path before cutover.

**Files likely touched:**
- Create: `apps/pwa/e2e/**` if Playwright is adopted here
- Or add smoke/integration tests under `src/**/__tests__`
- Modify: `apps/pwa/package.json`

**Acceptance:**
- Covers: register device, set PIN, unlock, navigate, create transaction, mark payable paid.
- All local quality gates green.

**Verification:**
- test command(s) documented and green
- `cd apps/pwa && pnpm test && pnpm build && pnpm lint`

---

## Dispatch Strategy

- Start with **Slice A** because everything else depends on a real session model.
- Only move to Slice B after auth/session is green.
- Only prepare Cloudflare deploy after the app can authenticate and talk to the real API.

## External blockers to track

- public URL / tunnel for `pi-finance-api`
- API CORS for the future PWA domain
- Cloudflare credentials and account/project setup
- final domain choice
