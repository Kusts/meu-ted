# PI Financeiro — Roadmap
 
**Last verified:** 2026-08-26T17:00Z  
**Reference:** [`runtime-facts.json`](architecture/runtime-facts.json)  

## Fases do Programa de Estabilização & Modernização

| Fase | Título | Status | Principais Entregas |
|---|---|---|---|
| **P0** | Estabilização & Gates | CONCLUÍDO ✅ | Inventário de working tree, relógio determinístico, runner de testes estável, typechecks e linters. |
| **P1** | Migração Autoritativa da API | CONCLUÍDO ✅ | 51 adaptadores OpenAPI gerados, 0 chamadas diretas a banco a partir de tools do assistente. |
| **P2** | Transição de Runtime & Auth | CONCLUÍDO ✅ | Autenticação Better-Auth (V017-V031), resolução server-side de workspace, runtime ownership consolidado. |
| **P3** | Descomissionamento do Legado | CONCLUÍDO* ✅ | Stages 4-6 executados `f640e84` (bridge 123 files + financial-tools 3065 files removidos, pnpm-workspace limpo) — bypass gate 11.4h/48h por unlock explícito `2026-08-27 02:22Z`; `check-legacy-runtime-references` 0 active. *Soak real 39.03h/48h em 2026-08-26 `g6-soak-status.mjs` Can Close: NO (8.97h restantes); Stage 7 rotate secrets pendente manual VPS `187.77.249.47`. Ver `docs/ESTADO-E-PROXIMOS-PASSOS.md:1.4`. |
| **P4** | Documentação, Governança & Módulos | CONCLUÍDO ✅ | Docs lint 0 issues, governance no D01-D19, boundary valid, V032/V033 com hash, 234 paths inventário. |
| **P5** | Validação Final & Rubrica | EM REVISÃO ⚠️ | 10/10 VAL PASS em 2026-08-25 `docs/superpowers/goal-runs/2026-08-25-P5-validation.md`, mas regressão 2026-08-26: `pi-finance-api` 2 FAIL `TSCONFIG_ERROR cutover-check.ts` + `security:check` 2 HIGH `CVE-2026-14456 libcrypto3/libssl3 3.5.7->3.5.8`. Requer Passo 0 `ESTADO:4`. |

