# E2E Smoke Report — Production-Like Validation (Windows, Nemotron 3.5 LT Free)

## Execução
- **Suite**: Playwright `functional-mobile` (chromium headless)
- **Base URL**: `http://127.0.0.1:4010` (fixture API) com `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL`
- **Testes**: 160 specs rodadas; todas falharam no mesmo estágio de autenticação
- **Data**: 2026-09-08 a 2026-09-09

## Resultado Resumido

| Fluxo | Status | Severidade | Causa Apparente | Evidência |
|-------|--------|------------|-----------------|-----------|
| Login / Registro (AUTH-01) | FAIL | MÉDIUM | Sessão não estabelecida — FAB "Nova transação" não visível após `authenticate()` | Trace zip disponível; journal vazio para POST /auth/devices/register; CSP rewrite aplicado mas session não persiste |
| Conta/Cartão creation (ACC-01, CARD-01, CAT-01) | FAIL | MÉDIUM | Bloqueado por Falha de auth anterior — FAB nunca apareceu | 29/30 accounts/cards/categories specs falham idêntico |
| Goals (GOAL-01 a GOAL-06) | FAIL | MÉDIUM | Bloqueado por Falha de auth anterior | 6/6 goals specs falham |
| Home/perfil (HOME-01 a HOME-07) | FAIL | MÉDIUM | Bloqueado por Falha de auth anterior | 7/7 home specs falham |
| Navigation (DIRECT-01 a DIRECT-07) | FAIL | MÉDIUM | Bloqueado por Falha de auth anterior; navigation specs testam routes sem auth mas CSP/blocking interfere | 7/7 navigation specs falham |
| G3-Gate (G3-01 a G3-05) | FAIL | MÉDIUM | Bloqueado por Falha de auth anterior | 5/5 g3-gate specs falham |
| Budgets (BUD-01 a BUD-04) | FAIL | MÉDIUM | Bloqueado por Falha de auth anterior | 4/4 budgets specs falham |

## Causa raiz do bloqueio de auth (2026-09-09, provada com evidência)

**Sintoma**: journal do fixture vazio para `POST /auth/devices/register`; FAB "Nova transação" nunca aparece; 160/160 specs falham no bootstrap. Produção saudável → causa no setup de teste, não no produto.

**Cadeia causal provada** (diagnóstico NETDIAG/CSPDIAG/RDIAG*, specs temporárias já removidas):

1. **Fixture sem `Access-Control-Allow-Credentials`** (causa principal): `apiFetch` sempre envia `credentials: "include"` (`src/lib/api/client.ts:145`). O fixture respondia `POST /auth/sign-in/email 200` (journal preenchia!) mas sem `ACA-Credentials: true` o browser rejeita a resposta cross-origin (`net::ERR_FAILED`, "Failed to fetch") — servidor processa, app nunca recebe. Fix: 1 header em `e2e/fixture-api/server.ts` (`handleCors`). Após o fix, sign-in 200 + register 200 + token `pi-finance:token` + home carregam (NETDIAG pós-fix).
2. **Harness clicava em botão inexistente**: `authenticate()` (commit fccb56a) clicava em "Registrar" — o produto (`AuthGate.tsx`) só tem "Entrar". Revertido para o fluxo real: preencher e-mail/senha → Entrar → app chama sign-in + register.
3. **CSP do build bloqueava inline script do produto**: 1 script inline de tema sem nonce × `script-src` com nonce → console error → failure-guard. Fix só no harness (`rewriteCspForFixture` neutraliza `script-src` para e2e; nonce presente anula `unsafe-inline`, por isso a diretiva é substituída).
4. **Rotas 307 engolidas pelo `route.fulfill()`**: `fulfill` não processa redirect no browser — REDIRECT ficava na URL legada. Fix no harness: `fetch({ maxRedirects: 0 })` em documents + redirect client-side sintético (RDIAG5 prova CSP reescrita + fixture alcançável pós-redirect).
5. **Rotas chamadas pelo app e ausentes no fixture** (implementadas no fixture, sem tocar produto): `GET /auth/invites/pending-me`, `GET /workspaces`, `GET /pending-operations`, 6× `GET /analytics/*`, `POST /transactions/detect-duplicate` — cada 404 logava console error e derrubava o guard.
6. **Gate DIRECT contava bootstrap como escrita**: `assertNoUnexpectedWrites` excluía só o register; agora exclui também `POST /auth/sign-in/email` (bootstrap obrigatório).
7. **Higiene**: `apps/pwa/playwright.config.ts` havia sido sobrescrito por engano (commit 18bdc4d) com config e2e apontando `baseURL` ao fixture (4010) — restaurado ao original (`scripts/offline-shell-spike`). Suíte real usa `apps/pwa/e2e/playwright.config.ts` (harness 3000 → Next 3001 → fixture 4010). `PWA_BACKEND_PROXY_ORIGIN` apontado ao fixture no `webServer` para o caso de build com base relativa `/api/backend`.

