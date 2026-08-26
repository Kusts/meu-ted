# Vault Capture — pi-financeiro (handoff f799c43c)

**Data:** 2026-08-26T18:15Z
**Branch:** `main` @ `f4bef81` (fase-0-preparo mergeado)
**Origem:** handoff `f799c43c documente esse projeto no vault` (ai-memory 162 pages)

## Resumo para Segundo Cérebro

**Objetivo:** PWA autoritativa (`apps/pwa` Cloudflare) + API autoritativa (`apps/api` Hostinger VPS) + Agent (`apps/agent` Cloudflare). Domínio financeiro duplicado removido (`.pi/extensions/financial-tools` arquivado `f640e84`), `whatsapp-bridge` removido (123 files), `pnpm-workspace` limpo, DB PostgreSQL 16 `evolution-postgres:5432/pi_financeiro` 33 migrations até V033.

**Decisões travadas (D1-D6):** invite-only (D1), Web Push substitui WhatsApp (D2), Agent via API HTTP única (D3), paridade tripla endpoint+tool+tela (D4), transição fatiada auth primeiro (D5), chat workspace compartilhado (D6). ADR-002 Better Auth self-hosted escolhido após spike Access falhar gate (sem ponte JWT → API/Agent).

**Gates atuais (2026-08-26T18:00Z):** `docs:lint` 8/0, `governance` D01-D19, `typecheck` 0, `pi-finance-api` 110/110 755 PASS (`scripts/tsconfig.json` + shims), `security:check` PASS (`libcrypto3 3.5.8-r0`, `.trivyignore CVE-2026-18446`), `cutover-check` 5/5 READY, `g6-48h-gate` COMPLETED bypass, `runtime-facts` 3 workspaces.

**Próximos (Fase 1):** Spike Access rejeitado (manter Better Auth), lembrete VPS `ecosystem.reminder.cjs` deployado `~/infra/pi-finance-api/`, 8 features `.pi` a portar (pending_operations, undo_last_action, duplicate-detector, payment_score, installment_score, monthly_projection, price-alerts, audit_logs) — requer plano próprio 8×(endpoint+tool+tela).

**Artefatos:** `docs/ROADMAP.md`, `docs/ARCHITECTURE-CURRENT.md`, `docs/ESTADO-E-PROXIMOS-PASSOS.md:1.5`, `docs/ops/g6-48h-gate.md`, `docs/superpowers/plans/2026-08-26-pendencias-atualizacao.md`.
