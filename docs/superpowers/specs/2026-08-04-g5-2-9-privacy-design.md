# G5.2.9 Privacy Controls Design

## Goal

The Agent must retain transcript data for at most 180 days, let an authenticated user export or delete their own Agent history, provide an auditable access log, and avoid persisting duplicate or unnecessary tool/action payloads.

## Scope and authorization

The Agent Durable Object remains the privacy boundary because each instance is already isolated by workspace. The Worker authenticates workspace membership and forwards `x-agent-actor`, `x-agent-role`, and workspace identity to the Durable Object.

- A member can export and delete only their own history.
- A member can inspect access-log entries caused by that member.
- An owner can inspect the complete workspace access log.
- Delete operations never delete access-log evidence for the deletion itself.
- Existing shared transcript read behavior remains unchanged in this goal; export/delete are the privacy-scoped operations.

## Durable schema and retention

Schema version 5 adds an append-only `access_log` table containing only:

- generated event id;
- actor id;
- action (`history_export`, `history_delete`, `access_log_read`, `retention_purge`);
- affected record count;
- timestamp.

It contains no message, tool, credential, or arbitrary request payload. The Durable Object alarm runs an idempotent purge. Records older than 180 days are removed from `messages`, `agent_actions`, `turn_events`, completed/failed/aborted `turn_queue` rows, `token_usage`, and `access_log`. Queued/running turns are not removed by retention.

## Export and delete contract

Agent routes:

- `GET /history/export` returns a versioned JSON document with export timestamp and the caller's messages, turns, events, and minimized actions.
- `DELETE /history` removes the caller's messages, turns, associated events, token usage, and associated assistant/user actions. It returns an idempotent summary with counts. The delete is followed by one minimal access-log record.
- `GET /history/access-log` returns caller-scoped entries for members and workspace entries for owners.

A user's assistant records are associated through their owned turn ids (`<turnId>:assistant` for assistant rows). The export and delete implementation derives those ids from actor-owned `turn_queue` rows; it does not trust a client-supplied record list.

## Payload minimization

`agent_actions` remains an operational audit trail but no longer duplicates transcript content. `message.created` stores turn id, intention id, content length and input token count. `assistant.created` stores turn id, output length and token count. Full text remains only in the transcript fields that export/delete explicitly govern, and all persisted text continues through transcript redaction.

## Data flow

1. Worker authenticates the workspace request.
2. Worker forwards actor and role headers to the workspace Durable Object.
3. Durable Object validates the route and scope from those headers.
4. Durable Object reads the actor's turn ids, executes export/delete, and records a minimal access event.
5. PWA calls the Agent endpoints through authenticated `fetch`, downloads the JSON export, and asks for explicit confirmation before delete.

## Testing and verification

TDD cycles cover:

- 180-day purge and preservation of active turns;
- export scope and JSON shape;
- delete scope, idempotency, and access-log preservation;
- member/owner access-log authorization;
- Worker route forwarding;
- minimized action payloads;
- PWA export/delete client behavior;
- no sensitive payloads in access logs.

Verification runs the Agent suite, Agent typecheck, relevant PWA/API suites, bridge sanitizer regression, and `git diff --check`. Evidence is recorded in `docs/superpowers/goal-runs/G5.2.9.md`.
