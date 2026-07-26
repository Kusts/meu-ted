# PWA deploy gates

## Context

Cloudflare PWA ativa é anterior ao HEAD local. API VPS já coincide com conteúdo local. `apps/pwa/budget.json` foi removido, apesar de teste exigir baseline. Root `build:pwa` chama `next build` (Turbopack), incompatível com OpenNext local; CI já usa webpack.

## Requirements

- REQ-1: When `pnpm build:pwa` runs, system shall execute build Cloudflare baseado em webpack.
- REQ-2: When bundle-budget test runs after build, system shall read baseline versionado e validar regressão máxima de 5%.
- REQ-3: When release is preparada, system shall registrar SHA e instrução de rollback sem publicar automaticamente.
- REQ-4: While API/VPS is saudável e idêntica ao conteúdo local, system shall not modificar ou publicar API.

## Design

| Item | Decisão |
|---|---|
| Baseline | Restaurar `apps/pwa/budget.json` do histórico (`135.9`, `280.7`, limite `5%`) |
| Build canônico | Root `build:pwa` delega para `pwa build:cloudflare` |
| Validação | Linux com Node 20/pnpm 9: lint, build, Vitest, headers e E2E offline |
| Rastreabilidade | Documentar comando de deploy com `--message git:<SHA>` e rollback por versão Wrangler |
| Deploy | Fora deste escopo; requer confirmação após gates verdes |

## Non-goals

- Não publicar Worker nem alterar VPS/API.
- Não corrigir bridge TypeScript.
- Não alterar limites de bundle sem nova medição aprovada.

## Tests

| Tipo | Escopo |
|---|---|
| Unit/integration | Teste existente de budget após build |
| Contract | CORS passivo existente |
| E2E | Offline shell Playwright existente |
| Snapshot | Não aplicável |
| Mutation | Não aplicável; configuração/script sem lógica nova |
