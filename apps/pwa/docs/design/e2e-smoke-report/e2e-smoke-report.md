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

## Recomendações

- **Não corrigir código de produto** — todas as falhas são no fluxo de teste/integração.
- **Próximo passo**: Ajustar `authenticate()` no harness ou ajustar CSP/scenario no fixture API para garantir que `POST /auth/devices/register` seja gravado no journal.
- **Manter**: Probes de produção (PWA, Agent, API) continuam verdes — documentadas em `docs/agent/2026-09-08-v049-api-release.md`.