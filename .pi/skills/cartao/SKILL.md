---
name: cartao
description: Gerencia cartões de crédito — criação de conta de cartão, registro de compras em fatura, pagamentos (total/parcial), listagem de faturas (abertas, fechadas, atrasadas), e parcelamentos.
version: 1
created: 2026-08-01
updated: 2026-08-01
---

# Skill: Cartão de Crédito

## When to Use

Use esta skill quando o usuário mencionar:
- Criar/visualizar conta de cartão de crédito
- Fazer compra no cartão de crédito
- Pagar fatura (total ou parcial)
- Verificar faturas em aberto, fechadas, atrasadas
- Parcelamento de compra

**NÃO use** para:
- Débito (use a skill `transferir` se for entre contas, senão `create_expense` direto)
- PIX para terceiros (use a skill `transferir`)

## Conceitos Importantes

### Ciclo de Fatura

```
[Fechamento da fatura anterior] ─────► [Fechamento atual]
         │                                    │
         ▼                                    ▼
    [Fatura anterior]                  [Fatura atual]
      (closed/paid)                     (open)
                                          │
                                          ▼
                                    [Vencimento]
                                          │
                                          ▼
                                    [Paga ou Atrasada]
```

### Status da Fatura

| Status | Significado | Próximo Estado |
|--------|-------------|----------------|
| `open` | Antes do fechamento, recebendo compras | `closed` |
| `closed` | Após fechamento, antes do vencimento | `paid` / `partial` / `overdue` |
| `paid` | Total pago | — |
| `partial` | Pagamento parcial feito | `paid` / `overdue` |
| `overdue` | Passou do vencimento sem pagar total | `paid` / `partial` |
| `cancelled` | Fatura cancelada (raro) | — |

### Como Compras São Alocadas

Uma compra no cartão vai para a **fatura cujo ciclo contém a data da compra**:

```
Compra em 2026-08-15, cartão fecha dia 5:
  - Fechamento atual: 2026-09-05
  - Vencimento: 2026-09-15
  - Compra vai para fatura "2026-09"
```

Se a compra é após o dia de fechamento, vai para a **próxima** fatura.

## Fluxo de Decisão

```
Usuário menciona cartão
       ↓
+--------------------------+
| Quer CRIAR conta de      |---SIM---> create_credit_card_account()
| cartão?                  |
+--------------------------+
       | NÃO
       ↓
+--------------------------+
| Quer PAGAR fatura?       |---SIM---> pay_statement()
+--------------------------+
       | NÃO
       ↓
+--------------------------+
| Quer VER faturas?        |---SIM---> list_open_statements() /
|                          |            list_overdue_statements() /
+--------------------------+            get_statement_details()
       | NÃO
       ↓
+--------------------------+
| É COMPRA no cartão?      |---SIM---> create_card_purchase()
+--------------------------+
       | NÃO
       ↓
  "Não entendi, pode repetir?"
```

## Procedure

### 1. Criar conta de cartão

```typescript
await create_account({
  name: "Cartão Nubank",
  initialBalanceCents: 0,  // saldo inicial sempre 0
  isCreditCard: true,
  creditLimitCents: 500000,  // R$ 5.000
  closingDay: 5,
  dueDay: 15,
});
```

**Resposta para o usuário**:
```
✅ Cartão criado: Nubank
💳 Limite: R$ 5.000,00
📅 Fechamento: dia 5
⏰ Vencimento: dia 15
```

### 2. Registrar compra

```typescript
await create_card_purchase({
  accountId: "cartao-nubank-id",
  description: "iFood jantar",
  amountCents: 5000,
  date: "2026-08-15",
  installmentsTotal: 3,  // opcional
  installmentNumber: 1,  // 1 de 3
});
```

**Resposta**:
```
💳 Compra registrada: iFood jantar — R$ 50,00
📅 Fatura 2026-09 (fecha 05/09, vence 15/09)
🔢 Parcela 1/3
```

### 3. Pagar fatura

