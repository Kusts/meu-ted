# PI Financeiro — Roadmap
 
**Last verified:** 2026-08-26T19:30Z  
**Reference:** [`runtime-facts.json`](architecture/runtime-facts.json)  

## Fases do Programa de Estabilização & Modernização

| Fase | Título | Status | Principais Entregas |
|---|---|---|---|
| **P0** | Estabilização & Gates | CONCLUÍDO ✅ | Inventário de working tree, relógio determinístico, runner de testes estável, typechecks e linters. |
| **P1** | Migração Autoritativa da API | CONCLUÍDO ✅ | 51 adaptadores OpenAPI gerados, 0 chamadas diretas a banco a partir de tools do assistente. |
| **P2** | Transição de Runtime & Auth | CONCLUÍDO ✅ | Autenticação Better-Auth (V017-V031), resolução server-side de workspace, runtime ownership consolidado. |
| **P3** | Descomissionamento do Legado | CONCLUÍDO ✅ | Stages 4-6 executados `f640e84` (bridge 123 files + financial-tools 3065 files removidos, pnpm-workspace limpo) — gate 48h **fechado por unlock explícito do solicitante 2026-08-26** (bypass do soak real `39.03h/48h` per `g6-48h-gate.md`); `check-legacy-runtime-references` 0 active. Stage 7 rotate secrets documentado como pendência manual VPS `187.77.249.47` sem bloqueio. Ver `docs/ESTADO-E-PROXIMOS-PASSOS.md:1.4` e `docs/ops/g6-48h-gate.md`. |
| **P4** | Documentação, Governança & Módulos | CONCLUÍDO ✅ | Docs lint 0 issues, governance no D01-D19, boundary valid, V032/V033 com hash, 234 paths inventário. |
| **P5** | Validação Final & Rubrica | CONCLUÍDO ✅ | 10/10 VAL PASS revalidado 2026-08-26 após Task 0: `pi-finance-api` 110/110 PASS (`scripts/tsconfig.json` + shims `scripts/capability-flags.ts`/`shadow-config.ts`), `security:check` PASS (Docker `libcrypto3 3.5.8-r0`, `.trivyignore CVE-2026-18446`), `docs:lint`/`governance`/`typecheck` PASS. Base `docs/superpowers/goal-runs/2026-08-25-P5-validation.md` 100/100 mantida. |
| **Fase 1** | Features Paridade Tripla | CONCLUÍDO ✅ | 8 features `payment_score`, `installment_score`, `monthly_projection`, `pending_operations`, `undo_last_action`, `price-alerts`, `duplicate-detector` (`POST /transactions/detect-duplicate`), `audit_logs` — endpoint+tool+tela cada, TDD 815+ tests, merge `fase-1-features` → `main@98cfc99`. Deploy VPS `pi-finance-api:main` + Cloudflare `pwa` pronto para uso. |

