b. Extension vs CLI helper

Use a CLI helper first; keep Pi extension as the later/nicer interface.

Reason: the repo already has many deterministic finance operations, not just 2–3 simple calls. ToolExecutor registers financial tools like create_expense, create_income, create_transfer, installment purchase, recurrence, bill payment, invoice close/pay, report generation, category creation, review marking, undo and WhatsApp send. 

tool-executor

 

tool-executor

 

tool-executor

Given that scope, the safest path is:

Pi/TED → finance-cli → Fastify API/domain services

Not:

Pi/TED → free curl/HTTP instructions

The CLI helper is better for the first implementation because it is stable, testable, versionable, and does not depend on the maturity or exact loading behavior of Pi’s extension API. The extension can come later as a cleaner UX, but the core should be shared:

packages/finance-tools-core/
  createExpense()
  createIncome()
  createTransfer()
  ...
packages/finance-cli/
  bin/ted-finance.js
.pi/extensions/ted-finance.ts  // later, thin wrapper

So my verdict for b: CLI helper first, Pi extension later. Do not delete the finance tool logic; compress and move it behind a deterministic command surface.

c. pending_operations vs in-memory confirmation

Use pending_operations, but keep it simpler than the proposed table if this is Phase 1.

The Pi RPC session context helps TED remember the conversation, but it should not be the source of truth for money writes. Current webhook dedupe is already in-memory: InMemorySourceMessageStore stores processed messages in a Map, which is lost on restart. 

webhook-deps

 The webhook also passes idempotency as whatsapp:<providerMessageId>, which is good for single-message dedupe, but not enough for multi-turn confirmation. 

webhook-handler

 

webhook-handler

For this flow:

user: gastei 35
TED: qual conta?
user: nubank
TED: confirma?
user: sim

you need durable state keyed by:

household_id + chat_id + user_phone

Otherwise these bugs remain likely:

API restarts after “qual conta?” and loses the draft.

Two users in the same group confirm different things.

A later “sim” confirms the wrong operation.

Pi’s conversational memory says one thing, but DB state says another.

Duplicate webhook/retry creates or confirms twice.

So my verdict for c: yes, pending_operations is the right architecture, but start minimal:

SQL
pending_operations(
  id,
  household_id,
  chat_id,
  user_phone,
  status,
  draft_payload,
  missing_fields,
  confirmation_required,
  idempotency_key,
  expires_at,
  created_at,
  updated_at
)

You do not need to over-engineer confirmation_level yet. You do need expiry, status, idempotency, and user/chat scoping.

d. Pi bridge: sessions or ephemeral?

Use pi --mode rpc with sessions: one long-lived process per household, not one shared ephemeral process.

The current config already defaults to PI_RPC_ARGS = ["--mode","rpc"]. 

README

 The current runner starts a child process and keeps it alive, then sends prompts through that process. 

index

For this project, one process per household is the best balance because TED is not just answering questions; it is operating inside a household financial context. A single shared process risks context bleed between households/chats. Fully ephemeral calls lose conversational continuity and make multi-message finance flows worse.

Recommended model:

PiBridgeManager
  householdId -> PiBridgeSession

Each session should still have:

queue per chat/sender;

request IDs;

timeout;

restart on crash;

no cross-household memory;

durable pending_operations for confirmations.

The current JSONL client is not robust enough yet because it has no request ID correlation and parses stream chunks in a fragile way. It accumulates partial JSON but mixes assistant text and JSON buffering in the same responseBuffer, which is risky for concurrent or malformed events. 

rpc-client

 

rpc-client

 The refactor spec correctly calls for request IDs, JSONL buffering, timeout, restart and per-chat serialization. 

chore: sync project state for G…

So my verdict for d: sessions, one Pi RPC process per household, with durable DB state for financial confirmations.

e. Simplest first step with immediate value

First step: extract the existing deterministic finance operations into a CLI helper without changing the WhatsApp flow yet.

Do this before the full Pi-native refactor:

packages/finance-cli/
  bin/ted-finance.js
  commands/
    create-expense.ts
    create-income.ts
    create-transfer.ts
    list-accounts.ts
    list-categories.ts
    get-report.ts

Start with only:

list_accounts

list_categories

create_expense --dry-run

create_expense --commit

get_report

Why this adds immediate value:

It preserves the valuable financial layer.

It gives Pi a deterministic surface.

It avoids waiting for the full bridge/session/pending refactor.

It creates golden tests around actual money operations.

It reduces the risk of TED “saying it did something” before the DB confirms.

The repo already has Fastify endpoints for core financial writes like expense, income and transfer, with validation and idempotency fields. 

app

 

app

 

app

So my recommended immediate step is not “delete 5k lines.” It is:

Freeze behavior → create finance-cli → route one safe operation through it in shadow/dry-run mode.
f. Security check: secrets in the inspected commit

I did not see live production secrets, tokens, API keys, or private credentials in the inspected commit.

What I did see:

.env is ignored by Git. 

.gitignore

.env.example uses placeholders like your_instance_token_here and your_webhook_secret_here. 

.env

There is a hardcoded local/dev Postgres password: pi_financeiro_dev_secret, both in .env.example and docker-compose.yml. 

.env

 

docker-compose

Test files use fake tokens like test-instance-token, not real-looking credentials. 

chore: sync project state for G…

So security verdict: no obvious real secret leak found, but the repo does contain dev credentials. That is acceptable for local Docker only, but I would still rename them to something obviously non-secret, such as:

POSTGRES_PASSWORD=dev_only_change_me

Also: the webhook validation has a dev-mode bypass when expectedToken is empty. That is fine locally, but production startup should fail if EVOLUTION_GO_INSTANCE_TOKEN is empty. 

webhook-handler

g. Final verdict after actual code inspection

Proceed with the refactor, but not as originally phrased.

The analysis is directionally correct: there is real redundant harness code. The repo has a custom Pi runner, JSONL client, queue, prompt builder, tool registry and tool executor. The runner coordinates process, JSONL client, queue and prompt building. 

index

 The JSONL client manually implements Pi RPC stdin/stdout handling. 

rpc-client

 The queue is a custom serialized job processor. 

rpc-queue

 The prompt builder embeds TED persona/rules that should move into Pi-native prompts/AGENTS-style configuration. 

ted-prompt

But the finance safety layer is not redundant. The important parts to preserve are:

typed finance operations;

idempotency;

webhook dedupe;

message classification;

validation;

confirmation state;

report reads from API, not model guesses;

rollback/shadow mode.

The spec itself now says the same: not all current code is redundant, and the finance safety layer must be preserved. 

chore: sync project state for G…

My final recommendation:

PASS for experimental personal-use refactor
FAIL for “delete old code now”
PROCEED with feature flag + golden tests + CLI helper + durable pending_operations

Execution order:

Add golden tests for WhatsApp → finance intent → DB result.

Build finance-cli for 5 core commands.

Add pending_operations.

Build new PiBridge with sessions per household.

Run shadow mode.

Switch only your own number first.

Remove legacy runner only after stable real usage.

Final verdict: the repo should move toward Pi-native, but the first real milestone should be a deterministic finance CLI and durable confirmation state, not an aggressive deletion of the existing tool/runtime code.

[RESPONSE_COMPLETE_1780437957180_vy830msc]