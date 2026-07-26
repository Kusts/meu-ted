# PWA deploy gates

## Context

Cloudflare PWA ativa é anterior ao HEAD local. API VPS já coincide com conteúdo local. `apps/pwa/budget.json` foi removido, apesar de teste exigir baseline. Root `build:pwa` chama `next build` (Turbopack), incompatível com OpenNext. `output: "standalone"` também foi removido de `apps/pwa/next.config.ts`; sem ele OpenNext não encontra `pages-manifest.json`.

## Requirements

- REQ-1: When `pnpm build:pwa` runs, system shall execute `pnpm --filter pwa build:cloudflare` baseado em webpack e produzir `output: "standalone"` para OpenNext.
- REQ-2: When bundle-budget test runs after build, system shall read baseline histórico versionado e validar regressão máxima de 5%.
- REQ-3: When release é preparada, system shall documentar SHA, versão e rollback em `docs/runbooks/pwa-cloudflare-release.md`, sem publicar automaticamente.
- REQ-4: While API/VPS é saudável e idêntica ao conteúdo local, system shall not modificar ou publicar API.
- REQ-5: When gate Linux roda, system shall usar container Docker `node:20-bookworm-slim` com pnpm `9.15.9`.

## Design

| Item | Decisão |
|---|---|
| Baseline | Restaurar conteúdo histórico exato de `apps/pwa/budget.json` (`135.9`, `280.7`, limite `5%`); sem recalibração |
| Build canônico | Root `build:pwa` delega para `pnpm --filter pwa build:cloudflare`; Next mantém `output: "standalone"` |
| Validação | Docker `node:20-bookworm-slim` + pnpm `9.15.9`: lint, build, Vitest completo (budget/headers), E2E offline, Git limpo |
| Rastreabilidade | Criar `docs/runbooks/pwa-cloudflare-release.md`: SHA em `wrangler deploy --message`, descoberta de versão, health checks e rollback |
| Deploy | Fora deste escopo; requer confirmação explícita após gates verdes |

## Non-goals

- Não publicar Worker nem alterar VPS/API.
- Não corrigir bridge TypeScript.
- Não alterar limites de bundle sem nova medição aprovada.
- Não executar deploy ou rollback documentados.

## Tests

| Tipo | Escopo |
|---|---|
| Unit/integration | Teste existente de budget após build |
| Contract | CORS passivo existente |
| E2E | Offline shell Playwright existente |
| Snapshot | Não aplicável |
| Mutation | Não aplicável; configuração/script sem lógica nova |
