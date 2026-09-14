# Plano de execução — Consolidação TED Agent V2

**Goal:** Implementar a SPEC `MEU-TED-SPEC-CONSOLIDACAO-E-AGENTE-V2.md` por incrementos verificáveis, preservando a API como autoridade financeira e eliminando qualquer caminho de escrita autorizado por texto de LLM.

**Status:** EXECUTADO E MERGEADO (2026-09-14) — implementação concluída na branch `ted-agent-v2-consolidation` e mergeada na `main` (merge `f1f74be`, fixups pós-merge até `8541f19`); `pnpm validate:final` VAL.1–VAL.13 verde (ledger em `docs/reports/2026-09-13-final-validation.md`); relatório + adendo pós-merge em `docs/reports/agent-v2-implementation-report.md`. Auditoria SPEC §18 executada e deploy VPS da API concluído (imagem `pi-finance-api:main`, V050+V051 aplicadas, `/health`+`/ready` 200). Pendente: deploy Cloudflare PWA/Agent (bloqueado por billing do GitHub Actions) e evals com modelos reais.

**Baseline verificada:** `main@6bf7cfe69ba1a36cd7bbcfc1219e7c2bd388a315` em 2026-09-13. `HEAD` e `origin/main` coincidem exatamente com a baseline da SPEC; não há divergência de commits. O único item não rastreado é a própria SPEC. O registro de working tree em `AGENTS.md` que aponta `98cfc99` está desatualizado.

## Evidência de AGENT-001

AGENT-001 está **não satisfeito** na baseline. A busca foi feita em `apps/agent`, `apps/api`, `apps/pwa`, `apps/codex-broker`, `packages`, `scripts`, `.github` e `docs`, excluindo dependências e artefatos.

| Classe | Evidência | Estado |
|---|---|---|
| Prompt ativo | `apps/agent/src/finance-chat-agent.ts:915-920` instrui o modelo a emitir `[EXEC_ACTION]` e a confirmar o registro antes da API. | Ativo |
| Parser ativo | `apps/agent/src/finance-chat-agent.ts:1046-1051` extrai JSON por regex. | Ativo |
| Executor ativo | `apps/agent/src/finance-chat-agent.ts:1054-1100` emite `financial.write`, chama tool gerada e injeta `mutationApproved: true`. | Ativo |
| Escolha arbitrária | `apps/agent/src/finance-chat-agent.ts:1071-1083` seleciona categoria de despesa ou a primeira disponível. | Ativo |
| Gate permissiva | `apps/agent/src/tools/tool-policy.ts` aceita um objeto fabricável com `mutationApproved: true`. | Ativo |
| Código gerado | `apps/agent/src/generated/http-tools.ts` não contém o protocolo e não será editado manualmente. | Gerado, consumidor |
| API, PWA, Broker, packages, scripts e workflows | Nenhum match do protocolo. | Sem call site |
| SPEC | Há referências documentais ao marcador. | Documental |

`git blame` atribui os três call sites ativos a `6bf7cfe`, a própria baseline. Portanto, a divergência é interna à avaliação anterior, não ao repositório: uma busca combinada teve saída truncada e a ausência foi inferida incorretamente. O requisito continuará com testes de não regressão mesmo após a remoção.

## Baseline de validação observada

- `pnpm docs:lint`: passou.
- `pnpm governance:check`: passou.
- `pnpm --filter pi-finance-agent typecheck`: passou.
- `pnpm --filter pi-finance-agent test`: 55 arquivos e 310 testes passaram.
- `pnpm --filter pwa lint`: falhou com 6 erros e 21 avisos; os erros estão em `DonutChart`, filtros de analytics, categorias, hooks de gráficos e `AgentLlmSettingsSheet`.

## Regras de execução

1. Aplicar TDD real: RED observado, menor GREEN coerente e refactor seguro.
2. Não executar deploy, migration em produção, alteração de segredos ou exclusão de dados.
3. Toda migration será nova, aditiva, com checksum preservado e compatível durante rollback.
4. `apps/api` continua a única autoridade de dados e mutações financeiras.
5. Nenhuma feature flag pode manter um caminho V1 capaz de escrita após a entrada do hotfix.

