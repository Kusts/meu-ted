# Relatório de Implementação — Meu TED V4: Hardening, Simplificação e Descomissionamento

**Data:** 2026-09-16
**Branch:** `feat/meu-ted-v4-hardening` (criada a partir da baseline de planejamento `5733cc8`)
**SHA de execução (T0.1):** `81c440f`
**Baseline de planejamento:** `5733cc8`
**SPEC:** `docs/MEU-TED-SPEC-HARDENING-SIMPLIFICACAO-E-DESCOMISSIONAMENTO-V4.md`
**Plano:** `docs/superpowers/plans/2026-09-15-meu-ted-v4-hardening.md` (rev. 3)
**Natureza desta tarefa (T0.1):** foto da baseline — registro por execução, sem correção de código.

---

## 1. Baseline de entrada (gates T0.1, resultado real por execução)

| Gate | Comando | Resultado real |
|---|---|---|
| docs:lint | `pnpm docs:lint` | PASS — 12 documentos, 0 issues |
| governance:check | `pnpm governance:check` | PASS — sem mudança D01–D19 |
| typecheck | `pnpm typecheck` | PASS (exit 0) — 4 workspaces (api, pwa, agent, codex-broker); único aviso cosmético `DEP0190` do Node no runner `scripts/run-workspace-gate.mjs` |
| test | `pnpm test` (4 workspaces) | PASS (exit 0) — API: 200 arquivos / 1532 testes; Agent: 91 arquivos / 497 testes (1 arquivo + 1 teste skipped: evals com modelo real, gated); Broker: 4 arquivos / 12 testes; PWA: 190 arquivos / 1672 testes; total 485 arquivos / 3713 testes, ~8 min de parede |
| security:check | `pnpm security:check` | PASS (exit 0) — secrets: gitleaks local pulado no win32 (CI Linux é autoritativo); deps: `pnpm audit` 36 vulnerabilidades (2 low, 19 moderate, 15 high, 0 critical); containers: trivy 0 HIGH/CRITICAL nas imagens api e broker |

Nenhuma divergência bloqueante da baseline: a branch está 100% verde nos gates locais na foto T0.1.

## 2. Baselines de produção (referência imutável da V4)

- **Production Code Baseline:** `3305152` (V3 em produção; toda comparação de comportamento usa este SHA).
- **API:** imagem `pi-finance-api:main` = `v3-3305152` na VPS (`~/infra/pi-finance-api`), migration `V052` aplicada (`V052__pending_operation_execution_recovery.sql`).
- **PWA (Cloudflare):** deployment `a5ff2b4a`.
- **Agent (Cloudflare):** deployment `0e557bba`.
- **Migration máxima:** `V052`. Migrations novas da V4 partem de `V053`, aditivas e backward-compatible.

## 3. Bloqueios externos

- **CI remoto (GitHub Actions):** BLOQUEADO por billing/spending limit — não executado neste SHA, jamais marcado PASS. Débito explícito: re-executar CI + PWA CI sobre o mesmo SHA quando o billing for resolvido (SPEC §19).
- **Branch protection da `main` (H5):** indisponível no plano atual do GitHub; deploys Cloudflare seguem manuais via wrangler local (OAuth), autorizados pelo owner.

## 4. Fases e tarefas (acompanhamento)

### Fase 0 — Baseline, instrumentação XLT e governança

- **T0.1 — Registro de baseline e gates de entrada:** EM PROGRESSO (este relatório; gates capturados, falta fechar o esqueleto com `docs:lint` final).
- **T0.2 — Infraestrutura da categoria Cross-Layer Invariant Tests:** FEITO (scaffolding `apps/api/tests/xlt/`, `apps/pwa/e2e/xlt/`, `docs/testing/xlt-category.md` + fumaça XLT-00 verde atravessando a emissão real do middleware).
- **T0.3 — ADRs e governança documental:** FEITO (ADR-015 session hardening, ADR-016 descomissionamento WorkspaceAgent entregues).
- **T0.4 — Contrato e instrumentação de observabilidade V4 (SPEC §24):** FEITO no contrato (8 eventos/métricas, validador de privacidade fail-closed com allowlist estrita por evento, `POST /client-events` autenticado, V054, fila PWA com flush via proxy same-origin); emissores pontuais pendentes por bloco dono (T1.1, T2.2, T2.4, T2.6, T2.7, T3.1, T4.1) — ver `docs/reports/observability-v4-queries.md` (contrato, disponível-após-emissor).

