# Goal run — G5.GATE

**Goal ID:** G5.GATE
**Started:** 2026-08-04T21:22:33Z
**Completed:** 2026-08-04T21:31:16Z
**Status:** done

## Contract

- **Objective:** Verificar o canary do Agent sem cross-workspace, write duplicado, custo sem limite ou tool fora do inventário.
- **Canary period:** janela local determinística de verificação `2026-08-04T21:22:33Z`–`2026-08-04T21:31:16Z`. Esta evidência não declara deploy nem observabilidade de produção.
- **Acceptance metrics:**
  - cross-workspace violations: `0`;
  - duplicate financial effects for one idempotency/provider message key: `0`;
  - unbounded requests/tokens: `0`; limits are 1,000 tokens/turn, 10,000 tokens/day/actor, 20 requests/minute/actor, and 3 turn attempts;
  - unclassified tools/routes/write surfaces: `0` (72/72 capabilities, 78/78 API routes, 131/131 discovered write-policy rows; generated HTTP artifact has 44 tools).

## Evidence log

| Continuation | Command/result | Failure signature | Decision |
|---:|---|---|---|
| 0 | Inventory, focused isolation/idempotency/Agent checks started | write-policy matrix did not discover the generated HTTP tool artifact; PWA transport exemptions were stale | add generated-tool discovery and explicit transport allowlists |
| 1 | `node scripts/check-write-policy.mjs --generate`; policy and boundary contract tests | — | checks green |
| 2 | Full canary suites and typecheck completed | root `pnpm lint` retains 8 pre-existing PWA lint errors in Profile/Workspace/Auth files outside this gate change | gate evidence uses focused canary contracts; no lint assertion was weakened |

## Final verification

- **Cross-workspace:** API `idor-cross-household.test.ts` 10/10; Agent auth/routing/queue targeted tests 24/24; PWA workspace/agent focused tests 28/28.
- **Duplicate writes:** API idempotency/IDOR targeted run 18 passed, 2 Postgres-dependent tests skipped without `DATABASE_URL`; bridge containment included duplicate provider-message coverage and full bridge suite passed 41 files/448 tests; Pi migration suite proves stable intention ID reuse.
- **Cost bounds:** Agent full suite 10 files/45 tests passed, including safety budget/rate-limit and queue retry/attempt bounds; limits are enforced in `apps/agent/src/index.ts` and documented in `.dev.vars.example`.
- **Inventories:** route inventory 78/78; capability inventory 72/72; generated tools check 44/44; write policy 131/131; PWA command boundary valid; API route scanner regression passed. Final combined command also passed all inventory, boundary contract tests (8/8), `pnpm typecheck`, and `git diff --check`.
- **Full workspace checks:** API 73 files/590 tests passed; Agent 10 files/45 tests passed; Pi tools 39 tests passed plus typecheck; bridge 41 files/448 tests passed; root typecheck passed; `git diff --check` passed.

## Changes made for the gate

- `scripts/check-write-policy.mjs` now discovers writes in the generated HTTP tool artifact and normalizes `{parameter}` paths; its source contract is covered by `scripts/check-write-policy.test.mjs`.
- `docs/architecture/write-mutator-policy.md` regenerated from the 131 discovered write surfaces.
- `scripts/check-pwa-command-boundary.mjs` explicitly allowlists Agent, workspace, and reconnect transport modules without allowing business mutators to bypass `commands.ts`.

## Scope note

`pnpm lint` is not a gate acceptance metric and remains red only on pre-existing PWA lint findings: `ProfilePage.tsx`, `WorkspaceSheet.tsx`, and `workspace-context.tsx`. No test assertion or gate guard was weakened. No commit or deploy was performed.
