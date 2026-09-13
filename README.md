# Meu Ted

Sistema de gestão financeira pessoal e familiar com PWA, API autoritativa e o
assistente TED. Dados financeiros e decisões de escrita pertencem à API; o TED
é um cliente conversacional sujeito às mesmas fronteiras de identidade,
capability, confirmação e idempotência.

## Componentes ativos

| Componente | Responsabilidade | Runtime |
| --- | --- | --- |
| `apps/api` | Fonte de verdade financeira, Better-Auth, autorização de workspace e pending operations V2 | Hostinger VPS + PostgreSQL 16 |
| `apps/pwa` | Cliente web/mobile canônico e proxies same-origin privados | Cloudflare Pages/Workers + OpenNext |
| `apps/agent` | TED V2: orquestração, memória conversacional e decisão de aprovação delegada | Cloudflare Workers + Durable Objects |
| `apps/codex-broker` | Broker isolado para provider Codex; sem capability financeira ou acesso a PostgreSQL | Container Node 22 |

O antigo `apps/whatsapp-bridge` e a extensão `.pi/extensions/financial-tools`
não são componentes ativos nem fontes de produção.

## Fronteiras obrigatórias

1. A API é a única autoridade para dados financeiros e pending operations.
2. O browser usa `/api/backend` e `/api/agent`; ele não recebe atestação,
   capability de escrita ou identidade financeira livre.
3. O Agent normaliza os canais em um pipeline V2. Durable Objects persistem
   conversa e memória não autoritativa, nunca dados financeiros.
4. `MutationExecutor` é a única fronteira do Agent para confirmar/executar
   uma pending operation V2. A operação deve estar vinculada a workspace,
   ator e dispositivo e ser confirmada antes da escrita.
5. Rollback pode reverter roteamento de leitura, mas nunca reativa
   `[EXEC_ACTION]`, writes V1 ou bypasses de capability.

## Comandos principais

```bash
pnpm install --frozen-lockfile
pnpm docs:lint
pnpm typecheck
pnpm test
pnpm build:all
pnpm governance:check
pnpm architecture:check
pnpm validate:final
```

`pnpm validate:final` gera evidências locais em `docs/reports/`. Não executa
deploy, migration de produção nem altera segredos.

## Documentação canônica

- [Produto](docs/PRODUCT.md)
- [Arquitetura atual](docs/ARCHITECTURE-CURRENT.md)
- [Arquitetura alvo](docs/ARCHITECTURE-TARGET.md)
- [Roadmap](docs/ROADMAP.md)
- [ADRs](docs/adr/README.md)
- [Runbook de migration V2](docs/runbooks/api-migration-v2.md)
