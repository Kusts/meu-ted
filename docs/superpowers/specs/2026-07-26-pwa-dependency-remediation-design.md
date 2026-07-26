# PWA dependency remediation design

## Objective

Remove PWA scoped-audit high advisories without bypassing the audit gate or changing VPS/API.

## Approach

Use direct, compatible dependency upgrades only. Do not add global `sharp` or `brace-expansion` overrides and do not patch `minimatch`; those approaches broke OpenNext bundling or legacy consumers.

Apply upgrades in this order, validating `pnpm --dir apps/pwa build:cloudflare` after each increment:

1. `next` with matching `eslint-config-next`.
2. `@opennextjs/cloudflare` and its supported transitive toolchain.
3. `@lhci/cli`.
4. Direct ESLint packages when an upstream compatible release removes remaining advisories.

Correct PWA CI path filtering to watch `scripts/pwa-audit.mjs`, the script actually executed by the workflow.

## Verification

Before commit, pass:

- Node 20 / pnpm 9 Linux `pnpm install --frozen-lockfile`.
- Scoped audit with zero advisories, unless a separately approved documented exception exists.
- PWA lint, Vitest, headers, Lighthouse CI, Cloudflare build, fixture E2E, offline E2E, and `git diff --check`.

Push only after local gates pass. Deploy only after PWA CI is fully green and a new explicit user authorization. The VPS/API are out of scope.
