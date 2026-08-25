# Rubrica — Pendências Fechamento 2026-08-24

**Data verificação:** 2026-08-24
**Branch:** `fase-0-preparo` (114 commits à frente de `main`, 2 pushes nesta iteração: `9e7b38e`, `5ae2a98`)
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
| `node scripts/plan-legacy-retirement.mjs --inventory` | PASS | `docs/ops/g6-legacy-retirement-change-set.md` gerado com 7 estágios e rollback tag |
| `git log --oneline -4` | — | `5ae2a98 docs(p4): sync runtime-facts` + `9e7b38e docs(recovery): regenerate... (232)` + `9af6071` / `388f918` |

## Rubrica por Task (0-10)

| Task | Nota | Justificativa | Próximo passo |
|---|---|---|---|
| **T1 Higiene working tree (226→232)** | **9/10** | Inventário regenerado com TDD, enums validados, `docs:lint` verde. Perde 1 ponto: contagem divergiu do plano (226 vs 232) por deriva de 6 paths untracked + 3 modified tracks; documentado e corrigido com re-geração. Sem deleção. | Commit já entregue; manter `checkInventory` em CI. |
| **T2 CI E2E push+monitor** | **7/10** | Gates pré-push verdes, push real com `GH_TOKEN` ausente (já contornado), CI queued e em `in_progress`. Perde 3 pontos: ainda sem log `121 tests` — monitoramento pendente até `gh run watch` completar. | `gh run view 32780225112 --log | grep -E "e2e|121 tests|NEXT_PUBLIC"` após concluir; atualizar `ESTADO §1.2` e `goal-runs/2026-08-24-ci-e2e.md`. |
| **T3 VAL.9 security:check** | **8/10** | `secrets` PASS, `audit critical` PASS (0 critical). Containers SKIP local legitimamente (docker não disponível Win32). Perde 2 pontos: `trivy` não validado localmente; requer confirmação em CI Linux. | Aguardar CI job `security` verde; se CRITICAL surgir, aplicar `pnpm.overrides` ou `.gitleaks.toml` allowlist. |
| **T4 V032/V033 rehearsal+VPS** | **4/10** | SQL V032/V033 inspecionados (idempotentes, fail-safe `RAISE EXCEPTION` para orphans, índices parciais). `rehearse-migration --dry-run` tentado mas ETIMEDOUT por docker ausente Win32. Perde 6 pontos: sem DB descartável local, sem backup VPS, sem cutover. Bloqueado por VPS SSH + consent gate (AGENTS.md). | Rehearsal exige VPS/staging docker: `DATABASE_URL_TEST` + `node scripts/rehearse-migration.mjs`; backup `node scripts/backup-db.mjs --vps` + hash; depois `migrate.ts --apply V032 V033` + `psql \d card_purchases` + `cutover-check.ts`. |
| **T5 P3 Bridge T+36h** | **6/10** | Inventário legacy gerado (`g6-...change-set.md` 7 estágios, tag `pre-g6-legacy-retirement` documentada). Perde 4 pontos: tag `rollback-pre-p3-2026-08-24` não criada/pushada, `g6-soak-status.mjs --gate T+36h` não executado (requer 36h sem tráfego WhatsApp). Sem remoção prematura (correto). | `git tag rollback-pre-p3-2026-08-24 HEAD && git push origin tag`; `node scripts/g6-soak-status.mjs --gate T+36h`; só então atualizar `ROADMAP.md` P3. |
| **T6 Flakiness E2E** | **5/10** | Flakiness conhecida (8 testes Windows: ACC-06, CAT-01/02, CARD-05, GOAL-02, PAY-04, SUB-05, UI-03) documentada; coleta de amostra CI pendente. Perde 5 pontos: sem amostra limpa Linux, sem repro 10x, sem fix `networkidle`/`polling`. | Após T2 verde/vermelho: `grep -E "ACC-06|journal" /tmp/ci-e2e.log`; se falhar, criar `flakiness-repro.spec.ts` e testar hipóteses A/B. |
| **T7 Spike Cloudflare Access** | **3/10** | Critério binário definido em plano (`cf.access` → API valida usuário vs service token, ADR-003). Perde 7 pontos: spike não executado (dashboard Access + Worker `request.cf.access` + `/auth/access-verify` exigem credencial Cloudflare). | Timebox 1d: criar Access app, Worker repassa `X-Access-Jwt`, API valida JWKS, registrar em `adr/002-...` e `ESTADO §3`. |
| **T8 Docs canônicos P4/P5** | **7/10** | `runtime-facts.json` sincronizado (V033, 2026-08-24), `generate-...mjs` corrigido. Perde 3 pontos: `ESTADO-E-PROXIMOS-PASSOS.md` ainda em 2026-08-23/95 commits, `ROADMAP.md` P3/P4 não atualizado, `Last verified` em docs não propagado. | Atualizar `ESTADO` data/branch, `ROADMAP` P3/P4, `ARCHITECTURE-CURRENT/TARGET`, rodar `pnpm docs:lint && governance:check` final. |

## Nota global

**6.1 / 10** — Progresso fail-closed correto: hygiene e gates locais selados, push/CI em progresso com evidência, segurança auditada, mas 50% do plano depende de recursos externos (VPS SSH 187.77.249.47, Cloudflare dashboard, 36h soak) que exigem consent gate explícito (spec 2026-08-16 §184). Nenhum comando destrutivo executado.

## Riscos remanescentes

- **V032 orphans:** `RAISE EXCEPTION` aborta migração — exige inspeção `SELECT count(*) WHERE household_id IS NULL` antes do cutover.
- **CI E2E ainda falha por `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL`:** corrigido em `run-ci.sh`/`ci.yml` (tsx) mas só validado após log `121 tests`.
- **GH_TOKEN inválida:** contornada com `$env:GH_TOKEN` nulo no Win32; no Linux CI usar `env -u GH_TOKEN`.
- **Docker ausente Win32:** `rehearse-migration` e `security-containers` só validáveis em Linux/CI ou VPS.

## Próximos 3 passos imediatos (fail-closed)

1. **Aguardar CI 32780225112** → `gh run watch 32780225112 --exit-status` e capturar `121 tests`; se falhar no matrix gate, corrigir `ci.yml` (`tsx --test`).
2. **Rehearsal V032/V033 em staging** com `DATABASE_URL_TEST` (docker) e backup VPS com hash em `goal-runs/2026-08-24-v032-v033.md` antes de qualquer `migrate --apply`.
3. **Criar tag `rollback-pre-p3-2026-08-24`** e executar `g6-soak-status --gate T+36h` sem remover `apps/whatsapp-bridge/` nem `.pi/extensions/financial-tools/`.

## Arquivos tocados nesta iteração (staging explícito)

- `docs/recovery/2026-08-24-working-tree-inventory.md` (novo, 232)
- `scripts/check-working-tree-inventory.mjs` (+ `checkInventory` + param `dateStr`)
- `scripts/check-working-tree-inventory.test.mjs` (TDD RED→GREEN, fix side-effect)
- `scripts/generate-documentation-facts.mjs` (`lastVerified 2026-08-24`)
- `docs/architecture/runtime-facts.json` (`lastVerified 2026-08-24`)
- `docs/ops/g6-legacy-retirement-change-set.md` (gerado)
- Push `5ae2a98` em `origin/fase-0-preparo`
