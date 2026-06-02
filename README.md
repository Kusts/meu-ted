# pi-financeiro

Sistema financeiro pessoal para casal via WhatsApp grupo + TED agent (Pi terminal/RPC) + dashboard admin.

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces |
| API | Fastify + TypeScript |
| Dashboard | Next.js 15 |
| DB | Postgres Docker (porta 5432/5433) |
| ORM | Drizzle |
| WhatsApp | Evolution GO API |
| Agent | `pi --mode rpc` (sem SDK) |
| Jobs/Fila | RPC queue serial |
| Testes | Vitest |
| E2E | Playwright (dashboard) |

## Pré-requisitos

- Node.js ≥20
- pnpm ≥9
- Docker + Docker Compose
- Pi CLI (`npm install -g @earendil-works/pi-coding-agent`)
- Evolution API (incluído no docker-compose)

## Setup Rápido

```bash
# 1. Instalar dependências
pnpm install

# 2. Iniciar serviços Docker
docker compose up -d

# 3. Criar arquivo .env
cp .env.example .env

# 4. Editar .env conforme necessário (ver seção Variáveis abaixo)

# 5. Aplicar schema ao banco
pnpm db:push
```

## Variáveis de Ambiente

Copie `.env.example` → `.env` e configure:

| Variável | Descrição | Default |
|---|---|---|
| `DATABASE_URL` | Connection string Postgres | `postgresql://postgres@localhost:5432/pi_financeiro` |
| `PORT` | Porta API | `3000` |
| `HOST` | Host API | `0.0.0.0` |
| `API_DEP_MODE` | Modo repos: `memory` ou `drizzle` | `memory` |
| `PI_RPC_ENABLED` | Usar Pi RPC real | `false` |
| `PI_RPC_COMMAND` | Comando Pi | `pi` |
| `PI_RPC_ARGS` | Args como JSON array | `["--mode","rpc"]` |
| `PI_RPC_TIMEOUT_MS` | Timeout Pi em ms | `30000` |
| `EVOLUTION_GO_API_URL` | URL Evolution GO API | `http://localhost:4000` |
| `EVOLUTION_GO_INSTANCE_TOKEN` | Token da instância Evolution GO | - |
| `EVOLUTION_GO_INSTANCE_NAME` | Nome instância Evolution GO | `ted` |
| `WEBHOOK_SECRET` | Secret webhook | - |
| `ALLOWED_GROUP_IDS` | Grupos WhatsApp permitidos (separados por vírgula) | - |
| `REGISTERED_PHONES` | Telefones cadastrados (separados por vírgula) | - |
| `DEFAULT_HOUSEHOLD_ID` | Household default | `default` |
| `HIGH_VALUE_THRESHOLD_CENTS` | Limite para confirmação (R$500) | `50000` |

## Rodando em Dev

### Todos os apps (se existir script raiz)
```bash
pnpm dev
```

### Apps individualmente

```bash
# API Fastify
pnpm --filter @pi-financeiro/api dev

# Dashboard Next.js
pnpm --filter @pi-financeiro/dashboard dev

# WhatsApp Bridge
pnpm --filter @pi-financeiro/whatsapp-bridge dev

# TED Agent (pi --mode rpc)
pi --mode rpc
```

### Modo produção local

```bash
# Usar Drizzle com Postgres real
API_DEP_MODE=drizzle DATABASE_URL=postgresql://... pnpm --filter @pi-financeiro/api dev

# TED via Pi RPC (requer `pi` instalado)
FINANCE_AGENT_RUNTIME=pi-native pnpm --filter @pi-financeiro/whatsapp-bridge dev

# Build e start dashboard
pnpm --filter @pi-financeiro/dashboard build
pnpm --filter @pi-financeiro/dashboard start
```

## Docker Services

O `docker-compose.yml` inclui:

| Serviço | Porta | Descrição |
|---|---|---|
| `postgres` | 5432/5433 | Postgres 17 |


```bash
# Ver logs
docker compose logs -f

# Ver logs de serviço específico
docker compose logs -f postgres

# Reiniciar serviço
docker compose restart postgres
```

## Testes

```bash
# Rodar todos os testes (233 tests)
pnpm test

# Testes com cobertura
pnpm test:coverage

# Type check em todos os pacotes
pnpm typecheck

# Testes em watch mode
pnpm test:watch
```

