# Bridge Simplification Inventory

> Pré-refactor: classifica cada item do workspace segundo a pergunta-guia
> **"isso é necessário para transportar mensagem entre WhatsApp e Pi?"**.
> Se não, marcar `C` (mover ao Agent Pi) ou `D` (documentação antiga).

## Classificação

| Letra | Significado | Ação |
|---|---|---|
| **A** | Manter na bridge (transporte WhatsApp ↔ Pi) | Manter |
| **B** | Teste de bridge | Manter/atualizar |
| **C** | Domínio/API/CLI financeiro → responsabilidade do **Agent Pi** | Remover do workspace Node |
| **D** | Documentação antiga / duplicada | Remover ou arquivar |

---

## A. Manter (bridge)

| Path | Por quê |
|---|---|
| `apps/whatsapp-bridge/src/webhook-handler.ts` | Validar + extrair + encaminhar mensagem WhatsApp |
| `apps/whatsapp-bridge/src/pi-bridge.ts` | Adapter stdin/stdout para `pi --mode rpc` |
| `apps/whatsapp-bridge/src/evolution-client.ts` | `ResponseSender` para Evolution GO API |
| `apps/whatsapp-bridge/src/server.ts` (novo) | Fastify `POST /webhooks/evolution` + `GET /health` |
| `apps/whatsapp-bridge/src/index.ts` | Barrel mínimo |
| `apps/whatsapp-bridge/src/pi-client-factory.ts` | Cria `PiClient` (PiBridge ou Fake) |
| `apps/whatsapp-bridge/package.json` | Dependências: `fastify` + dev deps (sem domínio/DB/idempotência) |
| `apps/whatsapp-bridge/tsconfig.json` | Typecheck do bridge |
| `apps/whatsapp-bridge/.env.example` | Variáveis do bridge (Evolution, Pi RPC, allow-list) |
| `apps/whatsapp-bridge/src/pi-bridge-protocol.test.ts` | Testes de protocolo Pi RPC |
| `apps/whatsapp-bridge/src/pi-bridge.test.ts` | Testes de bridge (smoke) |
| `apps/whatsapp-bridge/src/pi-flow.test.ts` | Testes de fluxo (smoke) — **limpar** parte pendente financeira |
| `apps/whatsapp-bridge/src/feature-flag.test.ts` | Testes de env — **manter parte bridge, remover parte financeira** |
| `apps/whatsapp-bridge/src/whatsapp-bridge.test.ts` | Cobertura webhook — **re-escrever para nova forma sem classificação** |

---

## B. Testes bridge (atualizar)

| Path | Estado | Ação |
|---|---|---|
| `apps/whatsapp-bridge/src/webhook-bridge.test.ts` (novo) | — | **Criar** suite mínima cobrindo a spec |
| `apps/whatsapp-bridge/src/pi-bridge-timeout.test.ts` (novo) | — | **Criar** suite específica do bug de timeout |
| `apps/whatsapp-bridge/src/bridge-full-coverage.test.ts` | Toca `message-classifier` e `finance-api-client` | **Remover** (referências a código morto) |
| `apps/whatsapp-bridge/src/finance-api-client.ts` | DEPRECATED, não usado | **Remover arquivo** |

---

## C. Mover ao Agent Pi (remover do workspace Node)

| Path | Por quê é do Agent Pi |
|---|---|
| `apps/api/**` | CRUD HTTP financeiro — Agent Pi deve usar suas próprias tools/integrações |
| `apps/dashboard/**` | Admin CRUD Next.js — fora do escopo de bridge |
| `packages/db/**` | Drizzle/Postgres — Agent Pi tem suas próprias tools/db |
| `packages/domain/**` | Entidades + serviços financeiros — domínio do Agent Pi |
| `packages/finance-cli/**` | CLI financeiro antigo — removido do bridge; substituir por tool do Agent Pi se necessário |
| `packages/ledger/**` | Entries contábeis — Agent Pi |
| `packages/jobs/**` | pg-boss cron — Agent Pi tem seu scheduler |
| `packages/idempotency/**` | Idempotência do DB — Agent Pi |
| `packages/agent-prompts/**` | Prompts — vão para `.pi/prompts/` |
| `apps/whatsapp-bridge/src/message-classifier.ts` | Classificação financeira — Agent Pi interpreta |
| `apps/whatsapp-bridge/src/finance-api-client.ts` | Cliente HTTP de API removida |

