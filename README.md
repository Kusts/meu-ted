# pi-financeiro (bridge)

Bridge mínimo **WhatsApp ↔ Pi RPC**. Recebe webhooks da Evolution API,
extrai a mensagem, valida permissões, e encaminha para o Agent Pi
(`pi --mode rpc`) com contexto estruturado. O Agent Pi é responsável por
interpretar a mensagem, aplicar regras, chamar tools e persistir dados.

> **O que mudou:** este repositório não é mais o sistema financeiro.
> Toda a parte de domínio, DB, tools, CLI, dashboard, jobs e API HTTP
> financeira foram removidos/movidos para o Agent Pi.
> Veja `docs/bridge-simplification-inventory.md` para o inventário do
> refactor e `docs/superpowers/specs/` para o histórico.

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces (1 app) |
| Bridge | Fastify + TypeScript |
| WhatsApp | Evolution GO API |
| Agent | `pi --mode rpc` (Pi CLI, sem SDK) |
| Testes | Vitest |

## Estrutura

```
.
├── apps/
│   └── whatsapp-bridge/        # bridge único: webhook + Pi RPC + reminder
│       └── src/
│           ├── webhook-handler.ts    # validação + forward
│           ├── pi-client-factory.ts  # RpcClient upstream
│           ├── evolution-client.ts   # ResponseSender Evolution
│           ├── server.ts             # Fastify server
│           ├── env.ts                # .env loader compartilhado
│           └── tools/                # tools Pi (financial-tools extension)
│       └── scripts/
│           ├── reminder.ts           # resumo semanal (read-only)
│           ├── data-provider.ts      #抽象体 para DB reads
│           ├── formatter.ts          # montagem da mensagem
│           └── reminder.test.ts      # testes do pipeline
├── docs/
│   ├── bridge-simplification-inventory.md
│   └── migrations/           # SQL migrations manuais por fase
├── .pi/                      # extensão financial-tools + contrato do Agent Pi
│   ├── extensions/financial-tools/
│   └── tools/
├── package.json
├── pnpm-workspace.yaml
└── vitest.config.ts
```

## Setup

```bash
pnpm install
cp apps/whatsapp-bridge/.env.example apps/whatsapp-bridge/.env
# (opcional) cp apps/whatsapp-bridge/.env.example .env  # se preferir raiz
pnpm dev
```

## Variáveis de ambiente (resumo)

| Variável | Descrição | Default |
|---|---|---|
| `PORT` | Porta do Fastify | `3000` |
| `HOST` | Host do Fastify | `0.0.0.0` |
| `EVOLUTION_GO_API_URL` | URL da Evolution API | `http://localhost:4000` |
| `EVOLUTION_GO_INSTANCE_TOKEN` | Token da instância | — |
| `ALLOWED_GROUP_IDS` | Grupos permitidos (CSV) | vazio = todos |
| `REGISTERED_PHONES` | Telefones permitidos (CSV) | vazio = todos |
| `DEFAULT_HOUSEHOLD_ID` | Household default | `default` |
| `PI_AGENT_RUNTIME` | `pi-native` ou `disabled` | `pi-native` |
| `PI_RPC_COMMAND` | Comando do Pi | `pi` |
| `PI_RPC_ARGS` | Args do Pi (JSON ou CSV) | `["--mode","rpc"]` |
| `PI_RPC_TIMEOUT_MS` | Timeout em ms | `120000` |
| `REMINDER_TARGET_CHAT_ID` | Chat JID do WhatsApp que recebe o resumo semanal | — |
| `REMINDER_HOUSEHOLD_ID` | Household a consultar | `default` |
| `REMINDER_SHOW_DAYS` | Dias de transações recentes (default 7) | `7` |

Lista completa em `apps/whatsapp-bridge/.env.example`.

## Endpoints

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/health` | Liveness |
| `POST` | `/webhooks/evolution` | Recebe eventos do Evolution GO |

Payload de entrada: ver `WebhookPayload` em
`apps/whatsapp-bridge/src/webhook-handler.ts`.

## Fluxo

```
WhatsApp → Evolution API → POST /webhooks/evolution
    → validateEventType / Token / IsFromMe / Group / Phone
    → idempotency (providerMessageId)
    → buildBridgePrompt(...)
    → piClient.send(prompt, senderPhone, ctx)
    → Evolution API → WhatsApp (resposta + presence composing/paused)
