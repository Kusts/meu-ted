# Release boot-order + lockfile — 2026-09-06 (0cff771)

Deploy de dois fixes revisados: ordem de boot (migrations antes do better-auth) e
build standalone determinístico (frozen-lockfile + pin better-auth 1.6.30).

## Commits (3d95d5e..0cff771, 3 commits + este registro)

- `40e5766` fix(api): run migrations before better-auth at boot
  (`server/index.ts`: `runMigrations` linha 71 ANTES de `createBetterAuth` linha 85;
  elimina o cache de schema-check pré-migration que exigiu restart manual no release anterior).
- `a11bfcf` chore(deploy): freeze standalone VPS build on versioned lockfile
  (`--frozen-lockfile` + `apps/api/pnpm-lock.standalone.yaml` + pin exato `better-auth 1.6.30`).
- `0cff771` fix(deploy): align standalone lockfile COPY with VPS staging sync
  (nome canônico único, sync sem rename; lista de sync documentada).
- Push `3d95d5e..0cff771` para `origin/main` executado neste release.

## Gates

- Review APROVADO pelo coordenador (pré-requisito do deploy): boot order, logs, in-memory,
  1164/1164 testes, ambos os lockfiles em 1.6.30, demais Dockerfiles frozen.
- `pnpm --filter pi-finance-api run build` (tsc) PASS no commit do pin.

## API — VPS Hostinger (<VPS_SSH_USER>@<VPS_IP>, ~/infra/pi-finance-api)

Mecanismo: backup → sync 5 arquivos (checksums sha256 5/5) → `.release` → `docker build`
(com `--frozen-lockfile`) → tag `:main` → `docker compose up -d`. SEM restart manual.

- Backup: `backups/pre-0cff771-20260906T125128Z.sql` (114 KB; 8 tabelas:
  `user`, `session`, `account`, `verification`, `_migrations`, `agent_llm_*`),
  imagem `backup-before-0cff771-20260906T125128Z`, diretório `app-bak-0cff771-20260906T125128Z`.
- Sync: `Dockerfile` (de `Dockerfile.vps-standalone`), `package.json`,
  `pnpm-lock.standalone.yaml` (novo, mesmo nome), `src/server/index.ts`,
  `tests/server/boot-order.test.ts`.
- Imagem: `pi-finance-api:release-0cff771` → tag `:main`. Container `083444b0cd76`,
  `healthy` no primeiro boot. `/app/.release` = `0cff771`.
- **Fim do drift**: `better-auth` no container = **1.6.30** (era 1.7.3).
- Boot: `legacyMigrations: []` (nada pendente) ANTES de `Server listening`; ordem no código
  implantado confirma `runMigrations` (linha 71) antes de `createBetterAuth` (linha 85).
- Verificações: `/health` interno `{"status":"ok"}`;
  `https://api.synkroo.com.br/health` → 200.
- PROBE DO LOGIN (primeiro boot, sem restart): `POST /auth/sign-in/email` corpo `{}` →
  **400 VALIDATION_ERROR** (nunca 500) — prova comportamental do fix de ordem.
- Rollback: `docker tag backup-before-0cff771-20260906T125128Z :main + compose up -d`
  (+ restore de `pre-0cff771-*.sql` se necessário; mudanças de schema desde V043: nenhuma).

## Cloudflare (somente revalidação — sem código novo para PWA/Agent)

- Agent: `/health` → `{"status":"ready","schemaVersion":5}` (versão `73ea4217`).
- PWA: `/pwa-control` → `{"version":"3.3.0","enabled":true}` (versão `94a94307`).
- Nenhum redeploy executado.
