# PI Financeiro — Roadmap
 
**Last verified:** 2026-08-23  
**Reference:** [`runtime-facts.json`](architecture/runtime-facts.json)  

## Fases do Programa de Estabilização & Modernização

| Fase | Título | Status | Principais Entregas |
|---|---|---|---|
| **P0** | Estabilização & Gates | CONCLUÍDO ✅ | Inventário de working tree, relógio determinístico, runner de testes estável, typechecks e linters. |
| **P1** | Migração Autoritativa da API | CONCLUÍDO ✅ | 51 adaptadores OpenAPI gerados, 0 chamadas diretas a banco a partir de tools do assistente. |
| **P2** | Transição de Runtime & Auth | CONCLUÍDO ✅ | Autenticação Better-Auth (V017-V031), resolução server-side de workspace, runtime ownership consolidado. |
| **P3** | Descomissionamento do Legado | EM PROGRESSO ⏳ | Ensaio de rollback, checkpoint T+36h do gate de 48h de independência do bridge WhatsApp. |
| **P4** | Documentação, Governança & Módulos | EM PROGRESSO ⏳ | Documentos canônicos sincronizados, ADRs ativas, lint documental e expansão de cartões (V032/V033). |
| **P5** | Validação Final & Rubrica | PLANEJADO 📋 | Auditoria fim-a-fim, verificação dos critérios de aceitação VAL.1–VAL.10 com pontuação ≥ 90/100. |