**Mensagens como “gastei 50 no mercado” vão direto ao Pi** com o contexto
WhatsApp — quem interpreta, valida valor/categoria e grava é o Agent Pi.

---

## D. Documentação antiga

| Path | Ação |
|---|---|
| `README.md` (raiz) | **Re-escrever** como repo de bridge (este inventário orienta) |
| `.env.example` (raiz) | **Re-escrever** com vars do bridge |
| `docs/superpowers/**` | Planos históricos de features já removidas | **Arquivar** ou **manter** se forem contexto útil, mas não rodar |
| `docs/agent-capability-audit-2026-06-02.md` | Auditoria pontual do estado pré-refactor | **Manter** como histórico |
| `Dockerfile.cron` | Cron pg-boss — sem jobs no bridge | **Remover** |
| `docker-compose.yml` | Postgres — sem DB no bridge | **Remover** ou **comentar** |
| `data/`, `coverage/` | Saídas locais | **Já no .gitignore** |
| `start-coder.bat`, `start-planner.bat` | Scripts Windows legados | **Manter** (não atrapalham) |
| `scripts/db-init.mts` | Init Postgres | **Remover** |
| `api-server.log` | Log solto | **Não versionar** |

---

## Riscos

1. **Testes financeiros antigos quebram o `pnpm test`**
   - Mitigação: removê-los do escopo do Vitest via `vitest.config.ts` (`include`/`exclude`)
     e/ou excluí-los com `test.only` no escopo errado. **Não** reanimar domínio.

2. **Lockfile desatualizado após remover workspaces**
   - Mitigação: rodar `pnpm install` no fim; se o lockfile reclamar, recriar com
     `pnpm install --no-frozen-lockfile`. Workspace package.json órfão será
     removido da config raiz antes.

3. **Cache de TypeScript (`node_modules/.vite`, `.tsbuildinfo`)**
   - Mitigação: rodar `pnpm -r exec rm -rf node_modules/.cache` se typecheck
     reclamar de símbolos fantasmas.

4. **`.env` real apagado por engano**
   - Mitigação: **não tocar** em `.env`. Apenas `.env.example`. Bridge novo
     consegue rodar sem `.env` carregado se o caller fornecer as envs.

5. **Agent Pi ainda tem prompts em `packages/agent-prompts`**
   - Mitigação: criar `.pi/prompts/README.md` apontando para onde o conteúdo
     do `agent-prompts` deve ser movido (referência, sem extrair conteúdo).

6. **`apps/dashboard` em Next.js tem `.next/` e Playwright e2e**
   - Mitigação: remover `apps/dashboard` do workspace e da config. Os artefatos
     `.next/` e `node_modules/` locais somem junto (já no `.gitignore`).

---

## Comandos de validação

```bash
# Tipos só do bridge
pnpm --filter @pi-financeiro/whatsapp-bridge typecheck

# Testes só do bridge
pnpm --filter @pi-financeiro/whatsapp-bridge test

# Workspace root: tipos e testes
pnpm typecheck
pnpm test
```

Critério de aceite:

- `pnpm test` passa, com testes só do bridge.
- `pnpm typecheck` passa.
- O servidor do bridge sobe: `pnpm dev` no bridge ou `tsx src/server.ts`.
- `POST /webhooks/evolution` aceita payload do Evolution GO.
- `GET /health` retorna `200`.
- Mensagem “gastei 50 no mercado” chega ao Pi com prompt
  `[WhatsApp Message]\n...\n\nUser message:\n<texto>`.
- `apps/api`, `apps/dashboard`, `packages/{db,domain,finance-cli,ledger,jobs,idempotency,agent-prompts}`
  não estão mais referenciados em `pnpm-workspace.yaml`, `tsconfig` raiz ou
  `vitest.config.ts`.
