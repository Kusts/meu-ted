# ADR-007: Topologia de Produção e Separação Edge / VPS

**Status:** accepted  
**Date:** 2026-08-18  
**Decision:** D07  

## Contexto

Diferenciar claramente os serviços que rodam na infraestrutura física (VPS Hostinger) daqueles executados na edge global (Cloudflare).

## Decisão

1. **Hostinger VPS (`pi-stack`):** Hospeda o container PostgreSQL 16 e o servidor Fastify API (`apps/api`).
2. **Cloudflare Pages / Workers:** Hospeda a PWA canônica (`apps/pwa`) e o Cloudflare Agent Worker (`apps/agent`).
3. O repositório legado `../pi-finance-web` e processos locais PM2/Cloudflared no Windows não representam a produção e não devem ser usados para auditoria ou deploy.

## Impacto e Rollback

- **Clareza Operacional:** Previne deploys ou verificações erradas em ambientes depreciados.
