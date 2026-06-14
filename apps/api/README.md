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
- In-memory read models; persistence adapter is a future swap.
- Bridge stays untouched.

## Next slices (planned)

- CRUD endpoints for accounts, categories, transactions
- Card module endpoints (module 2)
- Real persistence adapter behind the same `ReadModelStore` interface
- Device registration + revocation flow
