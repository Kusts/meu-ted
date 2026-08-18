# G5.2.9 Privacy Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 180-day Agent transcript retention, self-service export/delete, auditable access logs, and minimized action payloads without changing the existing API-only side-effect boundary.

**Architecture:** Keep all transcript privacy operations inside the workspace Durable Object. The authenticated Agent Worker forwards actor and role context; the DO derives owned turn ids, filters export/delete data server-side, stores append-only minimal access events, and purges expired terminal records from its alarm. PWA adds authenticated client commands and a confirmation flow.

**Tech Stack:** Cloudflare Durable Objects SQLite, TypeScript, Vitest, Next.js PWA, Zod, existing Worker membership authorization.

**Agent Orchestration:** Single-Agent Looped — changes are coupled through the Agent schema/DO route contract and must be implemented in TDD order.

## File map

- Modify `apps/agent/src/schema.ts`: schema v5 and retention/access-log tables.
- Create `apps/agent/migrations/0005_privacy_controls.sql`: deployable v5 migration.
- Modify `apps/agent/src/index.ts`: purge alarm, export/delete/access-log routes, actor scope, minimal action payloads.
- Modify `apps/agent/src/worker-configuration.d.ts` only if new bindings/configuration is required; no new environment variable is planned.
- Modify `apps/pwa/src/lib/api/agent-client.ts`: export/delete/access-log client contracts.
- Modify `apps/pwa/src/features/profile/ProfilePage.tsx`: export/download and delete/confirm controls.
- Modify `apps/agent/tests/agent-scaffold.test.ts`: schema v5 assertions.
- Modify/create `apps/agent/tests/agent-privacy.test.ts`: DO retention, export, delete, access-log, and minimization tests.
- Modify `apps/agent/tests/agent-auth.test.ts`: Worker route forwarding and role authorization.
- Modify `apps/pwa/src/lib/api/agent-client.test.ts`: client contracts and error handling.
- Modify `apps/pwa/src/features/profile/__tests__/AgentTranscript.test.tsx`: UI confirmation/download behavior.
- Create `docs/superpowers/goal-runs/G5.2.9.md`: evidence and verification record.

### Task 1: Schema v5 and retention primitives

**Files:**
- Modify: `apps/agent/src/schema.ts`
- Create: `apps/agent/migrations/0005_privacy_controls.sql`
- Test: `apps/agent/tests/agent-scaffold.test.ts`, `apps/agent/tests/agent-privacy.test.ts`

- [ ] **Step 1: Write the failing schema and purge tests**

  Assert schema version 5 creates `access_log`, and a purge removes records older than 180 days while retaining queued/running turns. The SQL fake must expose rows for `messages`, `agent_actions`, `turn_queue`, `turn_events`, `token_usage`, and `access_log`, then record delete statements and bindings.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run `pnpm --dir apps/agent exec vitest run tests/agent-scaffold.test.ts tests/agent-privacy.test.ts --reporter=dot`.
  Expected: failure because schema version 5, access-log DDL, and purge behavior do not exist.

- [ ] **Step 3: Implement schema v5 and idempotent purge**

  Add `WORKSPACE_AGENT_SCHEMA_VERSION = 5`, `WORKSPACE_AGENT_SCHEMA_V5`, and `0005_privacy_controls.sql` with an append-only table containing `id`, `actor_id`, `action`, `record_count`, and `created_at`. Add a `purgeExpiredData(now = new Date())` method that deletes only records before `now - 180 days`, deletes terminal queue rows before deleting dependent rows, and leaves queued/running rows untouched. Call it from `alarm()` before queue processing.

- [ ] **Step 4: Run the focused tests and verify GREEN**

  Run the same Vitest command. Expected: schema and purge tests pass; existing Agent tests remain green.

### Task 2: Export/delete/access-log DO routes

**Files:**
- Modify: `apps/agent/src/index.ts`
- Test: `apps/agent/tests/agent-privacy.test.ts`

- [ ] **Step 1: Write failing route tests**

  Add tests for:
  - `GET /history/export` returns versioned JSON containing only the caller's owned turns and associated `<turnId>:assistant` rows/events/actions.
  - A different member's export does not contain the first member's turn ids or content.
  - `DELETE /history` deletes only the caller's owned turn graph, returns counts, and a repeated delete returns zero counts without removing the access-log row.
  - `GET /history/access-log` returns member-owned entries and owner workspace entries; a member cannot request another actor's entries.

- [ ] **Step 2: Run tests and verify RED**

  Run `pnpm --dir apps/agent exec vitest run tests/agent-privacy.test.ts --reporter=dot`.
  Expected: route tests fail with `agent.not_found` or missing behavior.

- [ ] **Step 3: Implement scoped export/delete and minimal access records**

  Add route dispatch before `/message` handling. Derive owned turn ids from `turn_queue.actor_id = x-agent-actor`; read associated message/action/event rows by those ids; never accept a client record list. Export `{ version: 1, exportedAt, messages, turns, events, actions }`. Delete the owned turn graph and record one `history_delete` access event. Export and access-log reads record minimal access events without content.

