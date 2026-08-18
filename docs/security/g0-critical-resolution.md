# G0 Critical Resolution Audit Log

**Run:** `G0-GATE-2026-07-29`  
**Scope:** repository evidence only; no production database was accessed.

| Event ID | Critical | Event type | Query/evidence | Result |
|---|---|---|---|---|
| `G0-SEC-01` | SEC-01 | `critical.resolved.auth_registration` | `pnpm --filter pi-finance-api test -- tests/auth/device-register-blocked.test.ts` | 5/5 passed; anonymous registration remains 403 |
| `G0-DATA-01` | DATA-01 | `critical.resolved.database_guard` | `pnpm --filter pi-finance-api exec vitest run tests/db/db-guard.test.ts`; disposable Postgres `DATABASE_URL_TEST` + `DB_TEST_MARKER` | 9/9 passed; raw integration `TRUNCATE` calls are preceded by `requireTestDatabase` |
| `G0-DATA-02` | DATA-02 | `critical.resolved.idempotency_atomic` | `pnpm --filter pi-finance-api test:integration` | 34/34 Postgres integration tests passed; 4 concurrent requests produced one effect and one audit record |
| `G0-AGT-01` | AGT-01 | `critical.resolved.bridge_isolation` | `pnpm --filter @pi-finance-bridge exec vitest run src/bridge-containment.test.ts src/pi-client-factory.test.ts` | 27/27 passed; per-chat queue and duplicate claim verified |

## Reproduction queries

The disposable Postgres run queried the following after the idempotency test:

```sql
SELECT status, response, lease_until, retry_until, retention_until
FROM operation_records
WHERE workspace_id = $1 AND idempotency_key = $2;

SELECT event_type, operation, effect_ref
FROM audit_logs
WHERE operation_record_id = $3;
```

Observed: one `completed` operation record, one `financial_effect.committed` audit event, and one financial effect for four concurrent calls. Raw output is preserved in `docs/security/g0-postgres-audit-output.txt`.
