# V4 Observability contract (T0.4 — SPEC §24) — FIX-F0 revision

Status: **contrato planejado**. Os emissores nascem junto de cada bloco dono
(T1.1, T2.2, T2.4, T2.6, T2.7, T3.1, T4.1) — nenhuma das 8 métricas abaixo é
consultável em produção até seu emissor existir. Cada consulta de exemplo
está marcada como **disponível-após-emissor**.

Contrato de validação (fail-closed): `apps/api/src/audit/events.ts`
(`OBSERVABILITY_EVENT_TYPES` + `buildObservabilityEvent`, allowlist estrita
por evento); testes de privacidade:
`apps/api/tests/audit/observability-events.test.ts`.

Transporte client→API: `POST /client-events` (autenticado; só
`offline.locked` e `mic.error`; sem persistência em DB — consumo via log
estruturado). Rotas: `apps/api/src/routes/client-events.ts`.

| # | Métrica | Backend REAL | Emissor (dono) | Consulta de exemplo (disponível-após-emissor) |
|---|---|---|---|---|
| 1 | legacy bearer fallback em uso | `audit_logs` (após V054) via `GET /audit-logs` | T2.2 (API central auth resolution; SOMENTE quando cookie/sessão não autenticou E o bearer legado foi o autenticador efetivo) | `GET /audit-logs?eventType=auth.request.legacy_bearer_used&limit=100` (autenticado; escopo de workspace server-side via `ctx.householdId`) |
| 2 | legacy device tokens ativos | log estruturado Fastify (`device.tokens.legacy_active`, contagens por vintage) | T2.4 (API rotation/job, log periódico) | `event=device.tokens.legacy_active` no log estruturado |
| 3 | dependentes do WorkspaceAgent | access-log do Agent DO (`history_export`/stream) correlacionado a `eventType=agent.workspace.legacy_access` | T4.1 (derivado do DO access-log) | `GET /history/access-log` no Agent DO |
| 4 | sessões offline além do maxOfflineAge | log estruturado Fastify via `POST /client-events` (autenticado) | T2.6 (report autenticado da PWA; dims `offlineSubjectId`, `ageBand`) | `event=client.event eventType=offline.locked` no log estruturado |
| 5 | undo replays | log estruturado Fastify (`audit-undo.replay`) | T3.1 (API) | `event=audit-undo.replay` no log estruturado |
| 6 | operações entrando em reconcile | log estruturado Fastify (`mutation.reconcile.enqueued`; dims `operationId`, `reason`) | T3.1 (API) | `event=mutation.reconcile.enqueued` no log estruturado |
| 7 | erros de permissão de microfone | log estruturado Fastify via `POST /client-events` (autenticado) | T1.1 (evento client da PWA; dims `reason=denied\|notfound\|busy`, `capability=on\|off`) | `event=client.event eventType=mic.error` no log estruturado |
| 8 | tentativas de bypass same-origin | log estruturado do endpoint `POST /api/csp-report` (PWA same-origin) + `csp.violation` (dims `effectiveDirective`, `blockedHost`) | T2.7 (nasce com o endpoint) | log estruturado do `/api/csp-report` |

Notas de honestidade (o que este contrato NÃO promete):

- `GET /audit-logs` (`apps/api/src/routes/audit.ts`, filtro `eventType` em
  `apps/api/src/audit/store.ts`) serve a métrica #1 somente após V054
  (`V054__audit_logs_nullable_operation_record.sql`) + emissor T2.2.
- As métricas #2, #5, #6 e #8 são consumidas no log estruturado do Fastify —
  não há tabela nem endpoint de leitura dedicado para elas nesta fase.
- A métrica #3 é lida no Agent DO (`GET /history/access-log`), fora da API.
- As métricas #4 e #7 dependem do transporte `POST /client-events`
  (entregue nesta revisão) E dos emissores PWA (T1.1 parcial via fila
  `mic.error`; `offline.locked` nasce em T2.6).
