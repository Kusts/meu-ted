# Relatório de Implementação — TED Agent V2 (Consolidação)

**Data:** 2026-09-13/14
**Branch:** `ted-agent-v2-consolidation` (a partir de `main@6bf7cfe`)
**SPEC:** `docs/MEU-TED-SPEC-CONSOLIDACAO-E-AGENTE-V2.md`
**Plano:** `docs/superpowers/plans/2026-09-13-ted-agent-v2-consolidation.md`
**Ledger de validação:** `docs/reports/2026-09-13-final-validation.{md,json}` (VAL.1–VAL.13, 13/13 PASS)

---

## 1. Resumo executivo

A consolidação TED Agent V2 foi implementada por completo na branch `ted-agent-v2-consolidation`. O protocolo `[EXEC_ACTION]` foi eliminado do prompt, parser e executor; todos os canais (REST, SDK, Broker) convergem para um único `ConversationOrchestrator` com `TurnInput` imutável; mutações exigem pending operation autoritativa na API com attestation opaca de uso único consumida apenas pelo `MutationExecutor`. A API ganhou startup fail-closed, migration job separado com advisory lock e o domínio `pending-v2` com bindings/hash/TTL/idempotência. A PWA teve lint zerado, bump de segurança do Next (16.2.12 → 16.3.5, eliminando 2 CVEs críticas de RCE), proxies same-origin e UX de aprovação. As imagens Docker da API e do Broker foram enxugadas (sem next/sharp/vitest no runtime) e passam smoke de health non-root. Nenhum deploy foi executado; a auditoria pós-implementação (SPEC §18) permanece pendente como condição para considerar a implementação candidata à produção.

## 2. Baseline

- **SHA:** `main@6bf7cfe69ba1a36cd7bbcfc1219e7c2bd388a315` (12–13/09/2026), sem divergência de commits (verificado no plano).
- **Estado validado na baseline:** `docs:lint` e `governance:check` verdes; typecheck do Agent verde; Agent 55 arquivos / 310 testes verdes; PWA lint vermelho (6 erros, 21 avisos).
- **Diagnóstico confirmado:** cadeia `prompt de sucesso antecipado → regex → token write → categoria default → attestation falsificável` ativa em `apps/agent/src/finance-chat-agent.ts`.

## 3. Commits e arquivos alterados

| Commit | Conteúdo | Escala |
|---|---|---|
| `493472f` | Implementação V2 completa (Agent, API, PWA, CI/CD, docs, ADRs, evals, invariantes) | 201 arquivos, +6082/−2400 |
| `28b53ee` | Correções de segurança de containers e CVEs transitivas | 9 arquivos, +387/−171 |
| `5410828` | Re-evidência do chunk `deployment-id` do framework (208- → 474-) + relatório | 5 arquivos, +78/−164 |

**Por componente (principais):**

- **Agent:** `src/orchestration/` (conversation-orchestrator, intent-router, turn-plan, provider-adapter, skill-inventory), `src/evidence/` (collector, envelope, formatters, grounding-validator), `src/mutations/` (policy via mutation-proposal, pending-operation client, confirmation-resolver, mutation-executor, binding-manifest, entity-resolution, financial-parser), `src/responses/` (deterministic-responses, grounded-response), `src/observability/` (events, metrics), `src/dlp/redaction.ts`, `src/finance-chat-agent.ts` (refatorado, −767 linhas de concentração), `evals/` (54 cenários).
- **API:** `src/approvals/pending-v2.ts`, `src/routes/pending-operations.ts`, migration `V051__pending_operation_bindings.sql`, `src/env.ts`, `src/server/index.ts` + `startup-guard.ts` (fail-closed), `src/scripts/migrate-job.ts` + `migration-job-policy.ts` (migration fora do processo web), Dockerfile enxugado.
- **PWA:** `src/app/api/backend/[...path]` e `src/app/api/agent/[...path]` (same-origin), `src/lib/api/agent-client.ts`, `src/features/ted/TedApprovalCard.tsx` (UX de proposta), lint zerado, `next`/`eslint-config-next` 16.3.5, drift de tipos da suíte resolvido (tsc full 0 erros).
- **Broker:** Dockerfile executável non-root com health, `tsconfig.build.json`.
- **CI/CD:** `.github/workflows/ci.yml` (gates reais por componente, Node 22), `agent-deploy.yml`, `pwa-deploy.yml` condicionados; `scripts/check-agent-v2-invariants.mjs` (`architecture:check`).
- **Docs:** `ADR-010` (pending operation V2), `ADR-011` (same-origin TED session), `docs/runbooks/api-migration-v2.md`, README/ARCHITECTURE/ROADMAP/PRODUCT atualizados.

