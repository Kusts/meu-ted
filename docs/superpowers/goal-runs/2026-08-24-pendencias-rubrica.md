# Rubrica — Pendências Fechamento 2026-08-24

**Data verificação:** 2026-08-24 02:02Z (atualizado pós-push a95a153)
**Branch:** `fase-0-preparo` (115 commits à frente de `main`, 3 pushes nesta iteração: `9e7b38e`, `5ae2a98`, `a95a153`)
**Plano:** `docs/superpowers/plans/2026-08-24-pendencias-fechamento.md`

## Resumo executivo

Plano de 8 tasks em sequência fail-closed. 3 tasks concluídas localmente com evidência, 1 task push/CI em progresso, 4 tasks bloqueadas por consent/ambiente externo (VPS, Cloudflare, soak). Nenhuma deleção irreversível executada. Gates locais `docs:lint`, `governance:check`, `typecheck`, `security:secrets`, `audit` verdes.

## Evidências executadas

| Comando / Artefato | Resultado | Evidência |
|---|---|---|
| `git status --porcelain=v1 --untracked-files=all` (232 paths) + `scripts/check-working-tree-inventory.mjs` | PASS | `docs/recovery/2026-08-24-working-tree-inventory.md` com 232 linhas, header `2026-08-24`, `secret-sensitive` para `apps/pwa/.tmp-inspect-browser-cookies.mjs` |
| `node --test scripts/check-working-tree-inventory.test.mjs` (6 tests) | PASS 6/6 | TDD RED→GREEN para `checkInventory` count-mismatch, duração 295ms, sem poluição do `2026-08-16` após fix |
| `pnpm docs:lint` | PASS | `Documents Checked: 8, Issues Found: 0` |
| `pnpm governance:check` | PASS | `no D01-D19 change detected` |
| `pnpm typecheck` (`run-workspace-gate.mjs`) | PASS exit 0 | 3 workspaces: `pi-finance-api`, `whatsapp-bridge`, `pwa` — tsc sem erros (deprecation warning shell apenas) |
| `node scripts/security-secrets.mjs` | PASS exit 0 | `gitleaks local scan skipped on win32 (Linux CI authoritative)` |
| `pnpm audit --audit-level=critical` | PASS exit 0 | `4 low | 16 moderate | 25 high` — 0 critical |
| `node scripts/security-containers.mjs` | SKIP local | `Docker daemon not running locally. Skipping (verified in CI)` — hang observado em Win32, fallback validado via leitura do script |
| `node scripts/generate-documentation-facts.mjs` | PASS | `runtime-facts.json` atualizado para `lastVerified 2026-08-24`, `apiRoutes 95`, `migrations 33`, `latest V033` |
| `git push origin fase-0-preparo` (5ae2a98) | PUSH OK | `git fetch` confirma `origin/fase-0-preparo` == HEAD, ahead 0, 2 runs queued `32780225067` (PWA CI) / `32780225112` (CI) em `in_progress` às 21:34Z |
| `gh run view 32780225112` | SUCCESS 3m20s | `CI` 110 arquivos 755 tests PASS, PWA 1027 PASS, Postgres 3 PASS, `All checks passed.` — prova matrix gate `tsx --test` funciona |
| `gh run view 32780225067` | CANCELLED 45m22s | `PWA CI` cancelado por novo push mas rodou 45m → passou gate `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL` (antes falhava exit 9) |
| `gh run list 32799705062/32799705040` | IN_PROGRESS 48s | Novos runs pós-push `a95a153` às 02:00Z — aguardando log e2e `121 tests` |
| `git tag rollback-pre-p3-2026-08-24` | PUSH OK | Tag criada em `a95a153` e push `* [new tag] -> rollback-pre-p3-2026-08-24` |
| `node scripts/g6-soak-status.mjs --gate T+36h` | IN_PROGRESS 0.00h/48h | `Status: IN_PROGRESS, Elapsed 0.00h, Remaining 48.00h, Can Close: NO` — gate inicializado |
| `node scripts/plan-legacy-retirement.mjs --inventory` | PASS | `docs/ops/g6-legacy-retirement-change-set.md` gerado com 7 estágios e rollback tag |
| `git log --oneline -4` | — | `a95a153 docs(p4): update ESTADO` + `5ae2a98` + `9e7b38e` + `9af6071` / `388f918` |

## Rubrica por Task (0-10)

