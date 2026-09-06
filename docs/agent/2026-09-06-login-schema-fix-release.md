# Release login-schema-fix — 2026-09-06 (9380232)

Deploy do fix do login de produção (POST /auth/sign-in/email → 500 SCHEMA_MISMATCH).

## Commits (b5dc06f..9380232, 1 commit + este registro)

- `9380232` fix(api): `V043__better_auth_admin_impersonation` legacy-safe
  (colunas admin/impersonation do better-auth + reparo do case-folding da V031
  + `V043` em `LEGACY_SAFE_PREFIXES`) + 2 arquivos de teste (TDD).
- Push `b5dc06f..9380232` para `origin/main` executado neste release.

## Gates (todos PASS antes do push)

- `pnpm --filter pi-finance-api run typecheck` PASS.
- `pnpm --filter pi-finance-api test` PASS — 148 arquivos, 1160/1160 testes
  (inclui 7 novos de `better-auth-admin-impersonation-migration`; 3 de integração pulados sem DB).
- `pnpm docs:lint` PASS (8 docs, 0 issues).
- `pnpm governance:check` PASS (sem mudança D01-D19).

## API — VPS Hostinger (deploy@187.77.249.47, ~/infra/pi-finance-api)

Mecanismo: backup (dump + tag + app-bak) → sync dos 4 arquivos alterados
(`apps/api` → `app/`, checksums sha256 conferidos 4/4) → `.release` → `docker build`
→ tag `:main` → `docker compose up -d` → `docker restart` (ver motivo abaixo).

- Backup: `backups/pre-9380232-20260906T112743Z.sql` (108 KB; tabelas `user`, `session`,
  `account`, `verification`, `_migrations`, `agent_llm_models/providers/runtime_config`,
  `--column-inserts`), imagem `backup-before-9380232-20260906T112743Z` (id da `:main` anterior
  `8bc26c214cf8`), diretório `app-bak-9380232-20260906T112743Z`.
- Imagem: `pi-finance-api:release-9380232` → tag `:main`. Container recriado `c0dece94cbcf`,
  `healthy`. `/app/.release` = `9380232`.
- Boot 1: `legacyMigrations: [43]` (V043 aplicada). Boot 2 (pós-restart): `[]` (idempotente).
- `_migrations` contém 43; colunas `"banReason"`, `"banExpires"` (user) e
  `"impersonatedBy"` (session) presentes com case exato (conferido via information_schema).
- Verificações: `/health` interno `{"status":"ok"}`; `https://api.synkroo.com.br/health` → 200.
- PROBE DO LOGIN: `POST /auth/sign-in/email` corpo `{}` → **400 VALIDATION_ERROR**
  (era 500 SCHEMA_MISMATCH). Via proxy PWA `/api/backend/auth/sign-in/email` → **400 idêntico**.
  (Nota: o path `/api/backend/auth/login` sugerido no plano não existe — proxy é catch-all que
  espelha o path da API; retornava 404 por rota inexistente, não por schema.)
- Rollback: `docker tag backup-before-9380232-20260906T112743Z :main + compose up -d`
  (+ restore de `pre-9380232-*.sql` se schema precisar voltar; colunas V043 são aditivas,
  rollback de código antigo segue funcional).

## Achado relevante — restart foi necessário (cache de schema do better-auth 1.7.3)

- A imagem instalada resolveu `better-auth@1.7.3` (build usa `pnpm install --no-frozen-lockfile`;
  lockfile/repo local tem 1.6.30). A 1.7.x adicionou validação de schema no boot
  (`@better-auth/core` `schema-check`: roda na inicialização e **cacheia** o veredito de mismatch,
  relançando em toda request sem reconsultar o banco até que uma migration o invalide).
- Ordem de boot em `apps/api/src/server/index.ts`: `createBetterAuth()` (linha 69) roda ANTES de
  `runMigrations(pool, true)` (linha 116). No primeiro boot com V043, o check cacheou o mismatch
  pré-migration → 500 persistiu mesmo com o banco correto (colunas verificadas via conexão da
  própria API). `docker restart` forçou re-check pós-migration → 400. Sem mudança de código.
- FOLLOW-UP (não executado, fora do escopo): reordenar `runMigrations` para antes de
  `createBetterAuth()` e/ou congelar a versão do better-auth no build Docker
  (lockfile respeitado), para que futuros boots com migrations relevantes não exijam restart manual.

## Cloudflare (somente revalidação — sem código novo para PWA/Agent)

- PWA `pi-finance-pwa` segue em `94a94307` (2026-09-06T10:39Z): `/` 200, `/sw.js` 200,
  `/manifest.webmanifest` 200, `/pwa-control` → `{"version":"3.3.0","enabled":true}`.
- Agent `pi-finance-agent` segue em `73ea4217` (2026-09-06T10:35Z):
  `/health` → `{"status":"ready","schemaVersion":5}`.
- Nenhum redeploy executado (commit 9380232 só toca `apps/api`).
