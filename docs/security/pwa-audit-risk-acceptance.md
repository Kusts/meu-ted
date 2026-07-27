# PWA Audit Risk Acceptance

> Generated 2026-07-27 · Permanent · Owner: project-maintainer
>
> 18 vulnerabilities accepted under strict exact-field matching.
> No expiration — all blocked by ecosystem constraints (downgrades or missing upstream support).

## Runtime (2)

| ID | Package | Severity | Range | Reason |
|----|---------|----------|-------|--------|
| `pwa-2026-07-27-next` | next | high | 9.5.6-canary.0 - 10.0.7 \|\| 14.3.0-canary.0 - 16.3.0-preview.7 | Fix is downgrade 16.x → 14.2.35. Unacceptable regression. |
| `pwa-2026-07-27-sharp` | sharp | high | <0.35.0 | Inherited libvips CVEs. Fix via next upgrade (blocked above). |

## Build-time (5)

| ID | Package | Severity | Range | Reason |
|----|---------|----------|-------|--------|
| `pwa-2026-07-27-lhci-cli` | @lhci/cli | high | >=0.3.4 | Fix is downgrade 0.15.x → 0.3.3. |
| `pwa-2026-07-27-node-minify-core` | @node-minify/core | high | <=5.3.0 \|\| 8.0.6 \|\| 9.0.1 - 9.0.2 | Transitive via OpenNext. |
| `pwa-2026-07-27-opennextjs-aws` | @opennextjs/aws | high | * | Unbounded range. Requires upstream fix. |
| `pwa-2026-07-27-opennextjs-cloudflare` | @opennextjs/cloudflare | high | 0.3.0 - 0.6.6 \|\| >=1.16.0 | Fix is downgrade 1.20.x → 1.15.1. |
| `pwa-2026-07-27-chrome-launcher` | chrome-launcher | high | 0.3.1 - 0.13.4 | Transitive via @lhci/cli. |

## Dev-only (11)

| ID | Package | Severity | Range | Reason |
|----|---------|----------|-------|--------|
| `pwa-2026-07-27-eslint-config-array` | @eslint/config-array | high | <=0.22.0 | Transitive via eslint. Fix: eslint@10.8.0. |
| `pwa-2026-07-27-eslint-eslintrc` | @eslint/eslintrc | high | 0.0.1 \|\| >=0.1.1 | Transitive via eslint. Fix: eslint@10.8.0. |
| `pwa-2026-07-27-brace-expansion` | brace-expansion | high | <=5.0.7 | Transitive via eslint chain. |
| `pwa-2026-07-27-eslint` | eslint | high | 0.12.0 - 2.0.0-rc.1 \|\| 4.1.0 - 10.0.0-rc.2 | Fix: eslint@10.8.0. **Blocked**: eslint-plugin-react broken with eslint 10 (2026-07-27 attempt). |
| `pwa-2026-07-27-eslint-config-next` | eslint-config-next | high | >=10.2.1-canary.2 | Fix is downgrade 16.x → 0.2.4. |
| `pwa-2026-07-27-eslint-plugin-import` | eslint-plugin-import | high | >=1.15.0 | Peer deps lock to eslint ^2-^9. |
| `pwa-2026-07-27-eslint-plugin-jsx-a11y` | eslint-plugin-jsx-a11y | high | >=6.5.0 | Peer deps lock to eslint ^3-^9. |
| `pwa-2026-07-27-eslint-plugin-react` | eslint-plugin-react | high | >=7.23.0 | **Crashes on eslint 10**: `contextOrFilename.getFilename is not a function`. Tested 2026-07-27. |
| `pwa-2026-07-27-glob` | glob | high | 4.3.0 - 10.5.0 | Transitive via rimraf/eslint chain. |
| `pwa-2026-07-27-minimatch` | minimatch | high | 2.0.0 - 10.0.2 | Core transitive dep. Fixes blocked by parent chains. |
| `pwa-2026-07-27-rimraf` | rimraf | high | 2.3.0 - 3.0.2 \|\| 4.2.0 - 5.0.10 | Transitive via chrome-launcher. |

## Blockers summary

- **eslint@10**: crashes on `eslint-plugin-react` (2026-07-27 verified). Awaiting Next.js ecosystem migration.
- **next@14 downgrade**: unacceptable — 16.x is current, full PWA features depend on it.
- **opennextjs downgrade**: unacceptable — 1.20.x is current, 1.15.1 lacks Cloudflare fixes.
- **lhci downgrade**: unacceptable — 0.15.x → 0.3.3 removes features.

## Review trigger

- New `eslint-config-next` release that supports eslint 10
- New `next` release that resolves sharp vuln
- New `@opennextjs/cloudflare` release
- Any `pnpm audit` or `scripts/pwa-audit.mjs` run detecting new vulnerabilities
