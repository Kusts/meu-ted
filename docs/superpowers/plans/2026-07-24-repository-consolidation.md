# Repository Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task.

**Goal:** Consolidate API into `apps/api` without losing WIP, history, database recoverability, or production availability.

**Architecture:** Canonical repo receives filtered API history. PWA stays `apps/pwa`; bridge remains transport-only. API runtime remains `api.synkroo.com.br` with existing `DATABASE_URL` and `DB_SCHEMA=legacy`.

**Tech Stack:** Git, pnpm, Node, Fastify, PostgreSQL, Docker, Cloudflare PWA, Hostinger VPS.

**Agent Orchestration:** Supervisor-Workers. Planner owns gates; workers perform isolated read/write tasks; reviewer validates each production/destructive gate.

## Guardrails

- No `.env`, credential, database dump, or backup archive enters Git.
- No deletion, VPS change, migration, deploy, or cutover without explicit user approval at marked gates.
- Every destructive command runs only in an isolated integration worktree.
- Historical `docs/superpowers/**` references remain unchanged; only operational docs change.

## Task 1: Preflight inventory

**Files:** Create external inventory under `$BACKUP_ROOT`; modify none.

- [ ] Initialize external-only run variables, then run:
  ```bash
  export RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
  export BACKUP_ROOT="D:/secure-backups/pi-financeiro-consolidation/$RUN_ID"
  umask 077; mkdir -p "$BACKUP_ROOT"
  git -C D:/projetos/pi-financeiro fetch --all --prune
  git -C D:/projetos/pi-financeiro worktree list --porcelain
  for d in D:/projetos/pi-finance*; do git -C "$d" status --short 2>/dev/null || true; done
  ```
- [ ] Record absolute paths, HEAD, branch, upstream, dirty files, and size excluding generated directories, including `D:/projetos/arquivados/pi-financeiro-e2e-baseline` and `D:/projetos/arquivados/pi-financeiro-backups`.
- [ ] Expected: all 14 reviewed directories have one inventory row.
- [ ] Stop: path identity differs from approved spec.
- [ ] Commit: none, external inventory only.

## Task 2: Secret gate

**Files:** Read every dirty canonical/API/remediation/group-filter workspace, safeguard branch, filtered clone, and final integration tree; create encrypted external reports only.

- [ ] Install or verify external tools before writing artifacts:
  ```bash
  set -euo pipefail
  command -v gitleaks; command -v age; command -v python3; git filter-repo --version
  gitleaks version
  ```
- [ ] Scan each approved dirty workspace, its refs/tags/objects/ignored/untracked files including `.env`, then scan each generated patch, safeguard branch, filtered clone, and final integration tree before it can advance; encrypt reports immediately and remove plaintext:
  ```bash
  set -euo pipefail
  reports="$BACKUP_ROOT/secret-reports"; mkdir -m 700 -p "$reports"
  for repo in D:/projetos/pi-financeiro D:/projetos/pi-finance-api D:/projetos/pi-financeiro-pwa-remediation D:/projetos/pi-financeiro-wt-group-filter; do
    name=$(basename "$repo")
    gitleaks git -s "$repo" --log-opts="--all" --redact --report-path "$reports/$name-history.json"
    gitleaks dir "$repo" --redact --no-git --report-path "$reports/$name-worktree.json"
  done
  tar -C "$reports" -czf "$BACKUP_ROOT/secret-scans.tar.gz" .
  age -r "$BACKUP_AGE_RECIPIENT" -o "$BACKUP_ROOT/secret-scans.age" "$BACKUP_ROOT/secret-scans.tar.gz"
  age --decrypt -i "$BACKUP_AGE_IDENTITY" -o "$BACKUP_ROOT/secret-scans.verify.tar.gz" "$BACKUP_ROOT/secret-scans.age"
  cmp "$BACKUP_ROOT/secret-scans.tar.gz" "$BACKUP_ROOT/secret-scans.verify.tar.gz"
  rm -rf "$reports" "$BACKUP_ROOT/secret-scans.tar.gz" "$BACKUP_ROOT/secret-scans.verify.tar.gz"
  ```
- [ ] Expected: zero unapproved findings; only encrypted reports persist.
- [ ] Stop: any credential, private key, database URL, token, or secret in history/WIP.
- [ ] Rollback: none. On finding, revoke/rotate, purge with an approved history-remediation procedure, then rescan.
- [ ] Commit: none.

## Task 3: Backup dirty state

