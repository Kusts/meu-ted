# PI Financeiro — Roadmap

**Last verified:** 2026-08-18  
**Reference:** [`runtime-facts.json`](architecture/runtime-facts.json)  

## Fases do Programa de Estabilização & Modernização

| Fase | Título | Status | Principais Entregas |
|---|---|---|---|
| **P0** | Estabilização & Gates | CONCLUÍDO ✅ | Inventário de working tree, relógio determinístico, runner de testes estável e typechecks. |
| **P1** | Migração Autoritativa da API | CONCLUÍDO ✅ | 51 adaptadores OpenAPI gerados, 0 chamadas diretas a banco a partir de tools do assistente. |
| **P2** | Transição de Runtime | CONCLUÍDO ✅ | Single runtime ownership, resolução de identidade server-side, métricas de divergência sanitizadas e validação de cutover. |
| **P3** | Descomissionamento do Legado | EM PROGRESSO ⏳ | Inventário de referências, ensaio de rollback, janela persistente de independência de 48 horas. |
| **P4** | Documentação & Governança | CONCLUÍDO ✅ | Documentos canônicos sincronizados com o runtime real, ADRs ativas e lint documental integrado ao CI. |
| **P5** | Validação Final & Rubrica | PLANEJADO 📋 | Auditoria fim-a-fim, verificação dos critérios de aceitação VAL.1–VAL.10 com pontuação ≥ 90/100. |
