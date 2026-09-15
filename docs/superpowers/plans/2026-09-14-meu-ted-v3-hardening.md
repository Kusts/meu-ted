# Plano de execução — Meu TED V3: Hardening Ponta a Ponta

**Goal:** Implementar a SPEC [`MEU-TED-SPEC-HARDENING-PONTA-A-PONTA-V3.md`](../../MEU-TED-SPEC-HARDENING-PONTA-A-PONTA-V3.md) por blocos A–F, fechando as lacunas entre PWA → Agent → API → PostgreSQL sem reescrever a arquitetura V2. Toda mutação aprovada deve ser executável; confirmação e cancelamento (botão e linguagem natural) devem usar a mesma máquina de decisão; a intenção incompleta sobrevive entre turnos em `MutationDraft` sem autoridade financeira (SPEC §7.8) e o handoff draft → PendingOperation é idempotente e recuperável — 0 ou 1 PendingOperation por draft (SPEC §7.8, INV-09/INV-10); nenhuma attestation reutilizável; nenhuma operação eternamente `executing`; nenhuma afirmação financeira sem evidência; PWA reconciliada após mutações via Mutation Effects Registry determinístico, separado do Approval Tool Contract (SPEC §7.5, §15.1.1).

**Status:** PLANEJADO (rev. 3 — revisão final de consistência: handoff recuperável draft → PendingOperation com `proposing` + `proposalIdempotencyKey` estável; recovery `confirmed` (reemissão de attestation, sem lease) ≠ `executing` (lease/reconciler); `MutationReceipt` com `mutationId` universal e `operationId` apenas no caminho TED) — aguardando autorização de execução.

**Baseline verificada:** `HEAD = main@e5f21177fc970c631fe47b80c584485fe0e0d47b` (2026-09-14) — commit de documentação (refresh do relatório V2) sobre o SHA de código `8541f19`; a reauditoria de código vale, portanto, para o código de `8541f19` + docs de `e5f2117`. Reauditoria por 4 subagentes de exploração confirmou os achados H-01..H-16 com evidência `arquivo:linha` (apêndice §35 da SPEC) e produziu 3 correções de escopo: (1) `retry` failed→confirmed já reemite attestation — vira teste de não regressão; (2) `credentials: include` já presente na PWA — migração cookie-first concentra-se em `AuthGate`/`RootProviders`; (3) snapshots já usam fingerprint SHA-256 — falta só identificador local estável.

## Evidência de baseline (reauditoria)

| Achado | Estado na baseline | Evidência |
|---|---|---|
| Proposta sem `accountId` persistida e só falha no execute | Ativo | `apps/agent/src/mutations/financial-parser.ts:1-3`; `apps/agent/src/orchestration/conversation-orchestrator.ts:209-222`; propose aceita args genéricos em `apps/api/src/routes/pending-operations.ts:64`; executor exige UUIDs em `apps/api/src/writes/types.ts:91-110` |
| Confirmação/cancelamento NL inoperantes | Ativo | `apps/agent/src/finance-chat-agent.ts:1116-1121`; `conversation-orchestrator.ts:225,247-251`; `confirmation-resolver.ts:10` |
| Attestation não recuperável após confirm perdido (H-03) | Ativo | `apps/api/src/approvals/pending-v2.ts:78,44-54` |
| Claim+executor+finalização em 1 transação (H-04/H-05) | Ativo | `pending-v2.ts:79`; `apps/api/src/db/pool.ts:44-63` |
| Pass-through sem evidência (H-06) | Ativo | `conversation-orchestrator.ts:150-158`; `channel-evidence.ts:289-290` |
| Sem `GET /v2/active`, sem registry, sem lease | Ausente | grep sem matches; tabela V2 = `apps/api/src/read-models/sql/V051__pending_operation_bindings.sql:4-15` |
| PWA sem reconciliação pós-mutação (H-07) | Ativo | `app-state-context.tsx:538-1361,1622-1684`; `TedChat.tsx:379` |
| Testes que não exercem o protocolo (§25.1) | Ativo | `pending-v2-postgres-red.test.ts` (8 linhas); `pending-operations-v2.test.ts:61,86` aceita `{}` |
| CI remoto | Bloqueado por billing (não é falha de código) | `docs/reports/agent-v2-implementation-report.md:158-160` |

## Regras de execução

1. Branch dedicada a partir de `main@e5f21177`; nenhum deploy automático durante o desenvolvimento.
2. TDD real: RED observado → menor GREEN coerente → refactor seguro. Nenhum teste alterado para passar artificialmente.
3. Migration `V052` nova, aditiva, backward-compatible; nunca reescrever migrations aplicadas.
4. `apps/api` permanece a única autoridade; Agent e PWA continuam sem escrita direta.
5. Nenhum rollout do Agent antes do BLOCO A completo; nenhum deploy antes do BLOCO F.
6. Subagentes conforme `orchestration.md`: coder implementa, tester valida, reviewer revisa, security-reviewer nas superfícies sensíveis (attestation, attachment, auth), architect para decisões de contrato (registry, state machine). Escalonamento só conforme tabela de cotas.
7. Gates contínuos por fase: `pnpm docs:lint`, `pnpm typecheck`, `pnpm test`, `pnpm governance:check`.
8. Política P2/P3 (SPEC §32): P0/P1 são obrigatórios para o release; itens P2/P3 são condicionais e ficam fora do caminho crítico (Core Release Path = Fase 0 → A → B → C → D → F). Um item P2/P3 é promovido a P1/blocker somente se demonstrar risco concreto a segurança, autoridade financeira, device binding, privacidade, confirmação ou reconciliação confiável (ou violar INV-01..INV-10). Todo item P2/P3 termina o projeto como `concluído` ou `deferido explicitamente` (risco avaliado, nenhum invariante crítico afetado, follow-up registrado).

## Fase 0 — Contratos, registry e suíte compartilhada (RED)

### T0.1 — Approval Tool Contract (registry canônico de tools V2)