**Files:** Create encrypted external artifacts; modify no repository files.

- [ ] For each dirty canonical/API/remediation/group-filter workspace, generate binary diff, NUL-safe untracked list, tar archive, and SHA-256 manifest outside Git:
  ```bash
  set -euo pipefail
  repo=D:/projetos/pi-finance-api
  out="$BACKUP_ROOT/pi-finance-api"
  mkdir -p "$out"
  git -C "$repo" diff --binary > "$out/tracked.patch"
  git -C "$repo" ls-files --others --exclude-standard -z > "$out/untracked-paths.nul"
  tar -C "$repo" --null -T "$out/untracked-paths.nul" -czf "$out/untracked.tar.gz"
  sha256sum "$out/tracked.patch" "$out/untracked-paths.nul" "$out/untracked.tar.gz" > "$out/SHA256SUMS"
  tar -C "$out" -czf "$out/archive.tar.gz" tracked.patch untracked.tar.gz untracked-paths.nul SHA256SUMS
  age -r "$BACKUP_AGE_RECIPIENT" -o "$out/archive.age" "$out/archive.tar.gz"
  age --decrypt -i "$BACKUP_AGE_IDENTITY" -o "$out/verify.tar.gz" "$out/archive.age"
  cmp "$out/archive.tar.gz" "$out/verify.tar.gz"
  rm "$out/tracked.patch" "$out/untracked.tar.gz" "$out/archive.tar.gz" "$out/verify.tar.gz"
  ```
- [ ] Decrypt into a restricted temporary directory, restore each archive, and compare `SHA256SUMS`.
- [ ] Expected: every checksum and restoration succeeds.
- [ ] Stop: archive omission, checksum mismatch, or plaintext secret artifact lacks approved restricted storage.
- [ ] Commit: none.

## Task 4: VPS and database identity

**Files:** Read `../vps-hostinger/`; create external inventory only.

- [ ] Record approved Hostinger SSH host fingerprint, deploy account, compose path, service/container, image digest, mounts, database host/port/name/schema/version/extensions/TLS/disk/connections, and approval record.
- [ ] Run read-only commands over approved SSH:
  ```bash
  docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
  docker inspect pi-finance-api --format '{{.Image}} {{.Config.Image}}'
  export PGSERVICE=pi_finance_production PGSERVICEFILE=/run/secrets/pg_service.conf
  psql -Atc 'show server_version; select current_database(); show search_path;'
  ```
- [ ] Expected: inventory identifies `/home/deploy/infra/pi-finance-api`, `pi-finance-api`, database target, and prior deploy revision.
- [ ] Stop: target differs from approved Hostinger topology or database identity is ambiguous.
- [ ] Commit: none.

## Task 5: PostgreSQL recovery rehearsal

**Files:** Encrypted off-host backup only; Git unchanged.

- [ ] **USER APPROVAL REQUIRED:** create production backup.
- [ ] Run from approved VPS session with externally supplied recipient, never echoed or committed:
  ```bash
  set -euo pipefail
  export PGSERVICE=pi_finance_production PGSERVICEFILE=/run/secrets/pg_service.conf
  out="/srv/secure-export/pi-financeiro-consolidation/$RUN_ID"
  mkdir -p "$out"
  pg_dump --format=custom | age -r "$BACKUP_AGE_RECIPIENT" -o "$out/postgres.dump.age"
  sha256sum "$out/postgres.dump.age" > "$out/SHA256SUMS"
  ```
- [ ] Record operator, target identity, timestamp, PostgreSQL metadata, RPO/RTO, and off-host copy. Verify and restore without printing credentials:
  ```bash
  sha256sum -c "$out/SHA256SUMS"
  trap 'rm -f "$out/postgres.dump"' EXIT
  age --decrypt -i "$BACKUP_AGE_IDENTITY" -o "$out/postgres.dump" "$out/postgres.dump.age"
  export PGSERVICE=pi_finance_restore PGSERVICEFILE=/run/secrets/pg_service.conf
  createdb pi_finance_restore
  pg_restore --dbname pi_finance_restore --clean --if-exists "$out/postgres.dump"
  export PGSERVICE=pi_finance_production
  export TARGET_SCHEMA=$(psql -Atc 'select current_schema()')
  psql -Atc "set search_path to \"$TARGET_SCHEMA\"; select 'accounts',count(*) from accounts union all select 'transactions',count(*) from transactions" > "$out/source-counts.tsv"
  export PGSERVICE=pi_finance_restore
  psql -Atc "set search_path to \"$TARGET_SCHEMA\"; select 'accounts',count(*) from accounts union all select 'transactions',count(*) from transactions" > "$out/restore-counts.tsv"
  diff -u "$out/source-counts.tsv" "$out/restore-counts.tsv"
  ```
