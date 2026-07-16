# Pi Financeiro — PWA

Progressive Web App companion for [Pi Financeiro](..), a personal finance tracker
with WhatsApp integration.

Runs inside the `apps/pwa` directory of this monorepo.
Este diretório é o frontend canônico atual do produto.
`../pi-finance-web` deve ser tratado apenas como legado/histórico.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16.2 (App Router) |
| Styling | Tailwind CSS v4 |
| State | React Context (`AppStateProvider`) |
| Testing | Vitest + Testing Library |
| Auth | Device token (localStorage), PIN intentionally removed |
| API Client | Sibling `../pi-finance-api` |
| Deployment | Cloudflare Workers via `@opennextjs/cloudflare` |

## Root Directory

All commands run from `apps/pwa`:

```bash
cd apps/pwa
```

## Getting Started

```bash
pnpm install
pnpm dev        # Next.js dev server on localhost:3000
pnpm test       # 130+ Vitest tests
pnpm build      # Standard Next.js build
pnpm lint       # ESLint
```

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL` | Base URL of sibling `pi-finance-api` (e.g. `https://api.example.com`) |

Without this variable, the PWA runs entirely on local mock data **without** any
network requests. The `AuthGate` is bypassed, so no `/auth/devices/register`
call is made. All data comes from in-memory mocks.

## Environment Behavior

| `BASE_URL` set | `BASE_URL` unset |
|---|---|
| AuthGate renders → device registration required | Mock mode: AuthGate bypassed, all features functional |
| Reads from `localStorage.getItem("pi-finance:token")` | No token needed, data is mocked |
| Fetches live data from the API | Zero network requests |

> **Security note:** The device token is stored in `localStorage` under the key
> `pi-finance:token`. This is intentionally JavaScript-accessible — the PWA
> acts as a first-party client to its own backend and does not support
> third-party embed scenarios. No `NEXT_PUBLIC_*` env-based token mechanism
> is used.

## Cloudflare Deployment

The app targets Cloudflare Workers via `@opennextjs/cloudflare`.

### Local Preview

```bash
pnpm preview
```

Builds the app for Cloudflare with `opennextjs-cloudflare build` and starts
`wrangler dev` locally (port 8787).

**Windows:** The OpenNext build creates symlinks during the bundle step.
Enable Developer Mode (`Settings → Privacy & security → For developers`)
or run the terminal as Administrator before building.

### Deploy to Production

```bash
pnpm deploy
```

Builds, adapts, and deploys to the Cloudflare account configured in `wrangler.jsonc`.

### R2 Cache (Optional)

For Incremental Static Regeneration (ISR), set up an R2 bucket:

1. Create bucket `pi-finance-pwa-cache` in Cloudflare Dashboard → R2
2. Uncomment the `r2_buckets` binding in `wrangler.jsonc`
3. Uncomment `r2IncrementalCache` in `open-next.config.ts`

Without R2, static pages work correctly; ISR revalidation is skipped.

### Configuration Files

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | Worker name, entry point, compatibility flags, R2 binding |
| `open-next.config.ts` | OpenNext adapter config (cache strategy) |
| `next.config.ts` | Standard Next.js config |

### Manual Commands

```bash
pnpm build:next:cloudflare              # Next.js webpack build for Cloudflare
pnpm opennextjs-cloudflare build --skipBuild   # OpenNext adapt (skip next build)
pnpm wrangler dev                       # Start local Wrangler preview
pnpm opennextjs-cloudflare deploy       # Deploy without rebuild

## Security Middleware (Next.js 16 / OpenNext)

The app applies security headers + CSP nonce on every request via
`src/middleware.ts` with `export const runtime = "experimental-edge"`.

**Why not `src/proxy.ts`?** Next.js 16 recommends `proxy.ts` over the deprecated
`middleware.ts`, but a Next 16 `proxy.ts` cannot set a runtime and always runs on
Node.js (build error: *"Route segment config is not allowed in Proxy file. Proxy
always runs on Node.js runtime."*). OpenNext Cloudflare rejects Node.js middleware:

> ERROR Node.js middleware is not currently supported. Consider switching to Edge Middleware.

So `middleware.ts` (Edge) is **required** for the OpenNext/Cloudflare deploy to
build. The Next 16 `middleware.ts` deprecation **warning** is non-fatal (build
still succeeds); the OpenNext Node.js rejection is fatal (breaks `opennext build`).

**Migration trigger — switch to `src/proxy.ts` only when BOTH hold:**
1. OpenNext Cloudflare no longer errors `Node.js middleware is not currently supported`
   (after upgrading `@opennextjs/cloudflare`), **and**
2. Next.js 16+ allows an Edge runtime in `proxy.ts` (a `runtime` export is
   currently rejected).

Until then, keep `src/middleware.ts` (Edge). Do not "fix" the deprecation warning
by renaming to `proxy.ts` — it breaks the deploy.
```

## Architecture

```
apps/pwa/
├── src/
│   ├── app/            # Next.js App Router pages
│   ├── components/     # Reusable UI (AppShell, BottomNav, etc.)
│   ├── features/       # Feature pages (home, records, cards, auth, …)
│   └── lib/            # Auth, API client, state management, tokens
├── wrangler.jsonc
├── open-next.config.ts
└── package.json
```

Auth flow (API configured): `RootProviders` → `AuthGate` → device registration (no PIN) → app content.
Mock flow (no API): `RootProviders` bypasses `AuthGate`, renders `AppStateProvider` directly with mock data.
Read more at `docs/superpowers/plans/2026-06-23-pwa-cloudflare-cutover.md`.