- **Objetivo:** única fonte de contrato do protocolo de aprovação `{ tool, inputSchema, approvalRequired, executor }` para `transactions.expense.create` e `transactions.income.create` (SPEC §7.5). **Não** inclui `affectedTargets`: os efeitos de reconciliação vivem no Mutation Effects Registry (T3.2, SPEC §15.1.1).
- **Arquivos prováveis:** `apps/api/src/approvals/tool-registry.ts` (novo), reuso de `apps/api/src/writes/types.ts:91-110`; testes em `apps/api/tests/approvals/`.
- **RED primeiro:** registry sem os dois tools falha; tool fora do registry é rejeitado (`tool.not_allowed`); tentativa de registrar `affectedTargets` no approval contract falha (separação é testada).
- **Mudança esperada:** executor deixa de ser `if tool===...` (`routes/index.ts:157,163`) e passa a consumir o registry.
- **Risco:** duplicar schemas em vez de reutilizar `createExpenseInputSchema`/`createIncomeInputSchema`; arrastar writes normais para dentro do approval contract.
- **Aceite:** nenhum tool mutável do TED fora do registry; schemas não duplicados; writes normais permanecem fora.
- **Validação:** suite focada `apps/api`.
- **Dependência:** primeira tarefa; desbloqueia T1.4, T3.2.
- **Responsável:** Architect (contrato) + Coder.

### T0.2 — Contratos compartilhados: Presentation, Receipt/Effects e MutationDraft

- **Objetivo:** tipos canônicos em `packages/llm-contracts` para o card (SPEC §16), o receipt + Mutation Effects Registry (SPEC §15.1/§15.1.1) e a superfície de clarification do MutationDraft, incluindo os estados do handoff `proposing` (SPEC §7.8).
- **Arquivos prováveis:** `packages/llm-contracts/src/`; consumo posterior em `apps/pwa/src/features/ted/TedApprovalCard.tsx`, `apps/agent`.
- **RED primeiro:** presentation exige `tool`, `title`, `expiresAt`, `warnings`; receipt exige `mutationId`, `mutationKind`, `status`, `affectedTargets` válidos no Mutation Effects Registry; `operationId` é opcional e só vale em receipt de origem TED (PendingOperation) — receipt de write normal sem `operationId` é válido; `mutationKind` sem efeitos registrados falha; classificação `no-refresh` precisa ser explícita; o tipo de draft exposto ao canal (pending clarification) não carrega autoridade nem attestation; `attestation`/hash são proibidos em todo tipo do browser.
- **Mudança esperada:** apenas contratos + testes; funcional vem em T1.3, T3.2 e T3.4.
- **Risco:** antecipar implementação e mascarar a baseline.
- **Aceite:** tipos versionados e testes falhando pelo motivo correto.
- **Validação:** suite de contracts.
- **Dependência:** paralela a T0.1; desbloqueia T1.3, T3.2, T3.4.
- **Responsável:** Coder.

### T0.3 — Suíte state-machine compartilhada (in-memory + PostgreSQL)

- **Objetivo:** mesma suíte de comportamento contra `InMemoryPendingStore` e `createPostgresPendingOperationV2Store`, eliminando a divergência H-03 in-memory vs Postgres (SPEC §25.2).
- **Arquivos prováveis:** `apps/api/tests/approvals/pending-v2-contract.test.ts` (novo), substituição do stub `pending-v2-postgres-red.test.ts`; infra Postgres do job `postgres` do CI.
- **RED primeiro:** divergências atuais falham (ex.: segundo `confirm()` em `confirmed` retorna attestation no in-memory e nada no Postgres); transição proibida `executing → confirmed` falha em ambos.
- **Mudança esperada:** harness parametrizado; stub de 8 linhas removido.
- **Risco:** infra Postgres local indisponível — usar o mesmo mecanismo do job CI.
- **Aceite:** zero divergência de comportamento entre os stores nas transições §13.
- **Validação:** `pnpm --filter pi-finance-api test` + job postgres.
- **Dependência:** paralela a T0.1/T0.2; desbloqueia T2.x.
- **Responsável:** Tester.

### T0.4 — Documentação e governança

- **Objetivo:** ADRs de decisão e registro canônico da V3.
- **Arquivos prováveis:** `docs/adr/ADR-012-approval-contract-propose-validation-and-effects-registry.md` (novo: Approval Tool Contract, validação no propose, separação do Mutation Effects Registry, semântica de identidade do MutationReceipt — `mutationId`/`operationId`), `docs/adr/ADR-013-execution-recovery-lease.md` (novo), `docs/adr/ADR-014-mutation-draft-multi-turno.md` (novo: invariantes do draft, ciclo de vida com `proposing`, TTL e protocolo recuperável de handoff draft → PendingOperation — §7.8); atualizar índice `docs/adr/README.md` (inclui 010/011 ausentes); incluir a SPEC V3 e o plano na lista `scripts/lint-docs.mjs`; linha V3 no `docs/ROADMAP.md`.
- **RED primeiro:** `governance:check`/`docs:lint` não se aplica (docs); validação é revisão.
- **Mudança esperada:** decisões de registry/propose, protocolo TX1/TX2/lease e MutationDraft registradas antes do código.
- **Risco:** dois formatos de ADR coexistindo — adotar o formato pt-BR de 010/011 e atualizar o template do README.
- **Aceite:** ADRs indexados; ROADMAP com linha V3; novos docs lintáveis.
- **Validação:** `pnpm docs:lint`, `pnpm governance:check`.
- **Dependência:** paralela a T0.1–T0.3.
- **Responsável:** Coder + Planner.

## Fase 1 — BLOCO A (P0): restaurar o fluxo financeiro do TED

### T1.1 — Resolução autoritativa de entidades e missing fields reais

- **Objetivo:** `accountId`/`categoryId` resolvidos por lookup autoritativo antes do propose; clarificação quando ambíguo (SPEC §7.2, §7.3, §7.6).
- **Arquivos prováveis:** `apps/agent/src/mutations/financial-parser.ts`, novo `apps/agent/src/mutations/entity-resolver.ts`, `apps/agent/src/orchestration/conversation-orchestrator.ts:209-222`, `apps/agent/src/orchestration/intent-router.ts:64`, `apps/agent/src/finance-chat-agent.ts:970-986`.
- **RED primeiro:** "Gastei R$ 50 no mercado" com 2+ contas → clarification e **nenhuma** pending operation; conta única → resolução automática; `categoryQuery` sem match único → clarification; `missingFields` reflete o que falta de verdade.
- **Mudança esperada:** resolver consulta contas/categorias via tools READ existentes do Agent (nada de escolha silenciosa do LLM); proposta só segue com args canônicos completos.
- **Risco:** resolver fantasia correspondência sem lookup real — proibir match por similaridade sem verificação.
- **Aceite:** teste §25.3 "mutação completa" passa nos dois cenários (incompleta → clarification; completa → exatamente 1 transaction).
- **Validação:** Agent tests + evals determinísticas de mutação.
- **Dependência:** T0.1; desbloqueia T1.3, T1.4 (T1.2 é paralela).
- **Responsável:** Coder; reviewer depois.

