# G6 Legacy Retirement Rollback Runbook

This document details the code, operational, and database rollback procedures during the Phase P3 legacy runtime retirement.

## 1. Code Rollback

- **Git Tag Target:** `pre-g6-legacy-retirement-YYYYMMDDHHMM`
- **Checkout Command:** `git checkout <tag-name>`
- **Preserved Artifacts:** Complete source trees of `apps/whatsapp-bridge/` and `.pi/extensions/financial-tools/` remain versioned and accessible in git history.

## 2. Operational Rollback Sequence

1. **Re-enable Runtime Stage:**
   Set `FINANCE_RUNTIME_STAGE=pi_owner` in the environment configuration.
2. **Re-activate Bridge Container:**
   Restart the WhatsApp bridge process or Docker container:
   `docker compose up -d whatsapp-bridge`
3. **Re-activate Evolution Webhook Ingress:**
   Point Evolution API webhook URL back to `POST /webhooks/evolution`.
4. **Health & Isolation Check:**
   Execute `npx tsx scripts/cutover-check.ts` and verify 200 OK on health endpoints.

## 3. Database Protection

- Database mutations during P3 are non-destructive (additive migrations only, up to V030).
- If integrity checks fail, restore the verified pre-cutover dump:
  `DB_TEST_MARKER=true DATABASE_URL=$DATABASE_URL node scripts/restore-db.mjs <backup-id>`
