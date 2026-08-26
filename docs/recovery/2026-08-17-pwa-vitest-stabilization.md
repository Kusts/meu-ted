# P0.5 — Estabilização do runner Vitest da PWA

**Data:** 2026-08-17
**Fase:** P0 (estabilização) — Task 5 do plano `docs/superpowers/plans/2026-08-16-p0-stabilization.md`
**Branch:** `fase-0-preparo`

## Objetivo
Estabilizar o runner Vitest da PWA (eliminar `Failed to start threads worker` /
`Timeout waiting for worker`) via experimento A/B reproduzível, sem trocar o
pool por intuição.

## Método
Script `scripts/pwa-vitest-runner-benchmark.mjs` que gera um config temporário
DENTRO de `apps/pwa/` (include/setup relativos, idênticos ao `vitest.config.ts`
real — globs absolutos com `**` não casam no Windows em Vitest 4) e roda cada
configuração N× (subprocesso isolado). A seleção do vencedor usa **zero
worker timeout** (não apenas exit 0), porque falhas de asserção de teste são
problemas de conteúdo, tratados separadamente.

Configs testadas:
- **A:** `pool=threads, maxWorkers=2, fileParallelism=true`
- **B:** `pool=threads, maxWorkers=1, fileParallelism=false`

## Vencedor aplicado
**Config A** (`apps/pwa/vitest.config.ts`): `pool: "threads"`, `maxWorkers: 2`,
`fileParallelism: true`. Script adicionado em `apps/pwa/package.json`:
`"test:stable": "vitest run --coverage.enabled=false"`.

## Achado crítico (root cause do baseline não-reproduzível)
O config **padrão** (Vitest 4 usa `maxWorkers` = todos os CPUs) disparava
`Failed to start threads worker` sob alta paralelização. Isso **abortava o run
cedo**, de modo que o baseline reportava apenas ~2 falhas / 970 testes.

Com a config estável (maxWorkers=2, **zero worker timeout**), o suite roda
COMPLETO: **1074 testes, 1045 passam, 29 falham** (77 arquivos OK). Ou seja,
o worker timeout **mascarava ~27 falhas de teste reais** que não chegavam a
executar.

➡️ O runner está estabilizado e o baseline agora é **reproduzível** (o suite
sempre roda até o fim). As 29 falhas são pré-existentes e pertencem ao escopo
amplo de fechamento das pendências (P1–P5), **não** ao problema de runner.

## Evidência
- Benchmark A/B: ambas as configs com `workerTimeouts: 0`; A mais rápido
  (156s vs 232s+) → vencedor = A.
- `pnpm --dir apps/pwa test:stable` → 0 ocorrências de
  `Failed to start threads worker` / `Timeout waiting for worker` (grep no log).
- Suíte completa executa sem travamento de worker.

## Falhas pré-existentes (29 testes, 11 arquivos) — PENDÊNCIAS SEPARADAS
Estas NÃO são problemas de runner. Cada uma é uma pendência de fechamento
própria (provavelmente parte das "25 pendências"), a ser tratada em P1–P5:

1. `e2e/fixture-api/server.test.ts` — CORS headers on response
2. `e2e/support/e2e-owner.test.ts` — delegates server lifecycle to Playwright webServer
3. `src/__tests__/bundle-budget.test.ts` — bundle budget measurement / gzip regression (2)
4. `src/features/__tests__/dashboard-aggregate-boundary.test.ts` — server-owned aggregates (4)
5. `src/features/__tests__/persisted-ui-boundary.test.tsx` — no fabricated monetary values (6)
6. `src/features/auth/__tests__/AuthGate.test.tsx` — token/session/register flows (4)
7. `src/features/profile/__tests__/AgentTranscript.test.tsx` — "Element type is invalid: got undefined" (6)
8. `src/lib/api/client-socket-invalidation.test.ts` — closes sockets on 401
9. `src/lib/api/response-boundary.test.ts` — `pwaControlSchema.parse(body)` wiring (2)
10. `src/lib/auth/workspace-context.test.tsx` — workspace selection/switch
11. `src/lib/reset-session.test.ts` — `clearSensitiveSession` flags

## Status da métrica "exit 0" do P0.5
**Parcial:** `zero worker timeout` = ATINGIDO; `exit 0` = BLOQUEADO por 29
falhas pré-existentes (acima), que são pendências separadas do runner. O P0.5
cumpre seu escopo real (runner estável + baseline reproduzível + benchmark
reproduzível). O "exit 0" depende do fechamento das 29 falhas em fases futuras.