### T1.2 — Idempotência de turno estável

- **Objetivo:** retries do mesmo envio reutilizam o mesmo id (SPEC §7.7). Precede o MutationDraft porque a criação/recuperação de draft é idempotente por turno.
- **Arquivos prováveis:** `apps/pwa/src/lib/api/agent-client.ts` (gerar/persistir id por mensagem), `apps/agent/src/orchestration/conversation-orchestrator.ts:78`, `apps/agent/src/finance-chat-agent.ts:1099-1101`, reuso de `apps/agent/src/tools/intention-ledger.ts:10-17`.
- **RED primeiro:** mesma mensagem reenviada após timeout de HTTP → uma única proposal; reload da página não gera segunda proposal para o mesmo turno.
- **Mudança esperada:** PWA gera `messageId` estável (não `Date.now()`), Agent o usa como base do `idempotencyKey`.
- **Risco:** id estável demais bloqueando mensagens legítimas repetidas — escopar por conteúdo+turno conforme ADR-012.
- **Aceite:** duplo-propose em retry impossível; `idempotency.conflict` só em colisão real.
- **Validação:** Agent + PWA tests.
- **Dependência:** paralela a T1.1; desbloqueia T1.3.
- **Responsável:** Coder.

### T1.3 — MutationDraft multi-turno

- **Objetivo:** preservar a intenção financeira incompleta entre turnos de clarificação, sem inferência livre do LLM nem releitura insegura do histórico (SPEC §7.8; extensão de H-01), com handoff recuperável para PendingOperation (INV-09).
- **Arquivos prováveis:** novo `apps/agent/src/mutations/mutation-draft.ts` (contrato + store), integração em `apps/agent/src/orchestration/conversation-orchestrator.ts` e `apps/agent/src/mutations/entity-resolver.ts` (T1.1), storage no Durable Object da conversa; tipos de superfície em `packages/llm-contracts` (T0.2).
- **RED primeiro:** os cenários §25.3.1 falham hoje: "Gastei R$ 85 no mercado" → falta conta → draft criado → "Nubank" → draft recuperado → proposal completa; draft expirado → resposta curta não executa nada; 2 drafts possíveis → desambiguação, nenhum propose; "cancela" → draft descartado, nenhuma PendingOperation; nova intenção incompatível → não herda campos; reenvio do mesmo turno → nenhum draft duplicado; duas continuações concorrentes → exatamente uma proposal; continuação concorrente com "cancela" → primeiro evento vence; reenvio após consumo → proposal existente reutilizada. Handoff (casos §25.3.2): A — resposta perdida após a API persistir → retry com a MESMA chave → mesma proposal, draft `consumed`; B — crash antes da chamada → restart → propose com a mesma chave → 1 PendingOperation; C — erro definitivo → draft `discarded (propose_rejected)`, nunca `consumed` silenciosamente; D — propose concorrente com a mesma chave → uma única PendingOperation; E — "cancela" durante `proposing` → desfecho resolvido antes de responder.
- **Mudança esperada:** draft com `workspaceId/actorId/deviceId/conversationId`, `resolvedArgs/missingFields`, TTL obrigatório; estados `active → proposing → consumed | discarded` e `active → discarded | expired | replaced`; `proposalIdempotencyKey` derivada do `draftId` e reutilizada em toda reemissão; `proposalId` persistido quando conhecido; **consumo atômico** (compare-and-set no storage do DO — SPEC §7.8) garantindo um único proponente, e o CAS + propose idempotente produzem 0 ou 1 PendingOperation (não há atomicidade entre DO e API — protocolo recuperável §7.8); nunca é PendingOperation, nunca gera attestation, nunca contorna a validação canônica; a chamada propose do draft passa integralmente por T1.4.
- **Risco:** draft virar estado autoritativo ou job genérico — proibido por §7.8; escopo restrito a clarificação de mutação.
- **Aceite:** fluxo §34 ponta a ponta ("Em qual conta?" → proposal completa); todos os cenários §25.3.1 verdes.
- **Validação:** Agent tests + evals determinísticas de mutação.
- **Dependência:** T1.1, T1.2, T0.2 e T1.4 (a superfície propose idempotente + validada é pré-requisito dos casos de handoff A–E; a validação da API é por payload, então T1.4 não depende do store de draft); desbloqueia T1.5, T1.6.
- **Responsável:** Coder; security-reviewer nos invariantes do draft.

### T1.4 — Validação por tool no endpoint propose

- **Objetivo:** nenhuma pending operation inválida no banco (SPEC §7.4), incluindo args vindos de draft completado (§7.8).
- **Arquivos prováveis:** `apps/api/src/routes/pending-operations.ts:59-75`, `apps/api/src/approvals/pending-v2.ts:70,110`, consumo de `tool-registry.ts`; corrigir `apps/api/tests/routes/pending-operations-v2.test.ts:61,86`.
- **RED primeiro:** `normalizedArgs: {}` para expense → 422/400; args válidos → 201; payload válido para tool errado → rejeitado; args de draft completado passam pela mesma validação (nenhum atalho); reemissão do propose com a mesma chave e mesmo payload retorna a MESMA PendingOperation (replay determinístico — nunca segunda linha); mesma chave com payload divergente → 409 `idempotency.conflict`.
- **Mudança esperada:** propose valida contra `inputSchema` do Approval Tool Contract antes de persistir; dedup por `(workspaceId, idempotencyKey)` + `proposal_hash` exercida por teste como mecanismo de recuperação do handoff (§7.7.1); testes de rota atualizados para o contrato real.
- **Risco:** quebrar propostas legítimas do agent — alinhar T1.1/T1.3/T1.4 na mesma suíte.
- **Aceite:** impossível persistir proposal que o executor rejeitaria.
- **Validação:** API tests + suíte T0.3.
- **Dependência:** T0.1, T1.1 (a validação é por payload canônico e não depende do store de draft — executar ANTES de T1.3, que consome esta superfície no handoff).
- **Responsável:** Coder; security-reviewer na superfície de validação.

### T1.5 — PendingOperationCoordinator e decisão unificada