## Comandos Úteis

```bash
# Database
pnpm db:push        # Aplicar schema (sem migrations)
pnpm db:migrate      # Gerar e aplicar migrations
pnpm db:studio       # Abrir Drizzle Studio
pnpm db:seed         # Seed database (se existir)

# Linting
pnpm lint

# Build
pnpm build

# Limpar
pnpm clean
```

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         WhatsApp Grupo                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ webhooks
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Evolution GO API                         │
│                         (porta 4000 — externa ao Docker)                            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   apps/whatsapp-bridge                          │
│           Webhook handler + PiBridge adapter                   │
└────────────────────────────┬───────────────────────────────────┘
                             │ Pi RPC JSONL (stdin/stdout)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    pi --mode rpc                               │
│     (pi CLI, carrega .pi/AGENTS.md, executa ted-finance CLI)   │
└────────────────────────────┬───────────────────────────────────┘
                             │ Tools (create_expense, etc)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  packages/finance-cli                           │
│         ted-finance CLI (deterministic, typed)                  │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       apps/api (Fastify)                        │
│    CRUD endpoints + webhook handler + services                  │
└────────────────────────────┬───────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────┐
│ packages/domain │ │  packages/db │ │packages/ledger│
│    (services)    │ │  (Drizzle)   │ │  (entries)    │
└──────────────────┘ └──────────────┘ └──────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   Postgres Docker │
                    │   (porta 5432)     │
                    └───────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   apps/dashboard (Next.js)                      │
│              Admin CRUD local via API /records                  │
└─────────────────────────────────────────────────────────────────┘
```

## Domínio - Tabelas Principais

| Tabela | Descrição |
|---|---|
| `households` | Grupos familiares |
| `accounts` | Contas (pode ter saldo negativo - REQ-010) |
| `categories` | Categorias hierárquicas com aliases |
| `financial_records` | Registros financeiros (receita/despesa/transferência) |
| `ledger_entries` | Entradas contábeis (audit trail) |
| `credit_cards` | Cartões de crédito |
| `invoices` | Faturas mensais |
| `installment_groups` | Grupos de parcelas |
| `recurrences` | Recorrências (12 meses) |
| `recurrence_occurrences` | Ocorrências pré-criadas |
| `bills` | Contas a pagar |
| `idempotency_keys` | Controle de duplicidade |
| `audit_logs` | Log de auditoria |

## Milestones Implementados

| # | Marco | Status |
|---|---|---|
| 1 | Fundação monorepo/Docker/DB | ✅ |
| 2 | Domínio core (contas/categorias/registros/audit) | ✅ |
| 3 | Cartões/faturas/parcelas | ✅ |
| 4 | Recorrências/cron 12 meses | ✅ |
| 5 | Pi RPC/TED tools | ✅ |
| 6 | WhatsApp bridge + Evolution | ✅ |
| 7 | API Fastify endpoints CRUD | ✅ |
| 8 | Dashboard Next.js admin | ✅ |
| 9 | Drizzle adapters + mappers | ✅ |
| 10 | Pi RPC runner | ✅ |
| 11 | Integração Pi → WhatsApp bridge | ✅ |

## Status Atual

- **Testes:** 233 tests passing (18 test files)
- **Packages:** 11 workspaces (6 packages, 4 apps)
- **Typecheck:** Todos os pacotes passing
- **Cobertura:** ~80%+ em domínio crítico

## TED - Agente Financeiro

TED (Talkin' Electronic Dude) é o agente financeiro:

- **Nome:** TED (The Economic Dashboard - mas pode chamar só de TED)
- **Tom:** amigável, engraçado, inteligente, prestativo
- **Especialidade:** dinheiro, organização financeira, alertas, conselhos práticos
- **Regra de Ouro:** NUNCA diz que fez algo sem confirmação da tool/service
- **Humor:** piadas leves nos momentos certos, nunca sarcasmo

## Fora do MVP (Futuro)

- App iPhone
- Áudio WhatsApp (entrada/saída)
- OCR comprovantes
- Importação OFX/CSV
- Investimentos/patrimônio líquido avançado

## Referências

- Spec: `docs/superpowers/specs/2026-05-29-finance-agent-design.md`
- Planos: `docs/superpowers/plans/`
- Skills: `.pi/skills/finance-ted/` (se existir)