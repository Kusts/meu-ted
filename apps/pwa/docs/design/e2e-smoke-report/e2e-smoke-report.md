# E2E Smoke Report — Production-Like Validation (Windows, Nemotron 3.5 LT Free)

## Execução (estado FINAL)
- **Suíte**: Playwright `functional-mobile` (chromium headless, viewport 390x844), config `apps/pwa/e2e/playwright.config.ts`
- **Topologia**: harness `http://127.0.0.1:3000` → Next standalone `:3001` → fixture API `:4010` (via `PWA_BACKEND_PROXY_ORIGIN`); o cliente chama o proxy relativo `/api/backend` (baked de `apps/pwa/.env.local`)
- **Resultado FINAL (2026-09-09)**: **128 passed / 12 failed / 24 skipped em 164 testes** (inclui 4 specs novas PAYSTMT/TRF de `a8c36cf`)
- **Data**: 2026-09-08 a 2026-09-09
- **Evolução**: 160/160 falhando no bootstrap de auth (pré-fix, 2026-09-08) → 89/47/24 → 109/27/24 em 160 → **128/12/24 em 164** (pós-triagem `0bca478`). Detalhe por grupo em "Re-run final pós-triagem"; o estado pré-fix está preservado em "Histórico — estado pré-fix (resolvido em 72eda03)".

## Resultado Resumido (FINAL)

| Métrica | Total |
|---------|-------|
| Passed | 128 |
| Failed | 12 (todas classificadas — nenhuma é infra de auth) |
| Skipped | 24 |
| **Total** | **164** |

Falhas restantes por grupo, causas e veredito: ver "Re-run final pós-triagem" (não renegociados aqui).

## Causa raiz do bloqueio de auth (2026-09-09, provada com evidência)

**Sintoma**: journal do fixture vazio para `POST /auth/devices/register`; FAB "Nova transação" nunca aparece; 160/160 specs falham no bootstrap. Produção saudável → causa no setup de teste, não no produto.

**Cadeia causal provada** (diagnóstico NETDIAG/CSPDIAG/RDIAG*, specs temporárias já removidas).

> Nota (achado 4 do review, MEDIUM): os itens C2–C7 abaixo são evidência histórica de código — os fixes estão aplicados em `72eda03`, mas as sondas NETDIAG/RDIAG foram removidas, então a cadeia NÃO é prova independente reproduzível; vale como registro do que foi corrigido.

1. **Fixture sem `Access-Control-Allow-Credentials`** (causa principal): `apiFetch` sempre envia `credentials: "include"` (`src/lib/api/client.ts:145`). O fixture respondia `POST /auth/sign-in/email 200` (journal preenchia!) mas sem `ACA-Credentials: true` o browser rejeita a resposta cross-origin (`net::ERR_FAILED`, "Failed to fetch") — servidor processa, app nunca recebe. Fix: 1 header em `e2e/fixture-api/server.ts` (`handleCors`). Após o fix, sign-in 200 + register 200 + token `pi-finance:token` + home carregam (NETDIAG pós-fix).

> Qualificação (achado 2 do review, HIGH): este mecanismo CORS vale para o caminho DIRETO ao fixture (chamada cross-origin a `:4010` com `credentials: "include"`). A suíte via proxy `/api/backend` é same-origin — CORS não se aplica aí; o defeito real do caminho proxy era a perda do header `x-e2e-test-id` (o proxy não o encaminha — allowlist em `src/app/api/backend/[...path]/route.ts:24-44` — e o fixture o exige, `e2e/fixture-api/server.ts:252-256`), de modo que o fixture não correlacionava o usuário de teste → 400 / "Sem conexão" (causa provada pelo Coder 1 no E2E focado). Consequência: a suíte E2E deve usar a base direta do fixture (4010).
2. **Harness clicava em botão inexistente**: `authenticate()` (commit fccb56a) clicava em "Registrar" — o produto (`AuthGate.tsx`) só tem "Entrar". Revertido para o fluxo real: preencher e-mail/senha → Entrar → app chama sign-in + register.
3. **CSP do build bloqueava inline script do produto**: 1 script inline de tema sem nonce × `script-src` com nonce → console error → failure-guard. Fix só no harness (`rewriteCspForFixture` neutraliza `script-src` para e2e; nonce presente anula `unsafe-inline`, por isso a diretiva é substituída).
4. **Rotas 307 engolidas pelo `route.fulfill()`**: `fulfill` não processa redirect no browser — REDIRECT ficava na URL legada. Fix no harness: `fetch({ maxRedirects: 0 })` em documents + redirect client-side sintético (RDIAG5 prova CSP reescrita + fixture alcançável pós-redirect).
5. **Rotas chamadas pelo app e ausentes no fixture** (implementadas no fixture, sem tocar produto): `GET /auth/invites/pending-me`, `GET /workspaces`, `GET /pending-operations`, 6× `GET /analytics/*`, `POST /transactions/detect-duplicate` — cada 404 logava console error e derrubava o guard.
6. **Gate DIRECT contava bootstrap como escrita**: `assertNoUnexpectedWrites` excluía só o register; agora exclui também `POST /auth/sign-in/email` (bootstrap obrigatório).
7. **Higiene**: `apps/pwa/playwright.config.ts` havia sido sobrescrito por engano (commit 18bdc4d) com config e2e apontando `baseURL` ao fixture (4010) — restaurado ao original (`scripts/offline-shell-spike`). Suíte real usa `apps/pwa/e2e/playwright.config.ts` (harness 3000 → Next 3001 → fixture 4010). `PWA_BACKEND_PROXY_ORIGIN` apontado ao fixture no `webServer` para o caso de build com base relativa `/api/backend`.

