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

**Files:** Create external inventory under `D:\secure-backups\pi-financeiro-consolidation\<timestamp>\`; modify none.

- [ ] Run:
  ```bash
  git -C D:/projetos/pi-financeiro fetch --all --prune
  git -C D:/projetos/pi-financeiro worktree list --porcelain
  for d in D:/projetos/pi-finance*; do git -C "$d" status --short 2>/dev/null || true; done
  ```
- [ ] Record absolute paths, HEAD, branch, upstream, dirty files, and size excluding generated directories, including `D:/projetos/arquivados/pi-financeiro-e2e-baseline` and `D:/projetos/arquivados/pi-financeiro-backups`.
- [ ] Expected: all 14 reviewed directories have one inventory row.
- [ ] Stop: path identity differs from approved spec.
- [ ] Commit: none, external inventory only.

## Task 2: Secret gate

**Files:** Read API refs/objects/WIP; create encrypted external reports only.

- [ ] Install or verify scanner outside repository:
  ```bash
  gitleaks version
  ```
- [ ] Scan API history and working files:
  ```bash
  cd D:/projetos/pi-finance-api
  gitleaks git --log-opts="--all" --redact --report-path D:/secure-backups/pi-financeiro-consolidation/<timestamp>/api-history.json
  gitleaks dir . --redact --exclude-path=.env --report-path D:/secure-backups/pi-financeiro-consolidation/<timestamp>/api-worktree.json
  ```
- [ ] Expected: zero unapproved findings.
- [ ] Stop: any credential, private key, database URL, token, or secret in history/WIP.
- [ ] Rollback: none. On finding, revoke/rotate, purge with an approved history-remediation procedure, then rescan.
- [ ] Commit: none.

## Task 3: Backup dirty state

**Files:** Create encrypted external artifacts; modify no repository files.

- [ ] For each dirty canonical/API/remediation/group-filter workspace, generate binary diff, NUL-safe untracked list, tar archive, and SHA-256 manifest outside Git:
  ```bash
  repo=D:/projetos/pi-finance-api
  out=D:/secure-backups/pi-financeiro-consolidation/<timestamp>/pi-finance-api
  mkdir -p "$out"
  git -C "$repo" diff --binary > "$out/tracked.patch"
  git -C "$repo" ls-files --others --exclude-standard -z > "$out/untracked-paths.nul"
  tar --null -T "$out/untracked-paths.nul" -C "$repo" -czf "$out/untracked.tar.gz"
  sha256sum "$out/tracked.patch" "$out/untracked-paths.nul" "$out/untracked.tar.gz" > "$out/SHA256SUMS"
  ```
- [ ] Encrypt artifacts using approved local encryption outside Git.
- [ ] Restore each archive into a temporary directory and compare `SHA256SUMS`.
- [ ] Expected: every checksum and restoration succeeds.
- [ ] Stop: archive omission, checksum mismatch, or plaintext secret artifact lacks approved restricted storage.
- [ ] Commit: none.

## Task 4: VPS and database identity

**Files:** Read `../vps-hostinger/`; create external inventory only.

- [ ] Inspect approved Hostinger deploy host, compose/service name, API image/revision, Postgres host/database/schema/version/extensions, TLS, disk, and active connections.
- [ ] Run read-only commands over approved SSH:
  ```bash
  docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
  docker inspect pi-finance-api --format '{{.Image}} {{.Config.Image}}'
  psql "$DATABASE_URL" -Atc 'show server_version; select current_database();'
  ```
- [ ] Expected: inventory identifies `/home/deploy/infra/pi-finance-api`, `pi-finance-api`, database target, and prior deploy revision.
- [ ] Stop: target differs from approved Hostinger topology or database identity is ambiguous.
- [ ] Commit: none.

## Task 5: PostgreSQL recovery rehearsal

**Files:** Encrypted off-host backup only; Git unchanged.

- [ ] **USER APPROVAL REQUIRED:** create production backup.
- [ ] Run from approved VPS session with externally supplied recipient, never echoed or committed:
  ```bash
  out=/srv/secure-export/pi-financeiro-consolidation/<timestamp>
  mkdir -p "$out"
  pg_dump "$DATABASE_URL" --format=custom | age -r "$BACKUP_AGE_RECIPIENT" -o "$out/postgres.dump.age"
  sha256sum "$out/postgres.dump.age" > "$out/SHA256SUMS"
  ```
- [ ] Copy encrypted dump/checksum to approved off-host storage, then restore into isolated PostgreSQL matching production major version; verify schema, extensions, row counts, and API contract tests against `DB_SCHEMA=legacy`.
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
  git -C D:/projetos/pi-financeiro merge-base --is-ancestor 49d1a90 1c520ab
  git -C C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation diff --stat origin/main 1c520ab
  ```