- **Objetivo:** botão e linguagem natural na mesma máquina de decisão; listagem autoritativa; cancelamento persistido (SPEC §8); cancelamento/interrupção descarta draft ativo (§7.8, §8.5).
- **Arquivos prováveis:** novo `apps/agent/src/orchestration/pending-operation-coordinator.ts`; `apps/agent/src/finance-chat-agent.ts:1116-1121` (criar `MutationApiClient` também para turnos confirm/cancel); `conversation-orchestrator.ts:225-251`; `confirmation-resolver.ts:10`; API: novo `GET /pending-operations/v2/active` em `apps/api/src/routes/pending-operations.ts` + store em `pending-v2.ts`.
- **RED primeiro:** "sim" sem pendentes → resposta determinística; "sim" com 1 pendente → confirma e executa exatamente uma vez **sem** `pendingOperationIds` do cliente; "sim" com 2+ → desambiguação, nada executado; "cancela" com pendente → `execution_status = cancelled` na API antes de responder; "cancela" com draft ativo e sem pendente → draft descartado, nenhuma PendingOperation; "cancela" durante handoff em `proposing` → desfecho do propose resolvido pela mesma `proposalIdempotencyKey` antes de responder (proposal existe → cancelamento autoritativo; não existe → draft descartado; desfecho desconhecido → resposta inconclusiva, nunca "cancelado" — INV-10); retry por NL ("tenta de novo") sobre operação `failed` → mesmo Decision Service → API retry com nova attestation → execução única; `pendingOperationIds` do body ignorado como autoridade; `resolveDecisionTarget` considera draft ativo e pendentes autoritativas.
- **Mudança esperada:** coordinator resolve alvo por `GET /v2/active` (workspace/actor/device da identidade autenticada) e pelo draft ativo do contexto; RPC do botão e NL convergem no mesmo `decide`.
- **Risco:** RPC do botão e NL divergirem de novo — a suíte deve exercitar os dois caminhos com as mesmas assertions.
- **Aceite:** cenários §25.3 (confirmação natural, cancelamento natural, múltiplas pendentes) + interações com draft (§25.3.1) + retry conversacional (`failed → retry → confirmed → execute` exatamente uma vez) verdes.
- **Validação:** Agent tests + API tests + suíte state-machine.
- **Dependência:** T1.3, T1.4; paralelizável internamente (endpoint API antes do coordinator).
- **Responsável:** Coder; reviewer no fim do bloco A.

### T1.6 — E2E real Agent → API → PostgreSQL

- **Objetivo:** exercitar expense e income com `WriteStore` real, sem stub (SPEC §25.5), incluindo o caminho multi-turno com draft.
- **Arquivos prováveis:** novo `apps/api/tests/integration/pending-v2-e2e.test.ts` (ou suíte existente de integração); reuso da infra Postgres de T0.3.
- **RED primeiro:** com o código atual, proposta real de expense falha no execute (sem `accountId`) — o teste documenta o P0 e vira critério do fix.
- **Mudança esperada:** fluxo completo parse → draft/clarificação → propose → card args → confirm → exatamente 1 transação no PostgreSQL; cancelamento nunca chama executor.
- **Risco:** flakiness de integração — isolamento por schema/transaction por teste.
- **Aceite:** os cenários §25.3, o fluxo feliz §25.3.1, os casos A e E do handoff (§25.3.2) e o retry conversacional verdes contra Postgres real.
- **Validação:** suite integração + job postgres do CI.
- **Dependência:** T1.1–T1.5.
- **Responsável:** Tester.

**Gate do BLOCO A:** nenhum rollout antes de A completo; reviewer emite APPROVED para o bloco.

## Fase 2 — BLOCO B (P1): hardening transacional

### T2.1 — Migration V052

- **Objetivo:** colunas de recuperação e lease (SPEC §12).
- **Arquivos prováveis:** `apps/api/src/read-models/sql/V052__pending_operation_execution_recovery.sql`; updates em `pending-v2.ts` (mapV2, checks); migration integrity test.
- **RED primeiro:** store atual sem as colunas falha nos testes novos de lease/attempt.
- **Mudança esperada:** colunas `attestation_issued_at`, `execution_claimed_at`, `execution_lease_expires_at`, `execution_attempt_count DEFAULT 0`, `failure_code`, `mutation_id` (identidade do MutationReceipt do caminho TED, §12/§15.1) + índice parcial `executing AND lease < now()`; sem plaintext/stack/prompt.
- **Risco:** incompatibilidade de rollback — colunas só acrescentam, checks preserve.
- **Aceite:** migration aplica e reverte limpa; in-memory e Postgres atualizados juntos.
- **Validação:** migration integrity + suíte T0.3.
- **Dependência:** T0.3.
- **Responsável:** Coder.

### T2.2 — Confirm recuperável (re-emissão controlada)

- **Objetivo:** H-03 — novo `confirm` em `confirmed` com attestation não consumida reemite e invalida a anterior (SPEC §9).
- **Arquivos prováveis:** `apps/api/src/approvals/pending-v2.ts:78` (confirm Postgres) e `:122-130` (confirm in-memory).
- **RED primeiro:** cenário "confirm response loss" da suíte falha hoje (segundo confirm sem token); cenário nomeado **restart AFTER confirm BEFORE claim** (status `confirmed`, attestation não consumida) recupera exclusivamente por reemissão de attestation (§9) — nenhuma etapa de lease participará desse caminho (lease não existe antes do claim).
- **Mudança esperada:** reemissão com substituição de hash; recusa para `executing/succeeded/failed/cancelled/expired`; teste de não regressão provando que `retry` (failed→confirmed) já reemite (`:80` Postgres; `:158-165` in-memory — correção §35.3, item 1 da SPEC).
- **Risco:** janela entre invalidar antigo e emitir novo — fazer na mesma transação.
- **Aceite:** exatamente uma attestation válida em qualquer instante.
- **Validação:** suíte state-machine + fault injection.
- **Dependência:** T2.1.
- **Responsável:** Coder; security-reviewer.

### T2.3 — Claim em TX separada (TX1/executor/TX2)