## Fase 0 — baseline, contratos e RED

### T0.1 — Matriz de regressão e evals determinísticas

- **Objetivo:** registrar a baseline e criar fixtures antes da produção.
- **Arquivos prováveis:** `apps/agent/tests/`, `apps/agent/evals/` proposto e scripts de validação.
- **RED primeiro:** injection, `[EXEC_ACTION]`, confirmação sem pendência, duas pendências, troca de workspace/actor/device, replay, alteração de argumentos, saldo vazio e resposta incompleta da API.
- **Mudança esperada:** harness de evals por propriedades, sem LLM real no gate obrigatório.
- **Risco:** mocks que repitam a lógica de produção.
- **Aceite:** mínimo de 50 cenários versionados cobrindo rota, tool, argumentos, confirmação, grounding e execução.
- **Validação:** testes do Agent e comando novo de eval determinística.
- **Dependência/paralelismo:** primeira tarefa; fixtures podem ser divididas entre Tester e Security Reviewer.
- **Responsável:** Tester.

### T0.2 — Schema, ADR e RED do contrato de aprovação

- **Objetivo:** definir `PendingOperationV2`, hash de proposta e bindings sem implementar comportamento funcional.
- **Arquivos prováveis:** `packages/llm-contracts/`, ADR novo, testes em `apps/api/tests/approvals/` e `apps/agent/tests/`.
- **RED primeiro:** schema exige hash, actor, device, workspace, TTL e idempotency key; binding divergente falha.
- **Mudança esperada:** somente contrato, ADR e testes RED; GREEN funcional fica restrito a T1.1 e T2.4.
- **Risco:** antecipar endpoint ou executor e mascarar a baseline.
- **Aceite:** contrato versionado, invariantes explícitas e testes falhando pelo motivo correto.
- **Validação:** suites focadas de schema/contrato.
- **Dependência/paralelismo:** depende de T0.1 e desbloqueia T1.1 e T1.2.
- **Responsável:** Architect, com Security Reviewer.

### T0.3 — Gate de invariantes arquiteturais em RED

- **Objetivo:** definir o checker automatizado que bloqueará regressões estruturais.
- **Arquivos prováveis:** `scripts/check-agent-v2-invariants.mjs`, respectivo teste e `apps/agent/tests/architecture/` proposto.
- **RED primeiro:** baseline falha por `[EXEC_ACTION]`, namespace `direct`, capability write antecipada, issuer fora do executor e bindings incompletos.
- **Mudança esperada:** checker e allowlists explícitas para fixtures e documentação, sem correção de produção.
- **Risco:** busca textual ampla gerar falsos positivos ou allowlist ampla demais.
- **Aceite:** checks distinguem fontes produtivas, geradas, testes e documentação.
- **Validação:** teste do próprio checker contra fixtures positivas e negativas.
- **Dependência/paralelismo:** depende de T0.1; paralela a T0.2.
- **Responsável:** Security Reviewer.

## Fase 1 — hotfix P0 de verdade operacional

### T1.1 — Pending operations autoritativas na API

- **Objetivo:** consolidar proposta, confirmação, execução, expiração e retry na API.
- **Arquivos prováveis:** `apps/api/src/approvals/pending.ts`, `guard.ts`, `executor.ts`, rotas de pending operations, store PostgreSQL e migration nova proposta `V051__pending_operation_bindings.sql`.
- **RED primeiro:** device diferente, payload/tool alterado, TTL expirado, concorrência approve/retry e resultado de executor incompleto.
- **Mudança esperada:** hash de `tool + normalizedArgs + workspace + actor + device`, attestation opaca e única, auditoria de transições e idempotência persistida.
- **Risco:** a rota atual trata `deviceId` como parâmetro de ator; corrigir sem ambiguidade semântica.
- **Aceite:** somente a API emite attestation após confirmação; replay causa no máximo uma mutação.
- **Validação:** testes unitários, PostgreSQL concorrente, migration integrity e integração com banco descartável.
- **Dependência/paralelismo:** depende de T0.2; paralela a T1.2.
- **Responsável:** Coder; Security Reviewer revisa.