- [ ] Cherry-pick or merge reviewed integration branch commits into integration worktree.
- [ ] Run PWA targeted unit/E2E checks before next task.
- [ ] Expected: 31 remediation commits proven ancestors; selected 40-commit series applies cleanly.
- [ ] Stop: conflict, test regression, or dependency lockfile conflict.
- [ ] Rollback: abort merge/cherry-pick; reset integration branch only.
- [ ] Commit: one integration commit or preserved reviewed commit series.

## Task 8: Apply remediation dirty delta

**Files:** Only paths listed by `git -C D:/projetos/pi-financeiro-pwa-remediation diff --name-only`.

- [ ] Generate patch relative to updated `main-deploy-3` content; exclude `nul` and generated helpers unless approved.
- [ ] Apply patch with index validation:
  ```bash
  patch=D:/secure-backups/pi-financeiro-consolidation/<timestamp>/pwa-remediation-delta.patch
  git -C D:/projetos/pi-financeiro-pwa-remediation diff --binary > "$patch"
  git -C C:/Users/walis/.config/superpowers/worktrees/pi-financeiro/repository-consolidation apply --check "$patch"
  ```
- [ ] Run changed PWA test files and E2E specs.
- [ ] Expected: only uncommitted delta applies; no duplicated 31-commit history.
- [ ] Stop: patch touches undeclared files or tests fail.
- [ ] Rollback: `git restore` changed integration paths.
- [ ] Commit: `fix(pwa): apply reviewed remediation delta`.

## Task 9: Classify API WIP

**Files:** `D:/projetos/pi-finance-api/**`; safeguard branch.

- [ ] Split every modified/untracked API path into `import-ready` or `deferred`; include reason in commit body.
- [ ] Create safeguard branch and commit import-ready sources, including approved migrations/routes/Docker assets:
  ```bash
  git -C D:/projetos/pi-finance-api switch -c safeguard/repository-consolidation
  git -C D:/projetos/pi-finance-api add <reviewed-paths>
  git -C D:/projetos/pi-finance-api commit -m "chore: safeguard API consolidation WIP"
  ```
- [ ] Expected: all API paths have classification; no `.env`, logs, `node_modules`, or `dist` staged.
- [ ] Stop: unclassified source, failing API tests, or secret finding.
- [ ] Rollback: preserve branch and restore working tree from external artifacts.
- [ ] Commit: safeguard commit in API repository.

## Task 10: Import API history

**Files:** Temporary clone and integration worktree `apps/api/**`.

- [ ] Clone API to temporary external path; save pre-rewrite commit list/hash manifest.
- [ ] Filter history:
  ```bash
  git clone --no-local D:/projetos/pi-finance-api D:/secure-work/pi-finance-api-filtered
  cd D:/secure-work/pi-finance-api-filtered
  git filter-repo --to-subdirectory-filter apps/api
  ```
- [ ] Preserve filter-repo commit map outside Git. Merge filtered history into integration branch with `--allow-unrelated-histories`.
- [ ] Fallback only after review: `git subtree add --prefix=apps/api <api-remote> safeguard/repository-consolidation --squash` plus equivalent provenance manifest.
- [ ] Expected: `apps/api` contains source history; no nested `.git`, `.env`, `node_modules`, `dist`, or logs.
- [ ] Stop: commit map missing, secret scan fails, or imported tree has unapproved artifacts.
- [ ] Rollback: reset integration branch to pre-import commit; retain temp clone and manifests.
- [ ] Commit: merge commit preserving filtered API history.