### Fase 1 — BLOCO A (P1, bloqueante): microfone funcional

- **T1.1 — Capability flag de microfone + Permissions-Policy condicional + UI gated:** EM PROGRESSO (working tree; units `microphone-policy`, `TedChat.microphone`, `use-recording-state-mic-error` verdes — 31/31 nos arquivos do bloco).
- **T1.2 — E2E real de gravação (XLT-01):** CONCLUÍDO — `apps/pwa/e2e/xlt/xlt-01-ted-microphone.spec.ts` (4 testes, Chromium real headless): header `microphone=(self)` servido da capability REAL (`NEXT_PUBLIC_TED_MICROPHONE=true`, call-time, sem mock) + `getUserMedia` resolvendo com trilha viva; fluxo idle → click → recording → stop → 1 attachment `audio/*`; denied via enforcement real da policy `microphone=()` → `NotAllowedError` genuíno → error/`denied`, `recording` nunca alcançado, sem resíduo. XLT total 7/7; `pnpm --filter pwa test` 1696/1696 (2ª execução; 1ª teve 4 falhas flaky em arquivos fora do bloco, sem relação com T1.2).
  - **Nota honesta:** `--deny-permission-prompts` NÃO gera denial neste Chromium (sem fake device → `NotFoundError`; com → `NotSupportedError`) — a denial autêntica vem da policy servida. O fluxo de UI usa harness servido espelhando o contrato de `use-recording-state.ts` (XLT proíbe webServer/Next); hook real travado pelos units. O XLT-01 serve os headers via a MESMA função compartilhada do middleware (`buildProductionEmissionHeaders`); a validação contra o artefato build/OpenNext/Cloudflare fica para o smoke do deploy da Fase 1 (R3) — débito consciente.

### Fase 2 — Segurança da sessão (B → C → D → G)

- **T2.1 — Convergir tráfego da PWA para o proxy same-origin:** A FAZER.
- **T2.2 — Cookie-first: transporte validado e preferência (B3 passos 1–3):** A FAZER.
- **T2.3 — Cookie-first: remoção gradual do localStorage (B3 passos 4–7):** A FAZER.
- **T2.4 — Device token: migration V053, hash e lifecycle (C1–C3, C6):** A FAZER.
- **T2.5 — Device token: rotação e transporte do client (C4):** A FAZER.
- **T2.6 — Política offline: maxOfflineAge (D1–D3):** A FAZER.
- **T2.7 — Hardening de borda: proxies, localhost e CSP (G1–G4):** A FAZER.

### Fase 3 — Consistência financeira: Undo provado (F)

