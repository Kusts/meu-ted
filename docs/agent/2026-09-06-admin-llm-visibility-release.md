# Release admin LLM visibility (isAdmin) — 2026-09-06 (d0f6908)

Deploy do fix que faz o item "Configuração LLM (Admin)" aparecer no Perfil do PWA
para a conta admin e funcionar corretamente (API VPS + PWA Cloudflare).

## Commits (936822d..d0f6908, 2 commits + este registro)

- `c1ddedf` fix(profile): preserve isAdmin across PATCH, save and bootstrap (API).
- `d0f6908` fix(pwa): merge profile flags in refreshProfile to preserve isAdmin (PWA).
- Push `936822d..d0f6908` para `origin/main` executado neste release.

## Gates (bloco explícito)

- `pnpm --dir apps/pwa lint` PASS (0 errors, 13 warnings pré-existentes).
- `pnpm --dir apps/pwa build:cloudflare` PASS.
- `pnpm --dir apps/pwa exec vitest run` PASS — **1239/1239** (primeira tentativa teve
  1 falha flaky isolada; rerun completo verde).
- `vitest run src/headers.test.ts` PASS (6/6).
- `playwright --config=scripts/offline-shell-spike` **FAILED — 2 falhas PRÉ-EXISTENTES
  em Offline Routes** (precache de `offline-shell.html` + fallback "Modo offline"),
  alheias ao diff: spec/sw.js/offline-shell.html intocados desde `d99dd7f`/`354aefb`/`f65909d`,
  diff deste release toca só profile state + rota profile, outros 4 testes de SW passam,
  e o mesmo offline-shell já está em produção desde `94a94307`. Deploy da PWA autorizado
  pelo coordenador com este registro; follow-up aberto para correção do spike.
  Nenhum outro gate foi contornado.

## API — VPS Hostinger (deploy@187.77.249.47, ~/infra/pi-finance-api)

Mecanismo padrão: backup → sync 2 arquivos (checksums sha256 2/2) → `.release` →
`docker build` (frozen, better-auth 1.6.30) → tag `:main` → `docker compose up -d`.

- Backup: `backups/pre-d0f6908-20260906T135211Z.sql` (114 KB; 8 tabelas),
  imagem `backup-before-d0f6908-20260906T135211Z`, diretório `app-bak-d0f6908-20260906T135211Z`.
- Sync: `src/routes/profile.ts`, `tests/routes/profile.test.ts`.
- Imagem `pi-finance-api:release-d0f6908` → `:main`; container `ff92e6860e50` healthy;
  `/app/.release` = `d0f6908`.
- Verificações: `/health` interno e `https://api.synkroo.com.br/health` → 200;
  `POST /auth/sign-in/email {}` → 400; `GET /profile` sem auth → 401.
- Rollback: `docker tag backup-before-d0f6908-20260906T135211Z :main + compose up -d`.

## PWA — Cloudflare (`pnpm --dir apps/pwa build:cloudflare + wrangler deploy`)

- Deploy `--message "git:d0f69088d5a3"` → **versão `b790679a-53c5-4d19-91c7-6548c057dfc7`**.
- Verificações: `/pwa-control` → `{"version":"3.3.0","enabled":true}`;
  `/` 200, `/sw.js` 200, `/manifest.webmanifest` 200.
- Rollback: `wrangler rollback 94a94307-2ce6-4426-aca9-f7c705fafeff`
  (versão saudável anterior) + re-run dos health checks.

## Validação funcional (sem credenciais)

- Bundle novo servido (versão `b790679a` ativa); `GET /profile` segue 401 sem auth
  (guards intactos); API 200/400/401 conforme esperado.
- O item do Perfil depende de sessão real: confirmação final é do usuário
  (reload do PWA; se necessário, logout + login no navegador).
