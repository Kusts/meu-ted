# Pi Financeiro — PWA

Progressive Web App companion for [Pi Financeiro](..), a personal finance tracker
with WhatsApp integration.

Runs inside the `apps/pwa` directory of the monorepo.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16.2 (App Router) |
| Styling | Tailwind CSS v4 |
| State | React Context (`AppStateProvider`) |
| Testing | Vitest + Testing Library |
| Auth | Device token + PIN (PBKDF2) |
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
| `NEXT_PUBLIC_PI_FINANCE_API_DEVICE_TOKEN` | Optional pre-set device token (bypassed by auth flow) |

Without these, the PWA runs on local mock data.

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

Auth flow: `AuthGate` → device registration → PIN setup → unlock → app content.
Read more at `docs/superpowers/plans/2026-06-23-pwa-cloudflare-cutover.md`.
