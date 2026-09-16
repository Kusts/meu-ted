# V4 Observability queries (T0.4 — SPEC §24)

Short-lived snippet to be folded into `docs/reports/meu-ted-v4-implementation-report.md`
(Fase 0/T0.4) once T0.1 creates it. Confirms the EXISTING `GET /audit-logs`
(`apps/api/src/routes/audit.ts:72-89`, `eventType` filter backed by
`apps/api/src/audit/store.ts:122-148`) serves all 8 metrics — no new platform.

Base: `GET {API}/audit-logs?eventType=<type>&limit=100` (authenticated;
workspace-scoped server-side via `ctx.householdId`).

| # | Metric | Example query |
|---|---|---|
| 1 | legacy bearer fallback in use | `GET /audit-logs?eventType=auth.request.legacy_bearer_used&limit=100` |
| 2 | legacy device tokens active | structured API log: `event=device.tokens.legacy_active` (counts by vintage; T2.4) |
| 3 | WorkspaceAgent dependents | `GET /history/access-log` on the Agent DO (`history_export`, stream; T4.1) → correlate `eventType=agent.workspace.legacy_access` |
| 4 | offline sessions over maxOfflineAge | `GET /audit-logs?eventType=offline.locked&limit=100` (dims: `offlineSubjectId`, `ageBand`; T2.6) |
| 5 | undo replays | `GET /audit-logs?eventType=audit-undo.replay&limit=100` (T3.1) |
| 6 | operations entering reconcile | `GET /audit-logs?eventType=mutation.reconcile.enqueued&limit=100` (dims: `operationId`, `reason`; T3.1) |
| 7 | microphone permission errors | `GET /audit-logs?eventType=mic.error&limit=100` (dims: `reason=denied\|notfound\|busy`, `capability=on\|off`; T1.1) |
| 8 | same-origin bypass attempts | structured PWA log from `POST /api/csp-report` + `GET /audit-logs?eventType=csp.violation&limit=100` (dims: `effectiveDirective`, `blockedHost`; T2.7) |

Contract: `apps/api/src/audit/events.ts` (`OBSERVABILITY_EVENT_TYPES` +
`buildObservabilityEvent`); privacy fail-closed unit tests:
`apps/api/tests/audit/observability-events.test.ts`.
