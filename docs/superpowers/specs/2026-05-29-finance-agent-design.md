# Finance Agent TED — Design Técnico

**Data:** 2026-05-29  
**Status:** draft aprovado para revisão  
**Escopo:** MVP completo sem app mobile

## Contexto

Sistema financeiro pessoal para casal. Usuário e esposa usam mesmo grupo WhatsApp, permissões iguais, dados compartilhados e ações atribuídas por telefone. TED é agente financeiro via Pi terminal/RPC, com backend validando tudo antes de gravar.

## Objetivos

- Registrar finanças por WhatsApp, dashboard e cron.
- Manter contas reais, cartões, faturas, parcelas, recorrências, empréstimos, metas e relatórios.
- Dar confiabilidade: validação, duplicidade, audit log, undo, feedback pós-ação.
- Rodar local em Windows + Docker, com dashboard local-only.
- Postergar app iPhone, áudio, OCR, importação OFX/CSV e investimentos avançados.

## Stack

| Camada | Tecnologia | Motivo |
|---|---|---|
| Monorepo | pnpm workspaces | simples, TS único |
| API | Fastify + TypeScript | rápido, testável |
| Dashboard | Next.js | admin local CRUD |
| DB | Postgres Docker | fonte da verdade |
| ORM | Drizzle | migrations tipadas |
| WhatsApp | Evolution API Docker | grupo + webhooks |
| Jobs | pg-boss | cron em Postgres |
| Agent | `pi --mode rpc` | sem SDK |
| Testes | Vitest + Testcontainers + Playwright | TDD + integração + E2E |

## Arquitetura

```txt
WhatsApp Grupo ── Evolution API ── whatsapp-bridge ── Pi RPC (TED)
                                           │              │
Dashboard Next.js ─────────────────────── API Fastify ───┤
                                           │              │
pg-boss cron ─────────────────────────────┘              │
                                           │              │
                                      Postgres Docker <── tools validadas
```

## Boundaries

| Regra | Decisão |
|---|---|
| Fonte da verdade | Postgres |
| Agent | interpreta, sugere, chama tools |
| Services | validam regra financeira e idempotência |
| Tools | única ponte agent → domínio |
| Dashboard | CRUD/admin local |
| Cron | sempre chama TED, mas grava só via service validado |
| Ledger | saldos vêm de lançamentos auditáveis, não de mutação direta |
| Idempotência | WhatsApp, cron e tools usam chaves únicas anti-retry |
| Pi RPC | entrada serializada por fila/lock com timeout |
| Webhook | validar secret, group_id e telefones cadastrados |

## Módulos

```txt
apps/api
apps/dashboard
apps/whatsapp-bridge
apps/pi-rpc-runner
packages/domain
packages/db
packages/ledger
packages/idempotency
packages/tools
packages/agent-prompts
packages/testkit
.pi/skills/finance-ted
.pi/extensions/finance-tools.ts
```

## Persona TED

| Atributo | Regra |
|---|---|
| Nome | TED |
| Tom | amigável, engraçado, inteligente |
| Especialidade | dinheiro, organização, alertas, conselhos |
| Autonomia | insights, avisos, padrões, orientações |
| Segurança | nunca diz que fez sem confirmação da tool/service |
| Humor | piadas leves, no momento certo |

## Requisitos EARS

