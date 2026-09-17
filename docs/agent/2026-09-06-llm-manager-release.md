# Release LLM-manager — 2026-09-06 (499d2cf)

Deploy do trabalho de revisão do gerenciador de LLM (50 commits de review
Fase 0–3 + audits + Dockerfile standalone versionado).

## Commits (783d560..499d2cf, 52 commits)

- `018a4fc..15aa84f` (50 commits): fixes TDD do gerenciador de LLM
  (runtime DTOs, guards fail-closed, CSRF, relay allowlist, snapshot validado).
- `06d4b66` docs(audits): 10 relatórios de review em `docs/audits/`.
- `499d2cf` chore(deploy): `apps/api/Dockerfile.vps-standalone` versionado.

## Gates (pré-commit, todos PASS)

- `pnpm docs:lint` PASS (8 docs, 0 issues)
- `pnpm governance:check` PASS (sem mudança D01-D19)
- `pnpm security:secrets` PASS (gitleaks pulado no win32; CI é autoritativo)
- `pnpm typecheck` PASS (api, pwa, agent, codex-broker)
- `pnpm test` PASS — API 1153/1153 (147 arquivos) + PWA 1233/1233 (133 arquivos)

## API — VPS Hostinger (<VPS_SSH_USER>@<VPS_IP>, ~/infra/pi-finance-api)

Mecanismo: sync `apps/api` + `packages/llm-contracts` (vendored como membro
de workspace via `pnpm-workspace.yaml` com `packages/*`, sem `workspace:*`
quebrado) → `docker build` → tag `:main` → `docker compose up -d`.
V042 aplica sozinha no boot (`runMigrations(pool, true)` em DB_SCHEMA=legacy;
`MIGRATIONS_MODE` não é lido pelo código — vestigial).

- Backup: `backups/llm-pre-499d2cf-20260906T103037Z.sql` (agent_llm_* + _migrations),
  `app-bak-499d2cf-<TS>`, imagem `backup-before-499d2cf-<TS>`.
- Imagem: `pi-finance-api:release-499d2cf` (libcrypto 3.5.8-r0, CVE-2026-14456 OK).
- Verificações: container `healthy`, `/app/.release` = `499d2cf`,
  `/health` → `{"status":"ok"}` (interno e `https://api.synkroo.com.br/health`),
  `_migrations` contém V42, `agent_llm_runtime_config` intacta
  (active = opencode-zen / muse-spark-1.2-contributor-free), 4 providers.
- Rollback: `docker tag backup-before-499d2cf-<TS> :main + compose up -d`;
  schema via dump + plano no header de V042 (código primeiro, constraints depois).

## Cloudflare (wrangler manual, conta <owner-email>)

- Agent `pi-finance-agent` — versão `73ea4217`
  (`https://<AGENT_HOST>/health` → `{"status":"ready","schemaVersion":5}`).
- PWA `pi-finance-pwa` — versão `94a94307` (3 assets novos, resto em cache)
  (`/pwa-control` → `{"version":"3.3.0","enabled":true}`).
- Nota: `pnpm --filter pwa deploy` colide com o comando nativo `pnpm deploy`;
  usar `pnpm --filter pwa run deploy`.