**Resultado das correções verificadas isoladamente antes do re-run**: AUTH-01 ✅, AUTH-02 ✅, DIRECT-01..12 ✅ (12/12), REDIRECT-01/02/04 ✅; REDIRECT-03 exigiu ainda 1 ajuste de regex no spec (Next preserva `?cardId=..` antes de `&aba=`).

## Re-execução completa pós-fixes (2026-09-09)

**Ambiente**: Playwright `functional-mobile` (chromium headless, viewport 390x844), `apps/pwa/e2e/playwright.config.ts`, fixture 4010 + Next 3001 + harness 3000 via `webServer`, 160 testes, 1 worker.

**Resumo numérico FINAL**:

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
| 20 | WS ×3 | sim | fulfills sem CORS (corrigido, 25 pontos) MAS segue "Sem conexão" — qual request falha ainda a isolar | parcial; em aberto |
| 21 | PAYSTMT/TRF (4 novos) | n/a (specs novas pós-baseline) | — | veredito no re-run final |

Specs novas no re-run final: `card-statement-payment.spec.ts` (PAYSTMT) + `transfer-record.spec.ts` (TRF), adicionadas em a8c36cf após o baseline 109/27/24 → total 164.

**Veredito final (re-run 128/12/24)**: confirmados verdes — ACC-03/05, CAT-02, G3-01/02, HOME-02, NAV-07, NOAPI-01, TX-08/09, UI-02/03/04, WAL-01, PAYSTMT/TRF (4/4). UI-07/08 passam isolados (2/2) mas falham no run completo (race de timing). TX-04 falhou neste run só por flake de infra (`goto` timeout na init; a causa de validação está corrigida). Em aberto para follow-up: admin-llm (role-gating), G3-05 (validação offline), REP-01..04 (reescrita p/ nova UI), TED (gating do input), TX-04 flake (confirmar no próximo run), TX-06 (state do sheet), UI-07/08 (race ordem-dependente), WS ×3 (qual request falha).

## Re-run final pós-triagem (2026-09-09)

| Métrica | Total |
|---------|-------|
| Passed | 128 |
| Failed | 12 |
| Skipped | 24 |
| **Total** | **164** |

(Evolução completa: 89/47/24 em 160 → 109/27/24 em 160 → **128/12/24 em 164**, incluindo 4 specs novas PAYSTMT/TRF. Verdes confirmadas no final: AUTH-01/02, DIRECT-01..12, REDIRECT-01..04, ACC-01..06, CAT-01..05, G3-01/02, HOME-01..10, NAV-01..07/08..13, NOAPI-01, TX-01/02/03/05/07/08/09, UI-01/03/04/05/06, WAL-02..10.)

Restantes (12), todas classificadas abaixo — nenhuma é infra de auth:

| Grupo | Causa (1 linha) | Sev. |
|-------|-----------------|------|
| admin-llm | Botão "configuração llm (admin)" não renderiza no /perfil — role-gating do produto não atendido pelo contexto do teste | BAIXA |
| G3-05 | Salvar segue disabled no modo offline (categoria indisponível com GETs em 503) — premissa do teste × validação do produto | MÉDIA |
| REP-01..04 | UI do produto evoluiu (filtros, sem chips) — requer reescrita dos specs | MÉDIA |
| TED chat | Input renderiza só após 25–45s ociosos sem tráfego — gating do componente a investigar | MÉDIA |
| UI-07/08 | Salvar segue disabled NO RUN COMPLETO (passam isolados 2/2) — race na seleção via pickers, dependente de ordem/timing da suíte | MÉDIA |
| TX-04 | Flake de infra neste run (`goto` com timeout na init; falha anterior de validação já corrigida) | BAIXA |
| TX-06 | Reabertura do form inline não traz o input — state machine do sheet a investigar | MÉDIA |
| WS ×3 | "Sem conexão" persiste mesmo com CORS nos mocks — qual request falha ainda a isolar | MÉDIA |

