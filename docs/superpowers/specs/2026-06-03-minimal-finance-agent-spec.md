# Spec: Assistente Financeiro Familiar — Mínimo por Fases

**Data:** 2026-06-03
**Status:** Aprovado — aguardando implementação
**Mantenedor:** walis

---

## 1. Visão Geral

Assistente financeiro familiar via WhatsApp. Simples, local, determinístico.

- Escopo: uso pessoal/familiar (casal, telefones cadastrados em allow-list)
- Household único, não multi-tenant SaaS
- Agent Pi como cérebro — pessoa "TED" que escuta, orienta, registra
- Bridge WhatsApp usando client/session oficial (não custom RPC)
- Postgres local via Docker (dados financeiros tabulares)
- Cron via Windows Task Scheduler (Fase 5+), não Docker
- Sem API REST, sem dashboard, sem cron Docker no MVP

---

## 2. Decisões Arquiteturais

### 2.1 Stack approved

| Componente | Tecnologia | Motivo |
|---|---|---|
| Brain / Agent | Pi (existing) | Não reinventar LLM orchestration |
| Bridge WhatsApp | Node/TypeScript + RpcClient/AgentSession oficial | Client upstream, não bridge custom |
| Database | PostgreSQL via Docker | Persistência confiável, simples |
| Schedule | Windows Task Scheduler | Evita overhead Docker Compose |
| Config | `.env` | Padrão local, não versionar |
| Auth | Allow-list de telefones | Validação mínima via phone allow-list |
| Valores monetários | Centavos inteiros (BIGINT) | Precisão sem float |
| Saldo de conta | Calculado, não mutável | initial_balance + transações ativas |

### 2.2 Stack rejected (não fazer)

| Rejeitado | Motivo |
|---|---|
| API REST (apps/api) | Não necessário — WhatsApp é interface |
| Dashboard Next.js (apps/dashboard) | Overengineering para uso familiar |
| Cron via Docker (packages/jobs) | Windows Task Scheduler é suficiente |
| Bridge RPC custom (pi-bridge.ts) | Substituir por RpcClient/AgentSession oficial |
| Ledger completo | Cálculo de saldo é suficiente para MVP |
| FLOAT/DECIMAL para dinheiro | Usar centavos inteiros |
| Saldo mutável em conta | Saldo é calculado, não armazenado |
| ORM complexo (Drizzle completo) | Raw SQL é suficiente para MVP |
| Multi-tenant / multi-household | Household único |
| Harness/custom RPC parsing | Usar client upstream oficial |

### 2.3 Fluxo approved

```
WhatsApp → Evolution GO API → [whatsapp-bridge] → RpcClient/AgentSession → Pi
Pi stdout → [whatsapp-bridge] → Evolution GO send → WhatsApp
Pi (via tools) → Postgres local
```

O Agent Pi interpreta mensagens, decide quando escrever no DB, e responde via bridge. O bridge não classifica nem processa lógica financeira.

Saldos de contas são sempre calculados: saldo = initial_balance + soma das transações ativas (expense subtrai, income adiciona, transfer move entre contas). Saldos negativos são permitidos.

---

## 3. Regras Anti-Overengineering

1. **Não fazer arquitetura que não seja necessária para MVP.** Adiar decisões complexas.
2. **Se uma feature não existe na spec, ela não existe.** Adicionar apenas via spec aprovada.
3. **DB schema minimal — uma tabela por conceito, poucos campos.**
4. **Testes por fase.** Cada fase tem seus testes obrigatórios antes de avançar.
5. **Sem migrations automáticas no MVP.** Migrations manuais SQL até Fase 4.
6. **Bridge é apenas transporte.** Nada de domínio financeiro no whatsapp-bridge.
7. **Pi tools são determinísticas com validação mínima.** Não keyword matching ingênuo — usar allow-list e validações estruturadas.
8. **Soft delete em transações.** Transações nunca são deletadas fisicamente.
9. **Saldos são calculados, não armazenados.** Conta só guarda initial_balance_cents. Transações são o fonte da verdade.