- **Objetivo:** H-04 — falha do executor nunca ressuscita attestation consumida (SPEC §10).
- **Arquivos prováveis:** `apps/api/src/approvals/pending-v2.ts:79` (split do execute), `apps/api/src/approvals/executor.ts`, `apps/api/src/routes/index.ts:154-170`.
- **RED primeiro:** fault injection "executor throws" — hoje DB volta a `confirmed` com attestation reaparecendo.
- **Mudança esperada:** TX1 claim commit; executor fora; TX2 persiste `succeeded`/`failed` + `failure_code` sanitizado; erro só retornado após TX2.
- **Risco:** executor parcialmente aplicado sem estado `failed` — coberto por T2.4; idempotencyKey do WriteStore protege o write.
- **Aceite:** replay da attestation antiga → `403 approval.attestation_replayed`; DB nunca volta atrás.
- **Validação:** fault injection §25.4 (3 primeiros cenários).
- **Dependência:** T2.1, T2.2.
- **Responsável:** Coder; security-reviewer na attestation.

### T2.4 — Lease e reconciliação de `executing` abandonado

- **Objetivo:** H-05 — crash/restart **AFTER claim BEFORE executor/finalização** (status `executing`) é recuperável (SPEC §11); `confirmed` nunca é recuperado por lease.
- **Arquivos prováveis:** `pending-v2.ts` (lease no claim, checagem em retry/confirm), novo reconciler (endpoint Agent/API controlado ou path interno), índice de T2.1.
- **RED primeiro:** fault injection "restart AFTER claim BEFORE executor/finalização" — hoje operação fica `executing` eternamente; asserção negativa: nenhum caminho de lease/reconciler atua sobre status `confirmed` (recuperação de `confirmed` é exclusivamente a reemissão de attestation de T2.2/§9).
- **Mudança esperada:** lease válida → `approval.execution_in_progress`; expirada → renovar, incrementar attempt, reexecutar com a **mesma** idempotencyKey; terminais nunca retornam.
- **Risco:** reconciler virar segunda via de execução — mesmo executor, mesma chave, sem nova aprovação.
- **Aceite:** crash window fecha com 0 ou 1 efeito financeiro total; attempt count auditável.
- **Validação:** fault injection cenário 4 + suíte state-machine.
- **Dependência:** T2.3.
- **Responsável:** Coder; reviewer no fim do bloco B.

### T2.5 — Suíte de fault injection consolidada

- **Objetivo:** os cenários §25.4 como testes permanentes contra in-memory e Postgres, com classes de falha nomeadas — `response loss`, `transport timeout`, `agent crash` (janelas draft `proposing`, pós-confirm-pré-claim e pós-claim), `API crash` (idem), `PostgreSQL failure` (claim/TX2), `executor failure`, `browser reload` — sem testes genéricos de "restart". Inclui: API restart pós-confirm (recuperação por reemissão de attestation, §9 — sem lease), API crash pós-claim (lease/reconciler, §11), falha do PostgreSQL em claim/TX2, duplo submit e os casos A–E do handoff draft → PendingOperation (§25.3.2, suítes de T1.3/T1.4/T1.5 quando no Agent; aqui quando na fronteira da API).
- **Arquivos prováveis:** `apps/api/tests/approvals/pending-v2-fault.test.ts` (novo).
- **Aceite:** confirm-loss (sem lease), restart AFTER claim (lease), replay, executor-fail, API/PG failure, transport timeout, double-submit e handoff A–E verdes nos dois stores; restart AFTER confirm BEFORE claim e restart AFTER claim BEFORE finalização testados como cenários distintos; nenhuma dupla mutação nem confirmação falsa.
- **Dependência:** T2.2–T2.4.
- **Responsável:** Tester.

## Fase 3 — BLOCO C (P1): verdade e consistência

### T3.1 — Grounding fail-closed

- **Objetivo:** H-06 — remover pass-through sem evidência para qualquer pergunta financeira (SPEC §14).
- **Arquivos prováveis:** `apps/agent/src/orchestration/conversation-orchestrator.ts:150-158`, `apps/agent/src/orchestration/channel-evidence.ts:131-142,167-178,289-290`, `apps/agent/src/responses/grounded-response.ts`.
- **RED primeiro:** "quanto tenho?" com evidence null → hoje cai no LLM sem evidência; deve responder mensagem determinística; `all error` idem; `empty` legítimo continua funcional; prompt injection pedindo saldo inventado é negado.
- **Mudança esperada:** perguntas financeiras mapeadas obrigatoriamente para reads; fallback determinístico; empty ≠ error preservado.
- **Risco:** classificação de "pergunta financeira" muito larga quebrar small talk — começar pelo domínio `DOMAIN_DEFAULT_READ`.
- **Aceite:** cenários §25.7 verdes, nenhum número inventado.
- **Validação:** Agent tests + evals determinísticas de grounding.
- **Dependência:** independente; pode paralelizar com Fase 2 (arquivos distintos).
- **Responsável:** Coder; security-reviewer no cenário de injection.

### T3.2 — MutationReceipt e Mutation Effects Registry

- **Objetivo:** receipt determinístico pós-mutação, com identidade `mutationId` (universal, gerada pela API) e `affectedTargets` vindos do Mutation Effects Registry `{ mutationKind → affectedTargets }` — separado do Approval Tool Contract e comum aos caminhos TED (com `operationId`) e writes normais (sem `operationId`) (SPEC §15.1/§15.1.1).
- **Arquivos prováveis:** `apps/api/src/approvals/` (emitir no TX2 success), camada de writes normais da API (emitir pós-sucesso dos writes §15.6), novo `apps/api/src/reconciliation/effects-registry.ts`, `packages/llm-contracts` (T0.2).
- **RED primeiro:** execute/write bem-sucedido sem receipt falha; receipt de write normal sem `operationId` é válido, e receipt do caminho TED sem `operationId` falha; `mutationId` ausente ou duplicado para mutações distintas falha; `mutationKind` sem efeitos registrados falha; sucesso sem política de reconciliação falha, salvo classificação explícita `no-refresh`; `affectedTargets` derivado de LLM ou hardcoded em componente falha.
- **Mudança esperada:** TED mutation → approval contract → executor → effects → receipt (`mutationId` gerado no TX2, persistido em `mutation_id` de T2.1, `operationId` preenchido); write normal → API mutation → effects → receipt (`mutationId` gerado no sucesso da resposta, sem `operationId`); ambos consumidos pelo mesmo reconciler (T3.3); writes normais não viram approval tools.
- **Risco:** registros incompletos silenciando reconciliação — teste de cobertura fecha o gap.
- **Aceite:** cada mutação suportada possui efeitos registrados; zero `affectedTargets` espalhados em componentes; receipt nunca derivado do LLM.
- **Validação:** API tests + teste de cobertura do registry (§25.2).
- **Dependência:** T0.2, T2.3.
- **Responsável:** Coder; reviewer na separação dos registries.

