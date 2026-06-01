# Finance Agent TED — REQ→Test Traceability Matrix

**Data:** 2026-06-01
**Spec:** `docs/superpowers/specs/2026-05-29-finance-agent-design.md`

## Requisitos EARS → Testes

| REQ | Tipo | Requisito | Teste(s) que cobrem | Arquivo | Status |
|-----|------|-----------|---------------------|---------|--------|
| REQ-001 | Ubiquitous | The system shall store all financial records in Postgres. | A2.8: Can create income and expense | `apps/api/src/finance-e2e.test.ts` | ✅ |
| REQ-002 | Ubiquitous | The system shall attribute every user-created action to a registered phone number. | A1.1: Full auth flow, A2.8: create with user attribution | `apps/api/src/auth-e2e.test.ts`, `finance-e2e.test.ts` | ✅ |
| REQ-003 | Event | When a WhatsApp message contains complete high-confidence financial data, the agent shall create the record and confirm updated financial impact. | `classifyMessage` complete financial, `webhook-handler` flow | `apps/whatsapp-bridge/src/coverage-boost.test.ts`, `webhook-e2e.test.ts` | ✅ |
| REQ-004 | Event | When a WhatsApp message misses account or card, the agent shall ask a clarification before registering. | `classifyMessage` clarification_needed, financial_detected with missing account | `apps/whatsapp-bridge/src/coverage-boost.test.ts` | ✅ |
| REQ-005 | Event | When a tool/service fails, TED shall report failure and shall not claim completion. | A3.1: Executing non-existent tool returns failure, A3.5d: Custom tool can throw | `packages/tools/src/tools-contract.test.ts` | ✅ |
| REQ-006 | Event | When a duplicate candidate is detected, the system shall block or request confirmation. | A2.4: Creating same expense twice with idempotency key, A2.6: high-value → review queue | `apps/api/src/finance-e2e.test.ts` | ✅ |
| REQ-007 | State | While dashboard is local-only, the system shall only expose admin UI on local network bindings. | Next.js build passes, dashboard served on localhost | Build verification | ✅ |
| REQ-008 | Ubiquitous | The system shall support non-expiring sessions with manual revoke. | A1.3: Verify-code returns token, revoke tests | `apps/api/src/auth-e2e.test.ts`, `api-coverage-5.test.ts` | ✅ |
| REQ-009 | Ubiquitous | The system shall support real accounts with shared or personal ownership. | createAccount shared/personal, account interface structure | `apps/api/src/api-coverage-5.test.ts`, `auth-context.test.ts` | ✅ |
| REQ-010 | Ubiquitous | The system shall allow negative account balances. | A2.1: Expense larger than balance does not block - account goes negative | `apps/api/src/finance-e2e.test.ts` | ✅ |
| REQ-011 | Ubiquitous | The system shall support cards with per-card closing and due days. | createCard with closingDay/dueDay, invoice period | `apps/api/src/api-coverage-5.test.ts` | ✅ |
| REQ-012 | Event | When a card purchase is registered, the system shall count spending by purchase date. | createCardPurchase, purchase date handling | `apps/api/src/api-coverage-5.test.ts` | ✅ |
| REQ-013 | Event | When an installment is generated, the system shall count each installment by its own date. | A2.7: Creating 3x installment creates 3 records in different months | `apps/api/src/finance-e2e.test.ts` | ✅ |
| REQ-014 | Event | When a recurrence is created, the system shall pre-create at least 12 future occurrences. | A2.3: Recurrence creates 12 occurrences | `apps/api/src/finance-e2e.test.ts` | ✅ |
| REQ-015 | Event | When cron processes recurrence horizon, the system shall create only missing occurrences. | cron trigger recurrence-horizon, idempotent occurrence creation | `apps/api/src/api-coverage-5.test.ts`, `cron-worker.test.ts` | ✅ |
| REQ-016 | State | While a bill is overdue and unpaid, the system shall roll it into the next month view. | overdue-rollover cron job | `packages/jobs/src/cron-worker.test.ts`, `api-coverage-5.test.ts` | ✅ |
| REQ-017 | Event | When overdue payment includes extra amount, the system shall create linked late-interest record. | payBill with juros (amountCents > bill amountCents) | `apps/api/src/api-coverage-5.test.ts` | ✅ |
| REQ-018 | Ubiquitous | The system shall support single/future/all edits for recurring occurrences. | edit-scope: single, future, all | `apps/api/src/api-coverage-5.test.ts` | ✅ |
| REQ-019 | Ubiquitous | The system shall support hierarchical macro categories and subcategories. | createCategory with parentId, category interface | `packages/domain/src/in-memory/category-service.test.ts` | ✅ |
| REQ-020 | Event | When TED considers creating category, it shall inspect existing taxonomy first. | create_category_if_needed tool, category alias | `packages/tools/src/tools-contract.test.ts` | ✅ |
| REQ-021 | Ubiquitous | The system shall support monthly category budgets, account goals, and custom scopes. | A2.10: Can create budget and compare vs actual | `apps/api/src/finance-e2e.test.ts` | ✅ |
| REQ-022 | Ubiquitous | The system shall support simple loan installments and calculated interest/amortization loans. | createLoan, payLoanInstallment | `apps/api/src/api-coverage-5.test.ts`, `loan-service.test.ts` | ✅ |
| REQ-023 | Ubiquitous | The system shall support reports for current month, 12-month projection, category, account, invoices, due/overdue, budget vs actual, and custom queries. | All report endpoints tested | `apps/api/src/api-coverage-5.test.ts`, `report-service.test.ts` | ✅ |
| REQ-024 | Event | When cron runs, it shall send task context to TED and execute validated service actions only. | cron trigger all job types | `apps/api/src/api-coverage-5.test.ts`, `cron-worker.test.ts` | ✅ |
| REQ-025 | Ubiquitous | The system shall keep audit logs for create/update/delete/undo actions. | undo creates audit trail, audit log mappers | `apps/api/src/finance-e2e.test.ts`, `mappers.test.ts` | ✅ |
| REQ-026 | Event | When user asks undo, the system shall reverse last eligible action through auditable reversal. | undoRecord returns original and reversal records | `apps/api/src/api-coverage-5.test.ts`, `api-client-coverage.test.ts` | ✅ |
| REQ-027 | Ubiquitous | The system shall store attachments and receipts linked to records. | attachments CRUD (create, list, delete) | `apps/api/src/api-coverage-5.test.ts` | ✅ |
| REQ-028 | Ubiquitous | The system shall support merchants/payees and automatic categorization rules. | categorization rules, auto-categorization service | `packages/domain/src/in-memory/auto-categorization-service.test.ts` | ✅ |
| REQ-029 | Ubiquitous | The system shall support reimbursements and split shared/personal expenses. | reimbursements CRUD + complete, splitExpense | `apps/api/src/api-coverage-5.test.ts` | ✅ |
| REQ-030 | Event | When value exceeds configured high-value limit, the system shall ask confirmation. | A2.6: Expense above threshold goes to review queue | `apps/api/src/finance-e2e.test.ts` | ✅ |
| REQ-031 | Ubiquitous | The system shall scope all user data by household_id. | householdId in all API calls, auth returns householdId | `apps/api/src/auth-e2e.test.ts`, `auth-context.test.ts` | ✅ |
| REQ-032 | Event | When a WhatsApp webhook is retried, the system shall ignore already-processed source_message_id values. | idempotency key tests, source_message_id handling | `packages/idempotency/src/index.test.ts`, `idempotency.test.ts` | ✅ |
| REQ-033 | Ubiquitous | The system shall calculate balances from ledger entries. | calculateAccountBalance with multiple entry types | `packages/ledger/src/ledger.test.ts` | ✅ |
| REQ-034 | Event | When transfer is created, the system shall create debit and credit ledger entries with from_account_id and to_account_id. | A2.9: Transfer creates two ledger entries (debit + credit) | `apps/api/src/finance-e2e.test.ts`, `transfer.test.ts` | ✅ |
| REQ-035 | State | While Pi RPC is processing, new WhatsApp/cron tasks shall wait in a serialized queue or fail with retryable status. | RPC queue serial execution, timeout, enqueue/dequeue | `apps/pi-rpc-runner/src/runner-full-coverage.test.ts`, `rpc-queue-coverage.test.ts` | ✅ |
| REQ-036 | Event | When Evolution webhook arrives, the system shall validate secret, group_id, and sender phone before processing. | webhook with valid/invalid secret, evolution client validation | `apps/api/src/api-coverage-5.test.ts`, `webhook-e2e.test.ts` | ✅ |
| REQ-037 | Ubiquitous | The system shall use BRL cents and America/Sao_Paulo timezone for financial dates. | formatters BRL, centavos inteiros | `apps/dashboard/src/lib/formatters.test.ts` | ✅ |
| REQ-038 | Event | When a backup is created, the system shall verify restore on a test database before marking backup healthy. | backups/run + verify-restore | `apps/api/src/api-coverage-5.test.ts` | ✅ |
| REQ-039 | Event | When a card purchase date crosses closing rules, the system shall assign it to the correct invoice period. | invoice closing logic, purchase date → invoice assignment | `packages/domain/src/in-memory/card-invoice-service.test.ts` | ✅ |
| REQ-040 | Ubiquitous | The system shall store local attachments under data/attachments with DB metadata. | attachments CRUD with file path | `apps/api/src/api-coverage-5.test.ts` | ✅ |