- **T3.1 — Suíte compartilhada de undo com injeção de crash (XLT-07):** FEITO — `apps/api/tests/xlt/xlt-07-undo-crash.test.ts` (13 cenários: 6 Postgres P1–P5 + legacy-branch, 4 paridade in-memory, 3 emissores T0.4.5/6). P3/P4 nasceram RED: essa foi a prova do defeito F3, não teste quebrado.
- **FIX-UNDO (F3 opção 1, SPEC §12 F3; T3.1):** FEITO (working tree, sem commit). **Defeito provado:** o undo Postgres não era atômico — `lookupOrRecord` (tx A, `postgres.ts:939-948`) chamava o producer, que executava `softDeleteTransaction` em tx B independente (`postgres.ts:810`); crash entre o commit de B e o de A deixava o efeito financeiro commitado SEM registro de idempotência, e o retry lançava `not_found` 404 ("Lançamento não encontrado") — replay não convergia (F4 violado). Isso refuta a premissa REV-V4-1/§31.2 F-1 de que o undo Postgres "já era atômico". **Correção (mesma transação PostgreSQL, sem distributed transaction, reusando `withTransaction`):** passthrough do client do claim ao producer (`producer(client)` nos branches canônico e legacy; tipo `IdempotencyProducer<T>` com parâmetro opcional — callers existentes intactos) + reversões client-bound `*InTx` expostas como extensões não-contratuais do Postgres write store (`PostgresReversalTxExtensions`, duck-typed com fallback no `applyReversal` do undo). Sem mudança nos contratos públicos de `createUndoService`/`WriteStore`; in-memory mantém a semântica atual; emissores T0.4.5/6 preservados. **Evidência:** XLT-07 13/13 verde (P3/P4 agora: rollback total 0 efeitos/0 registros + retry convergente byte-idêntico marcado `audit-undo.replay); suíte 0.4.1 reativada e alinhada (2/2, produtores no client do claim).
- **T3.2 — Paridade in-memory do idempotency store:** A FAZER (divergências P3/P4 in-memory registradas pela suíte como `DIVERGES_TODAY`, sem force-fail — replay convergente, sem promessa de atomicidade de processo).

### Fase 4 — Descomissionamento (E + I)

- **T4.1 — Arquitetura anti-regressão (E3, ARCH-V4-06):** A FAZER (RED de ARCH-V4-06a confinado a esta fase).
- **T4.2 — Migração histórica e prova de 0 consumidores (E2):** A FAZER.
- **T4.3 — Remoção do WorkspaceAgent (E4) com rollback planejado (E5):** A FAZER.
- **T4.4 — Limpeza documental (I1–I5):** A FAZER.

### Fase 5 — Qualidade (H, J, K)

- **T5.1 — CI, deploy gate e evidência (H1–H5):** A FAZER.
- **T5.2 — Lint real separado de typecheck (J1–J3, obrigatório para o fechamento):** A FAZER.
- **T5.3 — Modularização oportunista (K, único não bloqueante):** A FAZER.

## 5. Gates finais VAL-V4.1..VAL-V4.16 (a preencher no fechamento)

| Gate | Descrição | Status |
|---|---|---|
| VAL-V4.1 | frozen install | A EXECUTAR |
| VAL-V4.2 | lint real | A EXECUTAR |
| VAL-V4.3 | typecheck | A EXECUTAR |
| VAL-V4.4 | API tests | A EXECUTAR |
| VAL-V4.5 | Agent tests | A EXECUTAR |
| VAL-V4.6 | PWA tests | A EXECUTAR |
| VAL-V4.7 | Postgres integration | A EXECUTAR |
| VAL-V4.8 | Cross-Layer Invariant Tests | A EXECUTAR |
| VAL-V4.9 | architecture checks (inclui ARCH-V4-06a/b) | A EXECUTAR |
| VAL-V4.10 | write policy | A EXECUTAR |
| VAL-V4.11 | security scan | A EXECUTAR |
| VAL-V4.12 | build all | A EXECUTAR |
| VAL-V4.13 | container smoke | A EXECUTAR |
| VAL-V4.14 | production configuration tests | A EXECUTAR |
| VAL-V4.15 | real browser microphone E2E | A EXECUTAR |
| VAL-V4.16 | production smoke | A EXECUTAR |

## 6. Critérios SPEC §25/§26 (a preencher no fechamento)

Segurança: sessão sem bearer reutilizável em localStorage; device token com hash; localhost não trusted em produção; CSP reforçando a topologia; política offline explícita.
Agent: FinanceChatAgent único runtime financeiro; WorkspaceAgent, binding AGENT e `/agents/workspace` removidos; legacy migration encerrada.
Financeiro: autoridade da API, Pending Operations V2 e receipts preservados; Undo com atomicidade provada por crash/replay em Postgres real.
PWA: microfone funcional em browser real; headers coerentes com capabilities; service worker sem cache financeiro sensível; logout/expiração limpando estado sensível.
Operação: CI do SHA implantado executado quando a infraestrutura permitir; SHA testado igual ao SHA implantado; docs canônicos atualizados; legado arquivado; lint real separado de typecheck.
Não conclusão (§26): nenhum dos vetos pode estar ativo — mic bloqueado em browser real, bearer primário em localStorage, WorkspaceAgent necessário a tráfego novo, localhost aceito sem justificativa, Undo com duplo efeito demonstrável, docs instruindo arquitetura removida, gates remotos marcados verdes sem execução.

## 7. Débitos

- **CI billing (externo, owner):** re-executar CI + PWA CI no SHA de fechamento quando o billing do GitHub Actions for resolvido; jamais marcar PASS sem execução.
- **Branch protection H5:** ruleset da `main` indisponível no plano atual; perlindungan via processo manual até resolução.
- **Janela localStorage (ADR-011, `apps/pwa/src/lib/api/client.ts`):** compatibilidade com TODO 2026-12-01; fechamento da janela B3 remove o fallback bearer legado.
- **`sharp@0.34.5` pinado** até o opennextjs suportar 0.35 no Windows; **`.trivyignore`** expira 2026-12-31.
