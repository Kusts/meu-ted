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