**Resultado das correções verificadas isoladamente antes do re-run**: AUTH-01 ✅, AUTH-02 ✅, DIRECT-01..12 ✅ (12/12), REDIRECT-01/02/04 ✅; REDIRECT-03 exigiu ainda 1 ajuste de regex no spec (Next preserva `?cardId=..` antes de `&aba=`).

## Re-execução completa pós-fixes (2026-09-09)

**Ambiente**: Playwright `functional-mobile` (chromium headless, viewport 390x844), `apps/pwa/e2e/playwright.config.ts`, fixture 4010 + Next 3001 + harness 3000 via `webServer`, 160 testes, 1 worker.

**Resumo numérico (intermediário — baseline da triagem)**:

| Métrica | Total |
|---------|-------|
| Passed | 109 |
| Failed | 27 |
| Skipped | 24 |
| **Total** | **160** |

(Evolução: 89/47/24 no re-run anterior → 109/27/24. Corrigidos desta vez: DIRECT-01..12, REDIRECT-01..04, TX-02, TX-03, NAV-07, NAV-12. AUTH-01 e AUTH-02 verdes.)

**Falhas por grupo** (1 linha de causa cada; nada de produto corrigido):

| Grupo | Falhas | Causa (1 linha) | Sev. |
|-------|--------|-----------------|------|
| ACC-03, ACC-05 | 2 | Painel de detalhe do cartão nunca visível — fluxo UI do produto × localizadores do spec | MÉDIA |
| admin-agent-llm-config | 1 | Tela de config LLM não visível para o usuário do teste | BAIXA |
| CAT-02 | 1 | Strict-mode: 2 botões "Receita" renderizados — spec ambíguo × produto | BAIXA |
| G3-01, G3-02, G3-05 | 3 | `fill` com timeout 45s — campos do form nunca acionáveis no cenário | MÉDIA |
| HOME-02 | 1 | Sheet de notificações não abre ao tocar o sino | BAIXA |
| NOAPI-01 | 1 | UI de rejeição offline não visível como esperado | BAIXA |
| REP-01..04 | 4 | Stubs de `/analytics/*` retornam formas válidas porém vazias — chips/gráficos sem conteúdo ou rótulo divergente | MÉDIA |
| UI-02, UI-03, UI-04, UI-07, UI-08 | 5 | Prompts de confirm-discard / retry de erro não visíveis ou clique com timeout | MÉDIA |
| TED chat | 1 | Launcher/dialog do TED não visível no contexto da suíte | MÉDIA |
| TX-04, TX-06 | 2 | Cliques com timeout nos fluxos inline de transferência/subcategoria | MÉDIA |
| TX-08, TX-09 | 2 | Strict-mode: 2 botões "Cartão" no dialog — botões duplicados no produto | BAIXA |
| WAL-01 | 1 | Elemento da página patrimônio não visível | BAIXA |
| workspaces-multiuser ×3 | 3 | Card de proposta de titularidade não visível / clique com timeout | MÉDIA |

Nenhuma falha restante é de infra de auth: journal, token, CSP, redirects e bootstrap estão verdes (AUTH-01/02, DIRECT, REDIRECT passam). Restantes são divergências spec × UI do produto para triagem individual — produto NÃO tocado.

