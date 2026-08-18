# PWA Cloudflare release

## Scope

PWA Worker `pi-finance-pwa`. API VPS is out of scope. Never deploy or roll back without explicit human confirmation.

## Preflight

```bash
git status --short
pnpm --dir apps/pwa lint
pnpm --dir apps/pwa build:cloudflare
pnpm --dir apps/pwa exec vitest run
pnpm --dir apps/pwa exec vitest run src/headers.test.ts
pnpm --dir apps/pwa exec playwright test --config=scripts/offline-shell-spike/playwright.config.ts
```

Continue only when every command exits `0` and `git status --short` is empty.

## Deploy — explicit confirmation required

```bash
SHA="$(git rev-parse --short=12 HEAD)"
pnpm --dir apps/pwa build:cloudflare
pnpm --dir apps/pwa exec wrangler deploy --message "git:${SHA}"
pnpm --dir apps/pwa exec wrangler versions list --name pi-finance-pwa
```

Record returned Worker version ID and SHA in release notes.

## Public health checks

```bash
curl --fail --silent --show-error https://pi-finance-pwa.walissonead.workers.dev/
curl --fail --silent --show-error https://pi-finance-pwa.walissonead.workers.dev/sw.js
curl --fail --silent --show-error https://pi-finance-pwa.walissonead.workers.dev/manifest.webmanifest
curl --fail --silent --show-error https://pi-finance-pwa.walissonead.workers.dev/pwa-control
```

`/pwa-control` must return JSON with `"enabled":true`.

## Production smoke (post-deploy, read-only)

Run the manual GitHub Actions workflow `production-smoke.yml` against the target production URL or run locally:

```bash
E2E_PRODUCTION_SMOKE=1 E2E_PRODUCTION_URL=https://pi-finance-pwa.walissonead.workers.dev pnpm --dir apps/pwa e2e:production-smoke
```

## Rollback — explicit confirmation required

Version `817a9ac0-6f64-455d-b811-471e0bcb96a6` was healthy before this runbook. Verify it remains the intended rollback target with `wrangler versions list` before use.

```bash
SHA="$(git rev-parse --short=12 HEAD)"
pnpm --dir apps/pwa exec wrangler rollback 817a9ac0-6f64-455d-b811-471e0bcb96a6 --name pi-finance-pwa --message "rollback git:${SHA}"
```

Re-run public health checks and the same read-only production smoke workflow after rollback.
