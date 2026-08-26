# ADR-005: Geração Automática de Ferramentas via OpenAPI

**Status:** accepted  
**Date:** 2026-08-18  
**Decision:** D05  

## Contexto

Manter adaptadores manuais para dezenas de ferramentas do assistente causa desvio de contratos em relação às rotas da API e aos schemas OpenAPI.

## Decisão

1. As ferramentas do assistente são geradas pelo script `scripts/generate-agent-tools.mjs` a partir do arquivo `apps/api/openapi/agent-tools.openapi.json`.
2. O código gerado incorpora validação automática de flags de capability e políticas de congelamento de escritas (`runtime.write_frozen`).
3. É proibida a edição manual de `.pi/extensions/financial-tools/generated/http-tools.ts`.

## Impacto e Rollback

- **Automação:** Toda nova rota adicionada ao OpenAPI pode ser exposta ao assistente sem duplicar código de transporte.
