# Fase 1 — Portar 8 features .pi (decomposição)

**Origem:** `docs/ESTADO-E-PROXIMOS-PASSOS.md:198` — `pending_operations`, `undo_last_action`, `duplicate-detector`, `payment_score`, `installment_score`, `monthly_projection`, `price-alerts`, `audit_logs`
**Princípio:** paridade tripla D4 — cada feature = 1 endpoint `apps/api` + 1 tool `apps/agent` + 1 tela `apps/pwa` (com Pi ainda rodando para comparação).

| # | Feature | Endpoint (API) | Tool (Agent) | Tela (PWA) | Dependências | Esforço |
|---|---|---|---|---|---|---|
| 1 | `pending_operations` | `GET /pending-operations` + `POST /pending/{id}/confirm|/cancel` (já existe `apps/api/src/pending/*`) | `get_pending_operation`, `confirm_pending_operation`, `cancel_pending_operation` | `apps/pwa/src/features/approvals` | workspace_id, idempotency | M |
| 2 | `undo_last_action` | `POST /audit/undo` (usa `audit_logs` + `operation_records`) | `undo_last_action` | botão desfazer em `records` | audit_logs V013, idempotency | M |
| 3 | `duplicate-detector` | `POST /transactions/detect-duplicate` (estratégia já documentada em `tools/duplicate-detector.ts`) — hash semântico amount+description+date±2d | `suggest_duplicate_check` | warning em `create_expense` | transactions | S |
| 4 | `payment_score` | `GET /insights/payment-score` (on-time ratio 90d) | `payment_score` | card em dashboard | payables | S |
| 5 | `installment_score` | `GET /insights/installment-score` + `POST /cards/installments` já existe | `installment_score` | `cards` | card_purchases | S |
| 6 | `monthly_projection` | `GET /insights/monthly-projection?yearMonth=` | `monthly_projection` | `reports` | transactions+payables | M |
| 7 | `price-alerts` | `POST /alerts/price` + cron `check_price_alerts` | `price-alerts` | `settings/notifications` | external price API (mock) | M |
| 8 | `audit_logs` | `GET /audit-logs` já existe (`apps/api/src/audit/*`) — expor filtros | `audit_logs` | `admin/audit` | audit_logs | S |

**Ordem recomendada:** 8 → 3 → 4 → 5 → 6 → 1 → 2 → 7 (audit e detectors primeiro, depois pending/undo que dependem de audit).

**Próximo branch:** `fase-1-features` a partir de `main@3a5700e`. Cada feature em TDD RED→GREEN com `pnpm --filter pi-finance-api test`, `pnpm --filter pwa test` e `Idempotency-Key` onde mutação.

**Estimativa:** 8 features × (endpoint 1d + tool 0.5d + tela 1d) ≈ 20d com comparação Pi ativo.