---

## 4. Anti-Legado

Artefatos que devem ser removidos e não devem atrapalhar o fluxo novo:

| Artefato | Ação |
|---|---|
| `apps/api/**` | Remover — não faz parte do MVP |
| `apps/dashboard/**` | Remover — não faz parte do MVP |
| `packages/db/**` | Remover — usar Postgres direto |
| `packages/domain/**` | Remover — domínio vai para Agent Pi tools |
| `packages/finance-cli/**` | Remover — substituído por Pi tools |
| `packages/ledger/**` | Remover — cálculo de saldo é suficiente |
| `packages/jobs/**` | Remover — cron via Task Scheduler |
| `packages/idempotency/**` | Remover — idempotência é do bridge |
| `packages/agent-prompts/**` | Mover para `.pi/prompts/` |
| `apps/whatsapp-bridge/src/pi-bridge.ts` | Substituir por RpcClient/AgentSession oficial |
| `apps/whatsapp-bridge/src/pi-client-factory.ts` | Refatorar para usar client upstream |
| `Dockerfile.cron` | Remover — não usar Docker cron |
| `scripts/db-init.mts` | Remover — migrations manuais |

---

## 5. Fases 1-5 (MVP)

### Fase 1: Bridge WhatsApp com client oficial

**Objetivo:** receber e enviar mensagens via WhatsApp usando RpcClient/AgentSession oficial.

**Entregáveis:**
- `apps/whatsapp-bridge` com webhook para Evolution GO API
- Substituir `pi-bridge.ts` custom por `RpcClient` ou `AgentSession` oficial
- Refatorar `pi-client-factory.ts` para usar client upstream
- Mensagens chegam ao Pi com prompt formatado
- Pi responde voltam ao WhatsApp
- Health endpoint `/health`

**Testes obrigatórios:**
- `whatsapp-bridge/test` passa (webhook handler refatorado)
- `POST /webhooks/evolution` aceita payload Evolution GO
- `GET /health` retorna 200

**Critério de aceite:** mensagem WhatsApp → Pi responde → resposta volta ao WhatsApp via client oficial.

**Dependências externas:** Evolution GO API + Agent Pi rodando.

---

### Fase 2: Tools de núcleo financeiro

**Objetivo:** Pi consegue executar operações financeiras completas via tools.

**Entregáveis — Tools:**
- `create_expense` — registrar despesa (description, amount_cents, category_id, account_id, date)
- `create_income` — registrar receita (description, amount_cents, category_id, account_id, date)
- `create_transfer` — transferência entre contas (from_account_id, to_account_id, amount_cents, description, date)
- `get_balance` — consultar saldo de conta (calculado: initial_balance + transações ativas)
- `get_month_summary` — resumo mensal (total receitas, despesas, saldo)
- `list_recent_transactions` — listar últimas transações (limit, account_id)
- `list_accounts` — listar contas
- `create_account` — criar conta (name, initial_balance_cents)
- `list_categories` — listar categorias
- `create_category` — criar categoria (name, kind: expense/income)

**Entregáveis — Schema mínimo:**