- [ ] Verify restored schema/extensions and run API contracts with `DB_SCHEMA=legacy`. Treat this logical dump as logical-restore recovery only; write `$BACKUP_ROOT/database-recovery-runbook.md` with its measured RPO/RTO. Before cutover, separately prove base-backup/WAL PITR or explicitly forbid PITR as an available rollback method.
- [ ] Expected: restore succeeds; contract suite passes; recovery time meets recorded RTO.
- [ ] Stop: failed restore, incompatible extension, failed contract, or missing off-host copy.
- [ ] Rollback: discard isolated restore only; production remains untouched.
- [ ] Commit: none.

## Task 6: Create clean integration worktree

**Files:** New global worktree only.

- [ ] Run:
  ```bash
  git -C D:/projetos/pi-financeiro worktree add C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation -b integration/repository-consolidation origin/main
  ```
- [ ] Expected: branch clean and based on `origin/main`.
- [ ] Stop: worktree has tracked/untracked changes.
- [ ] Commit: none.

## Task 7: Integrate `pi-financeiro-main-deploy-3`

**Files:** Integration worktree, PWA E2E files only.

- [ ] Verify ancestry and review diff:
  ```bash
  remediation_head=$(git -C D:/projetos/pi-financeiro-pwa-remediation rev-parse HEAD)
  integration_head=$(git -C D:/projetos/pi-financeiro-main-deploy-3 rev-parse HEAD)
  git -C D:/projetos/pi-financeiro merge-base --is-ancestor "$remediation_head" "$integration_head"
  git -C C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation diff --stat origin/main "$integration_head"
  ```
- [ ] Merge exact reviewed branch and run exact PWA checks:
  ```bash
  cd C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation
  git merge --no-ff integration/pwa-e2e-cleanup
  pnpm --filter ./apps/pwa... test && pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts
  ```
- [ ] Expected: 31 remediation commits proven ancestors; selected 40-commit series applies cleanly.
- [ ] Stop: conflict, test regression, or dependency lockfile conflict.
- [ ] Rollback: abort merge/cherry-pick; reset integration branch only.
- [ ] Commit: one integration commit or preserved reviewed commit series.

## Task 8: Apply remediation dirty delta

**Files:** Tracked and approved untracked paths from `D:/projetos/pi-financeiro-pwa-remediation`.

- [ ] Classify all untracked paths. Delete accidental `apps/pwa/nul`; never stage it on Windows. Record approved untracked paths in `$BACKUP_ROOT/pwa-remediation-untracked.txt`.
- [ ] Build separate tracked and approved-untracked deltas from remediation, then apply them to the branch containing `main-deploy-3`:
  ```bash
  patch="$BACKUP_ROOT/pwa-remediation-tracked.patch"
  git -C D:/projetos/pi-financeiro-pwa-remediation diff --binary > "$patch"
  git -C C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation apply --check "$patch"
  git -C C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation apply --3way "$patch"
  python3 -c "import pathlib,sys; sys.stdout.buffer.write(b'\\0'.join(pathlib.Path(sys.argv[1]).read_bytes().splitlines()) + b'\\0')" "$BACKUP_ROOT/pwa-remediation-untracked.txt" > "$BACKUP_ROOT/pwa-remediation-untracked.nul"
  tar -C D:/projetos/pi-financeiro-pwa-remediation --null -T "$BACKUP_ROOT/pwa-remediation-untracked.nul" -czf "$BACKUP_ROOT/pwa-remediation-approved-untracked.tar.gz"
  tar -C C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation -xzf "$BACKUP_ROOT/pwa-remediation-approved-untracked.tar.gz"
  ```
- [ ] Stage only reviewed paths and commit `fix(pwa): apply reviewed remediation delta`.
- [ ] Run changed PWA test files and E2E specs.
- [ ] Expected: only uncommitted delta applies; no duplicated 31-commit history.
- [ ] Stop: patch touches undeclared files or tests fail.
- [ ] Rollback: `git restore` changed integration paths.
- [ ] Commit: `fix(pwa): apply reviewed remediation delta`.

