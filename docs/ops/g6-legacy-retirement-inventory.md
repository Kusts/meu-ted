# G6 Legacy WhatsApp Runtime Retirement Inventory

This document establishes the full catalog of legacy runtime components, services, entrypoints, and environment variables targeted for retirement.

## Catalog

| Component / Artifact | Class | Removal Stage | Proof Command | Rollback Strategy |
|---|---|---|---|---|
| `POST /webhooks/evolution` | `rollback-only` | Stage 1 (Disable Ingress) | `curl -X POST /webhooks/evolution` | Set `FINANCE_RUNTIME_STAGE=pi_owner` |
| `apps/whatsapp-bridge` | `rollback-only` | Stage 3 (Stop Bridge Service) | `docker ps / pm2 status` | Restart bridge service container |
| `.pi/extensions/financial-tools/` | `rollback-only` | Stage 5 (Remove Extension) | `npx tsx scripts/cutover-check.ts` | Git tag `pre-g6-legacy-retirement` checkout |
| `EVOLUTION_API_KEY` | `secret-name` | Stage 7 (Secret Rotation) | `pnpm security:secrets` | Re-issue from Evolution instance |
| `EVOLUTION_API_URL` | `secret-name` | Stage 7 (Secret Rotation) | `pnpm security:secrets` | Re-set in `.env` |
| `../pi-finance-web` | `historical-doc` | N/A (Already deprecated) | `check-legacy-runtime-references` | Documented in `AGENTS.md` |

## Retirement Stages

1. **Stage 1:** Disable Evolution webhook ingress
2. **Stage 2:** Observe Agent owner with 0 incoming bridge traffic
3. **Stage 3:** Stop and disable bridge service/process
4. **Stage 4:** Remove legacy bridge code `apps/whatsapp-bridge/`
5. **Stage 5:** Archive `.pi/extensions/financial-tools/` to git tag
6. **Stage 6:** Remove residual configs and unused dependencies
7. **Stage 7:** Rotate / retire external legacy API keys
