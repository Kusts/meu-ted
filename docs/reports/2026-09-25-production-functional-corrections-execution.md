# Relatório — Correções funcionais de produção (execução 2026-09-25)

- **Data:** 2026-09-25
- **Branch:** `feat/production-functional-corrections` (base `main@824615b`)
- **Plano:** `docs/superpowers/plans/2026-09-23-production-functional-corrections.md`

## Contexto

O review de prontidão de 2026-09-23 identificou 7 defeitos funcionais que
bloqueavam o aceite de produção (Onda 1: integridade/autorização, itens 1–4;
Onda 2: resiliência/apresentação, itens 5–7). O smoke público anterior (5/5)
não substituía a jornada autenticada com dados controlados. Esta execução
implementou os 7 itens no candidato `feat/production-functional-corrections`
(commits `dc056d9..890a531`) e acrescentou cobertura E2E nova para
proposta/confirm/cancel/retry (spec `ted-pending-ops`, 7 testes) mais o
endurecimento do harness E2E para o shell desktop e as specs de
push/notificação.

## O que foi implementado

1. **API — linhagem autenticada fail-closed** (`dc056d9`): token de
   dispositivo emitido com identidade de sessão exige UUID resolvido para
   `users.id`; lookup ausente ou com falha produz `auth.identity_unavailable`
   tipado (sem ecoar SQL), sem INSERT parcial; rotação resolve dentro da
   transação com ROLLBACK e predecessor intacto.
2. **PWA — guarda de autoridade de escrita** (`395de12`): nenhum mutador
   atualiza estado antes da autoridade online confirmada; `unknown` não
   concede autoridade a token de dispositivo; cookie-only autenticado segue
   escrevendo e reconciliando; snapshot V3 válido permanece somente-leitura.
3. **Agent — grounding de saldo por conta** (`2090bdd`): projeção
   `list_accounts` carrega `kind`; pergunta genérica lista contas
   separadamente (sem total heterogêneo); nome único escolhe a conta pedida;
   cartão é rotulado como dívida; lista parcial declara parcialidade.
4. **PWA/TED — apresentação acionável obrigatória** (`395de12`): `proposed`
   sem apresentação mostra aviso + somente Cancelar; `failed` sem
   apresentação não mostra Retry; com apresentação válida, valor, conta,
   categoria e data ficam visíveis antes de Confirm/Retry. Testes antigos que
   cristalizavam aprovação cega foram atualizados.
5. **Failover do `/rpc/chat`** (`dc056d9` + `2090bdd`): primário
   429/timeout/erro operacional com fallback configurado → no máximo uma
   segunda tentativa em provider/modelo distinto; 400 de payload, 403
   `agent.model_not_allowlisted`, erro de autoridade/epoch e configuração
   local → zero fallback. Código/status do relay preservado (sem conversão
   em 502 genérico).
6. **Deadline absoluto do relay/broker** (`dc056d9` + `2090bdd`): fetch e
   corpo pendentes encerram em prazo finito; turno seguinte não depende do
   anterior travado; sem sucesso sintético.
7. **UX e SSR** (`395de12`): `StaleBanner` com refresh por domínio e erro
   claro quando offline (sem reload desnecessário); flash inicial SSR tratado
   como hidratação, sem mock financeiro.
8. **Cobertura E2E nova**: spec `ted-pending-ops` (OP-01..OP-05 + OP-06a/OP-06b,
   7 testes) contra fixture determinística local (stub do agent programável
   via `/__e2e/agent-script`, journal por teste); harness desktop-aware
   (FAB mobile vs launcher TED no desktop) e specs push/pwa-runtime/no-api
   ajustadas.

## Evidências de validação (2026-09-25, candidato)

- **Gates locais 7/7 verde:** typecheck, lint, docs:lint, governance:check,
  public-safety --strict, production:smoke:contract 6/6, `pnpm test` (API
  2080 pass / 39 skip, Agent 674 pass / 1 skip, broker 25 pass, PWA 2138
  pass).
- **E2E mobile:** 140 pass / 25 skip / 8 falhas — as 8 falhas são as mesmas
  do baseline pré-candidato, estáveis e conhecidas (UI-07,
  ted-chat-workspaces, TX-06, TRF-01, TRF-02, workspaces-multiuser ×3).
- **E2E desktop subset canônico (home+navigation):** 39/39; push-runtime 4/4;
  pwa-runtime 6/6; no-api 1/1; ted-pending-ops 7/7 em ambos os viewports.
- **E2E desktop completo:** 122/25/26 com causa única sistêmica (specs
  escritas para o FAB mobile, fora do gate canônico `run-ci.sh`) — aceito
  como limitação mobile-first conhecida, com follow-up registrado.
- **PostgreSQL descartável:** evidência `integration:all` + concorrência de
  2026-09-24 permanece válida — nenhum arquivo de produto em `apps/api` /
  `apps/agent` mudou desde então (mudanças posteriores restritas a
  e2e/fixture/specs).

## Findings do review e resolução

- **P2 — OP-06a/OP-06b alegavam failover do agent:** os testes provam o
  contrato de retry da PWA (reenvio pelo usuário com o mesmo `intentionId`;
  ausência de retry automático após 403), não as duas pernas dentro do mesmo
  turno do agent (cobertas pelos units
  `apps/agent/tests/llm-relay-failover*.test.ts`). **Resolução:** renomeados
  títulos, divisores e cabeçalho da spec para declarar o contrato de retry
  do cliente; lógica e asserções que já passavam (7/7 nos dois viewports)
  foram preservadas intactas.
- **P3 — plano com pendências desatualizadas:** **resolução:** bloco de
  resultado e seção de pendências do plano atualizados com a validação de
  2026-09-25 (itens a–f: 8 falhas mobile, specs desktop FAB-dependentes,
  PG com evidência herdada, checks remotos no PR, topologia proxy-vs-direto,
  navegação full-document sob SW).

## Decisões do Planner

- **Desktop completo aceito como limitação:** causa única sistêmica (FAB
  mobile), fora do gate canônico; follow-up de adaptação ao shell desktop,
  sem bloqueio do PR.
- **Evidência PG herdada válida:** justificativa documentada no plano —
  zero mudança em produto `apps/api`/`apps/agent` desde 2026-09-24.
- **Topologia E2E proxy-vs-direto:** recomendação do frontend-engineer
  (assar `/api/backend` + permitir `x-e2e-test-id` no proxy) registrada como
  decisão futura; não bloqueia.

## Pendências restantes

(a) 8 falhas mobile conhecidas; (b) specs desktop FAB-dependentes;
(c) `integration:all` + concorrência com `DATABASE_URL_TEST` dedicado em
próxima mudança de produto; (d) checks remotos no mesmo SHA (rodarão no PR);
(e) topologia proxy-vs-direto; (f) navegação full-document sob SW (limitação
topológica, inexistente em produção). Nenhuma publicação executada; nenhum
endpoint de produção consultado.
