# PWA audit risk acceptance design

## Objective

Temporarily change the PWA audit contract from zero advisories to zero **unaccepted** normalized vulnerability records. Accepted risk remains visible and never authorizes deployment.

This policy supersedes the absolute-zero requirement in `2026-07-26-pwa-dependency-remediation-design.md` only for exact accepted records. That remediation stopped after Task 3 at commit `b3dd105` because compatible upstream releases still leave risks.

## Policy artifacts

- `scripts/pwa-audit-policy.mjs`: pure normalization, validation, matching, expiry, and report policy.
- `scripts/pwa-audit-allowlist.json`: strict versioned accepted-record metadata.
- `scripts/pwa-audit-policy.test.mjs`: Node `node:test` policy contract tests.
- `scripts/__fixtures__/pwa-audit-current.json`: sanitized npm audit JSON fixture.
- `docs/security/pwa-audit-risk-acceptance.md`: current accepted-risk report.

## Accepted risk boundary

The initial allowlist may contain only the 18 normalized vulnerability records produced by `node scripts/pwa-audit.mjs` at commit `b3dd105`. A package record is not assumed to equal an underlying CVE.

Each normalized record must match exactly on:

- `package` and `severity`;
- canonical, deterministically sorted `via` entries: source/name/title/URL/range or package reference;
- deterministically sorted `effects`;
- affected range;
- every derived dependency chain.

Each allowlist entry must also contain a stable `id`, `scope`, `owner`, `justification`, and `expiresOn`. Scope precedence is runtime, then build-time, then dev-only.

- Runtime: `next` and `sharp`.
- Build-time: `@opennextjs/cloudflare`, `@opennextjs/aws`, `@node-minify/core`, and their `glob` chain.
- Dev-only: LHCI and ESLint/minimatch chains.

Every initial entry is owned by `project-maintainer` and expires on `2026-08-26`. Date comparison uses UTC calendar dates only; no environment variable or clock bypass is permitted. Wildcards, package-only matches, unbounded version ranges, severity-only matches, and malformed input are forbidden and block the gate.

## Gate behavior

- No current records: print `PASS`, exit 0.
- All current records exactly accepted and unexpired: print `ACCEPTED` with scope and expiry, exit 0.
- New, changed, malformed, or expired records: print `BLOCKED`, exit 1.
- A formerly accepted record absent from current audit is printed `RESOLVED` and does not block.

## Verification and release boundary

Tests must cover schema validation, canonical ordering, exact matching, accepted, new, changed, expired, and resolved records. Linux Node 20/pnpm 9 frozen install, lint, strict audit, Cloudflare build, Vitest, headers, Lighthouse CI, fixture E2E, offline E2E, and PWA CI remain required.

No overrides, patches, audit suppression, VPS/API changes, or deployment are included. Deployment still requires PWA CI green and fresh explicit approval.
