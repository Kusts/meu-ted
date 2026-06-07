---
name: contas-a-pagar
description: Cria e gerencia contas a pagar com lembretes de vencimento e status automático (pending/paid/overdue/cancelled). Suporta contas avulsas e recorrentes (luz, internet, aluguel).
version: 1
created: 2026-08-01
updated: 2026-08-01
---

# Skill: Contas a Pagar

## When to Use

Use esta skill SEMPRE que o usuário mencionar:
- "tenho uma conta de luz pra pagar"
- "minha internet vence dia 10"
- "cadê a conta do aluguel?"
- "paguei a conta da net"
- "quais contas vencem essa semana?"
- "tem algo vencido?"

## Conceitos Importantes

### Tipos de Conta

| Tipo | Quando | Comportamento |
|------|--------|---------------|
| `one_time` | IPVA, anuidade, cartório, avulsa | 1 ocorrência, some após pagar |
| `recurring` | Luz, internet, aluguel, streaming | Auto-cria próxima após pagar |

### Status

| Status | Significado | Visual |
|--------|-------------|--------|
| `pending` | Pendente, data ainda não passou | 📅 |
| `overdue` | Data já passou, não paga | 🚨 |
| `paid` | Paga (paid_date preenchido) | ✅ |
| `cancelled` | Cancelada (assinatura cancelada) | ❌ |

### Lembretes

- `reminder_days_before`: dias antes do vencimento (default 3)
- `last_reminder_sent_at`: timestamp do último envio (idempotência)
- Lembretes são "pessoais": uma vez enviados hoje, não repetem no mesmo dia

## Fluxo de Decisão

```
Usuário fala de conta
       ↓
+--------------------------+
| É fixa mensal?           |---SIM---> create_account_payable(type=recurring,
+--------------------------+                 frequency=monthly)
       | NÃO                                ↓
       ↓                              next occurrence
+--------------------------+             é auto-criada
| É avulsa/data única?     |---SIM---> create_account_payable(type=one_time)
+--------------------------+
```

## Procedure

### 1. Criar conta

```typescript
// One-time (avulsa)
await create_account_payable({
  accountId: contaId,
  description: "IPVA do carro",
  amountCents: 150000,  // R$ 1500
  dueDate: "2026-07-15",
  type: "one_time",
});

// Recurring (mensal)
await create_account_payable({
  accountId: contaId,
  description: "Conta de luz",
  amountCents: 18500,  // R$ 185
  dueDate: "2026-06-10",
  type: "recurring",
  frequency: "monthly",
});

// Recurring (anual, ex: IPVA)
await create_account_payable({
  accountId: contaId,
  description: "Seguro do carro",
  amountCents: 240000,
  dueDate: "2026-09-01",
  type: "recurring",
  frequency: "yearly",
});
```

### 2. Listar contas

```typescript
// Todas
await list_accounts_payable({});

// Filtros
await list_accounts_payable({ status: "overdue" });
await list_accounts_payable({ type: "recurring" });
await list_accounts_payable({ dueWithinDays: 7 });
```

### 3. Marcar como paga

```typescript
// Paga + cria expense automaticamente
await mark_account_paid({
  payableId: "uuid",
  paidDate: "2026-06-05",  // opcional, default hoje
});

// Paga SEM criar expense
await mark_account_paid({
  payableId: "uuid",
  createTransaction: false,
});
```

### 4. Cancelar conta

```typescript
await cancel_account_payable({
  payableId: "uuid",
  reason: "Cancelei a assinatura",
});
```

### 5. Lembretes proativos

```typescript
// No INÍCIO de cada conversa
await check_payable_reminders({ markAsSent: true });
```

### 6. Refresh automático

```typescript
// Para rodar no início do dia ou antes de checar lembretes
await refresh_payable_status({});
// pending → overdue (se data passou)
// recurring + paid → cria próxima ocorrência
```

## Início de Conversa (Procedimento Padrão)

```typescript
// SEMPRE no início de cada sessão
await refresh_payable_status({ householdId });
await check_payable_reminders({ householdId, markAsSent: true });
```

