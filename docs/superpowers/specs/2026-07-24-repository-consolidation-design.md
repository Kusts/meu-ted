# Repository Consolidation Design

## Context

Canonical repository: `D:\projetos\pi-financeiro`. Production PWA: `apps/pwa`. Production API endpoint stays `https://api.synkroo.com.br`; it runs on Hostinger VPS, not local Windows processes.

## Goals

- Consolidate API source into `apps/api` while preserving Git history.
- Preserve all WIP before integration.
- Remove only proven redundant copies.
- Keep production database connection behavior unchanged.

## Inventory

| Path | Classification | Required action |
|---|---|---|
| `pi-financeiro` | canonical, dirty | preserve and triage local WIP |
| `pi-finance-api` | production backend, dirty | import after backup and review |
| `pi-finance-ios` | clean, paused reference | archive with `.git` preserved |
| `pi-finance-web` | deprecated, 3 untracked docs | rescue 2 docs; discard review and clone |
| `pi-financeiro-hotfix-test` | Git-less copy | quarantine; compare sources first |
| `pi-financeiro-main-deploy` | Git-less copy | quarantine; compare sources first |
| `pi-financeiro-main-deploy-2` | Git-less copy | quarantine; compare sources first |
| `pi-financeiro-main-deploy-3` | clean worktree, 40 commits | integrate first |
| `pi-financeiro-pwa-remediation` | 31 commits plus dirty WIP | preserve; integrate WIP after its ancestor branch |
| `pi-financeiro-pwa-remediation;C` | empty | discard |
| `pi-financeiro-pwa-remediation-docker-report` | one LHCI report | archive report; discard directory |
| `pi-financeiro-wt-group-filter` | dirty worktree | preserve and apply reviewed patch |
| `arquivados/pi-financeiro-e2e-baseline` | clean redundant worktree | remove through Git |
| `arquivados/pi-financeiro-backups` | backups/patches | retain |

## Target Architecture

```text
pi-financeiro/
├─ apps/
│  ├─ api/                 # imported pi-finance-api history
│  ├─ pwa/                 # active Cloudflare PWA
│  └─ whatsapp-bridge/     # transport only; no financial domain logic
├─ docs/
└─ pnpm-workspace.yaml
```

- `apps/api` shall remain a normal directory in the canonical Git repository.
- The system shall not use a nested `.git` directory or a submodule.
- API runtime shall retain `https://api.synkroo.com.br`, `DATABASE_URL`, and `DB_SCHEMA=legacy`.
- PWA shall access API only over HTTPS; it shall not access PostgreSQL directly.
- Historical plans/specs shall remain unchanged. Only current operational documentation shall point to `apps/api`.

## Requirements

- REQ-01 (event-driven): When consolidation begins, the system shall create binary diffs, NUL-safe untracked lists, tar archives, and SHA-256 manifests for every dirty repository/worktree.
- REQ-02 (state-driven): While production topology is unverified, the system shall not modify VPS deployment, DNS, `DATABASE_URL`, or database schema.
- REQ-03 (event-driven): When importing API history, the system shall rewrite a temporary clone with `git filter-repo --to-subdirectory-filter apps/api` and merge it into a clean branch based on `origin/main`.
- REQ-04 (unwanted): If `git filter-repo` is unavailable or import verification fails, then the system shall stop and use reviewed `git subtree` as fallback.
- REQ-05 (event-driven): When API WIP is backed up, the system shall commit legitimate source changes to a safeguard branch before history import.
- REQ-06 (event-driven): When `main-deploy-3` is integrated, the system shall validate its 40 commits before applying remediation WIP.
- REQ-07 (state-driven): While `pwa-remediation` commits are ancestors of `main-deploy-3`, the system shall integrate only its uncommitted changes after the integration branch is current.
- REQ-08 (event-driven): When applying `wt-group-filter`, the system shall apply its five-file patch on the updated base and run bridge tests.
- REQ-09 (event-driven): When a Git-less copy has normalized source equality with retained history, the system shall quarantine it before final deletion.
- REQ-10 (unwanted): If any source file differs or provenance is uncertain, then the system shall retain that copy in quarantine and request review.
- REQ-11 (event-driven): When VPS cutover is approved, the system shall compare the deployed API at `/home/deploy/infra/pi-finance-api`, back up PostgreSQL, and prepare a tested rollback artifact.
- REQ-12 (event-driven): When all validations pass, the system shall remove registered worktrees only through `git worktree remove` followed by `git worktree prune`.

## Integration Sequence

1. Fetch all remotes; preserve current canonical WIP without resetting it.
2. Create backups for canonical/API/remediation/group-filter WIP.
3. Compare VPS deployment and database backup/restore procedure.
4. Create clean integration worktree from `origin/main`.
5. Import API history into `apps/api`; add workspace, CI, Docker, and operational documentation changes.
6. Integrate `pi-financeiro-main-deploy-3`.
7. Apply reviewed dirty delta from `pi-financeiro-pwa-remediation`.
8. Apply reviewed `pi-financeiro-wt-group-filter` patch.
9. Triage canonical WIP individually; never bulk-apply audit artifacts.
10. Validate, deploy with rollback, archive/rescue legacy content, then remove redundant worktrees/copies.

## Data Safety

| Asset | Safeguard | Rollback |
|---|---|---|
| API WIP | branch, binary patch, untracked tar, SHA-256 | restore branch/archive |
| Canonical WIP | binary patch, untracked tar, SHA-256 | apply patch in isolated worktree |
| PostgreSQL | verified VPS backup before migration/deploy | restore backup; redeploy prior image |
| VPS API | image/tag and deployed revision inventory | redeploy prior revision |
| Legacy docs | copy to `arquivados/pi-finance-web-legacy-docs/` | restore from archive |

## Validation Matrix

| Scope | Command/check | Pass condition |
|---|---|---|
| API unit | `pnpm --dir apps/api test` | exit 0 |
| API types | `pnpm --dir apps/api typecheck` | exit 0 |
| API build | `pnpm --dir apps/api build` | exit 0 |
| PWA unit/types/build | PWA package scripts | all exit 0 |
| PWA E2E | Playwright suite | all enabled tests pass |
| Docker | API image build from monorepo context | image builds without secrets |
| PostgreSQL | isolated legacy-schema migration run | migrations idempotent; contract tests pass |
| Production smoke | `/health` and authenticated API/PWA flow | expected response and no data loss |
| Rollback | prior image + DB restore rehearsal | service health restored |

## Disposal Criteria

A directory is eligible for final deletion only when all conditions hold:

1. Retained Git history or archived artifact contains every source file.
2. Normalized source comparison excludes generated outputs and confirms no unique content.
3. Required documents are archived.
4. Relevant tests and deployment checks passed.
5. User confirms that specific directory.

## Non-Goals

- Moving PostgreSQL into the repository.
- Changing the production API hostname or credentials.
- Rewriting historical planning documents.
- Deleting any repository before verification and explicit confirmation.