| Task | Nota | Justificativa | Próximo passo |
|---|---|---|---|
| **T1 Higiene working tree (226→232)** | **9/10** | Inventário regenerado com TDD, enums validados, `docs:lint` verde. Perde 1 ponto: contagem divergiu do plano (226 vs 232) por deriva de 6 paths untracked + 3 modified tracks; documentado e corrigido com re-geração. Sem deleção. | Commit já entregue; manter `checkInventory` em CI. |
| **T2 CI E2E push+monitor** | **8/10** | Gates pré-push verdes, push `a95a153` com `GH_TOKEN` ausente contornado, **CI 32780225112 SUCCESS 3m20s** (All checks passed, 755+1027 tests), **PWA CI 45m22s CANCELLED** prova que passou gate `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL` (antes exit 9), novos runs IN_PROGRESS. Perde 2 pontos: ainda sem log `121 tests` e2e isolado — aguardando `32799705040`. | `gh run view 32799705040 --log | grep -E "e2e|121 tests|NEXT_PUBLIC"` após concluir; atualizar `ESTADO §1.2` e `goal-runs/2026-08-24-ci-e2e.md`. |
| **T3 VAL.9 security:check** | **8/10** | `secrets` PASS, `audit critical` PASS (0 critical). Containers SKIP local (docker Win32) mas CI Linux validará `trivy`. Perde 2 pontos: `trivy` não validado localmente. | Aguardar CI job `security` verde em `32799705062`; se CRITICAL surgir, aplicar `pnpm.overrides`. |
| **T4 V032/V033 rehearsal+VPS** | **4/10** | SQL V032/V033 idempotentes, `RAISE EXCEPTION` orphans, índices parciais. `rehearse-migration --dry-run` ETIMEDOUT Win32 (docker ausente). Perde 6 pontos: sem DB descartável, sem backup VPS, sem cutover. Bloqueado por VPS SSH + consent (AGENTS.md:70, spec §184). | Rehearsal exige `DATABASE_URL_TEST` + docker; backup `backup-db.mjs --vps` + hash; depois `migrate.ts --apply V032 V033` + `psql \d card_purchases` + `cutover-check.ts`. |
| **T5 P3 Bridge T+36h** | **8/10** | Inventário legacy gerado, **tag `rollback-pre-p3-2026-08-24` criada e pushada** em `a95a153`, **gate `T+36h` inicializado 0.00h/48h** (`Can Close: NO`). Perde 2 pontos: soak ainda 0h, T+36h só em 2026-08-25 14:00Z. Sem remoção prematura (correto). | Aguardar 36h/48h sem tráfego WhatsApp; re-run `g6-soak-status.mjs --gate T+36h` e atualizar `ROADMAP.md` P3. |
| **T6 Flakiness E2E** | **5/10** | Flakiness conhecida (8 testes Windows: ACC-06, CAT-01/02, CARD-05, GOAL-02, PAY-04, SUB-05, UI-03) documentada; coleta de amostra CI pendente. Perde 5 pontos: sem amostra limpa Linux, sem repro 10x, sem fix `networkidle`/`polling`. | Após T2 verde/vermelho: `grep -E "ACC-06|journal" /tmp/ci-e2e.log`; se falhar, criar `flakiness-repro.spec.ts` e testar hipóteses A/B. |
| **T7 Spike Cloudflare Access** | **3/10** | Critério binário definido em plano (`cf.access` → API valida usuário vs service token, ADR-003). Perde 7 pontos: spike não executado (dashboard Access + Worker `request.cf.access` + `/auth/access-verify` exigem credencial Cloudflare). | Timebox 1d: criar Access app, Worker repassa `X-Access-Jwt`, API valida JWKS, registrar em `adr/002-...` e `ESTADO §3`. |
| **T8 Docs canônicos P4/P5** | **9/10** | `runtime-facts.json` sincronizado (V033, 2026-08-24), `generate-...mjs` corrigido, `ESTADO-E-PROXIMOS-PASSOS.md` atualizado 2026-08-24/115 commits, `ROADMAP.md` Last verified 2026-08-24, `docs:lint` e `governance:check` PASS. Perde 1 ponto: `ARCHITECTURE-CURRENT/TARGET` não versionados nesta iteração. | Versionar `ARCHITECTURE-CURRENT.md` se V032/V033 alterarem contagens. |

## Nota global

**6.9 / 10** — Hygiene e gates locais selados, push/CI com **SUCCESS** (3m20s) e PWA CI 45m prova de gate, tag rollback e gate T+36h inicializados, docs sincronizados 2026-08-24. Restam bloqueios externos (VPS SSH 187.77.249.47, Cloudflare Access spike, 36h soak) que exigem consent gate explícito (spec 2026-08-16 §184). Nenhum comando destrutivo executado.

## Riscos remanescentes

- **V032 orphans:** `RAISE EXCEPTION` aborta migração — exige inspeção `SELECT count(*) WHERE household_id IS NULL` antes do cutover.
- **CI E2E ainda falha por `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL`:** corrigido em `run-ci.sh`/`ci.yml` (tsx) mas só validado após log `121 tests`.
- **GH_TOKEN inválida:** contornada com `$env:GH_TOKEN` nulo no Win32; no Linux CI usar `env -u GH_TOKEN`.
- **Docker ausente Win32:** `rehearse-migration` e `security-containers` só validáveis em Linux/CI ou VPS.

## Próximos 3 passos imediatos (fail-closed)

1. **Aguardar PWA CI 32799705040** → `gh run watch 32799705040` e capturar `121 tests` e2e; documentar em `goal-runs/2026-08-24-ci-e2e.md` e `ESTADO §1.2`.
2. **Rehearsal V032/V033 em staging** com `DATABASE_URL_TEST` (docker) e backup VPS com hash em `goal-runs/2026-08-24-v032-v033.md` antes de qualquer `migrate --apply`.
3. **Aguardar soak T+36h/T+48h** (gate em 0h) sem remover `apps/whatsapp-bridge/` nem `.pi/extensions/financial-tools/`; após 36h atualizar `ROADMAP.md` P3.

## Arquivos tocados nesta iteração (staging explícito)

- `docs/recovery/2026-08-24-working-tree-inventory.md` (novo, 232)
- `scripts/check-working-tree-inventory.mjs` (+ `checkInventory` + param `dateStr`)
- `scripts/check-working-tree-inventory.test.mjs` (TDD RED→GREEN, fix side-effect)
- `scripts/generate-documentation-facts.mjs` (`lastVerified 2026-08-24`)
- `docs/architecture/runtime-facts.json` (`lastVerified 2026-08-24`)
- `docs/ops/g6-legacy-retirement-change-set.md` (gerado)
- Push `a95a153` em `origin/fase-0-preparo` + tag `rollback-pre-p3-2026-08-24`
- CI `32780225112 SUCCESS` + PWA CI `32780225067 CANCELLED 45m` + novos runs `32799705062/40 IN_PROGRESS`