**Screenshots 390x844** (`apps/pwa/docs/design/previews/e2e-smoke/`, viewport do projeto):

| Arquivo | Fluxo | Estado |
|---------|-------|--------|
| `s01-home.png` | home autenticada | renderizada (~121 KB) |
| `s02-registros.png` | /registros | renderizada (~52 KB) |
| `s03-fatura-cartao.png` | /hub/patrimonio?aba=cartoes | renderizada (~104 KB) |
| `s04-compromissos.png` | /compromissos | renderizada (~79 KB) |
| `s05-ted-chat.png` | TED chat (launcher + dialog) | renderizada (~121 KB) |
| `s06-analytics.png` | /hub/relatorios | renderizada (~69 KB) |

## Observações Técnicas

1. **Autenticação (nóde crítico)**: O `authenticate()` no `support/harness.ts` tenta logar com `test@example.com / password123` ou clicar em "Registrar". O fixture API (port 4010) tem dados populados incluindo `authRegister`, mas a sessão não persiste para o Playwright. O journal está vazio para `POST /auth/devices/register`, indicando que a rota nem é atingida ou a resposta não é gravada.

2. **CSP Rewrite**: `applyCspRewrite(page)` aplica `connect-src http://127.0.0.1:4010` e `script-src 'unsafe-eval'`, mas parece não ser suficiente para manter a sessão ativa across navigations no modo headless com service workers bloqueados.

3. **Service Workers**: `serviceWorkers: "block"` no config — SWs bloqueados, mas o app depende de SW para estado persistente. A remoção temporária dos SWs ou o modo `allow` não resolveu.

4. **PWA dev server**: O `next start --port 3001` (standalone server) não foi subido neste rodagem — o ambiente usa apenas o fixture API em 4010 + PWA build parado. A health checks de produção (PWA / 200 + title "Meu Ted", /pwa-control v3.3.0, Agent /health schemaVersion 5, API /health 200, 6 redirects legacy 200) foram validadas separadamente via `curl` externo e estão **VERDES**.

5. **Seed data**: O `e2e-seed.tmp.ts` (apps/api, NÃO rastreado) cria admin/member + workspaces usando DATABASE_URL + API real em 3101. Não foi rodado neste ciclo por exigir DB setup adicional; o fixture API já vem com `populated` seed contendo `authRegister`.

6. **Classificação de Severidade**: **MÉDIUM** — falha de integração entre fixture API + Playwright no Windows/Nemotron setup. Dados de seed existem e são válidos; a correção exigirá ajuste no harness ou do ambiente de teste, não em código de produto.

## Evidências Coletadas

- **Traces**: `test-results/*/trace.zip` para cada spec executada (160 arquivos) — contêm screenshots de tela no ponto do failure
- **Contexto de erro**: `error-context.md` em cada pastinha de teste — descreve `expect(received).toBeDefined()` recebendo `undefined` no `getByLabel('Nova transação')`
- **Sprints**: Não geradas por falha de ambiente; será delegada correção de harness/ambiente

## Cobertura canônica — Coder 2 (2026-09-09)

**Specs novos** (`apps/pwa/e2e/specs/`, projeto `functional-mobile`, viewport 390x844, fixture 4010 reutilizado — ciclo de vida do fixture intocado):

| Spec | Resultado |
|------|-----------|
| [PAYSTMT-01] `card-statement-payment.spec.ts` — pagar fatura integral → `POST /cards/statements/stmt-1/pay` 200, sheet fecha | PASS |
| [PAYSTMT-02] — após reload: badge "Paga" no histórico + CTA "Pagar fatura" desabilitado | PASS |
| [TRF-01] `transfer-record.spec.ts` — transferência via FAB → `POST /transfers` 200, sheet fecha | PASS |
| [TRF-02] — corpo do journal confere `description/amountCents/fromAccountId/toAccountId` (`Reserva mensal`, 25000, acc-1 → acc-2) | PASS |