### T3.3 — MutationReconciler na PWA

- **Objetivo:** H-07 — reconciliação única pós-mutação, incluindo pós-TED; stale em falha (SPEC §15).
- **Arquivos prováveis:** novo `apps/pwa/src/lib/state/mutation-reconciler.ts`; integração em `app-state-context.tsx:1622-1684`; `TedChat.tsx:379` (`onResolved` → reconciler); mutators dos writes comuns (`:538-1361`).
- **RED primeiro:** aprovação no TED não atualiza `dashboardSummary`; falha de refresh não marca stale; ambos falham hoje.
- **Mudança esperada:** reconciler consome receipt/`affectedTargets` das duas origens — TED (com `operationId`) e writes normais (sem `operationId`, válidos por `mutationId`/`mutationKind`) — sem conhecer detalhes do protocolo de aprovação; dedup opcional de receipts repetidos por `mutationId`; refaz só o necessário, sem adivinhar targets; banner stale + retry de refresh; sem rollback de mutação persistida.
- **Risco:** espalhar refresh manual em componentes — proibido; tudo via reconciler.
- **Aceite:** testes §25.6 (approval success atualiza Home; write comum idem; stale exibido).
- **Dependência:** T3.2.
- **Responsável:** Coder; tester para os cenários de UI.

### T3.4 — Card de aprovação com dados financeiros

- **Objetivo:** H-10 — `PendingOperationPresentation` derivada dos args canônicos hash-bound (SPEC §16).
- **Arquivos prováveis:** projeção na API/Agent (`pending-v2.ts` `mapV2` ou endpoint de presentation), `TedApprovalCard.tsx:6-11,76`, `agent-client.ts:47-59`.
- **RED primeiro:** card sem valor/conta/categoria/data falha; valor do card divergente do `normalizedArgs` falha; attestation no payload do browser falha (regressão).
- **Mudança esperada:** card renderiza Valor/Conta/Categoria/Data + botão "Confirmar R$ X"; `summary` do LLM deixa de ser a única representação.
- **Risco:** vazar dado além do necessário — projection explícita, nunca o `normalizedArgs` cru.
- **Aceite:** teste de igualdade semântica card ↔ args executados (INV-02); tabela de estados visíveis (SPEC §16) com labels/comportamento pt-BR por estado (clarification/proposed/executing/succeeded/failed/cancelled/expired/stale) testada dentro do TED; testes de attestation continuam passando.
- **Dependência:** T0.2, T1.4.
- **Responsável:** Coder; reviewer no fim do bloco C.

## Fase 4 — BLOCO D (P1): TED frontend

### T4.1 — Ciclo de vida do microfone

- **Objetivo:** H-08 — gravação só existe de fato; cleanup único e idempotente (SPEC §17).
- **Arquivos prováveis:** `apps/pwa/src/features/ted/TedChat.tsx:38,43-44,98-102,160-199,450-455`; novo hook `use-recording-state.ts`.
- **RED primeiro:** permissão negada mostra `gravando` (falha hoje); fechar chat não para tracks (falha hoje); unmount/workspace switch não limpam.
- **Mudança esperada:** `RecordingState` 5 estados; `setRecording` só após `recorder.start`; `cleanupMedia()` idempotente nos 6 gatilhos §17.3.
- **Aceite:** testes §25.6 de mic (close/unmount/workspace/permission) verdes.
- **Dependência:** independente; paralela ao resto da Fase 3.
- **Responsável:** Coder; tester.

### T4.2 — Capability gate de anexos e cleanup de blobs

- **Objetivo:** H-09 — UI não promete capability inexistente (SPEC §18).
- **Arquivos prováveis:** `TedChat.tsx:127,143,185,234-240,407-424,431-454`; config de capability (env/feature flag).
- **RED primeiro:** botões imagem/PDF/áudio ativos sem ingestão real falham; object URL não revogada após remoção/close falha.
- **Mudança esperada:** anexos desabilitados/ocultos enquanto não houver upload autenticado; `revokeObjectURL` nos 7 gatilhos §18.4; pipeline multimodal real fica fora do escopo (§33).
- **Aceite:** nenhum botão sem função real; nenhum blob vazado.
- **Dependência:** independente.
- **Responsável:** Coder; security-reviewer na decisão de capability.

## Fase 5 — BLOCO E (P2, condicional): experiência e segurança

**Política (SPEC §32):** itens desta fase NÃO são obrigatórios para o release V3 e não dependem do caminho crítico. Cada item termina como `concluído` ou `deferido explicitamente` (risco avaliado, nenhum invariante crítico afetado, follow-up registrado). Promoção a P1/blocker somente se implementação/auditoria demonstrarem risco concreto a segurança, autoridade financeira, device binding, privacidade, confirmação ou reconciliação confiável.

| Tarefa | Classificação | Análise de promoção |
|---|---|---|
| T5.1 chat resiliência | P2 deferível | UX de recuperação; idempotência financeira já garantida por T1.2; nada promove por padrão |
| T5.2 overlay a11y | P2 deferível | Acessibilidade; sem impacto em autoridade/confirmação |
| T5.3 pendentes visíveis | P2 deferível | Ausência do indicador não é estado enganoso; decisões continuam no TED |
| T5.4 cookie-first | P2 deferido com condições | `credentials: include` já existe (SPEC §35.3, item 2); V3 não adiciona segredo em `localStorage`; risco crítico só na retirada do bearer. **Promove a P1** se qualquer mudança da V3 exigir novo segredo de longa duração em `localStorage` ou se a auditoria (T6.1) encontrar vetor concreto de exposição |
| T5.5 pequenos ajustes | P2/P3 deferível | SPEC §24; nenhum bloqueia release |

### T5.1 — Resiliência do chat

- **Objetivo:** H-13 — optimistic para texto, histórico fail-soft, retry preserva draft (SPEC §19).
- **Arquivos prováveis:** `TedChat.tsx:36,63-78,210-226,248-252,299`.
- **RED primeiro:** falha de `fetchAgentHistory` com histórico existente zera mensagens (falha hoje); erro de envio perde draft+anexos (falha hoje).
- **Mudança esperada:** optimistic universal sending→sent/failed+[Tentar novamente]; aviso de refresh com histórico preservado; status pt-BR; dica de teclado oculta em touch.
- **Dependência:** após T1.2 (id estável do turno).
- **Aceite/Validação:** PWA tests — falha de refresh preserva histórico, retry preserva draft+anexos, optimistic para texto; status pt-BR; §25.6.
- **Responsável:** Coder; tester.

