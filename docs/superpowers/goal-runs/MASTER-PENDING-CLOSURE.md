# Goal-Run: Master de Fechamento das 25 Pendências — Gate P0

**Branch:** `fase-0-preparo`
**Data do Gate:** 2026-08-17
**Status:** P0 ESTÁVEL — pronto para P1 (com reds conhecidos classificados)

## Entregas P0 (commits)

| ID | Commit | Conteúdo |
|----|--------|----------|
| P0.1 | `153163b` | Inventário do working tree (RED+script+doc) |
| P0.2 | `243d74f`, `27dccd7` | Composição de rotas 1:1 (audit/ownership/better-auth/invites/workspaces) |
| P0.3 | `a80912f` | Precedência auth: 401 p/ não autenticado (parcial — bulk route-authz é P1) |
| P0.4 | `119db5f` | Relógio determinístico via injeção de closure |
| P0.5 | `04910eb` | Runner PWA vitest estável (maxWorkers=2, A/B benchmark) |
| P0.6 | `fe6afd6` | Typecheck do bridge (Buffer→string no JSON.parse) |
| P0.7 | — | Reconciliação G6.1.2 (bloqueado, não concluído) |
| P0.8 | `cee5246` | Gates canônicos do projeto (root package.json + run-workspace-gate) |
| P0.9 | (este gate) | Commit da composição better-auth/auth (WIP untracked do P0.2) + Gate P0 |

## Matriz de Verificação do Gate P0

| Check | Resultado | Evidência |
|-------|-----------|-----------|
| Step 1 — Working tree classificado | ✅ GREEN | `node --test scripts/check-working-tree-inventory.test.mjs` → exit 0 |
| Step 2 — API baseline | ⚠️ 172 failed (KNOWN) | Suíte API documentada como escopo P1-P5; baseline reprodutível |
| Step 3 — PWA baseline | ⚠️ 29 failed (KNOWN) | `pnpm --dir apps/pwa test:stable` → zero worker timeout; 29 falhas em doc de recovery |
| Step 4 — 4 typechecks | ✅ GREEN | api OK, pwa OK, bridge OK, agent OK (exit 0) |
| Step 5 — Route inventory | ✅ GREEN | `node scripts/check-api-route-inventory.mjs` → 89/89 |
| Step 5 — Capability inventory | ⚠️ 8 gaps (KNOWN) | tools de inventory não registrados → atribuídos a P1/P5 |
| Step 5 — PWA command boundary | ⚠️ 4 gaps (KNOWN) | adoption/web-vitals/profile-adapter/sw-coordinator → atribuídos a P5 |
| Step 6 — Env baseline | ✅ | DB descartável guardado (`require-reminder-integration-env.mjs`); CI/security em root package.json; topologia de prod em `../vps-hostinger/` (sem secrets) |
| G6.1.2 | ⚠️ BLOQUEADO (explícito) | `docs/superpowers/goal-runs/G6.1.2.md`; `docs/goals/2026-08-14-pi-goal-resume.md` = paused |

## Reds Conhecidos (NÃO são blockers desconhecidos)

1. **API 172 falhas** — baseline das 25 pendências; fechadas em P1-P5.
2. **PWA 29 falhas** — `docs/recovery/2026-08-17-pwa-vitest-stabilization.md` (itens P1-P5).
3. **Capability: 8 tools de inventory** não registrados (`get_month_summary`, `get_pending_operation`, `audit_logs`, `confirm_pending_operation`, `cancel_pending_operation`, `list_recurring_purchases`, `refresh_payable_status`, `auto_create_from_templates`).
4. **PWA boundary: 4 pontos** (`lib/api/adoption.ts`, `lib/observability/web-vitals.ts`, `lib/state/profile-adapter.ts`, `lib/sw-coordinator.tsx`).
5. **G6.1.2 bloqueado** — sem Postgres descartável disponível (Docker down); marcado explicitamente, não concluído.

## Decisões

- **D1 (P0.3 parcial):** bulk route-authz (71× 401→403 membership/owner) é escopo P1 (unified-authz). Não faking-complete.
- **D2 (P0.5 AC3 parcial):** `test:stable` não atinge exit 0 (29 falhas pré-existentes); critério "zero worker timeout" atendido.
- **D3 (P0.9 auth composition):** subsystem de auth (18 src + 31 testes + doc) estava como WIP untracked cabeado em `index.ts` (27dccd7). Versionado para tornar o estado commitado consistente (typecheck verde no working tree).

## Próximo

P1 — unified-authz (desbloqueia T4/P0.3): migração capability→authz com membership/owner em todas as rotas resource.