## Triagem 1-a-1 das 27 falhas (2026-09-09, specs isoladas, run sequencial)

Regra operacional aprendida: NUNCA rodar suítes em paralelo neste ambiente — duas
instâncias disputam as portas 3000/3001 (`EADDRINUSE`) e os resultados se contaminam
(CAT-03/04 "falharam" só no run paralelo; isoladas passam). Sempre sequencial.

| # | Teste | Reproduz isolado? | Causa | Ação |
|---|-------|-------------------|-------|------|
| 1 | ACC-03 | sim | strict-mode: "Nubank" ×3; overlay animado flaky no clique "Novo" | spec `.first()`; overlay em aberto |
| 2 | ACC-05 | sim (2 modos) | strict-mode Nubank ×3; abort de request em navegação | spec `.first()` + guard ignora `ERR_ABORTED` |
| 3 | admin-llm | sim | 1º: `authenticate()` em página em branco (sem goto) — corrigido; 2º: botão "configuração llm (admin)" não renderiza (role-gating do produto) | spec: goto; restante classificado |
| 4 | CAT-02 | sim | strict-mode: 2 botões "Receita" | spec: escopo ao dialog — **verificado 5/5 isolado** |
| 5 | CAT-03/04 | NÃO (passam isolado) | contaminação do run paralelo (`EADDRINUSE`) | nenhuma — **verificado 5/5 isolado** |
| 6 | G3-01/02 | sim | fillExpense sem menuitem + `fill()` não valida + categoria/origem fora de sheets | spec: menuitem + digitação sequencial + pickers via sheets |
| 7 | G3-05 | sim | mesmo FAB-menu no corpo do teste | spec: menuitem |
| 8 | HOME-02 | sim | texto stale do rename ("Alertas do Pi" → "Alertas do Meu Ted") | spec: 1 palavra |
| 9 | NOAPI-01 | sim (+2 causas) | sem menuitem; `fill()` não valida; Salvar exige categoria+origem | spec: menuitem + sequencial + pickers — **verificado verde isolado** |
| 9b | UI-07/08 coda | sim | após o fix: botão BottomNav chama-se "Extrato", não "Registros"; picker de origem exige sheet própria (chip abre picker, não seleciona) | spec: Extrato + origin via sheet — **verificado verde isolado (2/2)** |
| 10 | REP-01..04 | sim | UI do produto evoluiu (filtros "Período/Conta", sem chips Mês/Ano) | classificado, sem fix (reescrita de spec fora do escopo) |
| 11 | UI-02 | sim (+2ª causa) | sem menuitem; filtro `hasText: "Novo lançamento"` (título real é "Nova despesa") | spec: menuitem + filtro — **verificado verde isolado** |
| 12 | UI-03/04 | sim | sem menuitem | spec: menuitem no helper (UI-03/04 verdes no final) |
| 13 | UI-07/08 | sim (+2ª causa) | sem menuitem; Salvar exige categoria | spec: menuitem + picker de categoria |
| 14 | TED chat | sim | 5 bugs de spec corrigidos (goto, launcher `.last()`, placeholder, mock de history na URL errada, CORS); input renderiza só após 25–45s ociosos sem tráfego — gating do componente a investigar | parcial; restante classificado |
| 15 | TX-04 | sim | produto mantém "Transferir" disabled no inválido (correto) | spec: assert disabled — **verde no final** |
| 16 | TX-06 | sim | "Cancelar" desmonta o sheet; reabertura não traz o input | spec: force-click (insuficiente) — em aberto |
| 17 | TX-08/09 | sim | strict-mode: substring "cartão" | spec: `exact: true` — **verdes no final** |
| 18 | TX-02/03 | — | stub `detect-duplicate` (task anterior) | **verificados verdes isolado** |
| 19 | WAL-01 | sim | strict-mode: aba × span | spec: escopo a `main` |
| 20 | WS ×3 | sim | fulfills sem CORS (corrigido, 25 pontos) MAS segue "Sem conexão" — request isolado (Coder 2): `GET /api/backend/workspaces` no bootstrap; mecanismo em confirmação via experimento mínimo | parcial; em aberto — ver seção WS×3 |
| 21 | PAYSTMT/TRF (4 novos) | n/a (specs novas pós-baseline) | — | veredito no re-run final |