### T1.2 — Remover EXEC_ACTION e bypasses equivalentes

- **Objetivo:** eliminar prompt, parser regex, executor JSON, write token no relay e categoria default.
- **Arquivos prováveis:** `apps/agent/src/finance-chat-agent.ts`, `src/index.ts`, `src/tools/*`, `src/safety/*`, OpenAPI e gerador de tools quando necessário.
- **RED primeiro:** marker no output do modelo não chama write; nenhum token write é criado; resposta não diz sucesso antes da API.
- **Mudança esperada:** a gate deixa de aceitar objeto falsificável e exige attestation opaca emitida apenas pelo futuro `MutationExecutor`.
- **Risco:** feature flag manter V1 com escrita viola a SPEC.
- **Aceite:** busca em fontes produtivas não encontra `[EXEC_ACTION]`; somente `MutationExecutor` emite/consome attestation.
- **Validação:** testes de mutação, `architecture:check` e `write-policy:check`.
- **Dependência/paralelismo:** depende de T0.2 e T0.3; paralela a T1.1.
- **Responsável:** Coder; Security Reviewer obrigatório.

## Fase 2 — pipeline único, provider adapters e grounding

### T2.1 — ConversationOrchestrator e TurnInput

- **Objetivo:** convergir REST, SDK e Broker em `runTurn(TurnInput)`.
- **Arquivos prováveis:** novos `apps/agent/src/orchestration/*`, `worker.ts`, `finance-chat-agent.ts` e cliente Broker.
- **RED primeiro:** mesma fixture nos três canais produz plano e política equivalentes; identidade no body é ignorada.
- **Mudança esperada:** adaptadores de canal finos, TurnInput imutável e remoção de `direct` em produção.
- **Risco:** persistência/migração de Durable Object e coexistência de dois pipelines.
- **Aceite:** todos os caminhos produtivos chamam o orquestrador; não há prefetch exclusivo de `/rpc/chat`.
- **Validação:** contratos REST/SDK/Broker, namespace canônico, typecheck do Agent e architecture gate.
- **Dependência/paralelismo:** depende de T1.2; desbloqueia T2.2, T2.3 e T2.5.
- **Responsável:** Coder; Reviewer.

### T2.2 — Router e TurnPlan validado

- **Objetivo:** roteamento em camadas, determinístico onde possível, schema validado onde necessário.
- **Arquivos prováveis:** `orchestration/intent-router.ts`, `turn-plan.ts`, inventário de skills e `packages/llm-contracts`.
- **RED primeiro:** negação, typo pt-BR, frase composta, plano inválido, mais de duas skills, mais de oito tools e write em turno read.
- **Mudança esperada:** máximo de duas skills, quatro operações, oito tools e uma correção estruturada.
- **Risco:** classificação ampla causar regressão de intenção.
- **Aceite:** plano inválido nunca executa parcialmente; fallback pede esclarecimento curto.
- **Validação:** evals de rota/tool e testes unitários.
- **Dependência/paralelismo:** depende de T2.1; paralela a T2.3 e T2.5.
- **Responsável:** Coder.

### T2.3 — Evidence collector e grounded responses

- **Objetivo:** substituir JSON truncado por evidência tipada e resposta fundamentada.
- **Arquivos prováveis:** novos `apps/agent/src/evidence/*`, `src/responses/*` e adaptadores de tools.
- **RED primeiro:** tool indisponível, lista vazia, payload grande, cálculo monetário e claim sem evidência.
- **Mudança esperada:** EvidenceEnvelope, cálculos em código, renderer determinístico e validador de claims.
- **Risco:** vazar IDs, headers ou dados financeiros em prompts e logs.
- **Aceite:** zero valor inventado; tool necessária indisponível retorna erro seguro.
- **Validação:** evals de saldo/extrato, redaction e grounding.
- **Dependência/paralelismo:** depende de T2.1; paralela a T2.2 e T2.5.
- **Responsável:** Coder; Reviewer.

### T2.4 — Propostas, entidades e MutationExecutor

