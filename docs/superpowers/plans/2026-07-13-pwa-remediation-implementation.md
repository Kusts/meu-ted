# PWA Remediation Master Plan

> **For agentic workers:** execute one phase plan at a time using `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Goal:** remediate PWA quality, local-session safety, offline read-only capability, Cloudflare hardening and operations without changing financial domain behavior.

**Architecture:** online Next App Router stays dynamic/private with nonce CSP. Offline uses a separately proven static external-script shell plus IndexedDB snapshot. SW never caches API, RSC, authenticated, cross-origin or nonce-bearing HTML.

**Execution safety STOP:** before Phase 0, user must explicitly authorize a local `WIP:` checkpoint commit and remediation worktree. Checkpoint includes relevant PWA WIP plus this spec/master/six phase plans; excludes only generated audit/temp artifacts. Record branch, commit and worktree path. Never reset, stash or overwrite source checkout WIP.

## Phase index

| Phase | Plan | Requirements | Gate | Rollback |
|---|---|---|---|---|
| 0 | [baseline + CI](2026-07-13-pwa-remediation-phase-0-baseline-ci.md) | R-13 | lint/test/build/scoped-audit green | discard remediation worktree only |
| 1 | [session + security](2026-07-13-pwa-remediation-phase-1-session-security.md) | R-01,R-02,R-11,R-14,R-15 | cleanup + HTTP contracts green | revert session/proxy changes |
| 2 | [state + snapshot](2026-07-13-pwa-remediation-phase-2-state-snapshot.md) | R-03..R-06 | migration/mutation gates green | retain v1; discard v2 |
| 3 | [offline + SW](2026-07-13-pwa-remediation-phase-3-offline-service-worker.md) | R-05..R-10,R-12 | blocking shell proof + E2E green | kill switch/unregister |
| 4 | [context decomposition](2026-07-13-pwa-remediation-phase-4-context-decomposition.md) | R-05,R-06 | facade contracts green | revert current extraction only |
| 5 | [performance + operations](2026-07-13-pwa-remediation-phase-5-performance-observability.md) | R-11..R-13 | CWV/cache/RUM gates green | disable RUM; revert headers |

## Requirement mapping

| Requirement | Exact tasks |
|---|---|
| R-01 | 1.1, 2.2 |
| R-02 | 1.2 |
| R-03 | 2.2 |
| R-04 | 2.2 |
| R-05 | 2.1, 3.1, 3.3 |
| R-06 | 2.1, 2.3, 3.3 |
| R-07 | 3.1, 3.2 |
| R-08 | 3.3 |
| R-09 | 3.3 |
| R-10 | 3.3 |
| R-11 | 1.3, 5.1 |
| R-12 | 3.2, 5.1 |
| R-13 | 0.1, 0.2, 0.4, 2.2, 3.3, 5.2 |
| R-14 | 1.2 |
| R-15 | 1.3 |

## Global acceptance

- No code/deploy begins in original dirty checkout.
- Final CI: lint 0 warnings/errors, tests green, modified coverage ≥80%, mutation ≥70% for session/snapshot/sync/commands.
- Active API IDOR, authorization and rate-limit tests require separate explicit authorization and test credentials.
- No commit/deploy while phase gate is red.