| ID | Tipo | Requisito |
|---|---|---|
| REQ-001 | Ubiquitous | The system shall store all financial records in Postgres. |
| REQ-002 | Ubiquitous | The system shall attribute every user-created action to a registered phone number. |
| REQ-003 | Event | When a WhatsApp message contains complete high-confidence financial data, the agent shall create the record and confirm updated financial impact. |
| REQ-004 | Event | When a WhatsApp message misses account or card, the agent shall ask a clarification before registering. |
| REQ-005 | Event | When a tool/service fails, TED shall report failure and shall not claim completion. |
| REQ-006 | Event | When a duplicate candidate is detected, the system shall block or request confirmation based on confidence and amount. |
| REQ-007 | State | While dashboard is local-only, the system shall only expose admin UI on local network bindings. |
| REQ-008 | Ubiquitous | The system shall support non-expiring sessions with manual revoke. |
| REQ-009 | Ubiquitous | The system shall support real accounts with shared or personal ownership. |
| REQ-010 | Ubiquitous | The system shall allow negative account balances. |
| REQ-011 | Ubiquitous | The system shall support cards with per-card closing and due days. |
| REQ-012 | Event | When a card purchase is registered, the system shall count spending by purchase date. |
| REQ-013 | Event | When an installment is generated, the system shall count each installment by its own date. |
| REQ-014 | Event | When a recurrence is created, the system shall pre-create at least 12 future occurrences. |
| REQ-015 | Event | When cron processes recurrence horizon, the system shall create only missing occurrences. |
| REQ-016 | State | While a bill is overdue and unpaid, the system shall roll it into the next month view. |
| REQ-017 | Event | When overdue payment includes extra amount, the system shall create linked late-interest record. |
| REQ-018 | Ubiquitous | The system shall support single/future/all edits for recurring occurrences. |
| REQ-019 | Ubiquitous | The system shall support hierarchical macro categories and subcategories. |
| REQ-020 | Event | When TED considers creating category, it shall inspect existing taxonomy first. |
| REQ-021 | Ubiquitous | The system shall support monthly category budgets, account goals, and custom scopes. |
| REQ-022 | Ubiquitous | The system shall support simple loan installments and calculated interest/amortization loans. |
| REQ-023 | Ubiquitous | The system shall support reports for current month, 12-month projection, category, account, invoices, due/overdue, budget vs actual, and custom queries. |
| REQ-024 | Event | When cron runs, it shall send task context to TED and execute validated service actions only. |
| REQ-025 | Ubiquitous | The system shall keep audit logs for create/update/delete/undo actions. |
| REQ-026 | Event | When user asks undo, the system shall reverse last eligible action through auditable reversal. |
| REQ-027 | Ubiquitous | The system shall store attachments and receipts linked to records. |
| REQ-028 | Ubiquitous | The system shall support merchants/payees and automatic categorization rules. |
| REQ-029 | Ubiquitous | The system shall support reimbursements and split shared/personal expenses. |
| REQ-030 | Event | When value exceeds configured high-value limit, the system shall ask confirmation. |
| REQ-031 | Ubiquitous | The system shall scope all user data by household_id. |
| REQ-032 | Event | When a WhatsApp webhook is retried, the system shall ignore already-processed source_message_id values. |
| REQ-033 | Ubiquitous | The system shall calculate balances from ledger entries. |
| REQ-034 | Event | When transfer is created, the system shall create debit and credit ledger entries with from_account_id and to_account_id. |
| REQ-035 | State | While Pi RPC is processing, new WhatsApp/cron tasks shall wait in a serialized queue or fail with retryable status. |
| REQ-036 | Event | When Evolution webhook arrives, the system shall validate secret, group_id, and sender phone before processing. |
| REQ-037 | Ubiquitous | The system shall use BRL cents and America/Sao_Paulo timezone for financial dates. |
| REQ-038 | Event | When a backup is created, the system shall verify restore on a test database before marking backup healthy. |
| REQ-039 | Event | When a card purchase date crosses closing rules, the system shall assign it to the correct invoice period. |
| REQ-040 | Ubiquitous | The system shall store local attachments under data/attachments with DB metadata. |

## Domínio

### Household

```ts
households(id, name, currency='BRL', timezone='America/Sao_Paulo')
```

### Users/Auth

```ts
users(id, household_id, name, phone, role='owner', active)
sessions(id, household_id, user_id, token_hash, revoked_at, created_at) // sem expires_at
login_codes(id, household_id, phone, code_hash, attempts, expires_at)
```