- **Objetivo:** conectar parser financeiro, desambiguação, proposta e confirmação API.
- **Arquivos prováveis:** novos `apps/agent/src/mutations/*`, ferramentas de entidades e integração API.
- **RED primeiro:** nomes similares, categoria ausente, data relativa, valor decimal, negação, múltiplas propostas e alteração posterior.
- **Mudança esperada:** resolução atual via API, parser em centavos, proposta humana e execução sem novo planner.
- **Risco:** escolha silenciosa, duplo submit e reuso de argumentos alterados.
- **Aceite:** mudança de parâmetro exige nova proposta; sucesso deriva do resultado real da API.
- **Validação:** matriz de segurança da SPEC e integração Agent→API.
- **Dependência/paralelismo:** depende de T1.1, T2.1, T2.2 e T2.5.
- **Responsável:** Coder; Security Reviewer.

### T2.5 — Provider adapters e fallback uniforme

- **Objetivo:** provider, modelo e canal convergem para TurnPlan, EvidenceEnvelope, GroundedResponse e mesma mutation policy.
- **Arquivos prováveis:** `orchestration/provider-adapter.ts` proposto, `src/llm/attempts.ts`, `failover.ts`, `model-factory.ts`, `private-broker-client.ts` e testes de provider.
- **RED primeiro:** native tool calling sem capability extra; text-only equivalente; schema/output inválido; retryable e non-retryable; fallback inválido; Broker; provider/model/channel sem alterar approval ou policy.
- **Mudança esperada:** adaptadores produzem output estruturado; fallback só ocorre conforme classificação documentada.
- **Risco:** tratar native tool calling como exceção autorizada.
- **Aceite:** nenhum provider recebe autoridade extra; Broker apenas devolve output validável.
- **Validação:** matrix de providers, attempts/failover/Broker e evals determinísticas.
- **Dependência/paralelismo:** depende de T2.1; paralela a T2.2 e T2.3.
- **Responsável:** Coder; Reviewer.

## Fase 3 — memória, observabilidade e custo

### T3.1 — Memória não autoritativa e eventos sanitizados

- **Objetivo:** separar histórico, resumo, preferência e estado financeiro atual.
- **Arquivos prováveis:** `agent-config/memory/*`, novos `observability/*` e DLP.
- **RED primeiro:** memória com saldo obsoleto não define resposta; learning sem resposta real; logs sem dados brutos.
- **Mudança esperada:** metadados de origem/confiança, filtros determinísticos, eventos e classificação de erros.
- **Risco:** retenção no SQLite do DO e log excessivo.
- **Aceite:** memória falha sem quebrar leitura; API necessária falha fechado.
- **Validação:** testes de memória, DLP e redaction.
- **Dependência/paralelismo:** depende de T2.4 e T2.3.
- **Responsável:** Security Reviewer.

### T3.2 — Fast paths, métricas e evals finais

- **Objetivo:** atingir orçamento de chamadas e métricas P50/P95.
- **Arquivos prováveis:** router, observability e `apps/agent/evals/`.
- **RED primeiro:** saldo, extrato, confirmar e cancelar não invocam planner; orçamento excedido falha.
- **Mudança esperada:** fast paths e limites explícitos por etapa/turno.
- **Risco:** cache ser tratado como saldo atual.
- **Aceite:** metas de custo e acurácia da SPEC nas fixtures.
- **Validação:** comando de eval e relatório de métricas.
- **Dependência/paralelismo:** depende de T3.1, T2.2 e T2.3.
- **Responsável:** Tester.

## Fase 4 — API, migrations, Docker e Broker

### T4.1 — Startup fail-closed e migration job

- **Objetivo:** remover migrations do web process e validar produção antes da readiness.
- **Arquivos prováveis:** `apps/api/src/env.ts`, `server/index.ts`, `startup-guard.ts`, `schema-verifier.ts`, scripts de migration e runbooks.
- **RED primeiro:** produção sem segredo/origin seguros, banco ausente, schema incompatível e duas réplicas migrando.
- **Mudança esperada:** schema central de config, web verify-only e advisory lock no job.
- **Risco:** compatibilidade com bootstrap legacy.
- **Aceite:** web nunca aplica migrations; config insegura bloqueia startup.
- **Validação:** boot, migration policy e PostgreSQL integration.
- **Dependência/paralelismo:** após T0.1; independente do orquestrador.
- **Responsável:** Coder; Reviewer.