```typescript
await pay_statement({
  statementId: "stmt-id",
  amountCents: 35000,  // null = pagar total
  accountId: "conta-pagamento-id",  // conta de onde sai o dinheiro
});
```

**Resposta**:
```
✅ Fatura 2026-09 paga: R$ 350,00
💰 Saldo restante: R$ 50,00 (parcial)
```

### 4. Listar faturas

```typescript
const open = await list_open_statements({ accountId: "cartao-id" });
const overdue = await list_overdue_statements({ householdId: "hh-id" });
```

**Resposta**:
```
📋 Faturas em aberto:
• Fatura 2026-09 (fecha 05/09, vence 15/09) — R$ 350,00
• Fatura 2026-10 (fecha 05/10, vence 15/10) — R$ 120,00

⚠️ Faturas atrasadas:
• Fatura 2026-07 (venceu 15/07) — R$ 200,00
```

## Exemplos de Mensagens

| Usuário | Ação |
|---------|------|
| "criei um cartão nubank com limite 5000" | `create_credit_card_account` |
| "comprei 50 no iFood no cartão" | `create_card_purchase` |
| "comprei 300 no cartão em 3x" | `create_card_purchase` (installments=3) |
| "paguei a fatura do nubank" | `pay_statement` (total) |
| "paguei 200 da fatura" | `pay_statement` (parcial) |
| "quais faturas em aberto?" | `list_open_statements` |
| "tem fatura atrasada?" | `list_overdue_statements` |
| "mostra fatura 09" | `get_statement_details` |

## Perguntar vs Inferir

| Campo | Perguntar? |
|-------|-----------|
| Limite do cartão | ✅ Sempre |
| Dia de fechamento | ✅ Sempre |
| Dia de vencimento | ✅ Sempre |
| Valor da compra | ✅ Sempre se não veio explícito |
| Data da compra | ❌ Usar data da mensagem |
| Categoria | ❌ Inferir via `skill:categorizar` |
| Número de parcelas | ❌ Default 1x (à vista) |

## Pitfalls

- ❌ **NÃO** use `create_expense` para compra no cartão — use `create_card_purchase`
- ❌ **NÃO** confunda "paguei a fatura" com "paguei a compra" — primeiro paga o banco, depois a compra vira histórico
- ❌ **NÃO** feche a fatura antes da data de fechamento (deixe o sistema calcular)
- ❌ **NÃO** pague fatura com saldo negativo — vai falhar
- ✅ **SEMPRE** use `create_card_purchase` (não `create_expense`) para cartão
- ✅ **SEMPRE** verifique se a fatura está `open` antes de adicionar compra
- ✅ **SEMPRE** atualize o status da fatura após pagamento

## Integração com outras skills

- **Skill `categorizar`**: Use para classificar a compra
- **Skill `transferir`**: Use para registrar o pagamento da fatura (saída para banco)

## Verificação

Após qualquer operação, verificar:
1. ✅ Saldo do cartão não mudou imediatamente (só na fatura)
2. ✅ Status da fatura está correto
3. ✅ Total da fatura = soma das compras
4. ✅ Pago + Saldo = Total
5. ✅ Se pago < Total → status é `partial` ou `overdue`
6. ✅ Se pago >= Total → status é `paid`

## Arquivo: tools/credit-card.ts

### Funções principais

| Função | Uso |
|--------|-----|
| `getClosingDate(date, closingDay)` | Calcula data de fechamento |
| `getDueDate(closingDate, dueDay)` | Calcula data de vencimento |
| `getOrCreateOpenStatement(...)` | Encontra ou cria fatura |
| `computeStatementStatus(stmt, today)` | Calcula status |
| `refreshStatementStatus(...)` | Atualiza status no DB |
| `getCreditCardInfo(...)` | Info do cartão |
| `listOpenStatements(...)` | Lista faturas em aberto |
| `listOverdueStatements(...)` | Lista atrasadas |
| `getStatementPurchases(...)` | Compras de uma fatura |
| `recalculateStatementTotal(...)` | Recalcula total |
| `formatStatement(...)` | Formata para exibição |
