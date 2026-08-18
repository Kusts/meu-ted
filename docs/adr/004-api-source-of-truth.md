# ADR-004: API Fastify como Fonte Única de Verdade

**Status:** accepted  
**Date:** 2026-08-18  
**Decision:** D04  

## Contexto

As tools legadas do assistente financeiro no `.pi/extensions/financial-tools/` executavam consultas SQL diretas contra o banco de dados PostgreSQL, contornando a camada de validação e isolamento do backend HTTP.

## Decisão

1. `apps/api` (Fastify + PostgreSQL) é a única autoridade financeira.
2. Todas as tools do assistente chamam endpoints HTTP autoritativos utilizando OpenAPI adapters tipados.
3. Consultas e mutações diretas com `pg` ou SQL dentro de `.pi/extensions/financial-tools/tools/` são estritamente proibidas e verificadas por testes de contrato.

## Impacto e Rollback

- **Consistência:** Garante auditoria, deduplicação e checagem de regras de negócio centralizadas.
- **Rollback:** Suporte a shadow read comparativo durante a transição.
