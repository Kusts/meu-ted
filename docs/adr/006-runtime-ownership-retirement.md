# ADR-006: State Machine de Runtime Ownership e Aposentadoria do Legado

**Status:** accepted  
**Date:** 2026-08-18  
**Decision:** D06  

## Contexto

A migração de runtime entre o subprocesso Pi local e o Cloudflare Agent Worker precisa evitar respostas duplicadas para o usuário e permitir reversão imediata caso haja instabilidade.

## Decisão

1. A variável de ambiente `FINANCE_RUNTIME_STAGE` controla a state machine única de execução (`pi_owner`, `agent_owner`, `agent_owner_pi_read_fallback`, `frozen`).
2. Apenas um runtime emite a resposta final para o usuário por turno (invariante Exactly-Once Response).
3. A aposentadoria física do canal legado segue um corte em 7 estágios com período de soak de 48 horas.

## Impacto e Rollback

- **Rollback:** Alteração imediata para `FINANCE_RUNTIME_STAGE=pi_owner` sem necessidade de migrações de dados.
