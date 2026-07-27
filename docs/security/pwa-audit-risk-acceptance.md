# PWA Audit Risk Acceptance

> Generated 2026-07-27 · Expires 2026-08-27 · Owner: project-maintainer
> 
> 18 vulnerabilities accepted under strict exact-field matching.
> No wildcard, package-only, or severity-only entries.

## Runtime (2)

| ID | Package | Severity | Range | Reason |
|----|---------|----------|-------|--------|
| `pwa-2026-07-27-next` | next | high | 9.5.6-canary.0 - 10.0.7 \|\| 14.3.0-canary.0 - 16.3.0-preview.7 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-sharp` | sharp | high | <0.35.0 | No compatible upstream release as of 2026-07-27. |

**Mitigation**: Monitor Next.js and sharp releases. `sharp` vulnerability is inherited from libvips (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591). `next` vulnerability is via transitive `sharp`.

## Build-time (5)

| ID | Package | Severity | Range | Reason |
|----|---------|----------|-------|--------|
| `pwa-2026-07-27-lhci-cli` | @lhci/cli | high | >=0.3.4 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-node-minify-core` | @node-minify/core | high | <=5.3.0 \|\| 8.0.6 \|\| 9.0.1 - 9.0.2 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-opennextjs-aws` | @opennextjs/aws | high | * | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-opennextjs-cloudflare` | @opennextjs/cloudflare | high | 0.3.0 - 0.6.6 \|\| >=1.16.0 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-chrome-launcher` | chrome-launcher | high | 0.3.1 - 0.13.4 | No compatible upstream release as of 2026-07-27. |

**Mitigation**: Build-time only — these packages do not ship to production. `@opennextjs/aws` has unbounded range (`*`) and requires upstream attention.

## Dev-only (11)

| ID | Package | Severity | Range | Reason |
|----|---------|----------|-------|--------|
| `pwa-2026-07-27-eslint-config-array` | @eslint/config-array | high | <=0.22.0 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-eslint-eslintrc` | @eslint/eslintrc | high | 0.0.1 \|\| >=0.1.1 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-brace-expansion` | brace-expansion | high | <=5.0.7 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-eslint` | eslint | high | 0.12.0 - 2.0.0-rc.1 \|\| 4.1.0 - 10.0.0-rc.2 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-eslint-config-next` | eslint-config-next | high | >=10.2.1-canary.2 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-eslint-plugin-import` | eslint-plugin-import | high | >=1.15.0 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-eslint-plugin-jsx-a11y` | eslint-plugin-jsx-a11y | high | >=6.5.0 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-eslint-plugin-react` | eslint-plugin-react | high | >=7.23.0 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-glob` | glob | high | 4.3.0 - 10.5.0 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-minimatch` | minimatch | high | 2.0.0 - 10.0.2 | No compatible upstream release as of 2026-07-27. |
| `pwa-2026-07-27-rimraf` | rimraf | high | 2.3.0 - 3.0.2 \|\| 4.2.0 - 5.0.10 | No compatible upstream release as of 2026-07-27. |

**Mitigation**: Dev-only tooling — no production impact. `eslint` major upgrade (to 10.8.0) would resolve 7 transitive vulnerabilities.

## Review schedule

- **Next review**: 2026-08-20 (1 week before expiry)
- **Owner**: project-maintainer
- **Trigger**: new `pnpm audit` or `scripts/pwa-audit.mjs` run