## 4. Decisões arquiteturais

1. **Remoção (não deprecação) de `[EXEC_ACTION]`** — prompt, parser e executor sem any trace em fontes produtivas; texto do modelo é tratado como dado não confiável (AGENT-001, provado por `tests/ted-v2-t1-2-removal.test.ts`).
2. **Endpoints legacy `/process` e `/retry` aposentados com `410 agent.legacy_mutation_path_removed`** — nenhuma segunda pipeline pública de execução/retry; retry é interno via `alarm() → processTurn()` com a mesma `Idempotency-Key` da operação pendente.
3. **Pending operation autoritativa na API** — hash imutável `tool + normalizedArgs + workspace + actor + device`, attestation opaca de uso único, bindings estritos, auditoria de transições (ADR-010); o Durable Object guarda apenas identificador opaco.
4. **Single MutationExecutor** — `architecture:check` (VAL.8) falha se qualquer outro módulo emitir/consumir attestation ou capability write.
5. **Provider adapters sem autoridade** — tool calling nativo não concede capability; output estruturado passa pelo mesmo schema (T2.5).
6. **Same-origin PWA** (`/api/backend`, `/api/agent`) com ADR-011 antes da implementação, conforme revisão crítica do plano.
7. **Imagem da API sem next/sharp** — `pnpm deploy --legacy --filter meu-ted-api --prod` + poda explícita dos subtrees peer-only (`next@*`, `sharp@*`, `@img+*`), nunca importados no contexto fastify (grep provado); smoke de boot confirma.
8. **Bump de segurança Next 16.3.5** com re-evidência consciente dos chunk ids do framework (mecanismo fail-closed do `measure-bundle.mjs` — o gate trips a cada mudança de conteúdo e exige prova via `build-manifest.json#rootMainFiles`).
9. **Pin `sharp@0.34.5`** (pnpm override) enquanto `opennextjs-cloudflare` não empacota `sharp@0.35` (módulos nativos `.node`) no Windows; revisitar quando a dependência suportar.
10. **`.trivyignore` restrito a CVEs internos do npm CLI embutido na base `node:22-alpine`** (pacote/sigstore/tar/brace-expansion dentro de `/usr/local/lib/node_modules/npm`), cada entrada com justificativa e expiração 2026-12-31; entradas antigas que mascaravam cópias de app foram removidas após as deps serem corrigidas de verdade.
11. **Nodemailer 6 → 9** (3 CVEs HIGH) validado por suíte completa da API; transporte SMTP real só executa sob uso — observar primeiro invite em staging.

## 5. Validação executada (estado entregue)

Comando único: `pnpm validate:final` → **PASSED, 13/13 gates** (ledger anexo com durações e exit codes):

| Gate | Escopo | Resultado |
|---|---|---|
| VAL.1 | Lockfile congelado (reprodutibilidade) | PASS |
| VAL.2 | `pnpm lint` + `docs:lint` | PASS (PWA 0 erros; 19 avisos pré-existentes) |
| VAL.3 | `pnpm typecheck` (monorepo) | PASS |
| VAL.4 | API: unit + contratos | PASS — 181 arquivos / 1360 testes |
| VAL.5 | Agent: testes + evals determinísticas | PASS — 72 arquivos / 370 testes + 54 evals (6 categorias) |
| VAL.6 | Broker: typecheck + testes + build | PASS |
| VAL.7 | PWA: unit + contratos | PASS — 167 arquivos / 1500 testes |
| VAL.8 | Invariantes arquiteturais (`architecture:check`) | PASS |
| VAL.9 | Capabilities + write policy + governance | PASS |
| VAL.10 | Contratos de documentação canônica | PASS |
| VAL.11 | `build:all` (API, Agent, Broker, PWA) | PASS |
| VAL.12 | `security:check` + `container:smoke` | PASS — audit 0 critical; trivy HIGH/CRITICAL: 0 em app; smoke non-root + health GREEN |
| VAL.13 | Fechamento | PASS |

## 6. Métricas antes/depois