## Task 9: Classify API WIP

**Files:** `D:/projetos/pi-finance-api/**`; safeguard branch.

- [ ] Create `$BACKUP_ROOT/api-wip-classification.tsv` with one tab-delimited line per changed/untracked path: `path`, classification, reason, approver.
- [ ] **USER APPROVAL REQUIRED:** resolve every deferred source path before API sibling removal. Hash TSV and include hash plus explicit import-ready/deferred path lists in safeguard commit body. Commit only classification-approved import-ready paths:
  ```bash
  git -C D:/projetos/pi-finance-api switch -c safeguard/repository-consolidation
  awk -F '\t' '$2=="import-ready" {printf "%s%c", $1, 0}' "$BACKUP_ROOT/api-wip-classification.tsv" > "$BACKUP_ROOT/api-import-ready.nul"
  git -C D:/projetos/pi-finance-api add --pathspec-from-file="$BACKUP_ROOT/api-import-ready.nul" --pathspec-file-nul
  git -C D:/projetos/pi-finance-api commit -m "chore: safeguard API consolidation WIP"
  ```
- [ ] Expected: TSV covers all API changes; no `.env`, logs, `node_modules`, `dist`, or deferred source staged.
- [ ] Stop: unclassified source, failing API tests, or secret finding.
- [ ] Rollback: preserve branch and restore working tree from external artifacts.
- [ ] Commit: safeguard commit in API repository.

## Task 10: Import API history

**Files:** Temporary clone and integration worktree `apps/api/**`.

- [ ] Clone explicit safeguard branch to temporary external path; save pre-rewrite commit list/hash manifest.
- [ ] Filter and merge history:
  ```bash
  git clone --no-local --branch safeguard/repository-consolidation D:/projetos/pi-finance-api D:/secure-work/pi-finance-api-filtered
  cd D:/secure-work/pi-finance-api-filtered
  gitleaks git --log-opts="--all" --redact
  git filter-repo --to-subdirectory-filter apps/api
  gitleaks git --log-opts="--all" --redact && gitleaks dir . --redact --no-git
  git -C C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation remote add api-filtered D:/secure-work/pi-finance-api-filtered
  git -C C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation fetch api-filtered
  git -C C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation merge --allow-unrelated-histories api-filtered/safeguard/repository-consolidation
  ```
- [ ] Preserve filter-repo commit map outside Git. Run encrypted `gitleaks git --log-opts="--all"` and `gitleaks dir . --no-git` in filtered clone before merge, then rerun both in final integration tree after merge before next task.
- [ ] Fallback only after review: `git subtree add --prefix=apps/api D:/projetos/pi-finance-api safeguard/repository-consolidation` without `--squash`, plus equivalent provenance manifest.
- [ ] Expected: `apps/api` contains source history; no nested `.git`, `.env`, `node_modules`, `dist`, or logs.
- [ ] Stop: commit map missing, secret scan fails, or imported tree has unapproved artifacts.
- [ ] Rollback: reset integration branch to pre-import commit; retain temp clone and manifests.
- [ ] Commit: merge commit preserving filtered API history.

## Task 11: Reconcile workspace, Docker, CI, and operational docs

**Files:** `pnpm-workspace.yaml`, root `package.json`, root `pnpm-lock.yaml`, `apps/api/{package.json,Dockerfile,.dockerignore}`, active CI/deploy docs.

- [ ] Decide one documented runtime baseline before changing files: retain Node 20/pnpm 9 across CI and Docker, or upgrade every workspace/CI image together. Baseline existing warnings; reject new warnings.
- [ ] Add `apps/api` to workspace; remove imported nested lockfiles, then regenerate one root lockfile:
  ```bash
  git rm apps/api/pnpm-lock.yaml apps/api/package-lock.json 2>/dev/null || true
  pnpm install
  pnpm --filter ./apps/api... test
  pnpm --filter ./apps/api... typecheck
  pnpm --filter ./apps/api... build
  ```
- [ ] Add TDD migration mode and locking before Docker work: create `apps/api/src/server/index.test.ts` cases for `MIGRATIONS_MODE=disabled|verify-only|run` and `apps/api/src/scripts/migrate.test.ts` cases proving `pg_advisory_lock(82420260724)` is acquired/released once; run RED, update server so only `run` invokes migrations, add lock/timeout/ledger behavior to controlled `apps/api/src/scripts/migrate.ts`, then rerun GREEN.
- [ ] Replace standalone Docker context with monorepo-compatible multi-stage Dockerfile: copy root workspace manifests plus `apps/api`, run `pnpm --filter ./apps/api... deploy --prod /app`, then copy `/app` into runtime image using chosen baseline Node/pnpm. Validate without secrets:
  ```bash
  docker build -f apps/api/Dockerfile -t pi-finance-api:consolidation .
  ```