- [ ] **Step 4: Run route tests and verify GREEN**

  Run the focused privacy tests and the existing Agent suite. Expected: all pass, including existing shared `/message` history behavior.

### Task 3: Minimize action payloads and Worker routes

**Files:**
- Modify: `apps/agent/src/index.ts`
- Modify: `apps/agent/src/schema.ts` if indexes are needed
- Modify: `apps/agent/src/worker-configuration.d.ts` only if required
- Test: `apps/agent/tests/agent-privacy.test.ts`, `apps/agent/tests/agent-auth.test.ts`

- [ ] **Step 1: Write failing minimization and forwarding tests**

  Assert `message.created` action payload contains ids/length/token metadata but not message content; assert `assistant.created` contains output length/token metadata but not output text. Assert Worker forwards `/history/export`, `DELETE /history`, and `/history/access-log` to the workspace DO with authenticated actor/role headers.

- [ ] **Step 2: Run tests and verify RED**

  Run `pnpm --dir apps/agent exec vitest run tests/agent-privacy.test.ts tests/agent-auth.test.ts --reporter=dot`.
  Expected: action payload assertions fail and new Worker paths are not forwarded.

- [ ] **Step 3: Implement payload minimization and route matching**

  Replace duplicated action content with `{ turnId, intentionId, contentLength, inputTokens }` for user messages and `{ turnId, outputLength, outputTokens }` for assistant output. Extend the Worker path matcher to include `/history/export`, `/history`, and `/history/access-log`; keep membership authorization and role forwarding unchanged.

- [ ] **Step 4: Run tests and verify GREEN**

  Run the focused Agent tests and full Agent suite. Expected: all pass with no credential or transcript payload in action records.

### Task 4: PWA commands and confirmation UI

**Files:**
- Modify: `apps/pwa/src/lib/api/agent-client.ts`
- Test: `apps/pwa/src/lib/api/agent-client.test.ts`
- Modify: `apps/pwa/src/features/profile/ProfilePage.tsx`
- Test: `apps/pwa/src/features/profile/__tests__/AgentTranscript.test.tsx`

- [ ] **Step 1: Write failing client/UI tests**

  Assert export uses authenticated `GET /agents/workspace/:id/history/export`, delete uses authenticated `DELETE /agents/workspace/:id/history`, and the transcript UI renders export and delete controls only after the transcript is open. Assert delete requires confirmation and removes the local transcript after success; failed delete keeps it visible.

- [ ] **Step 2: Run tests and verify RED**

  Run `pnpm test:pwa -- --run apps/pwa/src/lib/api/agent-client.test.ts apps/pwa/src/features/profile/__tests__/AgentTranscript.test.tsx`.
  Expected: imports/functions and controls are missing.

- [ ] **Step 3: Implement typed client methods and UI flow**

  Add Zod schemas/types for export/delete responses, authenticated client methods, a download using a Blob URL for the versioned JSON, and a destructive confirmation action. Keep errors thrown through the existing client boundary; do not report success before a 2xx response.

- [ ] **Step 4: Run PWA focused tests and typecheck**

  Run `pnpm test:pwa -- --run apps/pwa/src/lib/api/agent-client.test.ts apps/pwa/src/features/profile/__tests__/AgentTranscript.test.tsx` and `pnpm typecheck`. Expected: focused tests pass and no new type errors appear.

### Task 5: Verification, documentation, and evidence

**Files:**
- Create: `docs/superpowers/goal-runs/G5.2.9.md`
- Modify: `docs/superpowers/specs/2026-08-04-g5-2-9-privacy-design.md` only for confirmed corrections

- [ ] **Step 1: Run complete relevant verification**

  Run:
  - `pnpm --dir apps/agent test -- --reporter=dot`
  - `node_modules/.bin/tsc -p apps/agent/tsconfig.json --noEmit --pretty false --skipLibCheck`
  - `pnpm test:pwa -- --run apps/pwa/src/lib/api/agent-client.test.ts apps/pwa/src/features/profile/__tests__/AgentTranscript.test.tsx`
  - `pnpm --filter @pi-financeiro/whatsapp-bridge exec vitest run src/log-sanitizer.test.ts --reporter=dot`
  - `git diff --check`

- [ ] **Step 2: Inspect scope and privacy evidence**

  Confirm every export/delete route is authenticated by the Worker, no access-log row contains raw payload, purge is 180 days, active turns survive, and action payloads contain metadata only.

- [ ] **Step 3: Write evidence**

  Record exact commands, counts, failures (if any), and paths in `docs/superpowers/goal-runs/G5.2.9.md`. Do not claim API/PWA full-suite health if unrelated pre-existing failures remain.

- [ ] **Step 4: Final diff review**

  Run `git diff --check` and inspect only goal-scoped files. No commit or deployment is performed without explicit authorization.