Specs novas no re-run final: `card-statement-payment.spec.ts` (PAYSTMT) + `transfer-record.spec.ts` (TRF), adicionadas em a8c36cf após o baseline 109/27/24 → total 164.

**Veredito final (re-run 128/12/24)**: confirmados verdes — ACC-03/05, CAT-02, G3-01/02, HOME-02, NAV-07, NOAPI-01, TX-08/09, UI-02/03/04/07/08, WAL-01, PAYSTMT/TRF (4/4). UI-07/08 passam isolados (2/2) E no run final (a race ordem-dependente foi observada no run 109/27/24, não no final — ver correção de contagem abaixo). TX-04 falhou neste run só por flake de infra (`goto` timeout na init; a causa de validação está corrigida). Em aberto para follow-up: admin-llm (gap de fixture/locator), G3-05 (premissa inválida do spec), REP-01..04 (specs obsoletos), TED (gap de harness + gating do input), TX-04 flake (confirmar no próximo run), TX-06 (reprodução insuficiente), WS ×3 (causa provada — ver seção WS×3).

## Re-run final pós-triagem (2026-09-09)

| Métrica | Total |
|---------|-------|
| Passed | 128 |
| Failed | 12 |
| Skipped | 24 |
| **Total** | **164** |

(Evolução completa: 89/47/24 em 160 → 109/27/24 em 160 → **128/12/24 em 164**, incluindo 4 specs novas PAYSTMT/TRF. Verdes confirmadas no final: AUTH-01/02, DIRECT-01..12, REDIRECT-01..04, ACC-01..06, CAT-01..05, G3-01/02, HOME-01..10, NAV-01..07/08..13, NOAPI-01, TX-01/02/03/05/07/08/09, UI-01/03/04/05/06/07/08, WAL-02..10.)

Restantes (12), todas classificadas abaixo — nenhuma é infra de auth:

| Grupo | Causa (1 linha) | Sev. |
|-------|-----------------|------|
| admin-llm | Botão "configuração llm (admin)" não renderiza no /perfil — gap de fixture/locator (role-gating do produto não atendido pelo contexto do teste) | BAIXA |
| G3-05 | Salvar segue disabled no modo offline (categoria indisponível com GETs em 503) — premissa inválida do spec (o disabled é a validação correta do produto) | MÉDIA |
| REP-01..04 | UI do produto evoluiu (filtros, sem chips) — specs obsoletos, requerem reescrita | MÉDIA |
| TED chat | Input renderiza só após 25–45s ociosos sem tráfego — gap de harness (rota mockada divergente da real `/agents/finance-chat-agent/:workspaceId/rpc/chat`) + gating do componente a investigar | MÉDIA |
| TX-04 | Flake de infra neste run (`goto` com timeout na init; falha anterior de validação já corrigida) | BAIXA |
| TX-06 | Reabertura do form inline não traz o input — reprodução insuficiente (force-click não cobre a state machine do sheet) | MÉDIA |
| WS ×3 | "Sem conexão": o proxy `/api/backend` perde o `x-e2e-test-id` → fixture não correlaciona o usuário de teste → 400 — causa PROVADA pelo Coder 1 no E2E focado; suíte deve usar a base direta do fixture (4010) | MÉDIA |

> Correção de contagem (achado 1 do review, HIGH): esta tabela declarava 12 falhas mas enumerava 14 alvos (UI-07/08 indevidamente mantidos). Fonte da verdade = resultado Playwright bruto do último run completo: `apps/pwa/test-results/.last-run.json` com 12 `failedTests` + 12 pastas `error-context.md` (observados antes da limpeza pelo run focado do Coder 1) — sem nenhuma pasta de UI-07/08, que passaram isoladas (2/2) E no run final (a race era do run 109/27/24). Contagem corrigida: admin-llm 1 + G3-05 1 + REP 4 + TED 1 + TX-04 1 + TX-06 1 + WS 3 = **12**.

**Screenshots 390x844** (`apps/pwa/docs/design/previews/e2e-smoke/`, viewport do projeto):

| Arquivo | Fluxo | Estado |
|---------|-------|--------|
| `s01-home.png` | home autenticada | renderizada (~121 KB) |
| `s02-registros.png` | /registros | renderizada (~52 KB) |
| `s03-fatura-cartao.png` | /hub/patrimonio?aba=cartoes | renderizada (~104 KB) |
| `s04-compromissos.png` | /compromissos | renderizada (~79 KB) |
| `s05-ted-chat.png` | TED chat (launcher + dialog) | renderizada (~121 KB) |
| `s06-analytics.png` | /hub/relatorios | renderizada (~69 KB) |