- [ ] Update only operational documentation and CI paths.
- [ ] Expected: root lockfile resolves; API image builds; no nested API lockfile remains.
- [ ] Stop: peer dependency warning, frozen install failure, Docker secret copy, or changed historical docs.
- [ ] Rollback: revert task commit.
- [ ] Commit: `build: integrate API workspace and container`.

## Task 12: Apply group-filter patch

**Files:** five reviewed `apps/whatsapp-bridge/**` paths.

- [ ] Export patch from `pi-financeiro-wt-group-filter`; apply to integration worktree after API/PWA integration.
- [ ] Run bridge tests:
  ```bash
  pnpm --filter ./apps/whatsapp-bridge... test
  ```
- [ ] Expected: five-path diff applies and tests pass.
- [ ] Stop: scope expansion or bridge regression.
- [ ] Rollback: revert task commit.
- [ ] Commit: `fix(bridge): apply group filter changes`.

## Task 13: Triage canonical WIP

**Files:** current canonical dirty paths only.

- [ ] Classify each path as product source, test evidence, temporary audit output, or documentation.
- [ ] Apply product/test changes as small reviewed commits; archive evidence outside repo; remove only regenerated artifacts from integration worktree.
- [ ] Expected: no bulk add; each retained path has purpose and verification.
- [ ] Stop: unclear ownership or test artifact masquerading as source.
- [ ] Rollback: restore from Task 3 backup.
- [ ] Commit: one focused commit per independent concern.

## Task 14: Full validation gates

**Files:** none unless a test exposes a defect.

- [ ] Run exact gates from integration worktree: `pnpm --filter ./apps/api... test`, `pnpm --filter ./apps/api... typecheck`, `pnpm --filter ./apps/api... build`, `pnpm --filter ./apps/pwa... test`, `pnpm --filter ./apps/whatsapp-bridge... test`, and `docker build -f apps/api/Dockerfile -t pi-finance-api:consolidation .`.
- [ ] Before one controlled migration job, load `/run/secrets/pi-finance-restore.env`, set `DB_SCHEMA=legacy`, `MIGRATIONS_MODE=run`, and `PGOPTIONS='-c lock_timeout=5000 -c statement_timeout=60000'`; query `actual_host`, `actual_database`, and `actual_schema`; execute `test "$actual_host" = "$MIGRATION_EXPECTED_HOST" && test "$actual_database" = "$MIGRATION_EXPECTED_DATABASE" && test "$actual_schema" = "$MIGRATION_EXPECTED_SCHEMA" || exit 1` before acquiring lock. Then run `pnpm --dir apps/api db:migrate`; record identity, advisory-lock key, ledger/checksum, compatibility, and exit status in `$BACKUP_ROOT/migration-rehearsal.md`.
- [ ] Run PWA E2E with `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts` and API authenticated smoke against restored non-production legacy schema.
- [ ] Expected: all commands exit 0; migration ledger/checksum and prior-image compatibility pass.
- [ ] Stop: any failed gate.
- [ ] Rollback: no deploy; revert offending integration commit.
- [ ] Commit: none.

## Task 15: Controlled VPS cutover

**Files:** VPS deployment configuration only.

- [ ] **USER APPROVAL REQUIRED:** deploy consolidated API.
- [ ] Prove compose/entrypoint sets `MIGRATIONS_MODE=disabled`; run one named migration job against approved target with recorded advisory-lock key, statement/lock timeouts, transaction boundaries, ledger/checksum, drained connections, maintenance window, and exit status.
- [ ] Deploy approved `apps/api` image digest; retain prior compatible image and named application/database rollback operators. Write `$BACKUP_ROOT/cutover-evidence.md` with approver, digest, migration result, health response, and timestamps.
- [ ] Expected: `/health`, authenticated API flow, and PWA flow pass.
- [ ] Stop: migration lock failure, health failure, contract mismatch, error rate above approved baseline, or data anomaly.
- [ ] Application rollback: redeploy recorded prior image digest and rerun `/health` plus authenticated smoke. Database rollback: use PITR only after base-backup/WAL rehearsal evidence exists; otherwise use the measured Task 5 logical-restore runbook. Never treat image redeploy as database recovery.
- [ ] Commit: deployment references only after production approval.

