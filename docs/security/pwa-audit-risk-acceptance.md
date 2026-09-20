# PWA Audit Risk Acceptance

> Reviewed 2026-09-19 · Expires 2026-12-31 · Owner: project-maintainer
>
> Eight current vulnerabilities are accepted under strict exact-field matching.
> The audit blocks immediately when a finding changes or this acceptance expires.

## Runtime (2)

| Package | Severity | Scope | Reason |
|---|---|---|---|
| `sharp` | high | Next.js image optimization | `sharp@0.35.4` contains the fixes but OpenNext Cloudflare fails to bundle its native `.node` modules on Windows. The PWA keeps the scoped `next>sharp@0.34.5` pin until compatibility is available. |
| `next` | high | Consumer of `sharp` | This is the direct audit effect of the `sharp` exception, not an independent accepted dependency. |

## Build-Time (6)

| Package | Severity | Scope | Reason |
|---|---|---|---|
| `@lhci/cli`, `@lhci/utils`, `lighthouse`, `puppeteer-core`, `@puppeteer/browsers`, `extract-zip` | high | Lighthouse CI only | This is one exact-match dependency chain. Two path-traversal advisories remain in `extract-zip`; npm's proposed resolution downgrades `@lhci/cli` from `0.15.1` to `0.12.0`, so no non-breaking fix is available. |

## Controls And Review

- The isolated PWA audit has only the PWA dependency graph and matches every
  record exactly (`name`, severity, `via`, effects, and range).
- The approval records expire on 2026-12-31; a new audit and owner decision
  are required before then.
- `sharp@0.35.4` was tested on 2026-09-19 and failed the OpenNext Cloudflare
  bundle because native `.node` modules could not be resolved on Windows.
- `wrangler` was upgraded to `4.135.0`, eliminating its former
  `miniflare`/`sharp` audit chain without an exception.
- Review earlier if `sharp`, Next.js, OpenNext Cloudflare, or Lighthouse CI
  publish a compatible remediation.