### Accounts

```ts
accounts(
  id, household_id, name, type, owner_user_id?, scope: 'shared'|'personal',
  initial_balance_cents default 0, active
)
```

### Categories

```ts
categories(id, household_id, name, parent_id?, kind, normalized_name, active)
category_aliases(id, household_id, category_id, alias)
categorization_rules(id, household_id, matcher, category_id, priority, active)
```

### Records

```ts
financial_records(
  id, household_id, type: 'income'|'expense'|'transfer'|'interest'|'adjustment',
  amount_cents, date, description,
  account_id?, from_account_id?, to_account_id?, card_id?, invoice_id?, category_id?,
  created_by_user_id?, source: 'whatsapp'|'dashboard'|'cron'|'agent', source_message_id?, idempotency_key?,
  status: 'posted'|'scheduled'|'paid'|'overdue'|'cancelled'|'review',
  recurrence_id?, installment_group_id?, related_record_id?,
  merchant_id?, confirmed_at?, metadata_json
)
```

### Ledger

```ts
ledger_entries(
  id, household_id, record_id, account_id?, card_id?, invoice_id?,
  direction: 'debit'|'credit', amount_cents, effective_date,
  entry_type: 'cash'|'card_charge'|'invoice_payment'|'transfer'|'interest'|'adjustment',
  created_at
)

// balance = accounts.initial_balance_cents + sum(credits) - sum(debits)
// transfer = one debit from source + one credit to destination
```

### Cards/Faturas

```ts
credit_cards(id, household_id, name, owner_user_id?, scope, limit_cents?, closing_day, due_day, payment_account_id?)
invoices(id, household_id, card_id, period_month, period_year, status: 'open'|'closed'|'paid', closes_at, due_at, total_cents)
unique(card_id, period_month, period_year)
```

### Parcelas/Recorrências

```ts
installment_groups(id, household_id, description, total_cents, installments_count, first_date, card_id?, account_id?)
recurrences(id, household_id, description, amount_cents, period, target_type, account_id?, card_id?, category_id?, next_date, horizon_months=12)
recurrence_occurrences(id, household_id, recurrence_id, occurrence_date, record_id?, status, edited_policy)
unique(recurrence_id, occurrence_date)
```

### Contas a pagar/Empréstimos

```ts
bills(id, household_id, description, amount_cents, due_date, paid_at?, status, record_id?, recurrence_id?)
loans(id, household_id, name, principal_cents, mode: 'fixed'|'price'|'sac'|'custom', interest_rate?, start_date, installments_count)
loan_installments(id, household_id, loan_id, due_date, principal_cents, interest_cents, total_cents, status)
```

### Confiabilidade

```ts
audit_logs(id, household_id, actor_user_id?, action, entity_type, entity_id, before_json, after_json, source, created_at)
attachments(id, household_id, entity_type, entity_id, file_path, mime_type, uploaded_by_user_id?) // data/attachments/...
merchants(id, household_id, name, normalized_name, default_category_id?)
source_messages(id, household_id, provider, group_id, sender_phone, provider_message_id, content_hash, processed_at?)
idempotency_keys(id, household_id, key, scope, created_at, expires_at?)
review_queue(id, household_id, reason, payload_json, status)
backups(id, household_id, path, checksum, restore_verified_at?, created_at)
```

## Fluxos WhatsApp

| Entrada | Ação |
|---|---|
| `gastei 87 mercado no inter` | registra despesa direto |
| `paguei academia 120` sem conta | pergunta conta/cartão |
| `comprei 300 em 3x no nubank` | cria installment_group + parcelas |
| `recebi 500 pix no inter` | registra receita |
| `transferi 100 inter para nubank` | cria transferência |
| `desfaz último registro` | executa undo auditável |
| conversa normal | ignora |

## Resposta pós-registro

