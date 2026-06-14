# pi-finance-api

Private finance REST API for the iPhone finance app (V1).

**Separate from `apps/whatsapp-bridge`.** The WhatsApp bridge remains
transport-only; the iPhone app talks to this API through Cloudflare
Tunnel. Both bridge and API share the same financial database truth —
this V1 ships with in-memory read models, and the persistence adapter
will replace them later.

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node ≥ 20, ESM |
| HTTP | Fastify 5 |
| Validation | Zod |
| Tests | Vitest |
| Lang | TypeScript (strict, `exactOptionalPropertyTypes`) |

## Endpoints (V1)

All finance endpoints require `X-Device-Token`. The server derives the
household from the token — client-supplied household hints are ignored
(spec REQ-3A).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness |
| `GET` | `/auth/devices/me` | Validate current device token |
| `GET` | `/accounts?kind=bank\|cash\|credit_card` | List active accounts (V1 filters out credit cards) |
| `GET` | `/categories?kind=expense\|income` | List active categories |
| `GET` | `/transactions?…` | List with V1 filters (see below) |
| `GET` | `/dashboard/summary` | Totals, balances, top expenses |
| `GET` | `/insights/quick` | Up to 5 quick PT-BR insight cards |

### `GET /transactions` V1 filters

| Param | Type | Notes |
|---|---|---|
| `startDate`, `endDate` | `YYYY-MM-DD` | Range, inclusive |
| `accountId`, `categoryId` | UUID | |
| `kind` | `expense\|income\|transfer` | |
| `minAmountCents`, `maxAmountCents` | integer ≥ 0 | |
| `query` | string (1–120 chars) | Case-insensitive description search |
| `limit` | 1–200 (default 50) | |
| `offset` | ≥ 0 (default 0) | |

`startDate <= endDate` and `minAmountCents <= maxAmountCents` are
enforced via Zod refine.

## Auth (V1 demo)

- Tokens are looked up against an in-memory `DeviceTokenStore`.
- `dev-token-1` → household `11111111-…` (the demo household).
- Any other token → 401 `auth.invalid_token`.
- Missing header → 401 `auth.missing_token`.

The real implementation will validate against a `device_tokens` table.

## Setup

```bash
pnpm install
pnpm test          # Vitest
pnpm typecheck     # tsc --noEmit
pnpm dev           # tsx watch on port 3001
```

Env:

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3001` | |
| `HOST` | `0.0.0.0` | |
| `CORS_ORIGIN` | unset | Set to the PWA domain for browser CORS (e.g. `https://pi-finance-web.pages.dev`) |

## Deploy (production on Windows)

## Layout

```
src/
├── auth/device-token.ts      # token → household derivation
├── lib/dashboard.ts          # pure aggregator
├── lib/insights.ts           # pure insight generator
├── read-models/store.ts      # in-memory store (swap for Postgres later)
├── read-models/demo-data.ts  # V1 seed
├── routes/                   # one file per resource
├── server/index.ts           # Fastify entrypoint
└── types/                    # domain types + Zod schemas
tests/
├── auth/
├── fixtures/seed.ts          # 2 households, A vs B scoping
├── routes/
└── test-app.ts               # Fastify + deps builder for tests
```

## V1 scope (per iphone-finance-app-design)

- Read-only: no POST/PATCH/DELETE in V1.
- Single household derived server-side; multi-tenant SaaS is out of scope.
- Bridge stays untouched.

## Deploy (production on Windows)

The API runs locally on the user's PC and is exposed via Cloudflare Tunnel for HTTPS access from the PWA.

### Setup

1. Install cloudflared: `winget install cloudflare.cloudflared` (or from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
2. `cloudflared tunnel login` — opens browser, authorizes your Cloudflare account.
3. `cloudflared tunnel create pi-finance-api` — generates a tunnel UUID and credentials file.
4. `cloudflared tunnel route dns pi-finance-api api.pi-finance.example.com` — maps the tunnel to a DNS record.
5. Copy `cloudflared-config.example.yml` to `~/.cloudflared/config.yml`.
6. Update `config.yml` with your tunnel UUID and hostname.

### Run

```bash
# Terminal 1 — API
cp .env.example .env   # configure DATABASE_URL, CORS_ORIGIN, PORT
pnpm start             # or: pnpm db:migrate && pnpm start

# Terminal 2 — Tunnel
cloudflared tunnel run pi-finance-api
```

The API is now accessible at `https://api.pi-finance.example.com`.

### CORS

Set `CORS_ORIGIN=https://pi-finance-web.pages.dev` in `.env` to allow the PWA to call the API from the browser.

CORS is disabled by default (no open CORS). When `CORS_ORIGIN` is set, the API adds `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`, and handles OPTIONS preflight.

## Persistence

Two `ReadModelStore` implementations behind one interface:

| Backend | When | File |
|---|---|---|
| In-memory | `DATABASE_URL` unset (dev/test default) | `src/read-models/store.ts` |
| Postgres | `DATABASE_URL` set | `src/read-models/postgres-store.ts` |

The in-memory store is the dev/test fallback. Postgres becomes the
backend when `DATABASE_URL` is set; the server runs migrations on
startup. Both backends are exercised by the **same contract suite** at
`tests/contract/read-model-store.contract.ts`.

### Schema & migrations

SQL lives in `src/read-models/sql/V###__*.sql`. The forward-only
runner (`src/read-models/sql/migrate.ts`) applies pending migrations
and records them in `_migrations`.

```bash
pnpm db:migrate                  # apply pending migrations
# Uses DATABASE_URL from .env or environment.
```

### Postgres integration test (gated)

```bash
# 1. Create a dedicated test database (idempotent)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pi_finance_api_test \
  pnpm tsx src/scripts/create-test-db.ts

# 2. Run migrations
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pi_finance_api_test \
  pnpm db:migrate

# 3. Run the full suite (in-memory + postgres contract)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pi_finance_api_test \
  pnpm test
```

Without `DATABASE_URL` set, the Postgres contract suite is skipped and
the in-memory contract still proves the same behavior.

### Seeding the demo household

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pi_finance_api_test \
  pnpm tsx src/scripts/seed-demo.ts
```

Inserts the V1 demo accounts, categories, transactions, and a
`dev-token-1` device token pointing at the demo household — exactly
what the in-memory store serves by default.

## Next slices (planned)

- CRUD endpoints for accounts, categories, transactions
- Card module endpoints (module 2)
- Postgres-backed device-token store (table exists; auth still uses
  in-memory lookup for V1)
- Device registration + revocation flow
