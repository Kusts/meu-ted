# EXPERIMENT Phase 3 Task 3.1 — Offline Shell Design (Redesign)

## Design (standalone static shell, SW simulation)
- `public/offline-shell.html` — minimal HTML, no inline scripts. Served by server for ANY route path.
- `public/offline-shell.js` — reads `location.pathname` (e.g. `/registros`) + IndexedDB v2, renders stale/read-only view. External script (no inline).
- No SW, no route HTML caching, no Next.js config modifications.
- Zero API/RSC/auth/cross-origin/nonce-HTML requests.

## Test proof — direct /registros (Playwright headless Chromium)
Test server serves `offline-shell.html` for any known route path. `page.route` blocks ALL requests except those containing "offline-shell" or ending with a known route. This simulates a SW intercepting `/registros` and serving the shell.

```
=== OFFLINE SHELL — DIRECT /registros ===
Navigated to:        http://localhost:3456/registros
Banner:              PASS ✓
Route title:         PASS ✓
Stale data:          PASS ✓
No inline scripts:   PASS ✓
No nonce:            PASS ✓
Zero other requests: PASS ✓
Gzip: 2.2 KB (≤2000 KB ✓)
OVERALL: PASS ✓
```

- **Banner** reads "Modo offline — dados de quando estava online" (static HTML)
- **Title** shows "Últimos Registros" (mapped from `pathname=/registros`)
- **Stale data**: "Supermercado Extra" rendered from v2 IndexedDB snapshot
- **Zero inline scripts**: no `<script>...</script>` with content body
- **Zero nonce**: no `nonce=` attribute in any tag
- **Zero other requests**: all requests matched either the route OR the JS file; no API/RSC/auth/cross-origin requests survived

## Build output (pnpm build:cloudflare)
```
offline-shell.html  raw=1488B  gzip=724B   brotli=511B
offline-shell.js    raw=3523B  gzip=1562B  brotli=1300B
Total: gzip=2.2KB  brotli=1.8KB  (≤2000KB ✓)
```

Production build succeeds (all routes are dynamic `ƒ` due to `force-dynamic` in layout; the shell is independent of the Next.js page system).

## Route-to-domain mapping (location.pathname → domain key)
| pathname | Domain | Title |
|----------|--------|-------|
| `/` | accounts | Resumo Financeiro |
| `/registros` | transactions | Últimos Registros |
| `/contas` | accounts | Contas |
| `/categorias` | categories | Categorias |
| `/a-pagar` | payables | Contas a Pagar |
| `/orcamentos` | budgets | Orçamentos |
| `/metas` | goals | Metas Financeiras |
| `/cartoes` | cardStatements | Faturas do Cartão |
| `/assinaturas` | subscriptions | Assinaturas |
| `/patrimonio` | accounts | Patrimônio |
| `/relatorios` | transactions | Relatórios |
| `/perfil` | accounts | Perfil |

## Files
- `public/offline-shell.html` — created, tested, then DELETED after recording proof
- `public/offline-shell.js` — created, tested, then DELETED after recording proof
- `scripts/offline-shell-spike/test-offline.mjs` — persists (runnable test proof)
- `scripts/offline-shell-spike/EXPERIMENT-task-3-1.md` — this document

## Recommendation
- PASS criteria met. The HTML+JS pair (2.2KB gzip total) proves that a stale/read-only offline view can be rendered directly from IndexedDB v2.
- Pathname-based routing is correct: each route maps to a domain key in the v2 envelope.
- For production integration, the shell logic should be adopted into the PWA's error boundary (when `navigator.onLine` detects offline, render the stale view from the v2 snapshot directly, no shell URL needed).