```txt
✅ Registrei: R$87,40 Mercado
Conta: Inter compartilhada
Categoria: Alimentação > Mercado
Saldo Inter: R$1.240,20
Gasto Alimentação maio: R$642,10
TED: mercado tá comportado... por enquanto 😄
```

## Duplicidade

| Sinal | Regra |
|---|---|
| mesmo usuário + valor + merchant + janela curta | bloquear/perguntar |
| mesmo valor + mesma conta + descrição parecida | revisar |
| source_message_id já processado | ignorar retry |
| recorrência já existe por chave única | não criar |
| idempotency_key já usada | retornar resultado anterior |
| fatura já fechada | não fechar de novo |

## Cron

| Job | Frequência | Fluxo |
|---|---|---|
| recurrence-horizon | diário | fila Pi RPC → TED → cria faltantes idempotente |
| invoice-close | diário | fila Pi RPC → TED → fecha faturas vencidas |
| overdue-rollover | diário | fila Pi RPC → TED → marca vencidos no mês atual |
| notifications | diário | fila Pi RPC → TED → envia grupo |
| monthly-closing | mensal | fila Pi RPC → TED → resumo + insights |
| backup | diário/semanal | dump + checksum + restore test |

## Dashboard Admin

| Página | Função |
|---|---|
| Home | resumo mês + alertas TED |
| Registros | CRUD receitas/despesas/transferências |
| Contas | CRUD contas reais |
| Cartões | CRUD cartões + faturas |
| Recorrências | CRUD + edição única/futuras/todas |
| Categorias | árvore + aliases + merge |
| Metas/Orçamentos | category/account/custom |
| Empréstimos | fixed/price/sac/custom |
| Relatórios | fixos + filtros custom |
| Revisão | suspeitos/duplicados/altos |
| Config | usuários, limites, sessão, backup |

## Endpoints

| Método | Rota | Uso |
|---|---|---|
| POST | `/webhooks/evolution` | entrada WhatsApp com secret/group/phone validation |
| POST | `/auth/request-code` | código WhatsApp |
| POST | `/auth/verify-code` | sessão sem expiração |
| POST | `/auth/revoke` | revogar sessão |
| GET/POST | `/records` | listar/criar registros |
| PATCH/DELETE | `/records/:id` | editar/remover |
| POST | `/records/:id/undo` | reversão |
| POST | `/records/:id/review` | aprovar/rejeitar suspeito |
| GET/POST | `/accounts` | CRUD contas |
| GET/POST | `/cards` | CRUD cartões |
| GET/POST | `/invoices` | faturas |
| GET/POST | `/recurrences` | recorrências |
| POST | `/recurrences/:id/edit-scope` | esta/futuras/todas |
| GET/POST | `/categories` | categorias |
| POST | `/categories/merge` | padronização |
| GET/POST | `/budgets` | metas/orçamentos |
| GET/POST | `/loans` | empréstimos |
| GET | `/reports/:type` | relatórios |
| GET/POST | `/review` | fila revisão |
| POST | `/attachments` | comprovantes |
| POST | `/backups/run` | backup manual |
| POST | `/backups/:id/verify-restore` | valida restore |

## Pi Tools

| Tool | Responsabilidade |
|---|---|
| `find_financial_context` | contas/cartões/categorias/faturas relevantes |
| `create_expense` | despesa validada |
| `create_income` | receita validada |
| `create_transfer` | transferência validada com from_account_id/to_account_id + ledger duplo |
| `create_installment_purchase` | parcelamento |
| `create_recurrence` | recorrência + 12 ocorrências |
| `create_bill` | conta a pagar validada |
| `pay_bill` | pagamento real + juros |
| `pay_invoice` | pagamento fatura via conta |
| `close_invoice` | fechamento idempotente |
| `update_record` | edição auditável |
| `mark_reviewed` | resolve fila revisão |
| `generate_report` | relatório estruturado |
| `create_category_if_needed` | padronização categoria |
| `undo_last_action` | reversão auditável |
| `send_whatsapp_message` | resposta grupo |