```

O prompt segue um contrato documentado (veja `buildBridgePrompt`):

```
[WhatsApp Message]
householdId: ...
chatId: ...
senderPhone: ...
pushName: ...
providerMessageId: ...
timestamp: ...
source: whatsapp

User message:
<texto original>
```

Mensagens como `gastei 50 no mercado` chegam ao Pi **sem classificação**.
Quem interpreta valor/categoria/conta é o Agent Pi.

## Scripts

```bash
pnpm dev          # roda o bridge em watch mode
pnpm start        # roda o bridge em modo produção
pnpm test          # roda vitest
pnpm test:watch    # vitest watch
pnpm test:coverage # cobertura Vitest
pnpm typecheck     # tsc --noEmit
pnpm lint          # alias de typecheck (sem ESLint neste minimal)
pnpm build         # tsc --outDir ./dist --noEmit
pnpm reminder      # envia resumo semanal via WhatsApp (requer .env completo)
```

## Reminder Semanal (Task Scheduler)

O resumo semanal é um script **read-only** que consulta o banco,
monta uma mensagem e envia via Evolution GO. Sem operações de escrita.

**Execução manual:**
```bash
pnpm reminder
```

**Variáveis necessárias no `.env`:**
```env
REMINDER_TARGET_CHAT_ID=12000000000@g.us   # grupo ou número E.164
REMINDER_HOUSEHOLD_ID=default
REMINDER_SHOW_DAYS=7
EVOLUTION_GO_API_URL=http://localhost:4000  # já existente
EVOLUTION_GO_INSTANCE_TOKEN=...            # já existente
DATABASE_URL=...                            # conexão Postgres (já usada pelas tools)
```

**Task Scheduler — agendar toda segunda-feira às 09:00 (Windows):**

```powershell
# Criar tarefa via schtasks.exe
schtasks /create `
  /tn "Pi Financeiro — Resumo Semanal" `
  /tr "powershell -ExecutionPolicy Bypass -Command cd D:\projetos\pi-financeiro; pnpm reminder" `
  /sc weekly /d MON /st 09:00 /ru "%USERNAME%" `
  /rz "E. South America Standard Time"
```

Ou pela interface do **Task Scheduler** (taskschd.msc):
- **Ação:** Iniciar um programa
- **Programa:** `powershell.exe`
- **Argumentos:** `-ExecutionPolicy Bypass -Command "cd D:\projetos\pi-financeiro & pnpm reminder"`
- **Gatilho:** Semanal — Toda segunda-feira às 09:00
- **Condição:** Não iniciar se o computador estiver usando bateria

O log de stdout/stderr é salvo em `%SystemRoot%\System32\config\systemprofile\AppData\Local\Temp\` por padrão.
Para um log dedicado, use redireção no comando:
```powershell
/tr "powershell -ExecutionPolicy Bypass -Command \"cd D:\projetos\pi-financeiro > reminder.log 2>&1 & pnpm reminder\""
```

## Testes

Cobertos em `apps/whatsapp-bridge/src/`:
- `webhook-bridge.test.ts` — validações, extração, dedupe, presence,
  status (`forwarded`/`ignored`/`failed`), sem classificação.
- `pi-bridge.test.ts` — smoke + JSONL buffer.
- `pi-bridge-protocol.test.ts` — protocolo Pi RPC, ACK, streams, queue.
- `pi-bridge-timeout.test.ts` — regressão: timeout só arma no envio real.
- `scripts/reminder.test.ts` — formatter, week label e pipeline completo (fakes).

## Onde mora o resto

- **Domínio financeiro, DB, CLI de tools, jobs, dashboard, API CRUD**:
  responsabilidade do **Agent Pi** (Pi CLI rodando `pi --mode rpc`).
  Veja `.pi/AGENTS.md` e `.pi/{skills,prompts,tools}/README.md`.