### T4.2 — Imagens canônicas API e Broker

- **Objetivo:** builds executáveis Node 22, non-root e health verificável.
- **Arquivos prováveis:** Dockerfiles API/VPS/Broker, package/tsconfig Broker.
- **RED primeiro:** API sem `llm-contracts`, Broker sem dist, processo root e health ausente.
- **Mudança esperada:** multi-stage, workspace correto, dist real e smoke de containers.
- **Risco:** divergência entre Dockerfile da VPS e do repositório.
- **Aceite:** imagens buildam, iniciam sem migration e passam health/ready.
- **Validação:** docker build e container smoke.
- **Dependência/paralelismo:** depende de T4.1; paralela às fases Agent/PWA.
- **Responsável:** Coder; Security Reviewer.

## Fase 5 — PWA, sessão e UX

### T5.1 — Qualidade e dependências PWA

- **Objetivo:** corrigir os seis erros lint e atualizar dependências apenas após compatibilidade verificada.
- **Arquivos prováveis:** módulos apontados pelo lint, `apps/pwa/package.json` e lockfile.
- **RED primeiro:** testes comportamentais dos componentes antes de corrigir estado/effects.
- **Mudança esperada:** refactors mínimos e atualização segura de dependências.
- **Risco:** alterar filtros, gráficos e fluxos de tela.
- **Aceite:** lint, typecheck, unit, build Cloudflare, Lighthouse e E2E verdes.
- **Validação:** comandos PWA de qualidade e audit.
- **Dependência/paralelismo:** após T0.1; independente do Agent.
- **Responsável:** Coder; Tester.

### T5.2 — Same-origin, sessão e aprovação TED

- **Objetivo:** consolidar proxies same-origin, cookies seguros e UX de proposta/erro.
- **Arquivos prováveis:** `apps/pwa/src/app/api/**`, cliente API, `features/ted/*`, Serwist e E2E.
- **RED primeiro:** CSRF/cookies, header allowlist, cache privado, confirmar/cancelar, retry e duplo submit.
- **Mudança esperada:** `/api/backend`, `/api/agent`, sessão segura e painel de proposta.
- **Risco:** cookies/proxy Cloudflare exigem ADR de transporte antes da implementação.
- **Aceite:** “registrado” apenas em `succeeded`; retry mantém a mesma operação.
- **Validação:** rotas, unit UI, E2E auth/approval e inspeção SW.
- **Dependência/paralelismo:** depende de T0.2, T1.1, T2.4 e T5.1.
- **Responsável:** Architect para ADR; Coder e Tester.

## Fase 6 — CI/CD, documentação e encerramento

### T6.1a — Preparação de CI

- **Objetivo:** preparar workflows e scripts sem declarar CI final concluído.
- **Arquivos prováveis:** `.github/workflows/*`, `package.json`, validação final.
- **RED primeiro:** workflow falha para package ausente ou componente omitido.
- **Mudança esperada:** Node 22, remoção do Bridge fantasma, filtros fail-if-no-match e job de arquitetura inicialmente vermelho.
- **Aceite:** preparação executável e sem job fantasma.
- **Validação:** testes de scripts/workflows.
- **Dependência/paralelismo:** depende de T0.1 e T0.3.
- **Responsável:** Reviewer.

### T6.2a — Documentação canônica e legado

- **Objetivo:** separar estado atual, alvo e migração; inventariar legacy sem remoção P0.
- **Arquivos prováveis:** README, docs de arquitetura, roadmap, ADRs e runbooks.
- **RED primeiro:** contrato de fatos rejeita Bridge ativo, topologia incorreta e comandos inválidos.
- **Mudança esperada:** docs atualizadas e inventário/cutover de legacy.
- **Aceite:** documentação corresponde a código e limitações reais.
- **Validação:** docs lint, plans check e contratos canônicos.
- **Dependência/paralelismo:** depende de T2.1 e T4.1; paralela a componentes restantes.
- **Responsável:** Reviewer.

