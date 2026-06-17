# PWA Polish + Deploy Readiness — Audit & Design

**Data:** 2026-06-17
**Motivo:** o PWA está funcional com 6 módulos completos. Antes de deploy real, precisamos de polish final e documentação de readiness.

## Audit Findings

### ✅ What's ready

| Area | Status | Evidence |
|---|---|---|
| Build | ✅ | `npm run build` gera `dist/` com SW, manifest, precache |
| PWA installability | ✅ | `vite-plugin-pwa` gera `manifest.webmanifest` + `sw.js` |
| HTTPS requirement | ✅ | Documentado no README (Cloudflare Pages/Vercel) |
| CI/CD | ✅ | `.github/workflows/ci.yml` (typecheck + test + e2e + build) |
| Deploy config | ✅ | `wrangler.toml` pronto |
| README | ✅ | 3 caminhos de deploy documentados |
| Test coverage | ✅ | 206 unit + 41 E2E |
| TypeScript | ✅ | Strict mode, zero errors |

### ⚠️ Gaps (local fixes)

| # | Gap | Severity | Fix |
|---|---|---|---|
| 1 | `package.json` version = `0.0.0` | Low | Bump to `1.0.0` |
| 2 | Nav crowding: 7 tabs at 390px scroll horizontal, functional but not ideal UX | Medium | Accept for V1; documented limitation |
| 3 | `wrangler.toml` has hardcoded `VITE_API_BASE_URL` to `synkroo.com.br` | Low | Replace with placeholder or document override |
| 4 | No `robots.txt` (PWA is private, should block crawlers) | Low | Add `Disallow: /` |
| 5 | Duplicate `manifest.json` already removed (was in spec) | ✅ Done |
| 6 | Sheet primitive: no swipe-to-close, no focus trap | Low | Documented limitation from 2026-06-15 spec |
| 7 | Coverage ratchet not measured | Low | Add `vitest --coverage` to CI |

### 🔴 Blockers (user action required)

| # | Blocker | What user must do |
|---|---|---|
| B1 | Cloudflare credentials | API token + Account ID for deploy |
| B2 | Domain / DNS | Choose domain for PWA |
| B3 | API endpoint | `VITE_API_BASE_URL` must point to real `pi-finance-api` |
| B4 | Database | Postgres connection string for production |

## Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Version | Bump to `1.0.0` — feature-complete V1 |
| D2 | Nav | Keep 7 tabs + scroll; document as known limitation |
| D3 | Deploy | Cloudflare Pages via Dashboard (easiest path) |
| D4 | robots.txt | `Disallow: /` — app is private |
| D5 | Coverage | Add to CI but don't block build |

## Requirements (EARS)

| ID | Requirement |
|---|---|
| REQ-D1 | `package.json` version bumped to `1.0.0` |
| REQ-D2 | `robots.txt` with `Disallow: /` |
| REQ-D3 | `wrangler.toml` uses placeholder or env var, not hardcoded URL |
| REQ-D4 | README updated with latest module list and verification commands |
| REQ-D5 | CI optionally includes coverage report |

## Milestones

| # | Slice | Scope |
|---|---|---|
| D-1 | Polish local | Version bump, robots.txt, wrangler.toml cleanup, README update |
| D-2 | Deploy documentation | Document exact steps for user to deploy (credentials, DNS, API URL) |
| D-3 | Final verification | Full gate run + build verification |
