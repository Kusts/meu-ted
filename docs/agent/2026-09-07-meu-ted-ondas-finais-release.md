# Release ondas finais Meu Ted — 2026-09-07 (9a7e988)

Deploy do fechamento das ondas 3–4: fixes de segurança do Agent
(C-05, C-06, H-09, H-12, H-13, H-14), analytics com `AccountScope`
obrigatório (H-10), filtros escopados por workspace+ator (H-11),
prova PG de V047/V048 (M-10) e migrações legado-seguras V048 +
baseline de drift. Repo GitHub renomeado para `Kusts/meu-ted` no dia.

## Commits (2f07818..9a7e988)

- `2f07818` fix(filters): filtros de analytics escopados (H-11).
- `5d2e755` chore(policy): write-policy discovery + endpoint rows.
- `75b61f7` fix(agent-security): DLP central antes de escritas duráveis (H-09).
- `4a051d7` test(integration): prova PG V047/V048 (M-10).
- `dc95b6c` fix(agent-security): deviceId binding end-to-end (H-12).
- `553a598` fix(pwa-agent): limpeza central do agent com abort (H-13).
- `3398a33` fix(agent-security): autoridade fail-closed + recheck mid-turn (H-14).
- `4d5247f` docs(audits): relatórios ondas 1–2 e 3–4.
- `e7790df` feat(design): PageHeader + preview tooling.
- `5b67fde` fix(deploy): dedupe pnpm block.
- `b898d6a` fix(migrations): V048 legacy-safe.
- `9a7e988` fix(migrations): drift baseline para linhas legado pré-guard.

## Gates (verificados no escopo Coder 2)

- `pnpm typecheck` PASS (raiz).
- `pnpm docs:lint` PASS.
- `pnpm capabilities:check` PASS (52 tools / 72 linhas).
- `pnpm write-policy:check` PASS (176/176).
- Agent 310/310; API 1319 verdes (1 falha ambiental pré-existente sem
  `DATABASE_URL_TEST`); PWA afetadas 77/77 (`--pool=forks`).

## API — VPS Hostinger (<VPS_SSH_USER>@<VPS_IP>, ~/infra/pi-finance-api)

Mecanismo: backup → sync → build → tag (`:main`) → `docker compose up -d`.

- Release: `9a7e988`; `legacyMigrations [44,45,46,47]`.
- 7 WARNs `baseline_drift` esperados (linhas legado pré-guard, cobertas
  pelo baseline de drift do `9a7e988`).
- Rollback: imagens `backup-before-b898d6a-*` e `app-bak-*` disponíveis
  (`docker tag <backup> :main + compose up -d`).

## Cloudflare (conta <owner-email>)

- Agent `pi-finance-agent` — versão `78c57fb9` via `wrangler deploy`;
  name do worker inalterado → **DOs preservados** (histórico e memória
  do TED intactos).
- PWA — `pnpm --filter pwa run deploy` executado (nota: `pnpm --filter pwa
  deploy` colide com o `pnpm deploy` nativo — usar `run deploy`).