Mostrar ao usuário:
- 🚨 Vencidas (se houver)
- 🔥 Vence hoje (se houver)
- 📅 Próximas 7 dias
- Total a pagar

## Diferença vs Expense/Installment

| | Expense | Installment | Account Payable |
|---|---------|-------------|-----------------|
| Quando | Já aconteceu | Plano fechado com N parcelas | Compromisso futuro |
| Vencimento | Não (foi passada) | Por parcela | Por conta |
| Status | `pending`/`confirmed` | `scheduled`/`paid`/`overdue` | `pending`/`overdue`/`paid`/`cancelled` |
| Recorrente | ❌ | ❌ | ✅ |

## Perguntar vs Inferir

| Campo | Perguntar? |
|-------|-----------|
| Descrição | ❌ Inferir da mensagem |
| Valor | ❌ Inferir (valor em BRL → cents) |
| Data de vencimento | ❌ Inferir (palavras como "dia 10") |
| Conta | ❌ Perguntar se ambíguo |
| Tipo (recurring vs one_time) | ❌ Default one_time |
| Frequência | ✅ Perguntar se recurring |
| Categoria | ❌ Auto-categorizar |

## Pitfalls

- ❌ **NÃO** confunda `expense` (já aconteceu) com `account_payable` (vai acontecer)
- ❌ **NÃO** use `type=recurring` sem `frequency`
- ❌ **NÃO** pague uma conta cancelada (já bloqueado)
- ❌ **NÃO** chame `mark_paid` duas vezes (já bloqueado)
- ✅ **SEMPRE** chame `refresh_payable_status` antes dos lembretes
- ✅ **SEMPRE** use `markAsSent: true` para evitar lembrete duplicado no mesmo dia
- ✅ **SEMPRE** diferencie recorrente de avulsa

## Arquivos

| Arquivo | Função |
|---------|--------|
| `tools/accounts-payable.ts` | Helpers (computeStatus, getNextDate, refresh) |
| `tools/accounts_payable.ts` | 6 tools (create, list, pay, cancel, reminders, refresh) |

## Schema

```sql
CREATE TABLE accounts_payable (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL,
  account_id UUID NOT NULL,
  category_id UUID,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  type TEXT CHECK ('recurring' OR 'one_time'),
  frequency TEXT CHECK ('monthly' OR 'quarterly' OR 'yearly'),
  due_date DATE NOT NULL,
  end_date DATE,
  status TEXT CHECK ('pending' OR 'paid' OR 'overdue' OR 'cancelled'),
  paid_date DATE,
  paid_transaction_id UUID,
  reminder_days_before SMALLINT DEFAULT 3,
  last_reminder_sent_at TIMESTAMPTZ,
  source_message_id TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Em transactions:
ALTER TABLE transactions
  ADD COLUMN paid_account_payable_id UUID REFERENCES accounts_payable(id);
```

## Validação

1. ✅ Criar conta one_time → status=pending
2. ✅ Criar conta recurring sem frequency → erro
3. ✅ Refresh: pending → overdue se data passou
4. ✅ Lembretes categorizados (vencidas/vence hoje/próximas)
5. ✅ Lembretes com `markAsSent=true` são idempotentes
6. ✅ `mark_paid` cria expense automaticamente
7. ✅ Recurring paga → próxima ocorrência criada
8. ✅ `cancel` muda status para cancelled
9. ✅ `mark_paid` em cancelled → erro
10. ✅ `mark_paid` em paid → erro

## Templates de Contas Recorrentes

### Quando usar

- "todo dia 10 tenho conta de luz de R$ 185"
- "Netflix sempre dia 15, R$ 39,90"
- "cria a conta de luz desse mês"

### Tools

**`create_payable_template`**: salva template
- name (ex: "Netflix")
- description (ex: "Mensalidade Netflix")
- amount, frequency, day_of_month
- Auto-cria primeira ocorrência

