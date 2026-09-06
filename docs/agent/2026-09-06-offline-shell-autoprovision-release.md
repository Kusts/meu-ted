# Release offline-shell + autoprovisionamento — 2026-09-06 (11172e0)

Deploy final do dia: fix do offline-shell no PWA (Cloudflare) + autoprovisionamento
de perfil no GET /profile (API VPS). Objetivo: item admin visível e offline-shell correto.

## Commits (23df7c3..11172e0, 2 commits + este registro)

- `c8df3e8` fix(pwa): resolve revisioned precache key in offline fallback (+ e2e).
- `11172e0` fix(api): auto-provision profile on GET when session resolves (+ testes
  e `docs/agent/2026-09-06-causa-a-profile-evidence.md` com a correção de dado CAUSA-A).
- Push `23df7c3..11172e0` para `origin/main` executado neste release.

## Gates

- PWA `lint` PASS (0 errors, 13 warnings pré-existentes).
- `build:cloudflare` PASS.
- `vitest run` PASS — **1239/1239**.
- `vitest run src/headers.test.ts` PASS (6/6).
- `playwright offline-shell` PASS — **6/6** (gate que bloqueou o release anterior;
  corrigido por `c8df3e8`, agora verde).
- API `vitest tests/routes/profile.test.ts` 22/22 + `typecheck` + `build` PASS (no commit).
- Review APROVADO para `c8df3e8` e `11172e0` (pré-requisito do deploy).

## PWA — Cloudflare

- Deploy `--message "git:11172e0ec4e6"` → **versão `14cd692b-b69e-4ebc-9b6e-364aedb6f855`**.
- Verificações: `/pwa-control` → `{"version":"3.3.0","enabled":true}`;
  `/` 200, `/sw.js` 200, `/manifest.webmanifest` 200 (verificado no release anterior,
  bundle novo confirmado pela versão ativa).
- Rollback: `wrangler rollback b790679a-53c5-4d19-91c7-6548c057dfc7` (versão anterior).

## API — VPS Hostinger (deploy@187.77.249.47, ~/infra/pi-finance-api)

Mecanismo padrão: backup → sync 2 arquivos (sha256 2/2) → `.release` → `docker build` →
tag `:main` → `docker compose up -d`.

- Backup: `backups/pre-11172e0-20260906T155130Z.sql` (117 KB; 9 tabelas — inclui
  `profiles`, cobrindo a row CAUSA-A), imagem `backup-before-11172e0-20260906T155130Z`,
  diretório `app-bak-11172e0-20260906T155130Z`.
- Sync: `src/routes/profile.ts`, `tests/routes/profile.test.ts`.
- Imagem `pi-finance-api:release-11172e0` → `:main`; container `8886aeedbe0d` healthy;
  `/app/.release` = `11172e0`.
- Verificações: `/health` interno e `https://api.synkroo.com.br/health` → 200;
  `POST /auth/sign-in/email {}` → 400; `GET /profile` sem auth → 401.
- Rollback: `docker tag backup-before-11172e0-20260906T155130Z :main + compose up -d`;
  row do perfil (`d36cb649`): `DELETE FROM profiles WHERE household_id='d36cb649-...'`
  (só se for preciso desfazer o dado; dump pré-deploy a cobre).

## Validação funcional

- Item do Perfil depende de sessão real do usuário — confirmação final no navegador
  (reload; a row do household dele já existe e o autoprovisionamento cobre novos casos).