### T6.1b — Fechamento dos required gates

- **Objetivo:** transformar o CI em gate real de API, Agent, PWA, Broker, evals, segurança, arquitetura, containers e docs.
- **RED primeiro:** deploy sem SHA verde e CI sem componente obrigatório falham.
- **Mudança esperada:** deploy condicionado, smoke read-only e `architecture:check` em `validate:final`.
- **Risco:** testar deploy real exige credenciais e autorização que este plano não concede.
- **Aceite:** required gate depende de todos os jobs reais; nenhum deploy corre com CI vermelho.
- **Validação:** testes de workflow/scripts, dry-run autorizado e validate final.
- **Dependência/paralelismo:** depende de T3.2, T4.2, T5.2, T6.1a e T6.2a.
- **Responsável:** Reviewer.

### T6.2b — Relatório final

- **Objetivo:** produzir `docs/reports/agent-v2-implementation-report.md` baseado em evidência real.
- **RED primeiro:** n/a; é artefato de entrega posterior aos gates.
- **Mudança esperada:** baseline, arquivos, decisões, comandos, métricas, riscos, rollout e rollback.
- **Aceite:** não afirma deploy ou checks não executados.
- **Validação:** docs lint e revisão.
- **Dependência/paralelismo:** depende de T6.1b.
- **Responsável:** Reviewer.

## Gate de invariantes arquiteturais

`pnpm architecture:check` entrará no CI e em `pnpm validate:final`. Deve provar por análise estática e integração:

1. `MutationExecutor` é o único issuer/consumer de attestation e write.
2. PWA e Agent não acessam PostgreSQL/Kysely/stores financeiros diretamente.
3. Pending operations vivem e transitam autoritativamente na API.
4. Durable Object não possui autoridade financeira; sua SQLite limita-se a conversa/memória não autoritativa.
5. Provider/model/channel nunca elevam capability, approval ou mutation policy.
6. Workspace, actor e device são vinculados e body não substitui identidade autenticada.
7. Não há namespace `direct` em caminhos produtivos.
8. Write exige pending operation confirmada e attestation opaca válida.
9. Não há `[EXEC_ACTION]` em fontes produtivas; marker em output de modelo não produz efeito.

## DAG e paralelização

```text
T0.1 ─┬─ T0.2 ─┬─ T1.1 ───────────────┐
      │        └─ T1.2 ── T2.1 ─┬─ T2.2 ─┬─ T2.4 ─┬─ T3.1 ─ T3.2 ─┐
      └─ T0.3 ────────────────┘         ├─ T2.3 ─┘                │
                                         └─ T2.5 ─┘                │
T0.1 ──────────────────────────────── T4.1 ─ T4.2 ────────────────┤
T0.1 ──────────────────────────────── T5.1 ───────────────────────┤
T0.2 + T1.1 + T2.4 + T5.1 ─────────── T5.2 ───────────────────────┤
T0.1 + T0.3 ───────────────────────── T6.1a ──────────────────────┤
T2.1 + T4.1 ───────────────────────── T6.2a ──────────────────────┤
T3.2 + T4.2 + T5.2 + T6.1a + T6.2a ─ T6.1b ─ T6.2b
```

## Matriz de rastreabilidade