## Task 16: Observe and decide rollback

**Files:** external operational log only.

- [ ] Observe API health, error logs, PWA authenticated actions, and database metrics for 60 minutes; append 5-minute samples to `$BACKUP_ROOT/cutover-evidence.md`.
- [ ] Expected: no elevated errors or data inconsistency during recorded observation period.
- [ ] Stop: error threshold or data anomaly defined in cutover approval; execute the matching Task 15 application or database rollback.
- [ ] Rollback: Task 15 procedure.
- [ ] Commit: none.

## Task 17: Archive legacy material

**Files:** local filesystem only.

- [ ] Move `pi-finance-ios` to `D:/projetos/arquivados/pi-finance-ios`, preserving `.git`.
- [ ] Copy `pi-finance-web/docs/plano-redesign-premium.md` and `docs/superpowers/plans/2026-06-19-reports-page-fix.md` to `arquivados/pi-finance-web-legacy-docs/`; route the invalidated review into Task 18 quarantine, never discard it in this task.
- [ ] Move LHCI report from `pi-financeiro-pwa-remediation-docker-report` into archive.
- [ ] Expected: archive manifest and restore check pass.
- [ ] Stop: destination exists with different content or manifest mismatch.
- [ ] Rollback: move directory/file back.
- [ ] Commit: none; archives remain outside Git.

## Task 18: Quarantine and remove candidates

**Files:** local filesystem/worktree registry only.

- [ ] For every candidate, including copies, report directory, empty directory, and baseline worktree: create provenance manifest, restore-tested archive, normalized comparison, active-process/reference check, and dated 30-day quarantine after post-cutover observation.
- [ ] Place `pi-financeiro-hotfix-test`, `pi-financeiro-main-deploy`, and `pi-financeiro-main-deploy-2` in dated quarantine after those checks.
- [ ] Move `arquivados/pi-financeiro-e2e-baseline` into dated quarantine through Git, preserving recoverability:
  ```bash
  mkdir -p D:/projetos/arquivados/quarantine
  git -C D:/projetos/pi-financeiro worktree move D:/projetos/arquivados/pi-financeiro-e2e-baseline D:/projetos/arquivados/quarantine/pi-financeiro-e2e-baseline-$RUN_ID
  ```
- [ ] After 30 days, successful restore check, and explicit approval, remove it through `git worktree remove D:/projetos/arquivados/quarantine/pi-financeiro-e2e-baseline-$RUN_ID` then `git worktree prune`.
- [ ] Remove empty `pi-financeiro-pwa-remediation;C` only after explicit approval.
- [ ] After 30 days and per-directory user confirmation, delete local quarantine directories. Do not delete GitHub remotes.
- [ ] Expected: `git worktree list` has no stale entry; archive/manifests remain restorable.
- [ ] Stop: active process, missing manifest, failed restore, or absent approval.
- [ ] Rollback: restore quarantine archive; never force-remove a worktree.
- [ ] Commit: none.

## Tests

| Type | Tool | Scope |
|---|---|---|
| Unit | Vitest, RED first for behavior changes | API, PWA, bridge |
| Contract | API contract suite + legacy PostgreSQL restore | API/database boundary |
| E2E | Playwright | PWA authenticated flows |
| Docker | `docker build` | monorepo API image |
| Migration | isolated PostgreSQL | lock, ledger, compatibility, restore |
| Smoke | health + authenticated flow | VPS after approved cutover |
| Mutation | existing Stryker configuration where affected | changed production modules |

## Spec Traceability

| Requirements | Plan tasks |
|---|---|
| REQ-01, REQ-03 | 2, 3, 10 |
| REQ-02, REQ-14 | 4, 5, 15 |
| REQ-04, REQ-05, REQ-06 | 9, 10 |
| REQ-07, REQ-08 | 7, 8 |
| REQ-09, REQ-10 | 11 |
| REQ-11 | 12 |
| REQ-12, REQ-13, REQ-17 | 17, 18 |
| REQ-15, REQ-16 | 11, 14, 15, 16 |

## Execution Approval Gates

| Gate | Required approval |
|---|---|
| Task 5 production backup | user |
| Task 15 VPS migration/deploy | user |
| Task 17 archive moves | user |
| Task 18 each local deletion | user |
