# Architecture Decision Records (ADRs)

Este diretório contém o registro imutável de decisões de arquitetura do projeto **PI Financeiro**.

## Índice de Decisões

| ADR | Título | Status | Data | Decisão Relacionada |
|---|---|---|---|---|
| [ADR-001](001-legacy-schema-baseline.md) | Baseline do Schema Legado | accepted | 2026-07-28 | D01 |
| [ADR-002](002-better-auth-fallback-after-access-spike.md) | Better Auth Fallback após Access Spike | accepted | 2026-08-04 | D02 |
| [ADR-003](003-workspace-server-side.md) | Resolução de Identidade e Workspace Server-Side | accepted | 2026-08-18 | D03 |
| [ADR-004](004-api-source-of-truth.md) | API Fastify como Fonte Única de Verdade | accepted | 2026-08-18 | D04 |
| [ADR-005](005-generated-agent-tools.md) | Geração Automática de Ferramentas via OpenAPI | accepted | 2026-08-18 | D05 |
| [ADR-006](006-runtime-ownership-retirement.md) | State Machine de Runtime Ownership e Aposentadoria do Legado | accepted | 2026-08-18 | D06 |
| [ADR-007](007-production-topology.md) | Topologia de Produção e Separação Edge / VPS | accepted | 2026-08-18 | D07 |
| [ADR-008](008-consent-rollback-policy.md) | Política de Consentimento e Proteção de Rollback | accepted | 2026-08-18 | D08 |
| [ADR-009](009-global-agent-llm-configuration.md) | Configuração Global de LLM para o Agent TED | accepted | 2026-08-26 | D06 |

## Template para Novos ADRs

```markdown
# ADR-NNN: título

**Status:** proposed | accepted | rejected | superseded
**Date:** YYYY-MM-DD
**Decision:** D01–D19

## Contexto

## Decisão

## Impacto e Rollback
```