**`create_payable_from_template`**: cria conta a partir de template
- Por `templateId` ou `templateName`
- `amountOverrideCents`: alterar valor para esta ocorrência
- `dueDate`: custom (default: próximo calculado)
- Detecta duplicata (mesma description + dueDate)

**`list_payable_templates`**: lista templates
- Calcula `nextDue` baseado em `dayOfMonth`

**`auto_create_from_templates`**: batch
- Cria contas para todos os templates ativos
- `daysAhead`: janela de criação (default 30)
- Pula templates com conta já existente

### Cálculo de Próximo Vencimento

```
dayOfMonth + today
├── se hoje < próximo_dayOfMonth → este mês
└── se hoje >= próximo_dayOfMonth → próximo mês
```

Exemplos com `dayOfMonth=15` e `today=2026-06-06`:
- → 2026-06-15 (este mês, futuro)
- → 2026-07-15 (se hoje fosse 2026-06-20)

## Antecipação Múltipla (prepayMonths)

### Quando usar

- "paga 3 meses de internet adiantado"
- "quitar o ano de Netflix"

### Tool

**`mark_account_paid`** com `prepayMonths: N`:
- Marca a conta atual como paga
- Cria N contas futuras com status `paid` e `paid_date` = data do pagamento
- Respeita `end_date` (se passado, para de criar)
- Próxima `nextDueDate` = após último pré-pago

### Exemplo

```typescript
await mark_account_paid({
  payableId: "uuid",
  prepayMonths: 3,
});
// Resultado: 4 meses pagos de uma vez (1 atual + 3 adiantados)
// nextDueDate = 2026-09-10 (4 meses após 2026-06-10)
```

## Score de Pagamentos

### `payment_score`

Calcula % de pontualidade nos últimos N meses (default 6).

**Categorias**:
- `onTime`: pagas no dia exato
- `early`: pagas adiantadas (dias < 0)
- `late`: pagas atrasadas (dias > 0)
- `cancelled`: status cancelled

**Score**:
```
100 * onTimeRate + 50 * earlyRate - 50 * lateRate
```

**Ratings**:
- 🌟 90-100: Excelente
- ✅ 75-90: Bom
- ⚠️ 50-75: Regular
- 🔴 25-50: Ruim
- 🚨 0-25: Crítico

## Projeção Mensal

### `monthly_projection`

Soma todas as contas (pending/overdue) do mês.

**Output**:
- Total a pagar
- Breakdown por dia de vencimento
- Breakdown por categoria (top 5)
- Saldo após pagar (income - total)
- % de comprometimento da renda

```typescript
await monthly_projection({ yearMonth: "2026-07" });
```

## Alerta de Variação de Preço

### `check_price_alerts`

Detecta contas recorrentes com valor muito diferente da média histórica.

**Threshold** (default 15%):
- `info`: ≥ 15%
- `warning`: ≥ 25%
- `alert`: ≥ 50%

**Compara**:
- Atual: próxima ocorrência `pending`/`overdue`
- Histórico: últimas 6 ocorrências `paid` (12 meses)

**Casos de uso**:
- Conta de luz subiu 40% (clima, bandeira tarifária)
- Internet subiu (reajuste anual)
- Streaming mudou de preço

```typescript
await check_price_alerts({ thresholdPercent: 15 });
```

## Início de Conversa (Procedimento Recomendado)

```typescript
await refresh_payable_status({});          // pending → overdue
await check_payable_reminders({ markAsSent: true });
await monthly_projection({});              // projeção do mês
await check_price_alerts({});              // alertas de preço
```

## Arquivos Adicionais

| Arquivo | Função |
|---------|--------|
| `tools/payable_templates.ts` | 4 tools (template CRUD + auto) |
| `tools/payment_score.ts` | 1 tool (score) |
| `tools/payment-score.ts` | Helpers (computeScore, format) |
| `tools/monthly_projection.ts` | 1 tool (projeção) |
| `tools/price-alerts.ts` | 1 tool (alerta) |
| `scripts/apply-templates.ts` | Migração schema |
