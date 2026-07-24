# Repository Consolidation Design

## Context

Canonical repository: `D:\projetos\pi-financeiro`. Production PWA: `apps/pwa`. Production API endpoint stays `https://api.synkroo.com.br`; it runs on Hostinger VPS, not local Windows processes.

## Goals

- Consolidate API source into `apps/api` while preserving Git history.
- Preserve all WIP before integration.
- Remove only proven redundant copies.
- Keep production database connection behavior unchanged.
- Preserve provenance, scan secrets, and prove recovery before any irreversible action.

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
- One root `pnpm-lock.yaml` shall resolve all workspaces; imported API lockfiles shall not survive dependency reconciliation.
- API runtime shall retain `https://api.synkroo.com.br`, `DATABASE_URL`, and `DB_SCHEMA=legacy`.
- PWA shall access API only over HTTPS; it shall not access PostgreSQL directly.
- Historical plans/specs shall remain unchanged. Only current operational documentation shall point to `apps/api`.

## Requirements

- REQ-01 (event-driven): When consolidation begins, the system shall create binary diffs, NUL-safe untracked lists, tar archives, and SHA-256 manifests for every dirty repository/worktree.
- REQ-02 (state-driven): While production topology is unverified, the system shall not modify VPS deployment, DNS, `DATABASE_URL`, or database schema.
- REQ-03 (event-driven): When importing API history, the system shall scan all refs, tags, reachable objects, patches, and untracked files for secrets; on exposure it shall stop, rotate affected credentials, purge the exposure, and rescan before import.
- REQ-04 (event-driven): When importing API history, the system shall rewrite a temporary clone with `git filter-repo --to-subdirectory-filter apps/api`, retain its old-to-new commit map and pre-rewrite SHA-256 manifest outside Git, then merge it into a clean branch based on `origin/main`.
- REQ-05 (unwanted): If `git filter-repo` is unavailable or import verification fails, then the system shall stop and use reviewed `git subtree` as fallback with an equivalent provenance manifest.
- REQ-06 (event-driven): When API WIP is backed up, the system shall classify every changed/untracked file as import-ready or deferred, record that decision in a safeguard branch commit, and include import-ready commits in the temporary clone.
- REQ-07 (event-driven): When `main-deploy-3` is integrated, the system shall validate its 40 commits, including proof that the 31 remediation commits are ancestors, before applying the remediation dirty delta.
- REQ-08 (state-driven): While `pwa-remediation` commits are ancestors of `main-deploy-3`, the system shall extract and integrate only its uncommitted changes against the updated integration branch.
- REQ-09 (event-driven): When importing API dependencies, the system shall add `apps/api` to the workspace, regenerate one root lockfile, verify dependency specifiers and peer resolution, and remove the imported nested lockfile.
- REQ-10 (event-driven): When relocating the API, the system shall replace its standalone Docker build assumptions with a monorepo-compatible Docker build and verify it without secrets.
- REQ-11 (event-driven): When applying `wt-group-filter`, the system shall apply its five-file patch on the updated base and run bridge tests.
- REQ-12 (event-driven): When a Git-less copy has normalized source equality with retained history, the system shall create a manifest, verify archive restoration, quarantine it for 30 days, and require explicit approval before local deletion.
- REQ-13 (unwanted): If any source file differs, provenance is uncertain, an active process uses it, or quarantine restoration fails, then the system shall retain that copy and request review.
- REQ-14 (event-driven): When VPS cutover is approved, the system shall inspect approved host/service/image/database identity, create encrypted off-host PostgreSQL backup with checksum, restore it in isolation, validate schema/version/extensions/row counts/contracts, and record owner, RPO, and RTO; backups and secret-bearing files shall remain outside Git and shall never enter `apps/api`.
- REQ-15 (state-driven): While migration recovery is unproven, the system shall not start an API container that auto-runs migrations against production.
- REQ-16 (event-driven): When production migration is approved, one migration job shall run with advisory lock, ledger/checksum checks, timeouts, stop conditions, compatibility proof for the prior image, and a recorded exit result; the production container shall then start with migrations disabled or verify-only.
- REQ-17 (event-driven): When all validations and post-cutover observation pass, the system shall remove registered worktrees only through `git worktree remove` followed by `git worktree prune`.

## Integration Sequence

1. Fetch all remotes; preserve current canonical WIP without resetting it.
2. Scan sources/history for secrets; create encrypted, checksum-verified backups for canonical/API/remediation/group-filter WIP.
3. Inspect approved VPS/service/image/database identity; validate off-host PostgreSQL restore and prior-image compatibility.
4. Create clean integration worktree from `origin/main`.
5. Integrate `pi-financeiro-main-deploy-3`; prove the remediation branch is its ancestor.
6. Extract and apply only reviewed dirty delta from `pi-financeiro-pwa-remediation`.
7. Classify API WIP, create safeguard commits, import mapped history into `apps/api`, then reconcile workspace/lockfile/Docker/CI/docs.
8. Apply reviewed `pi-financeiro-wt-group-filter` patch.
9. Triage canonical WIP individually; never bulk-apply audit artifacts.
10. Validate, run controlled cutover with application and database rollback plans, observe production, archive/rescue legacy content, then remove redundant worktrees/copies.

## Data Safety

| Asset | Safeguard | Rollback |
|---|---|---|
| API WIP | classified safeguard commits, encrypted patch/archive, SHA-256 | restore branch/archive |
| Canonical WIP | encrypted binary patch, untracked tar, SHA-256 | apply patch in isolated worktree |
| PostgreSQL | encrypted off-host backup, checksum, isolated restore proof | database recovery/PITR runbook, separate from image rollback |
| VPS API | approved host/service/image/revision inventory | redeploy compatible prior image |
| Legacy copies | provenance manifest, restore-tested archive, 30-day quarantine | restore archive before deletion |
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
| Migration control | one locked, timed migration job on restored copy | ledger/checksum, compatibility, and stop conditions pass |
| Production smoke | `/health` and authenticated API/PWA flow | expected response and no data loss |
| Rollback | prior image rehearsal plus DB recovery rehearsal | service health restored within recorded RTO |

## Disposal Criteria

A directory is eligible for final deletion only when all conditions hold:

1. Retained Git history or restore-tested archived artifact contains every source file.
2. Normalized source comparison excludes only `node_modules`, `dist`, `.next`, `.open-next`, `.wrangler`, logs, and test reports; its manifest identifies the retained reference.
3. Required documents are archived and secret-bearing artifacts are encrypted or destroyed after rotation.
4. No active process/deployment references the directory.
5. Thirty-day quarantine and post-cutover observation completed.
6. Relevant tests and deployment checks passed.
7. User confirms that specific local directory; GitHub remotes are never deleted by this plan.

## Non-Goals

- Moving PostgreSQL into the repository.
- Changing the production API hostname or credentials, except mandatory rotation after detected exposure.
- Rewriting historical planning documents.
- Deleting any repository before verification and explicit confirmation.