### T5.2 — Acessibilidade de overlays

- **Objetivo:** H-12 — primitive de foco compartilhada (SPEC §21).
- **Arquivos prováveis:** `apps/pwa/src/lib/ui/overlay-a11y.ts`, `BottomSheet.tsx`, `ConfirmActionDialog.tsx:48-56` (padrão a generalizar), `TedChat.tsx:275-284`.
- **Mudança esperada:** initial focus/trap/restore/Escape/inert/reduced motion; sem biblioteca UI nova.
- **Dependência:** independente.
- **Aceite/Validação:** testes de foco por overlay (initial/trap/restore/Escape); nenhum foco escapando ao fundo; sem biblioteca nova.
- **Responsável:** Coder; tester para a11y.

### T5.3 — Visibilidade de operações pendentes

- **Objetivo:** H-14 — pendingCount real e tela de Aprovações útil (SPEC §22).
- **Arquivos prováveis:** `HeroSection.tsx:129-134`, `HomePage.tsx:139-142`, `PendingOperationsPage.tsx:32-46`; consumo do `GET /v2/active` (T1.5) via PWA ou contador do próprio bootstrap.
- **Mudança esperada:** "1 aprovação pendente" com deep-link para o TED focado; decisões (se listadas) sempre via o mesmo Decision Service — sem segundo executor.
- **Dependência:** T1.5.
- **Aceite/Validação:** pendingCount real na Home; deep-link abre o TED focado; decisões (se listadas) exclusivamente via Decision Service único.
- **Responsável:** Coder.

### T5.4 — Migração cookie-first

- **Objetivo:** H-11 — sessão sem bearer funcional de longa duração (SPEC §20).
- **Arquivos prováveis:** `apps/pwa/src/lib/api/token-store.ts`, `AuthGate.tsx`, `RootProviders.tsx:28-34,62`, `client.ts:73-151`, `snapshot-store.ts:34-46`; inventário device binding (ADR-011).
- **Mudança esperada:** `SessionState` 5 estados; API disponível = sessão válida (não presença de bearer); identificador de snapshot estável não secreto; E2E §20.6 sem bearer em `localStorage`. `credentials: include` já existe (correção §35.3, item 2) — escopo é o gate e o inventário.
- **Risco:** quebrar device binding do Agent — inventário completo antes de remover o bearer; migração atrás de flag até o E2E provar.
- **Dependência:** após BLOCO A–D estáveis; executada somente se não deferida conforme a política da Fase 5 (promoção a P1 nos gatilhos definidos na tabela acima).
- **Responsável:** Coder; security-reviewer obrigatório.

### T5.5 — Pequenos ajustes aprovados

- **Objetivo:** SPEC §24 (useLayoutEffect→useEffect, touch targets ~44px, FAB popover/ARIA, nomenclatura de contas, status pt-BR).
- **Aceite/Validação:** verificação por item em review; nenhum item sozinho bloqueia release.
- **Dependência:** junto dos workstreams correspondentes; nenhum bloqueia release.
- **Responsável:** Coder.

## Fase 6 — BLOCO F: release (Core Release Path = Fase 0 → A → B → C → D → F; BLOCO E condicional)

### T6.1 — Auditoria independente pós-implementação

- **Objetivo:** auditor diferente do implementador rastreia PWA → Agent → Pending Operation → API → PostgreSQL → reconciliação e responde "o que o usuário viu é exatamente o que foi executado?" (SPEC §29 Fase 3).
- **Responsável:** Reviewer + Security-reviewer (Planner coordena; sem overlap com quem codificou o bloco auditado).
- **Aceite:** sem P0/P1 aberto.

### T6.2 — Validação local completa

- **Objetivo:** `pnpm validate:final` (VAL.1–VAL.13) verde + suíte state-machine dual-store + E2E Postgres + evals determinísticas.
- **Dependência:** Fase 0 + Fases 1–4 (Core Release Path). Itens da Fase 5 entram neste gate somente se promovidos a P1 conforme SPEC §32; os demais seguem como `deferido explicitamente` com follow-up registrado.
- **Responsável:** Tester.

### T6.3 — Evals com modelos reais

- **Objetivo:** os 10 cenários §26 contra o modelo configurado (pendente desde a V2).
- **Aceite/Validação:** relatório de evals reais aprovado nos 10 cenários, anexado ao relatório final.
- **Dependência:** T6.2.
- **Responsável:** Tester + Planner (custo/aprovação).

### T6.4 — CI remoto verde e proteção da main

- **Objetivo:** H-16 — resolver billing do GitHub Actions (ação do owner), re-executar CI + PWA CI no SHA final, configurar ruleset/branch protection (required checks CI+PWA CI, sem force push/delete) (SPEC §27).
- **Risco:** billing é bloqueador externo — escalar ao owner antes da janela de release; não alterar workflows para contornar.
- **Aceite/Validação:** CI + PWA CI verdes no SHA final; ruleset/branch protection ativos na `main`.
- **Responsável:** Planner escala ao usuário; Coder prepara o ruleset como IaC/script quando possível.

### T6.5 — Rollout e smoke

- **Objetivo:** ordem §29 Fase 4: V052 → API (health/ready) → Agent → PWA → E2E smoke; atualizar runbook de deploy/rollback (reconciliar `executing` antes de qualquer rollback de state machine, SPEC §30).
- **Dependência:** T6.1–T6.4 verdes no mesmo SHA; autorização explícita de deploy.
- **Aceite/Validação:** `/health` + `/ready` 200 pós-migration; smoke read-only verde; runbook de deploy/rollback atualizado.
- **Responsável:** Planner com autorização do usuário.

## Riscos transversais