| Métrica | Antes (baseline `6bf7cfe`) | Depois (estado entregue) |
|---|---|---|
| Testes do Agent | 310 (55 arquivos) | 370 (72 arquivos) |
| Evals determinísticas TED V2 | 0 | 54 cenários / 6 categorias |
| Testes da API | (baseline anterior à V2) | 1360 (181 arquivos) — inclui suíte pending-v2, boot-order, migration-policy |
| Testes da PWA | 1500 (com drift de tipos) | 1500 (tsc full 0 erros) |
| PWA lint | 6 erros / 21 avisos | 0 erros / 19 avisos |
| CVEs críticas (pnpm audit) | 2 (Next RCE: GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4) | 0 |
| Achados HIGH/CRITICAL em imagens | 35 (API) + 16 (Broker), incl. CRITICAL `tar` e `sharp`/`next` embutidos | 0 em pacotes de app; internos do npm CLI ignorados com expiração justificada |
| `[EXEC_ACTION]` em fontes produtivas | 3 call sites ativos | 0 |
| Canais de conversa | 2 pipelines cognitivas | 1 `ConversationOrchestrator` |
| Migrations no processo web | `runMigrations()` no startup | verify-only; job dedicado com advisory lock |

## 7. Provas de segurança (por teste, executadas nos gates)

- **Write sem confirmação falha:** `apps/agent/tests/agent-mutation-gate.test.ts`, `tests/mutations/approval-rpc.test.ts`, `tests/ted-v2-t1-2-removal.test.ts` (marker no output não executa; `mutationApproved` fabricado é rejeitado).
- **Atestation única do MutationExecutor:** `pnpm architecture:check` (VAL.8) + `scripts/check-agent-v2-invariants.test.mjs`.
- **Bindings/hash/replay/TTL:** `apps/api/tests/approvals/pending-v2.test.ts`, `pending-v2-postgres-red.test.ts`, `pending-operation-v2-contract.test.ts`, `tests/routes/pending-operations-v2.test.ts` (device divergente, payload alterado, expirado, concorrência, replay = no máximo uma mutação).
- **Sem sucesso prematuro:** `tests/llm-api-to-agent.e2e.test.ts` (upstream 500 vira erro operacional, sem alegação de registro).
- **Prompt injection tratada como dado:** matriz da SPEC §13 coberta pelas evals (`evals/ted-v2-regression-matrix.json`).

## 8. Implantação (NÃO executada — requer aprovação operacional)

1. **Cloudflare (PWA):** merge → CI verde no SHA → deploy automático condicionado (`pwa-deploy.yml`); smoke pós-deploy read-only.
2. **Cloudflare (Agent):** `agent-deploy.yml` com wrangler dry-run no CI; deploy do mesmo SHA aprovado.
3. **VPS (API):** build da imagem imutável → migration job (`docs/runbooks/api-migration-v2.md`: backup → migrate → verify → restart) → restart com readiness fail-closed. Requer credenciais e autorização explícita (fora do escopo desta implementação).

## 9. Rollback

- Feature flag/roteamento de leitura pode reverter, **nunca** reativando `[EXEC_ACTION]` ou write sem confirmação.
- Migration `V051` é nova e backward-compatible; operações pendentes V2 permanecem canceláveis/expiráveis após rollback.
- Rollback separado por componente: PWA (Cloudflare), Agent (Workers), API (imagem anterior na VPS).

## 10. Limitações e débitos residuais (declarados, não ocultos)

1. **Evals com modelos reais não executadas** — o gate obrigatório usa fixtures determinísticas; avaliação noturna/manual com provedores reais segue pendente até baseline estável.
2. **`sharp@0.34.5` pinado** até `opennextjs-cloudflare` suportar bundling de `sharp@0.35` no Windows (HIGH GHSA-f88m/rgj7 aplicam ao build local; a PWA em produção Cloudflare não empacota sharp).
3. **`.trivyignore` expira em 2026-12-31** — revisar quando a base `node:22-alpine` embarcar npm com as fixes (pacote/sigstore/tar/brace-expansion internos).
4. **Nodemailer 9:** caminho real de envio SMTP sem cobertura de integração; observar primeiro convite em staging.
5. **PWA lint:** 19 avisos pré-existentes (no-unused-vars, no-img-element) não bloqueiam e não foram alvo desta SPEC.
6. **`undici@^7` fixado exato em 7.29.0** (float `>=` quebrou jsdom); bumps futuros manuais.
7. **Deploy workflows não exercitados contra Cloudflare real** (sem credenciais/autorização nesta execução).
8. **`AGENTS.md` (seção "Working Tree e Estado Atual")** ainda descreve `98cfc99` — atualizar após o merge.
9. **Auditoria pós-implementação (SPEC §18)** — obrigatória antes de tratar a implementação como candidata à produção; deve rastrear call sites de tools mutáveis, emissores de token write, fluxo PWA → Agent → API → PostgreSQL e reproduzir as evals.