## WS×3 — investigação read-only (Coder 2, 2026-09-09)

Escopo: read-only — nenhum código de produto ou spec alterado, nenhuma suíte executada (portas 3000/3001/4010 single-instance, via E2E com o Coder 1).

**Request que falha**: `GET /api/backend/workspaces` (same-origin; base relativa `/api/backend` baked em `apps/pwa/.env.local:1`, proxy em `src/app/api/backend/[...path]/route.ts`) via `fetchWorkspaces()` (`src/lib/api/workspaces.ts:65-71` → `apiFetch` com `credentials: "include"`, `src/lib/api/client.ts:142-147`), disparado no bootstrap do `WorkspaceProvider` (`src/lib/auth/workspace-context.tsx:164`). O erro é exibido em `WorkspaceManagerPage.tsx:506-511` (alert + "Tentar novamente"); a lista fica vazia (`:553-560`, "0 total" / "Nenhum workspace ainda") e o badge vira "Sem conexão" (`WorkspaceSwitcher.tsx:108-144`).

**Evidência (assinatura idêntica nos 3)**: `apps/pwa/test-results/specs-workspaces-multiuser-*/error-context.md` — alert "Failed to fetch" + retry, "0 total", "Nenhum workspace ainda". Sem `activeWorkspace`, os 3 alvos somem em cascata: heading "Convites pendentes" (`WorkspaceManagerPage.tsx:639`, exige workspace compartilhado ativo), botão "revogar convite…" (clique com timeout, teste 2) e "Proposta de Titularidade" (`:519-523`, exige `pendingTransferForMember`, `:157`).

**Excluído — CORS nos fulfills**: o run que gerou as evidências JÁ continha `MOCK_CORS_HEADERS` (o fonte do spec embutido no error-context o prova) e, além disso, o tráfego real do app é same-origin (`/api/backend`), onde `Access-Control-Allow-Origin/Credentials` nos mocks são irrelevantes.

**Causa PROVADA (Coder 1, E2E focado 2026-09-09)** — o proxy `/api/backend` perde o `x-e2e-test-id` → o fixture não correlaciona o usuário de teste → login 400 / "Sem conexão"; a suíte deve usar a base direta do fixture (4010). Fragilidade contribuinte do harness (sombreamento de rota no spec): `workspaces-multiuser.spec.ts:49` registra `page.route("**/*")` DEPOIS do `applyCspRewrite` (`e2e/support/harness.ts:158-201`). O Playwright dá precedência à rota registrada por último (playwright-core@1.61.1 `types.d.ts:4054`) e só `route.fallback()` encadeia para o próximo handler — `route.continue()` vai direto à rede. Consequências neste spec (o ÚNICO da suíte com catch-all próprio; todos os outros `page.route` usam padrões estreitos — `g3-gate`, `no-api`, `ted-chat-workspaces`, `admin-agent-llm-config`): (a) os documents nunca passam pelo rewrite de CSP (consistente com o erro de CSP que só este spec precisa tolerar, spec:199/252/314); (b) o mock responde até a requests não-API cujo pathname colide (`endsWith("/workspaces")` casa `/workspaces` de documents/RSC/prefetch). Ou seja: o mock era load-bearing sobre um caminho real que nunca poderia funcionar via proxy — o sombreamento o tornava frágil.

**O que falta**: `apps/pwa/test-results/` retém só `error-context.md` (snapshots) — nenhum `trace.zip`/log de rede. Sem isso, o ponto exato de rejeição (browser × harness × proxy × fixture) não é fechável read-only.

**Experimento formal de confirmação (follow-up PENDENTE, desenho pronto — NÃO executado)**: spec temporário replicando o teste 1 com mocks em padrão ESTREITO (`**/api/backend/**`, sem interceptar documents — o rewrite de CSP volta a valer) + `page.on("requestfailed"/"response")` logando a `GET /api/backend/workspaces` (status/errorText) + `trace: "on"`. Asserções: alert de erro AUSENTE e "1 total". Se verde → sombreamento confirmado (estreitar o padrão no spec real resolve); se ainda "Failed to fetch" → o `errorText` distingue falha TCP (contaminação de run paralelo / servidor fora) de HTTP (investigar proxy→fixture). Rodar sequencial, sem outra instância E2E nas portas 3000/3001/4010, e reter o trace.