## Task 11: Reconcile workspace, Docker, CI, and operational docs

**Files:** `pnpm-workspace.yaml`, root `package.json`, root `pnpm-lock.yaml`, `apps/api/{package.json,Dockerfile,.dockerignore}`, active CI/deploy docs.

- [ ] Add `apps/api` to workspace; reconcile package manager version and regenerate one root lockfile:
  ```bash
  pnpm install
  pnpm --filter ./apps/api... test
  pnpm --filter ./apps/api... typecheck
  pnpm --filter ./apps/api... build
  ```
- [ ] Replace standalone Docker context with monorepo-compatible build; validate without secrets:
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

- [ ] Run API, PWA, bridge, Docker, and isolated legacy-schema migration checks.
- [ ] Run PWA E2E and API authenticated smoke against non-production environment.
- [ ] Expected: all commands exit 0; migration ledger/checksum and prior-image compatibility pass.
- [ ] Stop: any failed gate.
- [ ] Rollback: no deploy; revert offending integration commit.
- [ ] Commit: none.

## Task 15: Controlled VPS cutover

**Files:** VPS deployment configuration only.

- [ ] **USER APPROVAL REQUIRED:** deploy consolidated API.
- [ ] Disable startup migrations in production; run one approved migration job with advisory lock, timeouts, ledger/checksum verification, and recorded result.
- [ ] Build/deploy approved API revision from `apps/api`; retain prior compatible image.
- [ ] Expected: `/health`, authenticated API flow, and PWA flow pass.
- [ ] Stop: migration lock failure, health failure, contract mismatch, or data anomaly.
- [ ] Rollback: redeploy prior image; use PostgreSQL recovery/PITR runbook only for database-impacting failure.
- [ ] Commit: deployment references only after production approval.

## Task 16: Observe and decide rollback

**Files:** external operational log only.

- [ ] Observe API health, error logs, PWA authenticated actions, and database metrics through approved window.
- [ ] Expected: no elevated errors or data inconsistency during recorded observation period.
- [ ] Stop: error threshold or data anomaly defined in cutover approval.
- [ ] Rollback: Task 15 procedure.
- [ ] Commit: none.

## Task 17: Archive legacy material

**Files:** local filesystem only.

- [ ] Move `pi-finance-ios` to `D:/projetos/arquivados/pi-finance-ios`, preserving `.git`.
- [ ] Copy `pi-finance-web/docs/plano-redesign-premium.md` and `docs/superpowers/plans/2026-06-19-reports-page-fix.md` to `arquivados/pi-finance-web-legacy-docs/`; discard only invalidated review after approval.
- [ ] Move LHCI report from `pi-financeiro-pwa-remediation-docker-report` into archive.
- [ ] Expected: archive manifest and restore check pass.
- [ ] Stop: destination exists with different content or manifest mismatch.
- [ ] Rollback: move directory/file back.
- [ ] Commit: none; archives remain outside Git.

## Task 18: Quarantine and remove candidates

**Files:** local filesystem/worktree registry only.

- [ ] Place `pi-financeiro-hotfix-test`, `pi-financeiro-main-deploy`, and `pi-financeiro-main-deploy-2` in dated quarantine after normalized source comparison against retained references.
- [ ] Remove `arquivados/pi-financeiro-e2e-baseline` only through:
  ```bash
  git -C D:/projetos/pi-financeiro worktree remove D:/projetos/arquivados/pi-financeiro-e2e-baseline
  git -C D:/projetos/pi-financeiro worktree prune
  ```
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

## Execution Approval Gates

| Gate | Required approval |
|---|---|
| Task 5 production backup | user |
| Task 15 VPS migration/deploy | user |
| Task 17 archive moves | user |
| Task 18 each local deletion | user |
