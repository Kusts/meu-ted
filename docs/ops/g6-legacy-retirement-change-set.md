# G6 Legacy Retirement Staged Change-Set

This document specifies the exact dry-run change-set for decommissioning the legacy WhatsApp runtime across 7 sequenced stages.

## Staged Execution Plan

| Stage | Name | Target | Action | Proof Command | Rollback Step |
|---|---|---|---|---|---|
| 1 | Disable Evolution Webhook Ingress | `Evolution API webhook routing` | Remove webhook subscription to POST /webhooks/evolution | `curl -X POST https://api.../webhooks/evolution returns 404 or inactive` | Re-enable webhook subscription pointing to bridge URL |
| 2 | Observe Agent Owner | `Runtime ownership router & Cloudflare Agent Worker` | Verify 100% of user traffic routes through PWA / Agent Worker with zero bridge traffic | `npx tsx scripts/canary-validation.ts && npx tsx scripts/cutover-check.ts` | Set FINANCE_RUNTIME_STAGE=pi_owner |
| 3 | Stop and Remove Bridge Service | `whatsapp-bridge process / container` | docker compose stop whatsapp-bridge && docker compose rm -f whatsapp-bridge | `docker ps | grep -v whatsapp-bridge` | docker compose up -d whatsapp-bridge |
| 4 | Remove Bridge Source Code | `apps/whatsapp-bridge/` | git rm -r apps/whatsapp-bridge | `test ! -d apps/whatsapp-bridge` | git checkout HEAD~1 -- apps/whatsapp-bridge |
| 5 | Archive Financial Tools Extension | `.pi/extensions/financial-tools/` | Archive to git tag pre-g6-legacy-retirement and remove active workspace folder | `node scripts/check-legacy-runtime-references.mjs --stage=final` | git checkout pre-g6-legacy-retirement -- .pi/extensions/financial-tools |
| 6 | Remove Residual Configs & Dependencies | `pnpm-workspace.yaml, package.json scripts` | Remove bridge workspace reference and obsolete build scripts | `pnpm install && pnpm build` | git checkout HEAD~1 -- pnpm-workspace.yaml package.json |
| 7 | Rotate / Retire External API Secrets | `Evolution API keys in external secret stores` | Revoke EVOLUTION_API_KEY from Evolution instance; delete from VPS environment | `pnpm security:secrets` | Generate new API key in Evolution instance if needed |

## Preconditions & Safety Guards

1. **Annotated Git Tag:** Created before first deletion: `git tag -a pre-g6-legacy-retirement -m "Pre-cutover snapshot"`
2. **Verified Database Dump:** SHA256 validated database dump preserved.
3. **Fail-Closed Execution:** Any failed verification halts the progression immediately.