## Segurança

| Risco | Guarda |
|---|---|
| TED alucinar ação | só confirmar após tool success |
| loop cron | unique keys + idempotency key |
| concorrência Pi RPC | fila serial + lock + timeout |
| webhook falso | secret + group_id + telefone permitido |
| duplicidade WhatsApp | source_message_id + fuzzy match + review/confirm |
| valor alto | confirmação obrigatória |
| dashboard exposto | bind local + firewall |
| sessão infinita roubada | revoke manual + cookie httpOnly |
| deleção acidental | soft delete + audit log + undo |

## Testes

| Tipo | Ferramenta | Escopo |
|---|---|---|
| Unit RED first | Vitest | domínio: saldo, fatura, parcelas, recorrência |
| Integration | Testcontainers Postgres | Drizzle repos + migrations |
| Contract | Zod + undici | API + tools Pi |
| E2E WhatsApp | Evolution mock | mensagem → validation → TED → DB → resposta |
| E2E Dashboard | Playwright | CRUD + relatórios |
| Snapshot | Playwright/screens | páginas principais |
| Mutation | Stryker | domínio crítico ≥70% |
| Coverage | Vitest | ≥80% novo código |

## Cenários TDD iniciais

| Cenário | Teste RED |
|---|---|
| Conta pode ficar negativa | despesa maior que saldo não bloqueia |
| Fatura idempotente | fechar duas vezes não duplica |
| Recorrência 12 meses | cria 12 ocorrências únicas |
| Cron horizon | vencida 1 ocorrência cria só próxima faltante |
| Duplicidade | mesma despesa curta janela pede revisão |
| TED não mente | falha tool gera resposta de erro |
| Pagamento atrasado | registra data real + juros separado |
| Categoria | alias mercado reaproveita Alimentação > Mercado |
| Parcela | 3x entra em 3 meses diferentes |
| Valor alto | entra em confirmação antes de gravar |
| Ledger | transferência cria débito e crédito auditáveis |
| Idempotência WhatsApp | retry do mesmo provider_message_id não duplica |
| Pi RPC lock | cron e WhatsApp são serializados |
| Backup restore | dump só fica saudável após restore test |

## Milestones

| # | Marco | Entrega |
|---|---|---|
| 1 | Fundação | monorepo, Docker, DB, migrations, testkit |
| 2 | Domínio core | contas, categorias, registros, audit log, TDD |
| 3 | Cartões/faturas/parcelas | regras e relatórios básicos |
| 4 | Recorrências/cron | 12 meses, idempotência, pg-boss |
| 5 | Pi RPC/TED tools | bridge RPC + tools seguras |
| 6 | WhatsApp | Evolution webhook + respostas grupo |
| 7 | Dashboard | admin CRUD local |
| 8 | Relatórios/insights | fixos + custom + fechamento mensal |
| 9 | Segurança/backup | sessions, revoke, export, backup, restore test |
| 10 | E2E completo | WhatsApp + dashboard + cron |

## Fora do MVP

```txt
- app iPhone internet-facing
- áudio WhatsApp entrada/saída
- OCR comprovantes
- importação OFX/CSV
- investimentos/patrimônio líquido avançado
```

## Decisões abertas

| Tema | Padrão proposto |
|---|---|
| Limite valor alto | R$500 por padrão, configurável |
| Backup | diário local + export manual |
| Primeiro usuário | seed manual no `.env`/script |
| Nome grupo WhatsApp | configurar por group_id Evolution |
| Ambiente | `localhost` + rede local |
| Timezone/moeda | `America/Sao_Paulo`, BRL, centavos inteiros |

## Aprovação

Após revisar este documento, próxima etapa é gerar plano de implementação TDD em `docs/superpowers/plans/2026-05-29-finance-agent-implementation.md`.
