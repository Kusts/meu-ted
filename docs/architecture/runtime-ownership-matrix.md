# Runtime Ownership Matrix

This document defines the single-ownership runtime transition state machine for WhatsApp financial assistant message handling.

## States

| Stage | Primary Responder | Pi Direct Writes | Agent Direct Writes | Shadow Mode |
|---|---|---|---|---|
| `pi_owner` | Pi Subprocess (`AgentRunner`) | Enabled (via API adapters) | Disabled | Agent Read-Only Shadow |
| `agent_owner` | Cloudflare Agent Worker | Disabled | Enabled (via API adapters) | None |
| `agent_owner_pi_read_fallback` | Cloudflare Agent Worker | Disabled | Enabled (via API adapters) | Pi Read-Only Fallback |
| `frozen` | Cloudflare Agent Worker | Disabled | Enabled (via API adapters) | Disabled |

## Invariants

1. **Exactly-Once Response**: Exactly one runtime processes the turn and emits the final user message to WhatsApp.
2. **Server-Side Identity**: Both runtimes resolve actor and workspace identity via `POST /auth/bridge-context` and authenticate API requests using signed short-lived delegated tokens.
3. **Fail-Closed Startup**: If `FINANCE_RUNTIME_STAGE` is set to an unknown or conflicting stage, the application fails to start.
4. **Safe Rollback**: Reverting from `agent_owner` to `pi_owner` via configuration requires zero data migration and guarantees in-flight isolation by idempotency key.