| Requisito/invariante | Fase e tarefa | Teste/evidência | Gate |
|---|---|---|---|
| AGENT-001 | F1 T1.2 | marker, call graph e issuer único | architecture |
| AGENT-002 | F2 T2.1 | paridade REST/SDK/Broker | Agent integration |
| AGENT-003 | F2 T2.2 | router pt-BR, negação e limite de tools | evals |
| AGENT-004 | F2 T2.3 | schema de evidência, vazio e erro | Agent unit/integration |
| AGENT-005 | F2 T2.3 | claim rejeitado e renderer | grounding evals |
| AGENT-006 | F1 T1.1; F2 T2.4 | confirmação, hash, retry e replay | API integration + architecture |
| AGENT-007 | F2 T2.4 | ambiguidade, data e centavos | evals |
| AGENT-008 | F3 T3.1 | memória não autoritativa | memory/DLP |
| AGENT-009 | F2 T2.5; F3 T3.1 | retry, fallback e erro sanitizado | Agent integration |
| AGENT-010 | F3 T3.1 | eventos sem payload bruto | observability |
| AGENT-011 | F0 T0.1; F3 T3.2 | 50 fixtures e métricas | evals |
| API-001 | F4 T4.1 | boot/readiness falha fechado | API boot |
| API-002 | F4 T4.1 | web verify-only e lock | PostgreSQL integration |
| API-003 | F4 T4.2 | imagem API executável | Docker smoke |
| API-004 | F1 T1.1 | estado, hash, TTL e audit | approvals integration |
| API-005 | F6 T6.2a | inventário/paridade/cutover | docs + legacy checker |
| PWA-001 | F5 T5.1 | lint, typecheck, unit, build, E2E | PWA quality |
| PWA-002 | F5 T5.2 | cookies, CSRF e SW | PWA auth/SW E2E |
| PWA-003 | F5 T5.2 | proposta, cancelamento e retry | PWA approval E2E |
| CICD-001 | F6 T6.1a/b | jobs reais e filtros ausentes | required CI |
| CICD-002 | F6 T6.1b | SHA verde e smoke read-only | deploy workflow |
| BROKER-001 | F2 T2.5; F4 T4.2 | output, dist, non-root e health | Broker/Docker |
| DOCS-001 | F6 T6.2a/b | fatos, lint e relatório | docs gate |
| I1 API authority | F1 T1.1; F2 T2.4 | tools só via API | architecture |
| I2 workspace isolation | F1 T1.1; F2 T2.1 | cross-workspace e namespace | architecture |
| I3 actor/device binding | F1 T1.1 | troca de contexto bloqueada | API integration |
| I4 single mutation issuer | F1 T1.2 | import/call graph | architecture |
| I5 LLM advisory | F1 T1.2; F2 T2.5 | provider não concede aprovação | architecture |
| I6 pending API authority | F1 T1.1 | DO só guarda ID opaco | architecture |
| I7 exact confirmation | F1 T1.1 | hash de tool/args/contexto | approvals |
| I8 fresh data | F2 T2.3 | envelope atual | grounding evals |
| I9 no premature success | F1 T1.2; F2 T2.4 | API 500 não registra sucesso | Agent→API integration |
| I10 idempotency | F1 T1.1 | retry/replay único | API integration |
| I11 fail closed | F1 T1.2; F2 T2.2 | falta de schema/capability bloqueia | architecture + evals |
| I12 no raw secrets/IDs | F3 T3.1 | DLP/redaction | security |
| I13 no arbitrary defaults | F1 T1.2; F2 T2.4 | pede desambiguação | evals |
| I14 one pipeline | F2 T2.1; T2.5 | contratos equivalentes | integration + architecture |

## Fechamento e rollback

O encerramento exige `pnpm docs:lint`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:all`, `pnpm governance:check`, `pnpm security:check`, `pnpm architecture:check` e `pnpm validate:final` verdes. Rollback pode reverter roteamento de leitura, mas nunca reativar EXEC_ACTION, write sem confirmação ou bypass equivalente. Migrations novas devem permanecer backward-compatible; operações pendentes V2 continuam canceláveis ou expiráveis após rollback.

## Revisão crítica final

- O risco P0 imediato é a cadeia prompt de sucesso antecipado → regex → token write → categoria default → attestation falsificável.
- O gate arquitetural precisa de análise semântica e allowlists mínimas, não apenas busca textual.
- A sessão same-origin requer ADR antes da implementação porque cookies, CSRF e Cloudflare/OpenNext alteram fronteiras de confiança.
- Atualização de dependências PWA fica isolada da migração de sessão para manter diagnóstico e rollback possíveis.
- Evals com modelos reais são manuais/noturnas; o CI obrigatório usa fixtures determinísticas.
- Nenhum resultado de documentação, CI ou deploy será declarado sem evidência executada no estado entregue.