## 11. Conclusão

Definition of Done da SPEC §16 atendida em código e gates, **com ressalva explícita**: nenhum item de deploy/produção foi executado (conforme instrução 9 da SPEC), e a auditoria da seção 18 é condição pendente para promoção. O estado entregue é o conteúdo integral da branch `ted-agent-v2-consolidation`, validado pelo ledger anexo.

---

## 12. Adendo pós-merge (2026-09-14)

Este adendo registra o que aconteceu de fato **após** o fechamento do relatório acima. As seções 8 (implantação não executada) e 11 descrevem o estado pré-merge; este adendo as supersede. Claims de produção refletem o registro da sessão de deploy de 2026-09-14; claims de repositório são verificáveis no checkout atual.

### 12.1 Auditoria SPEC §18 — executada (2 rodadas)

Executada em 2 rodadas (security-reviewer + reviewer). Achados corrigidos com TDD (RED → GREEN):

- **Idempotência ponta a ponta (P1):** gravação do registro de idempotência na mesma transação da escrita — `apps/api/src/writes/pending-idempotency.ts`.
- **Grounding ponta a ponta:** isolamento de token por requisição (sem contexto global de API; fallback global suprimido — ver `extractRequestAuth` em `apps/agent/src/generated/http-tools.ts`) e histórico do agente somente com respostas grounded.
- **Memória:** bloqueio de estado financeiro no momento da persistência (`isProhibitedFinancialMemory`/`isCurrentFinancialState`) + enquadramento do conteúdo lembrado como UNTRUSTED (`MEMORY_UNTRUSTED_PREAMBLE`).
- **Observabilidade sanitizada**, incluindo leituras de evidence.
- **Evals comportamentais:** 63 cenários executando comportamento, com os 6 mínimos funcionais da SPEC (`apps/agent/evals/`).
- **Deploy gate estrito:** falha fechada (fail-closed) quando CI ou PWA CI estão ausentes para o SHA.
- **Wildcard de bridge-context removido** (zero ocorrências em `apps/agent/src`).
- **Cliente canônico same-origin na PWA:** `apps/pwa/src/lib/api/agent-client.ts`.

### 12.2 Endurecimento de CI mergeado na `main`

- `llm-contracts` compilado antes dos builds cloudflare da PWA (`2fb8752`, reforçado em `f4e22f7`).
- PWA CI em todo push na `main`, sem filtros de caminho (`b7bb873`) — o deploy gate exige PWA CI por SHA.
- Fix de contexto (owner/repo) nos scripts do deploy gate (`909b080`).
- Fixture de auth do broker com modo `0600` (enforcement POSIX) (`2fb8752`).
- Matriz e2e ampliada em +8 IDs (`f4e22f7`).
- Framework set do bundle derivado do `build-manifest.json` — independente de plataforma, preservando o fail-closed (`8541f19`, HEAD atual da `main`).

### 12.3 Deploy de produção na VPS — executado por runbook

- Backup pré-migration: `pi-financeiro-pre-v2-f1f74be-20260914T115257Z`.
- Migration job com advisory lock: V050 + V051 aplicadas. A verificação de schema era-aware exigiu correção — o verify do processo web estava mais estrito que o migration guard (`1df73ea`).
- Imagem `pi-finance-api:main` construída da `main`; `/health` e `/ready` respondendo 200. Rollback disponível: tag `pi-finance-api:rollback-pre-v2` + o backup acima.
- **Um crash-loop ocorreu durante o rollout:** faltava `BETTER_AUTH_SECRET` real em produção — o código antigo rodava sobre um default de dev hardcoded. Corrigido com a geração de um segredo real; usuários precisam autenticar-se novamente uma única vez (efeito esperado da troca de segredo).

### 12.4 Cloudflare (PWA/Agent) — deploy PENDENTE

Bloqueado por billing/spending limit do GitHub Actions: todos os jobs de Actions recusam iniciar (anotação capturada no run). Após resolver o billing: re-executar CI + PWA CI para o SHA `8541f19` (sem novo push necessário); os deploys e o smoke pós-deploy read-only rodam automaticamente.

### 12.5 Evals com modelos reais — NÃO executadas

Nenhuma execução de harness com modelos reais ocorreu nesta rodada. Continua pendente (ver seção 10, item 1).