## Histórico — estado pré-fix (resolvido em 72eda03)

> Tudo abaixo descreve o estado de 2026-09-08, SUPERADO pelo commit `72eda03` (causa-raiz CORS + harness) e pela triagem `0bca478`. Mantido como registro — não usar para decisões.

1. **Autenticação (nó crítico, RESOLVIDO)**: o `authenticate()` clicava em "Registrar" inexistente e o fixture não enviava `Access-Control-Allow-Credentials` — journal vazio para `POST /auth/devices/register`, FAB nunca aparecia, 160/160 falhavam no bootstrap. Ver "Causa raiz do bloqueio de auth" acima.
2. **CSP Rewrite (RESOLVIDO no harness)**: `rewriteCspForFixture` hoje neutraliza `script-src` e prefixa `connect-src` com o fixture — era insuficiente antes do fix porque o bloqueio real era CORS, não CSP.
3. **Service Workers (esclarecido)**: `serviceWorkers: "block"` no projeto `functional-mobile` é intencional; SW não era a causa.
4. **Servidores do run (esclarecido)**: a topologia canônica é fixture 4010 + Next 3001 + harness 3000 via `webServer` (`apps/pwa/e2e/playwright.config.ts:87-124`). Fato ainda válido: probes de produção via `curl` externo estavam e seguem VERDES (PWA / 200 + title "Meu Ted", /pwa-control v3.3.0, Agent /health schemaVersion 5, API /health 200, 6 redirects legacy 200).
5. **Seed data (fato ainda válido)**: `e2e-seed.tmp.ts` (apps/api, NÃO rastreado) cria admin/member + workspaces contra a API real em 3101; não roda neste ciclo (exige DB) — a suíte usa o seed `populated` do fixture, que já contém `authRegister`.
6. **Severidade histórica**: MÉDIA — mesmo no pior momento, era falha de integração fixture↔Playwright no setup Windows, nunca de produto.

## Evidências Coletadas (estado final)

- **Falhas finais**: 12× `error-context.md` em `apps/pwa/test-results/*/` (snapshots + fonte do spec no ponto da falha). Nenhum `trace.zip` foi retido — coleta de rede é follow-up (ver WS×3 acima).
- **Contexto de erro típico**: `expect(...).toBeVisible()` / `locator.click` com timeout após bootstrap incompleto; cada pasta documenta o caso.
- **Screenshots**: `apps/pwa/docs/design/previews/e2e-smoke/` (tabela em "Re-run final pós-triagem").

## Cobertura canônica — Coder 2 (2026-09-09)

**Specs novos** (`apps/pwa/e2e/specs/`, projeto `functional-mobile`, viewport 390x844, fixture 4010 reutilizado — ciclo de vida do fixture intocado):

| Spec | Resultado |
|------|-----------|
| [PAYSTMT-01] `card-statement-payment.spec.ts` — pagar fatura integral → `POST /cards/statements/stmt-1/pay` 200, sheet fecha | PASS |
| [PAYSTMT-02] — após reload: badge "Paga" no histórico + CTA "Pagar fatura" desabilitado | PASS |
| [TRF-01] `transfer-record.spec.ts` — transferência via FAB → `POST /transfers` 200, sheet fecha | PASS |
| [TRF-02] — corpo do journal confere `description/amountCents/fromAccountId/toAccountId` (`Reserva mensal`, 25000, acc-1 → acc-2) | PASS |

> Escopo validado (achado 10 do review, MEDIUM): SUPERFICIAL — POST/journal/estado de badge/CTA. Lacunas financeiras NÃO cobertas: o fixture atualiza `paidCents`/status no pay de fatura (`e2e/fixture-api/server.ts:617-628`) mas não debita conta alguma (`fromAccountId` sequer existe no pay); `POST /transfers` grava o registro sem mover saldo (`server.ts:517-541`); sem idempotência (o fixture não deduplica — só propaga o header), sem validação de saldo, sem isolamento multitenant, sem terceiros. Manter PAYSTMT/TRF como cobertura adicional até haver saldo/idempotência.

**Fluxos sem spec — motivo real (nada inventado):**

