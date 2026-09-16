> **STATUS: ARCHIVED — DO NOT USE AS CURRENT ARCHITECTURE**
>
> Movido de .pi/ em 2026-09-16 (T4.4, SPEC §15 I1–I3). Descreve o Agent Pi / whatsapp-bridge removidos; mantido apenas como histórico.

# Duplicate Detection — Lidando com Itens Duplicados

## Quando uma tool retorna `duplicate_detected`

As tools de criação (`create_expense`, `create_income`, `create_transfer`,
`create_account`, `create_category`) detectam duplicatas **antes** de inserir.

Quando uma duplicata é detectada, a tool **NÃO cria nada** e retorna:

```typescript
{
  duplicate_detected: true,
  existing_*: "id",
  match_type: "idempotency_key" | "semantic" | "exact_name",
  similarity: 0.0-1.0,  // apenas para semantic
  hint: "..."
}
```

## Tipos de Match

| Tipo | Quando | Significado |
|------|--------|-----------|
| `idempotency_key` | Mesma `idempotency_key` | É a **mesma** transação. Não duplicar. |
| `semantic` | Descrição similar (>= 60% Jaccard) + mesmo valor + mesma conta + 1 dia | **Provavelmente** a mesma. Confirmar com o usuário. |
| `exact_name` | Conta ou categoria com mesmo nome (case-insensitive) | Nome igual. Pode ser duplicata ou usuário quer duas. |

## Fluxo de Confirmação

```
User: "gastei 50 no lanche no nubank"

TED: [parse → create_expense]
Tool: { duplicate_detected: true, existing_transaction_id: "abc", match_type: "semantic", similarity: 0.85 }

TED: 🤔 Achei um lançamento bem parecido:
     • "Lanche no Nubank" — R$ 50,00 em 06/06/2026 (85% similar)
     
     Seu novo: "lanche no nubank"
     
     É o mesmo gasto? Se sim, eu só atualizo.
     Se for diferente, responde "sim" pra registrar mesmo assim.

User: "sim, é o mesmo"

TED: [cria expense com force: true]
Tool: { success: true, transaction_id: "..." }

TED: ✅ Anotado: R$ 50 em Alimentação > Lanche no Nubank.
```

## Respostas do Usuário

| Resposta | Ação |
|----------|------|
| "sim" / "isso" / "mesmo" / "pode registrar" | Retry com `force: true` |
| "não" / "diferente" | Retry com `force: true` (caso realmente queira duplicar) |
| "atualiza" / "edita" | Usar `update_transaction` ao invés de criar |
| "deleta o antigo" | Usar `delete_transaction` no antigo, depois criar normal |
| Ignorado / sem resposta | Esperar — não criar |

## Mensagens de Warning (templates)

### Idempotency key
```
⚠️ Já existe um lançamento com essa chave de idempotência:
• Lanche — R$ 50,00 em 2026-06-06
ID: 902cc3fa-...

Quer registrar mesmo assim? Responda "sim" para confirmar.
```

### Semântico (gastos parecidos)
```
🤔 Achei um lançamento bem parecido:
• "Lanche" — R$ 50,00 em 2026-06-06 (85% similar)

Seu novo: "lanche no nubank"

É o mesmo gasto? Se sim, eu só atualizo.
Se for diferente, responde "sim" pra registrar mesmo assim.
```

### Conta com mesmo nome
```
⚠️ Já existe uma conta com esse nome:
• "Nubank" — saldo inicial R$ 0,00
ID: 600e1f5f-...

Quer criar mesmo assim? Responda "sim" para confirmar.
```

## IMPORTANTE: NÃO BURLAR

- ❌ Nunca chame a tool com `force: true` sem perguntar ao usuário primeiro
- ❌ Nunca deduza que "é o mesmo" sem confirmação
- ✅ Sempre pergunte ao usuário
- ✅ Use linguagem amigável (não exponha detalhes técnicos)

## Edge Cases

### Vários matches (muitos lançamentos similares)
Mostre **apenas o mais recente e similar** (já é o que a tool faz).
Se o usuário disser "não é nenhum desses", aí sim registra com `force: true`.

### Match de conta/categoria com nome parecido (typo)
Ex: usuário cria "Nubank" mas já existe "nubank" (case diferente).
Mostre o warning. Se o usuário disser "ah é a mesma", sugira usar a existente.