```sql
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  high_value_limit_cents BIGINT DEFAULT 50000,  -- R$ 500 em centavos
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id),
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id),
  name TEXT NOT NULL,
  initial_balance_cents BIGINT NOT NULL DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id),
  name TEXT NOT NULL,
  kind TEXT CHECK (kind IN ('expense', 'income')),
  active BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id),
  kind TEXT CHECK (kind IN ('expense', 'income', 'transfer')),
  amount_cents BIGINT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  from_account_id UUID REFERENCES accounts(id),
  to_account_id UUID REFERENCES accounts(id),
  date DATE NOT NULL,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending')),
  created_by_user_id UUID REFERENCES users(id),
  source_message_id TEXT,
  idempotency_key TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Testes obrigatórios:**
- `create_expense` persiste no DB com amount_cents correto
- `create_income` persiste no DB com amount_cents correto
- `create_transfer` cria transação de transferência (kind=transfer) com from/to account
- `get_balance` retorna saldo calculado (initial_balance + transações ativas, negativos permitidos)
- `get_month_summary` agrega corretamente em centavos
- `list_recent_transactions` retorna limite correto
- `create_account` cria com initial_balance_cents
- `create_category` cria com kind correto
- soft delete funciona: transação marcada com deleted_at não aparece em saldos

**Critério de aceite:** Pi executa todas as 10 tools sem erro e dados persistem corretamente em centavos.

---

### Fase 3: Conversa segura e operações pendentes

**Objetivo:** Pi confirma operações de alto valor e gerencia operações pendentes com estado persistente.

**Entregáveis:**
- Confirmação de alto valor: amount_cents > high_value_limit_cents do household exige confirmação via WhatsApp
- Operações pendentes: 1 por chat, estado em tabela `pending_operations`
- Expiração: confirmação expira em 30 minutos
- Resposta sim/não: `sim` confirma, `não` cancela
- Allow-list: telefones não cadastrados ou inativos recebem mensagem de rejeição

**Schema `pending_operations`:**

```sql
CREATE TABLE pending_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id),
  user_id UUID REFERENCES users(id),
  chat_id TEXT NOT NULL,
  kind TEXT CHECK (kind IN ('expense', 'income', 'transfer')),
  amount_cents BIGINT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  from_account_id UUID REFERENCES accounts(id),
  to_account_id UUID REFERENCES accounts(id),
  date DATE NOT NULL,
  status TEXT DEFAULT 'awaiting_confirmation' CHECK (status IN ('awaiting_confirmation', 'confirmed', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes')
);
```

**Ferramentas complementares:**
- `get_pending_operation` — retorna operação pendente do chat
- `confirm_pending_operation` — confirma operação pendente
- `cancel_pending_operation` — cancela operação pendente
- Expiração verificada antes de executar — operações expiradas são marcadas como expired e rejeitadas

**Testes obrigatórios:**
- operação com amount_cents > high_value_limit_cents cria pending sem executar transação
- `sim` no WhatsApp executa operação (cria transação com status=confirmed)
- `não` cancela e notifica
- operação expirada (>30min) é rejeitada e marcada como expired
- telefone não allow-list ou inativo recebe mensagem de recusa

**Critério de aceite:** operações de alto valor são confirmadas antes de executar; estado persiste em DB.

---

### Fase 4: CRUD completo do núcleo + audit log + undo

**Objetivo:** gestão completa de contas, categorias e transações com histórico consultável.

**Entregáveis:**
- `update_account` — atualizar nome de conta
- `deactivate_account` — soft delete de conta (apenas se sem transações ativas)
- `update_category` — atualizar nome de categoria
- `deactivate_category` — soft delete de categoria
- `update_transaction` — editar descrição, valor_cents, categoria, conta de transação (reverte saldos antigos, aplica novos)
- `delete_transaction` — soft delete de transação (reverte saldos)
- `undo_last_action` — reverte última ação do household (criação, update ou delete de transação elegível)
- Audit log: todas as operações de escrita registram quem, quando, o quê

**Schema `audit_logs`:**

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,  -- create, update, delete, confirm, cancel, undo
  entity_type TEXT NOT NULL,  -- transaction, account, category, pending_operation
  entity_id UUID NOT NULL,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Testes obrigatórios:**
- `update_account` persiste alteração em audit_log
- `deactivate_account` soft delete sem afetar transações existentes
- `update_transaction` registra before_json e after_json em audit_log
- `delete_transaction` reverte saldos e marca deleted_at
- `undo_last_action` reverte última ação (pode ser create/update/delete)
- Audit log contém todas as operações de escrita com contexto completo

**Critério de aceite:** CRUD completo funciona com undo e audit trail consultável.

---

### Fase 5: Automações via Task Scheduler

**Objetivo:** automações não destrutivas que enviam WhatsApp.

**Entregáveis:**
- Lembrete semanal (WhatsApp): resumo do saldo e próximas transações
- Script Node que usa Evolution API para enviar mensagens
- Windows Task Scheduler: task que executa script semanalmente
- Sem operações de escrita automáticas — apenas leitura e notificação

**Scripts:**
- `scripts/reminder.ts` — envia resumo semanal via Evolution API

**Testes obrigatórios:**
- Task Scheduler executa script sem erro
- mensagem chega no WhatsApp
- logs de execução

**Critério de aceite:** automação executa sem intervenção manual.

---

## 6. Fases futuras (6+)

| Fase | Descrição | Status |
|---|---|---|
| 6 | Tags e notas em transações | Backlog |
| 7 | Relatórios mensais agendados | Backlog |
| 8 | Integração com receipt OCR | Backlog |
| 9 | Dashboard web simples (leitura) | Backlog (se demandado) |
| 10 | Mais usuários no household | Backlog |

---

## 7. Critérios de Aceite por Fase

| Fase | Critério |
|---|---|
| 1 | Mensagem WhatsApp chega ao Pi e resposta volta via client oficial |
| 2 | Todas as 10 tools executam e persistem corretamente em centavos; saldos calculados corretamente |
| 3 | Operações de alto valor exigem confirmação; sim/não funciona; expiração funciona |
| 4 | CRUD completo com undo e audit log consultável |
| 5 | Task Scheduler executa e mensagem chega |

---

## 8. Testes Obrigatórios por Fase

| Fase | Testes |
|---|---|
| 1 | webhook-handler (refatorado), typecheck, integração WhatsApp → Pi |
| 2 | TDD vermelho-verde-refatora para cada tool (10 tools); saldos calculados em centavos; soft delete |
| 3 | Testes de confirmação, expiração, allow-list, pending_operations |
| 4 | Testes de update, soft delete, undo, audit log com before_json/after_json |
| 5 | Teste de trigger do Task Scheduler |

---

## 9. Decisões Já Fechadas

| Decisão | Resposta |
|---|---|
| Dashboard? | Não no MVP |
| API REST? | Não — WhatsApp é interface |
| Multi-tenant? | Não — household único |
| ORM? | Raw SQL |
| Cron Docker? | Não — Task Scheduler |
| Auth? | Allow-list de telefones |
| Migrações? | Manuais SQL em `docs/migrations/` |
| Soft delete? | Sim em transações e contas/categorias |
| Confirmação alto valor? | Sim, por household, com limite configurável |
| Bridge custom? | Não — client oficial |
| Valores monetários? | Centavos inteiros (BIGINT) |
| Saldo de conta? | Calculado: initial_balance + transações ativas |
| Transferências? | Criam lançamento consultável; saldos calculados |
| Undo? | `undo_last_action` cobre create/update/delete |
| Audit log? | Tabela `audit_logs` com before/after JSON |
| Operações pendentes? | Tabela `pending_operations`, não steer/follow-up |

---

## 10. Notas de Implementação

- **Bridge não classifica.** O Agent Pi interpreta e decide o que fazer com a mensagem.
- **Tools são determinísticas.** Com validação mínima — não keyword matching ingênuo.
- **Schema first.** DB schema definido antes das tools.
- **Config via `.env`.** `.env.example` documenta variáveis.
- **Fases blocker.** Não avançar para próxima fase sem testes da fase atual passando.
- **Saldos sempre calculados.** Nenhuma operação escreve saldo diretamente — sempre usa transactions como fonte da verdade.
- **Centavos como inteiros.** amount_cents, initial_balance_cents, high_value_limit_cents em BIGINT — nunca FLOAT.

---

*Última atualização: 2026-06-03 — Revisão 2 aplicada.*