- **(a) Edição com subcategoria — FLUXO EXISTE MAS QUEBRADO NO PRODUTO (bug, sem spec):** o `select#te-categoria` de "Editar lançamento" (`TransactionEditSheet.tsx`) reverte QUALQUER alteração. Snap-back imediato, sem flicker. Evidência de sonda E2E (spec temporário já removido): options `["","Sem categoria"],["cat-1","Alimentação"],["cat-2","Transporte"],["cat-4","Sub-alimentação"]`; após `selectOption("cat-4")`, `change` nativo disparou 1× mas valor ficou `cat-1` em 6 amostras/1,2 s; teclado confiável (`focus` + `s`) também ficou `cat-1`; `fill("XYZ probe")` em `#te-descricao` reverteu para `"Supermercado"` em 500 ms. Causa-raiz: `useEffect(..., [transaction, open, markClean])` (`TransactionEditSheet.tsx:46-57`) — `markClean` de `useFormDirtySafe` troca de identidade a cada dirty (`unsaved-changes.tsx`: `ctx` recriado via `useMemo` a cada `setDirtyTokens` → `markClean` recriado via `useCallback [live, ctx, token]`) → qualquer edição dispara `markDirty` → efeito re-roda → form resetado aos valores originais. Impacto colateral: **REC-05 era falso-positivo** (preenchia descrição/valor, salvava, mas o `PATCH` levava os valores ORIGINAIS — o spec nunca conferia o corpo). **CONCLUÍDO pelo Coder 1 (2026-09-09)**: RED (regressão 2/2 reproduz o snap-back) → fix estabilizando `markDirty`/`markClean` via ref em `apps/pwa/src/lib/unsaved-changes.tsx` (o contexto passa por ref em vez de recriar identidades a cada `setDirtyTokens`) → GREEN (regressão 2/2, consumidores 81/81 — métricas repassadas); REC-05 endurecido com asserção de payload do `PATCH` e EDIT-SUB (`e2e/specs/records-edit-sub.spec.ts`: tx-1 de cat-1 para cat-4, assert de `categoryId` no corpo) VERDES em functional-mobile. Commits locais `b3804e0` + `ad93761` (sem push). Arquivos: `src/lib/unsaved-changes.tsx`, `__tests__/TransactionEditSheetDirtyRegression.test.tsx`, `e2e/specs/records.spec.ts`, `e2e/specs/records-edit-sub.spec.ts`.
- **(b) Parcelamento fora do cartão — fluxo não implementado no produto:** UI de parcelas renderiza SOMENTE com `originKind === "card"` (`NewTransactionSheet.tsx:744-745`, `parcelado = !isTransfer && originKind === "card" && ...`, troca de origem reseta para 1×); API só tem `POST /cards/installments`. Spec não criado.
- **(d) Recorrência de conta a pagar — fluxo não implementado no produto:** `NewPayableSheet` (`PayablesPage.tsx:31-126`) não tem campo de recorrência (só descrição/valor/vencimento/conta/categoria); `createPayable` aceita `type/frequency` opcional mas o fixture ignora e não expande ocorrências. (Recorrências de outro domínio — assinaturas — já têm `subscriptions.spec.ts`.) Spec não criado.
- **(e) Transferência a terceiros — conceito inexistente; fluxo canônico existente coberto:** produto só transfere entre contas próprias (`fromAccountId/toAccountId`, sem destinatário externo — nem na API `apps/api`); TRF-01/02 pinam esse fluxo + registro correto.

**Contrato TED (nesta lane):** `generate-agent-tools --check` acusava gerado defasado → regenerado `apps/agent/src/generated/http-tools.ts` (52 tools; `create_expense`/`create_income` ganharam `subcategoryId` + `notes`, conferindo com `NewTransactionSheet` — nada inventado) + header factual do `tool-capability-inventory.md` (apontava para `.pi/...` removido). Gates: `capabilities:check` 52/72 ✅, `write-policy:check` 176/176 ✅, `--check` ✅. Refs de tools em `agent-config/` conferidas contra o gerado (5 candidatos são tools locais legítimas: `web_search`, `web_fetch`, `remember_fact`, `recall`/`list_past_sessions`/`get_session_summary`).

## Review formal (2026-09-09)

Veredito do Reviewer Pi (task_e73b413c4ba7): **REPROVADO para aceite como relatório final** — na época (pré-fix TransactionEditSheet, WS×3 sem causa). Status abaixo reflete o pós-fix.

