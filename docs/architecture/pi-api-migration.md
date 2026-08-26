# Pi capability API migration

## Rollout contract

Pi capabilities are migrated one at a time. Each migrated capability has its own
`PI_CAPABILITY_<NAME>` flag:

- `api`, `on`, `true`, or `1`: call the authenticated Finance API;
- `off`, `disabled`, `false`, or `0`: return a structured disabled result without
  executing a database call;
- unset: use API mode for capabilities already marked as migrated.

Write tools accept an internal `intentionId` supplied by the Agent turn processor. It is
not an API body field: the generated adapter uses it as the `Idempotency-Key` before
falling back to a tool-call ID. The Pi registration boundary extracts
`[PI_INTENTION_ID=...]` from the active user message before execution, so callers do not
expose `intentionId` in the public tool schema. The bridge carries that marker from its
stable provider-message ID. Agent turns persist `turn_queue.intention_id` and copy it into
`input_json`; regeneration/retry reads the same value, so a new tool-call ID cannot
duplicate the financial effect.

The migrated capabilities currently include CAP-001–CAP-005 (accounts,
categories, balance, month summary, and recent transactions), CAP-007
(`audit_logs`), CAP-008–CAP-018 (account/category/transaction writes),
CAP-022–CAP-027 and CAP-031 (card accounts, purchases, installments,
statements, payments and recurring purchases), CAP-043–CAP-051 (payables and
templates), CAP-034 (spending insights), CAP-056–CAP-057 (notification
configure/list), and CAP-062–CAP-068 plus CAP-070 (goals and budgets). Their API routes are the source of truth. The Pi tools use
`PI_FINANCE_API_BASE_URL` and `PI_FINANCE_API_DEVICE_TOKEN`; household scope is
resolved by the API from the device token, never from a SQL query in Pi.

## Static boundary

Migrated tool files contain no `pg` import, SQL statement, or direct database
query. The contract test `api-migration.test.ts` scans every migrated tool source
so a future edit cannot silently restore direct SQL.

Capabilities without an equivalent API route are now explicitly disabled by
default (for example pending-operation approval, installment scoring, and
notification processing). They must not fall back to direct SQL. The next slice
must add the API route before enabling their flag.

New capability migrations must add, in the same change:

1. an API route with authentication and household isolation;
2. an explicit per-capability flag;
3. an API-backed Pi adapter;
4. a contract test for flag on/off and API request shape;
5. a static test proving no direct SQL remains in the migrated tool.

## Shadow read-only

`PI_SHADOW_READS=on` ativa comparação assíncrona. Configure
`PI_SHADOW_DATABASE_URL` com credencial read-only legacy; `DATABASE_URL` é apenas
fallback de compatibilidade. para `list_accounts`,
`list_categories`, `get_balance`, `get_month_summary`,
`list_recent_transactions` e `audit_logs`. A resposta API retorna imediatamente;
o leitor legacy só executa `SELECT`, e divergências são registradas em
`PI_SHADOW_LOG_PATH` (default `data/shadow/read-divergences.jsonl`) usando hashes,
sem payload ou token. Eventos repetidos são deduplicados por processo.

Shadow falha aberto: erro do leitor legacy, logger ou configuração não altera a
resposta API. Tools de escrita não importam o runner shadow e nunca executam uma
segunda operação. `spending_insights` e demais leituras sem leitor legacy equivalente
não entram no shadow até existir baseline comparável.

## Rollback per capability

To roll back one capability, set only its flag to `off` (for example,
`PI_CAPABILITY_CREATE_EXPENSE=off`) and restart the Pi runtime. The tool returns a
structured disabled result and does not fall back to SQL. Keep the API route and
server data unchanged; re-enable with `api` after the route contract is healthy.
If the adapter itself must be reverted, disable the flag first, deploy the
adapter rollback, then run the capability contract and global SQL-boundary tests.
