# PWA audit risk acceptance design

## Objective

Temporarily change the PWA audit contract from zero advisories to zero **unaccepted** advisories. Accepted risks remain visible and do not authorize deployment by themselves.

## Accepted risk boundary

The initial allowlist may contain only the 18 advisories observed by `node scripts/pwa-audit.mjs` on 2026-07-26. Each entry must identify package, severity, advisory source or CVE, dependency chain, scope, justification, owner, and expiration date.

Scope classification is mandatory:

- Runtime: `next` and `sharp`.
- Build-time: `@opennextjs/cloudflare`, `@opennextjs/aws`, `@node-minify/core`, and their `glob` chain.
- Dev-only: LHCI and ESLint/minimatch chains.

Every initial entry is owned by `project-maintainer` and expires on 2026-08-26. Wildcards, package-only matches, unbounded version ranges, and severity-only matches are forbidden.

## Gate behavior

The scoped audit must normalize npm audit output and match it exactly against the versioned allowlist. It must print `ACCEPTED` entries with scope and expiry. It must fail when an advisory is new, changes package/severity/source/CVE/chain, is not allowlisted, or has expired. It must never print `PASS — no advisories` when accepted advisories exist.

## Verification and release boundary

Tests must cover accepted, new, changed, and expired advisories. Linux Node 20/pnpm 9 frozen install, lint, strict audit, Cloudflare build, Vitest, headers, Lighthouse CI, fixture E2E, offline E2E, and PWA CI remain required.

The exception does not modify the VPS/API and does not authorize deployment. Deployment still requires PWA CI green and fresh explicit approval.
