Access / inspection status

Repository access: Yes, via GitHub connector.

Repo: Kusts/pi-financeiro

Branch inspected: master

Commit inspected: d351b622c37e4739aa1ebe96f28f51320c2a4498

Commit match: Yes. GitHub compare reported master and the requested SHA as identical; the commit search also returned the requested SHA and message. 

chore: sync project state for G…

.pi/AGENTS.md: I tried to open it; it returned 404 Not Found. Search for AGENTS.md also returned no results. So .pi/ / AGENTS.md is not present at this commit.

Files opened/read included:

docs/superpowers/specs/2026-06-02-architecture-refactor-spec.md, packages/tools/src/index.ts, tool-registry.ts, tool-executor.ts, tool-result.ts, rpc-queue.ts, ted-prompt.ts, apps/pi-rpc-runner/src/index.ts, process-runner.ts, rpc-client.ts, rpc-queue.ts, ted-prompt.ts, apps/whatsapp-bridge/src/index.ts, webhook-handler.ts, pi-rpc-runner-client.ts, finance-api-client.ts, message-classifier.ts, apps/api/src/app.ts, apps/api/src/webhook-deps.ts, apps/api/src/server.ts, .env.example, .env, .gitignore, docker-compose.yml, package.json, pnpm-workspace.yaml.

1. Repository reality check
The diagnosis is directionally correct

The repo really does contain a custom Pi harness around pi --mode rpc:

apps/pi-rpc-runner/src/index.ts explicitly coordinates process runner, JSONL client, queue, and prompt builder. 

index

It starts a long-lived Pi process with pi --mode rpc. 

index

It rebuilds the TED prompt before sending every prompt. 

index

apps/pi-rpc-runner/src/ted-prompt.ts injects persona, context, rules, and user message into every prompt. 

ted-prompt

So yes: the current design explains the context-pollution problem. Even if the same Pi process stays alive, every WhatsApp turn is being wrapped with repeated system-like instructions.

But “~5,000 redundant lines” is overstated unless tests/helpers are included

From the production source files I opened, the core redundancy is real but smaller than the headline number:

packages/tools/src/* production sources are roughly around 1k lines from the opened files.

apps/pi-rpc-runner/src/* production sources are also roughly around 1k lines from the opened files.

The spec says “~4,600 lines” and “~3,000 removed” rather than the earlier “~5,000 all redundant” claim. That updated framing is better. 

2026-06-02-architecture-refacto…

My conclusion: the architecture problem is real, but not all of that code is garbage. The runner/prompt/queue/harness is replaceable; the finance safety/tool contract layer is valuable and must survive.

2. Key findings by area
packages/tools/src/

This package is not just redundant harness. It contains business-facing tool contracts.

tool-registry.ts is a generic registry with idempotency caching and basic schema validation. It is replaceable, but its behavior should be preserved in tests. 

tool-registry

 

tool-registry

However, the validation is weak: it only checks required fields and primitive typeof, not enums, formats, numeric ranges, arrays, or nested schemas. 

tool-registry

tool-executor.ts is more valuable. It maps tool calls to domain services for expenses, income, transfers, installments, recurrence, bills, invoices, reports, categories, review actions, undo, and WhatsApp send. 

tool-executor

 

tool-executor

 

tool-executor

 

tool-executor

Important: the spec’s proposed extension tool list is incomplete compared with the actual tool executor. It lists core create/report/list/confirm tools, but misses or under-specifies existing capabilities like create_installment_purchase, create_recurrence, pay_bill, close_invoice, pay_invoice, mark_reviewed, undo_last_action, and send_whatsapp_message. 

2026-06-02-architecture-refacto…

 

tool-executor

apps/pi-rpc-runner/src/

The custom runner is the clearest refactor target.

process-runner.ts only spawns and stops pi --mode rpc; it has no robust restart/backoff/health model. 

process-runner

rpc-client.ts implements JSONL parsing, message buffering, timeout, and pending response state. 

rpc-client

 But it has design risks:

no request IDs;

only one pendingResponse;

partial JSON handling can duplicate or mishandle chunks because on parse failure it appends the whole chunk text, not just the failed line; 

rpc-client

it creates a new JSONL client per prompt while attaching/removing stdout listeners, which is fragile around concurrent or delayed events. 

rpc-client

 

rpc-client

rpc-queue.ts has a more serious operational issue: if processNext() is called while another job is processing, it returns null instead of waiting. 

rpc-queue

 In runPrompt(), that becomes No result from queue. 

index

 That can explain dropped or failed concurrent WhatsApp messages.

apps/whatsapp-bridge/src/

The bridge has useful safety responsibilities and should not be deleted.

webhook-handler.ts validates Evolution GO event type, instance token, group, sender, duplicate message ID, classifies messages, sends progress, and forwards to Pi. 

webhook-handler

 

webhook-handler

But dedupe is currently in-memory. webhook-deps.ts creates an InMemorySourceMessageStore. 

webhook-deps

 It is lost on restart, so webhook idempotency is not durable. That is a bigger issue than the spec currently emphasizes.

Also, saveError() stores processed: false, which means failed messages can be retried/reprocessed later. That may be intentional, but for finance writes it needs a clear retry/idempotency policy. 

webhook-deps

finance-api-client.ts is important and should not be replaced with model-generated curl. It is a typed HTTP client for accounts, cards, categories, records, reports, and writes. 

finance-api-client

But it currently sends only Content-Type, no auth/service token. 

finance-api-client

 Meanwhile the API middleware makes most routes protected except health/auth/webhook. 

app

 So the refactor plan must add a service auth strategy for the Pi extension/CLI helper.

.pi/

Not present at the inspected commit. This matters because the updated spec’s target architecture depends on .pi/AGENTS.md, .pi/skills/ted-finance, and .pi/prompts/report.md. 

2026-06-02-architecture-refacto…

So Phase 0 must include creating .pi/AGENTS.md, not just migrating to it.

apps/api/src/app.ts

The Fastify API is the real source of truth and should stay.

It initializes domain services for records, cards, recurrence, review, loans, budgets, reports, attachments, reimbursements, and backups. 

app

It exposes deterministic endpoints for records, cards, installments, reports, review, cron, attachments, reimbursements, backups, and the Evolution webhook. Examples:

POST /records/expense, /records/income, /records/transfer. 

app

 

app

POST /cards/purchase and /cards/installments. 

app

reports such as /reports/current-month and /reports/account-balances. 

app

POST /webhooks/evolution. 

app

3. Review of the updated spec
a. Is the 7-phase migration plan safe and complete?

Safe direction: yes. Complete: not yet.

The updated spec is much better than the earlier big-bang/curl plan 

2026-06-02-architecture-refacto…

2026-06-02-architecture-refacto…

2026-06-02-architecture-refacto…

2026-06-02-architecture-refacto…

2026-06-02-architecture-refacto…

2026-06-02-architecture-refacto…

finance-api-client

app

webhook-deps

rpc-queue

tool-result

finance-api-client

finance-api-client

2026-06-02-architecture-refacto…

2026-06-02-architecture-refacto…

index

ted-prompt

ted-prompt

rpc-queue

.gitignore

.env

docker-compose

.env