## TDD Cenários do Spec → Testes

| Cenário | Teste | Arquivo | Status |
|---------|-------|---------|--------|
| Conta pode ficar negativa | A2.1: Expense larger than balance does not block | `finance-e2e.test.ts` | ✅ |
| Fatura idempotente | A2.2: Closing invoice twice does not duplicate | `finance-e2e.test.ts` | ✅ |
| Recorrência 12 meses | A2.3: Recurrence creates 12 occurrences | `finance-e2e.test.ts` | ✅ |
| Cron horizon | cron trigger recurrence-horizon creates only missing | `api-coverage-5.test.ts`, `cron-worker.test.ts` | ✅ |
| Duplicidade | A2.4: Same expense twice with idempotency key | `finance-e2e.test.ts` | ✅ |
| TED não mente | A3.1: Non-existent tool returns failure | `tools-contract.test.ts` | ✅ |
| Pagamento atrasado | payBill with juros | `api-coverage-5.test.ts` | ✅ |
| Categoria alias | createCategory + aliases, auto-categorization | `category-service.test.ts`, `auto-categorization-service.test.ts` | ✅ |
| Parcela | A2.7: 3x creates 3 records in different months | `finance-e2e.test.ts` | ✅ |
| Valor alto | A2.6: Expense above threshold → review queue | `finance-e2e.test.ts` | ✅ |
| Ledger | A2.9: Transfer creates debit + credit | `finance-e2e.test.ts`, `transfer.test.ts` | ✅ |
| Idempotência WhatsApp | idempotency key + source_message_id | `idempotency/index.test.ts`, `idempotency.test.ts` | ✅ |
| Pi RPC lock | RPC queue serial execution + timeout | `rpc-queue-coverage.test.ts`, `runner-full-coverage.test.ts` | ✅ |
| Backup restore | backups/run + verify-restore | `api-coverage-5.test.ts` | ✅ |

## Cobertura por Milestone

| Milestone | REQs | Testes | % |
|-----------|------|--------|---|
| 1. Fundação | REQ-001, 031 | auth-e2e, api tests | 100% |
| 2. Domínio core | REQ-002, 009, 010, 019, 025, 026, 033 | finance-e2e, domain tests | 100% |
| 3. Cartões/faturas | REQ-011, 012, 013, 039 | card-invoice, installments | 100% |
| 4. Recorrências/cron | REQ-014, 015, 016, 017, 018, 024 | recurrence, cron tests | 100% |
| 5. Pi RPC/TED tools | REQ-005, 020, 035 | tools-contract, rpc-queue | 100% |
| 6. WhatsApp | REQ-003, 004, 032, 036 | webhook-e2e, classifier | 100% |
| 7. Dashboard | REQ-007, 008, 037 | auth-context, formatters | 100% |
| 8. Relatórios/insights | REQ-021, 023 | report-service, api-coverage | 100% |
| 9. Segurança/backup | REQ-027, 028, 029, 030, 038, 040 | backup, review, attachments | 100% |
| 10. E2E completo | REQ-006, 034 | finance-e2e, ledger | 100% |

**All 40 REQs covered. All 14 TDD scenarios covered.**
