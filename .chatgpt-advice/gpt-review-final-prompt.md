You are a senior software architect and technical reviewer. Use the GitHub connector to inspect the repository.

Repo: Kusts/pi-financeiro
Branch: master
Commit: d351b622c37e4739aa1ebe96f28f51320c2a4498

## Context

This is a personal finance system for a couple, connected via WhatsApp group. It uses:
- Fastify API + PostgreSQL (Docker) — backend CRUD + reports
- Pi CLI (pi --mode rpc) — AI agent terminal (TED)
- Evolution GO API — WhatsApp integration
- pnpm monorepo

The architecture has a problem: ~5,000 lines of custom TypeScript code were written to reimplement what Pi already provides natively (process lifecycle, JSONL protocol, tool registry, prompt builder, RPC queue, etc). This code is causing issues:
1. TED (the AI agent) loses conversation context between messages
2. The prompt builder repeats full TED context in every user message, polluting the session
3. There's no proper session management — each WhatsApp message is an isolated prompt
4. The finance-api-client, tool-registry, tool-executor are all custom-managed instead of using Pi-native skills/AGENTS.md

## What was done in previous review

A previous architecture spec proposed removing everything and replacing it with:
- `.pi/AGENTS.md` as system prompt
- `curl` instructions in the prompt for TED to call the API
- A ~60-line pi-bridge.ts adapter

**That review (from you, ChatGPT) correctly rejected the approach**, pointing out:
- Replacing deterministic finance-api-client with model-generated `curl` is dangerous for a finance ledger
- The bridge needs 200-500 lines with proper JSONL buffering, request IDs, timeouts
- `--no-session` contradicts the need for conversation context
- Migration needs feature flags, shadow mode, golden tests — not big bang

## What I need from this review

The updated spec is at `docs/superpowers/specs/2026-06-02-architecture-refactor-spec.md`

Please review the updated plan with the GitHub connector. Specifically:

1. **Verify the repo structure** — open the key files and confirm the analysis matches reality:
   - `packages/tools/src/` — the custom tool registry/executor (~2,200 lines)
   - `apps/pi-rpc-runner/src/` — the custom Pi runner (~2,400 lines)
   - `apps/whatsapp-bridge/src/` — the WhatsApp adapter
   - `.pi/` — does it exist? Is there already an AGENTS.md?
   - `apps/api/src/app.ts` — the Fastify API endpoints

2. **Review the updated spec** at `docs/superpowers/specs/2026-06-02-architecture-refactor-spec.md`

3. **Answer these specific questions**:
   a. Is the 7-phase migration plan safe and complete?
   b. The spec proposes a Pi extension OR a CLI helper for deterministic finance tools. Which approach is better given Pi's current extension API?
   c. Is `pending_operations` the right approach for multi-message confirmation, or is there a simpler in-memory solution that's durable enough?
   d. For the pi-bridge, should we use `pi --mode rpc` with sessions (one process per household) or without sessions (ephemeral)?
   e. What's the simplest FIRST step that adds immediate value without waiting for the full refactor?

4. **Security check**: Does the repo contain any secrets, tokens, or credentials that shouldn't be public?

5. **Final verdict**: After inspecting the actual code, do you still recommend proceeding with the refactor? Any changes to the plan?

Before reviewing, state:
- whether you could access the repository
- exact branch and commit inspected
- files opened/read
- whether the inspected commit matches the requested SHA

Return your analysis in structured markdown. Be specific and reference actual file paths and line numbers where relevant. End your final answer with the unique completion tag: [RESPONSE_COMPLETE]