| # | Achado (sev.) | Status atual |
|---|---------------|--------------|
| 1 | Contagem: 12 declaradas × 14 alvos (HIGH) | ENDEREÇADO — UI-07/08 removidos da tabela (verdes no run final); 1+1+4+1+1+1+3=12, fonte: resultado Playwright bruto |
| 2 | CORS como causa principal, sem qualificar o caminho (HIGH) | ENDEREÇADO — causa válida só no caminho direto `:4010`; proxy `/api/backend` é same-origin; defeito do proxy = perda do `x-e2e-test-id` (prova Coder 1) |
| 3 | CSP: build exige nonce mas layout injeta THEME_SCRIPT sem nonce (HIGH) | ENDEREÇADO em `5513482` (nonce por request no script de tema; risco residual: validar flash de tema/console CSP em produção) |
| 4 | Cadeia C2–C7 como prova independente (MEDIUM) | ENDEREÇADO — rotulada como evidência histórica de código (sondas NETDIAG/RDIAG removidas) |
| 5 | admin-llm não prova role-gating (MEDIUM) | Follow-up (7º da fila): mockar perfil admin/não-admin + locator do texto real ("Gerenciador de IA") |
| 6 | TED: rota mockada divergente da real (MEDIUM) | Follow-up (4º da fila): corrigir mock para `/agents/finance-chat-agent/:workspaceId/rpc/chat` e provar request/resposta |
| 7 | G3-05: premissa inválida do spec (MEDIUM) | Follow-up (3º da fila): formulário válido ou testar o guard diretamente |
| 8 | UI-07/08 + TX-06: race não isolada / force-click (MEDIUM) | Follow-ups (5º e 6º): remover force, sincronização observável, trace que distinga race de bug de estado |
| 9 | TransactionEditSheet snap-back + REC-05 falso-positivo (HIGH) | ENDEREÇADO (`b3804e0`+`ad93761`; regressão 2/2, consumidores 81/81; REC-05 endurecido; EDIT-SUB verde) |
| 10 | PAYSTMT/TRF com claim financeiro além do provado (MEDIUM) | ENDEREÇADO — claim reduzido a fluxo superficial; lacunas registradas (saldo, idempotência, isolamento, terceiros) |
| 11 | WS×3 sem causa isolada | Causa PROVADA (proxy perde `x-e2e-test-id` → 400); experimento formal com mocks estreitos+trace pendente (2º da fila) |
| 12 | Classificação operacional dos grupos (LOW/MEDIUM) | ENDEREÇADO — tabela "Restantes" reclassificada conforme o review |

Fila priorizada do Pi (status atual): 1º TransactionEditSheet+REC-05 — CONCLUÍDO; 2º WS×3 — causa provada, confirmação formal pendente; 3º G3-05 — pendente; 4º TED (corrigir rota mockada) — pendente; 5º UI-07/08 — pendente (verdes no run final; race a isolar se recidivar); 6º TX-06 — pendente; 7º admin-llm — pendente; 8º REP-01..04 — pendente. Nota: manter PAYSTMT/TRF como cobertura adicional até haver saldo/idempotência.

## Recomendações (estado final 2026-09-09)

- **Decisão canônica**: fixture/harness corrigido (commit `72eda03`) em vez de apontar a suíte contra a API real local — as probes de produção separadas já validam a API real (verdes); o fixture determinístico mantém a suíte reproduzível.
- **REC-05 era falso-positivo — CORRIGIDO e endurecido**: bug `TransactionEditSheet` CONCLUÍDO pelo Coder 1 (commits `b3804e0` + `ad93761`); REC-05 agora com asserção de payload do `PATCH`, verde.
- **EDIT-SUB ATIVO e verde**: `e2e/specs/records-edit-sub.spec.ts` (subcategoria cat-1→cat-4 com assert de `categoryId`) verde em functional-mobile.
- **WS×3 — causa provada**: proxy `/api/backend` perde `x-e2e-test-id` → fixture 400 / "Sem conexão" (Coder 1); suíte deve usar base direta do fixture (4010); experimento formal com mocks estreitos+trace segue como follow-up (ver seção WS×3).
- **Regra operacional**: NUNCA rodar suítes em paralelo neste ambiente — portas 3000/3001/4010 são single-instance (`EADDRINUSE` contamina resultados; ver triagem). Sempre sequencial.
- **Review formal**: veredito REPROVADO na época, 12 achados com status atual e fila priorizada — ver seção acima.
- **Manter**: probes de produção (PWA, Agent, API) verdes — documentadas em `docs/agent/2026-09-08-v049-api-release.md`.