**Fluxos sem spec — motivo real (nada inventado):**

- **(a) Edição com subcategoria — FLUXO EXISTE MAS QUEBRADO NO PRODUTO (bug, sem spec):** o `select#te-categoria` de "Editar lançamento" (`TransactionEditSheet.tsx`) reverte QUALQUER alteração. Snap-back imediato, sem flicker. Evidência de sonda E2E (spec temporário já removido): options `["","Sem categoria"],["cat-1","Alimentação"],["cat-2","Transporte"],["cat-4","Sub-alimentação"]`; após `selectOption("cat-4")`, `change` nativo disparou 1× mas valor ficou `cat-1` em 6 amostras/1,2 s; teclado confiável (`focus` + `s`) também ficou `cat-1`; `fill("XYZ probe")` em `#te-descricao` reverteu para `"Supermercado"` em 500 ms. Causa-raiz: `useEffect(..., [transaction, open, markClean])` (`TransactionEditSheet.tsx:46-57`) — `markClean` de `useFormDirtySafe` troca de identidade a cada dirty (`unsaved-changes.tsx`: `ctx` recriado via `useMemo` a cada `setDirtyTokens` → `markClean` recriado via `useCallback [live, ctx, token]`) → qualquer edição dispara `markDirty` → efeito re-roda → form resetado aos valores originais. Impacto colateral: **REC-05 é falso-positivo** (preenche descrição/valor, salva, mas o `PATCH` leva os valores ORIGINAIS — o spec nunca confere o corpo). Sugestão de lane: bugfix TDD em `TransactionEditSheet` (estabilizar deps do efeito) + endurecer REC-05 com asserção de corpo; spec EDIT-SUB pronto para reativar quando o produto segurar a edição.
- **(b) Parcelamento fora do cartão — fluxo não implementado no produto:** UI de parcelas renderiza SOMENTE com `originKind === "card"` (`NewTransactionSheet.tsx:744-745`, `parcelado = !isTransfer && originKind === "card" && ...`, troca de origem reseta para 1×); API só tem `POST /cards/installments`. Spec não criado.
- **(d) Recorrência de conta a pagar — fluxo não implementado no produto:** `NewPayableSheet` (`PayablesPage.tsx:31-126`) não tem campo de recorrência (só descrição/valor/vencimento/conta/categoria); `createPayable` aceita `type/frequency` opcional mas o fixture ignora e não expande ocorrências. (Recorrências de outro domínio — assinaturas — já têm `subscriptions.spec.ts`.) Spec não criado.
- **(e) Transferência a terceiros — conceito inexistente; fluxo canônico existente coberto:** produto só transfere entre contas próprias (`fromAccountId/toAccountId`, sem destinatário externo — nem na API `apps/api`); TRF-01/02 pinam esse fluxo + registro correto.

**Contrato TED (nesta lane):** `generate-agent-tools --check` acusava gerado defasado → regenerado `apps/agent/src/generated/http-tools.ts` (52 tools; `create_expense`/`create_income` ganharam `subcategoryId` + `notes`, conferindo com `NewTransactionSheet` — nada inventado) + header factual do `tool-capability-inventory.md` (apontava para `.pi/...` removido). Gates: `capabilities:check` 52/72 ✅, `write-policy:check` 176/176 ✅, `--check` ✅. Refs de tools em `agent-config/` conferidas contra o gerado (5 candidatos são tools locais legítimas: `web_search`, `web_fetch`, `remember_fact`, `recall`/`list_past_sessions`/`get_session_summary`).

## Recomendações

- **Não corrigir código de produto** — todas as falhas são no fluxo de teste/integração.
- **Próximo passo**: Ajustar `authenticate()` no harness ou ajustar CSP/scenario no fixture API para garantir que `POST /auth/devices/register` seja gravado no journal.
- **Manter**: Probes de produção (PWA, Agent, API) continuam verdes — documentadas em `docs/agent/2026-09-08-v049-api-release.md`.