| Risco | Mitigação |
|---|---|
| Billing do GitHub Actions continuar bloqueado | T6.4 escalado ao owner desde o início do BLOCO A; validação local não depende de CI remoto |
| In-memory e Postgres divergirem de novo | T0.3 impõe suíte única; qualquer divergência quebra o gate |
| Reconciler virar segunda via de execução | Lease só renova o mesmo executor/idempotencyKey; teste de duplicidade no T2.5 |
| Card expor dado demais | Projection explícita `PendingOperationPresentation`; security-reviewer no T3.4 |
| Escopo crescer (multimodal, refactor geral) | Não objetivos §5; P3 só depois do hardening |
| P2 tratado como bloqueador implícito (ou omitido do DoD) | Política §32 + tabela da Fase 5; T6.2 só exige Fase 5 se houver promoção a P1; deferral formal com follow-up |
| Draft sobreviver a cancelamento ou contaminar intenção nova | Estados `discarded/replaced` + cenários §25.3.1 no T1.3/T1.5 |
| Janela draft consumido × propose sem resposta (DO ↔ API não é transacional) | Protocolo `proposing` + `proposalIdempotencyKey` estável + reconciliação no restart (SPEC §7.8, INV-09); casos A–E de §25.3.2 obrigatórios em T1.3/T1.4/T1.5 |
| Recovery de `confirmed` confundido com recovery de `executing` | Cenários distintos nomeados (restart AFTER confirm BEFORE claim sem lease × restart AFTER claim com lease) em T2.2/T2.4/T2.5 (SPEC §9/§11/§25.4) |

## Critério de conclusão

DoD §31 da SPEC integralmente resolvido: itens P0/P1 verdes e todos os itens **[P2]** com disposição explícita (`concluído` OU `deferido` com risco avaliado, nenhum invariante crítico afetado e follow-up registrado — SPEC §32). Release exige ainda: P0 = 0, P1 = 0, CI e PWA CI verdes no mesmo SHA, real-model eval aprovado, auditoria independente aprovada, smoke pós-deploy aprovado. Relatório final em `docs/reports/meu-ted-v3-implementation-report.md` com baseline, arquivos, decisões, evidências, disposição P2 e riscos residuais.

## Rastreabilidade

Requisito/invariante → seção da SPEC → tarefa → testes → gate.

| Requisito/Invariante | SPEC | Tarefa | Testes | Gate |
|---|---|---|---|---|
| Contrato canônico das mutações (H-01) | §3, §7.1–7.7 | T0.1, T1.1, T1.4 | rotas pending-v2, Agent tests, evals mutação | Bloco A, validate:final |
| Proposal nunca incompleta | §7.4 | T1.4 | rotas (rejeita `{}`), suíte T0.3 | Bloco A |
| MutationDraft multi-turno | §7.8, §25.3.1 | T1.2, T1.3, T1.5, T1.6 | cenários §25.3.1 (incl. consumo atômico), casos A–E §25.3.2, evals | Bloco A |
| Handoff draft → PendingOperation: 0 ou 1 (INV-09/INV-10) | §7.7, §7.7.1, §7.8, §25.3.2 | T1.2, T1.3, T1.4, T1.5 | casos A–E §25.3.2, fault §25.4 (handoff), E2E T1.6 | Bloco A, validate:final |
| Idempotência de turno + inventário de IDs | §7.7, §7.7.1 | T1.2 | retry/reload Agent+PWA; mesma chave → mesma proposal | Bloco A |
| Decisão unificada botão/NL + retry (H-02) | §8 | T1.5 | suíte state-machine, retry failed→execute, E2E T1.6 | Bloco A |
| Listagem autoritativa de pendentes | §8.3 | T1.5 | API tests (identidade autenticada) | Bloco A |
| Attestation recuperável (H-03) | §9 | T1.5 (retry), T2.2 | fault injection (response loss; restart AFTER confirm BEFORE claim — sem lease) | Bloco B, validate:final |
| Claim fora da TX (H-04) | §10 | T2.3 | fault injection (executor fail, replay 403) | Bloco B |
| Lease/crash recovery (H-05) | §11, §12 | T2.1, T2.4 | fault injection (restart AFTER claim BEFORE executor/finalização), migration integrity | Bloco B |
| restart `confirmed` ≠ restart `executing` | §9, §10, §11, §25.4 | T2.2, T2.4, T2.5 | cenários nomeados distintos: confirm-before-claim (reemissão de attestation) vs claim-before-finalize (lease) | Bloco B |
| State machine dual-store | §13 | T0.3 | suíte compartilhada in-memory+Postgres | CI postgres, validate:final |
| Grounding fail-closed (H-06) | §14 | T3.1 | cenários §25.7 (null/timeout/error/empty/injection) | Bloco C, validate:final |
| Receipt + Mutation Effects Registry | §15, §15.1.1 | T0.2, T3.2 | cobertura de efeitos por mutação (§25.2); identidade `mutationId`/`operationId` (§15.1) | Bloco C |
| MutationReceipt: TED vs write normal | §15.1, §15.1.1 | T0.2, T3.2, T3.3 | receipt de write normal sem `operationId` válido; TED com correlação a PendingOperation; reconciler das duas origens (§25.2, §25.6) | Bloco C |
| MutationReconciler PWA (H-07) | §15.2–15.6 | T3.3 | §25.6 (Home pós-TED, pós-write, stale) | Bloco C |
| Approval card (H-10, INV-02) | §16 | T0.2, T3.4 | igualdade card↔args, sem attestation no browser | Bloco C |
| Contrato de estados visíveis | §16 | T3.4 (+ T5.3 condicional) | §25.6 labels/pt-BR por estado | Bloco C |
| Fault injection + infraestrutura | §25.4 | T2.5 (+ T1.3/T1.4/T1.5 handoff, §25.6 reload) | confirm-loss (sem lease), restart AFTER claim (lease), replay, executor-fail, transport timeout, API/PG failure, double-submit, handoff A–E | Bloco B |
| Microfone (H-08) | §17 | T4.1 | §25.6 (close/unmount/workspace/permissão) | Bloco D |
| Anexos/capability (H-09, INV-08) | §18 | T4.2 | blob cleanup, gate de capability | Bloco D |
| Chat resiliência (H-13) **[P2]** | §19 | T5.1 | §25.6 (histórico, retry, optimistic) | condicional (promoção §32) |
| Overlay a11y (H-12) **[P2]** | §21 | T5.2 | foco/trap/restore | condicional |
| Pendentes visíveis (H-14) **[P2]** | §22 | T5.3 | pendingCount + deep-link | condicional |
| Cookie-first (H-11) **[P2]** | §20 | T5.4 | E2E §20.6 (se não deferido) | condicional com gatilho de promoção |
| Ajustes UX **[P2]** | §24 | T5.5 | conforme item | condicional |
| CI remoto + main protegida (H-16) | §27 | T6.4 | CI + PWA CI no mesmo SHA | release |
| Release/auditoria/rollout | §29, §32 | T6.1–T6.5 | validate:final, evals reais, smoke | release |
