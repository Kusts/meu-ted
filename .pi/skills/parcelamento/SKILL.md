---
name: parcelamento
description: Cria e gerencia parcelamentos, tanto no cartão (vai pra fatura) quanto fora (boleto/carnê/financ). Suporta juros, pagáveis em partes, com detecção de vencidos.
version: 1
created: 2026-08-01
updated: 2026-08-01
---

# Skill: Parcelamento (Universal)

## When to Use

Use esta skill SEMPRE que o usuário mencionar:
- "comprei X em Nx"
- "parcelado em 12x"
- "boleto em 10 vezes"
- "carnê da loja"
- "financiamento"
- "paguei a parcela Y"

**Diferenciar**:
- **No cartão** → `type: "credit_card"`, cada parcela vai pra uma fatura
- **Fora do cartão** → `type: "out_of_card"`, parcela é despesa normal (boleto/débito)

## Conceitos Importantes

### Tipos de Parcelamento

| Tipo | Quando | Vencimento | Onde aparece |
|------|--------|-----------|--------------|
| `credit_card` | "comprei no cartão em Nx" | Dia de vencimento da fatura | Fatura do cartão |
| `out_of_card` | "boleto em Nx", "carnê", "financiamento" | Data de vencimento do boleto | Despesa normal na conta |

### Juros

- **Sem juros** (mais comum no cartão e boleto sem juros): total ÷ N
- **Com juros** (financiamento, carnê com juros): usa fórmula PMT
  - `PMT = PV * (i * (1+i)^n) / ((1+i)^n - 1)`
  - Juros total = (mensalidade * N) - PV

### Status das Parcelas

| Status | Significado |
|--------|-------------|
| `scheduled` | Parcela criada, ainda não paga (data futura) |
| `paid` | Usuário confirmou pagamento |
| `overdue` | Data passou e ainda não foi paga |

## Fluxo de Decisão

```
Usuário menciona parcelamento
       ↓
+--------------------------+
| É no cartão?             |---SIM---> create_installment_plan(type=credit_card)
+--------------------------+
       | NÃO
       ↓
+--------------------------+
| Tem juros?               |---SIM---> interestRate=0.0299 (exemplo)
+--------------------------+
       | NÃO
       ↓
create_installment_plan(type=out_of_card, interestRate=0)
```

## Procedure

### 1. Criar parcelamento

```typescript
// Sem juros, no cartão
await create_installment_plan({
  accountId: cartaoId,
  description: "iPhone 15 Pro",
  totalAmountCents: 700000,  // R$ 7000
  installmentsCount: 12,
  type: "credit_card",
  firstDueDate: "2026-10-15",
});

// Com juros, fora do cartão
await create_installment_plan({
  accountId: debitoId,
  description: "Financiamento carro",
  totalAmountCents: 5000000,  // R$ 50.000
  installmentsCount: 24,
  type: "out_of_card",
  firstDueDate: "2026-08-20",
  interestRate: 0.0299,  // 2.99% a.m.
});
```

### 2. Listar parcelas

```typescript
// Todas
await list_installment_plans({ householdId });

// Só cartão
await list_installment_plans({ householdId, type: "credit_card" });

// Só ativas (com parcelas pendentes)
await list_installment_plans({ householdId, active: true });
```

### 3. Pagar parcela individual

```typescript
await pay_installment({
  householdId,
  transactionId: "uuid-da-parcela",
});
```

### 4. Ver parcelas vencendo

```typescript
// Próximos 7 dias
await list_due_installments({ householdId, daysAhead: 7 });

// Atrasadas
await list_due_installments({ householdId, daysAhead: 0 });
```

## Perguntar vs Inferir

| Campo | Perguntar? |
|-------|-----------|
| Tipo (cartão/fora) | ✅ Sempre |
| Valor total | ✅ Sempre |
| Número de parcelas | ✅ Sempre |
| Juros | ✅ Sempre (se fora do cartão) |
| Data 1ª parcela | ❌ Default hoje (cartão) ou próximo mês (fora) |
| Categoria | ❌ Auto-categorizar |

## Exemplos

### Compra no cartão 12x

```
User: "comprei iPhone em 12x no cartão"
→ create_installment_plan(type=credit_card, count=12)
→ 12 transactions criadas, cada uma em uma fatura
```

### Financiamento 24x com juros

```
User: "financiei carro em 24x de 2949 com juros de 2.99%"
→ create_installment_plan(type=out_of_card, count=24, interestRate=0.0299)
→ 24 transactions de R$ 2949 cada
→ Total com juros: R$ 70.780,59
```

### Pagou parcela avulsa

```
User: "paguei a parcela do sofá hoje"
→ pay_installment(transactionId=...)
→ Status muda para 'paid'
```

## Pitfalls

- ❌ **NÃO** confunda `create_installment_plan` (N transactions) com `create_card_installments` (N compras no cartão)
- ❌ **NÃO** crie com `type=credit_card` em conta que não é cartão
- ❌ **NÃO** esqueça de marcar parcelas como pagas
- ✅ **SEMPRE** cheque se há parcelas atrasadas no início da conversa
- ✅ **SEMPRE** use `list_due_installments` para mostrar ao usuário o que vence

## Integração com outras skills

- **Skill `cartao`**: `create_installment_plan(type=credit_card)` complementa as tools de cartão
- **Skill `categorizar`**: Auto-categoriza a descrição
- **Skill `transferir`**: Pagamento de fatura usa essa skill

## Verificação

Após criar parcelamento:
1. ✅ N transactions criadas (N = installmentsCount)
2. ✅ Todas com `installment_status='scheduled'`
3. ✅ Primeira parcela: data = firstDueDate
4. ✅ Última parcela: data = firstDueDate + (N-1) meses
5. ✅ Soma das parcelas = total (sem juros) ou > total (com juros)

## Arquivos

| Arquivo | Função |
|---------|--------|
| `tools/installment-plan.ts` | Helpers (calculatePayment, buildSchedule, etc) |
| `tools/create_installment_plan.ts` | 2 tools (create, list) |
| `tools/pay_installment.ts` | 2 tools (pay, list_due) |

## Schema

```sql
CREATE TABLE installment_plans (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL,
  account_id UUID NOT NULL,  -- conta onde é debitada
  category_id UUID,
  description TEXT NOT NULL,
  total_amount_cents BIGINT NOT NULL,
  installments_count SMALLINT NOT NULL CHECK (1-48),
  interest_rate NUMERIC(7,6) DEFAULT 0,  -- ex: 0.0299 = 2.99% a.m.
  type TEXT CHECK ('credit_card' OR 'out_of_card'),
  first_due_date DATE NOT NULL,
  start_date DATE NOT NULL,
  source_message_id TEXT,
  created_at TIMESTAMPTZ
);

-- Em transactions:
ALTER TABLE transactions
  ADD COLUMN installment_plan_id UUID,
  ADD COLUMN installment_status TEXT DEFAULT 'scheduled'
    CHECK ('scheduled' OR 'paid' OR 'overdue'),
  ADD COLUMN paid_date DATE;
```
