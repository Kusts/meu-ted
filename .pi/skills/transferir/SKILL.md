---
name: transferir
description: Classifica e registra transferências entre contas próprias OU para/de terceiros. Detecta automaticamente o tipo de operação e chama a tool correta.
version: 1
created: 2026-07-25
updated: 2026-07-25
---

# Skill: Transferir

## When to Use

Use esta skill SEMPRE que o usuário mencionar uma **transferência** ou **PIX** ou **TED** ou **DOC**. O usuário pode usar linguagem natural como:

- "transferi X da conta A pra B" (entre contas próprias)
- "movi X do Nubank pra Carteira" (entre contas próprias)
- "fiz um PIX de X pro João" (para terceiro = despesa)
- "recebi um PIX de X" (de terceiro = receita)
- "paguei X via PIX pro João" (para terceiro = despesa)
- "TED de X pra imobiliária" (para terceiro = despesa)

**NÃO use** esta skill para:
- Compras com cartão (use a skill `compra_cartao` ou `create_expense`)
- Pagamentos em dinheiro (use `create_expense` ou `create_income`)
- Transferências recorrentes (configurar via app, não via chat)

## Modelo Conceitual

| Cenário | Tipo | Tool | Categoria | Afeta Saldo |
|---------|------|------|-----------|-------------|
| **Entre contas próprias** (Nubank → Carteira) | `transfer` | `create_transfer` | — | Neutro (move entre contas) |
| **Para terceiro** (PIX João Silva - envio) | `expense` | `create_expense` | `Transferência > PIX` | Diminui |
| **De terceiro** (PIX recebido de João) | `income` | `create_income` | `Transferência > PIX Recebido` | Aumenta |

**REGRA CRÍTICA**: Transferência entre contas próprias **NÃO** é receita nem despesa. É apenas movimentação interna. O saldo total do household fica o mesmo.

## Fluxo de Decisão

```
Usuário menciona transferência
       |
       v
+----------------------+
| É entre contas      |---SIM---> create_transfer (kind=transfer)
| próprias?            |              NUNCA gera receita ou despesa
+----------------------+
       | NAO
       v
+----------------------+
| É RECEBIMENTO        |---SIM---> create_income
| (usuário RECEBEU)?   |              Categoria: Transferência > PIX Recebido
+----------------------+
       | NAO
       v
+----------------------+
| É PAGAMENTO          |---SIM---> create_expense
| (usuário ENVIOU)?    |              Categoria: Transferência > [Método]
+----------------------+
```

## Procedure

### 1. Parsear a mensagem

Extrair:
- **Valor**: SEMPRE obrigatório, em centavos
- **Direção**: 
  - "transferi X da A pra B" = entre contas
  - "recebi X" = entrada de terceiro
  - "paguei X" / "enviei X" / "mandei X" = saída para terceiro
- **Conta origem** (se aplicável): Nubank, Itaú, etc.
- **Conta destino** (se aplicável): para transferências entre contas próprias
- **Destinatário** (se for terceiro): nome da pessoa/empresa
- **Método**: PIX (default), TED, DOC, TRANSFER, CASH
- **Data**: usar timestamp da mensagem WhatsApp

### 2. Identificar o tipo

```typescript
function classifyTransfer(message: string, accounts: Account[]): {
  type: "internal" | "outgoing_third" | "incoming_third";
  method: TransferMethod;
  recipientName?: string;
  fromAccountId?: string;
  toAccountId?: string;
} {
  const lower = message.toLowerCase();
  
  // Caso 1: Entre contas próprias
  // Pistas: "da A pra B", "movi do X pro Y", "transferi do X para Y"
  if (/\b(da|de|do)\s+\w+.*\s+(pra|para|pro)\s+\w+/i.test(message) ||
      /\bmovi\b|\bmovei\b/i.test(message)) {
    // Detectar contas pelos nomes conhecidos
    return { type: "internal", ... };
  }
  
  // Caso 2: Recebimento
  // Pistas: "recebi", "caiu na conta", "entrou", "pix de [pessoa]"
  if (/\brecebi\b|\bcaiu\b|\bchegou\b|\bentr[ou]u\b/i.test(message)) {
    return { type: "incoming_third", ... };
  }
  
  // Caso 3: Pagamento (default quando há menção a terceiro)
  // Pistas: "paguei", "mandei", "enviei", "transfiri pra/pra [pessoa]"
  return { type: "outgoing_third", ... };
}
```

### 3. Chamar a tool correta

```typescript
if (type === "internal") {
  return await create_transfer({
    fromAccountId: detectedFromAccount,
    toAccountId: detectedToAccount,
    amountCents: parseAmount(),
    description: cleanDescription,
    date: timestamp,
    method: detectedMethod,  // opcional, default PIX
    idempotencyKey: `${sourceMessageId}-${kind}-${amount}`,
  });
} else if (type === "outgoing_third") {
  // IMPORTANTE: É uma DESPESA, não transferência
  return await create_expense({
    description: `[${method}] ${recipientName} - ${reason}`,
    amountCents: parseAmount(),
    categoryId: getCategoryId(`Transferência > ${method}`),  // ou criar
    accountId: detectedFromAccount,
    date: timestamp,
    idempotencyKey: `${sourceMessageId}-${kind}-${amount}`,
  });
} else {
  // incoming_third
  return await create_income({
    description: `[${method}] Recebido de ${recipientName} - ${reason}`,
    amountCents: parseAmount(),
    categoryId: getCategoryId(`Transferência > ${method} Recebido`),
    accountId: detectedToAccount,
    date: timestamp,
    idempotencyKey: `${sourceMessageId}-${kind}-${amount}`,
  });
}
```

### 4. Confirmar com o usuário

**Para transferências entre contas próprias**:
```
✅ Transferência registrada: PIX R$ 100.00 da Nubank para Carteira em 2026-07-25
```

**Para PIX para terceiro** (despesa):
```
✅ PIX R$ 50.00 para João Silva registrado como despesa em Alimentação > Transferência > PIX.
Se a categoria não estiver certa, me avisa.
```

**Para PIX recebido** (receita):
```
✅ Recebido R$ 200.00 de João Silva via PIX.
```

## Exemplos de Mensagens

| Mensagem do usuário | Tipo | Tool |
|---------------------|------|------|
| "transferi 100 do nubank pra carteira" | internal | create_transfer |
| "movi 200 do itaú pra nubank" | internal | create_transfer |
| "fiz um pix de 50 pro João" | outgoing_third | create_expense |
| "paguei 2500 de aluguel via TED" | outgoing_third | create_expense |
| "recebi 100 de pix da Maria" | incoming_third | create_income |
| "caiu 500 na conta do João" | incoming_third | create_income |
| "mandei 30 de pix pro Zé" | outgoing_third | create_expense |

## Pitfalls

- ❌ **NÃO chame `create_transfer`** para PIX a terceiro. Use `create_expense`.
- ❌ **NÃO confunda "transfiri pra João"** (terceiro) com "transfiri pra Carteira" (interna).
- ❌ **NÃO infira categoria de despesa** se a categoria `Transferência > [Método]` não existir — crie.
- ✅ **SEMPRE pergunte a conta** se houver mais de uma conta própria possível.
- ✅ **SEMPRE confirme com o usuário** antes de chamar a tool, mostrando o tipo detectado.
- ✅ **Método padrão = PIX** se não mencionado.

## Categorias Recomendadas

Crie estas categorias na casa do usuário se não existirem:

| Categoria | Kind | Uso |
|-----------|------|-----|
| `Transferência > PIX` | expense | PIX enviado para terceiro |
| `Transferência > TED` | expense | TED enviado para terceiro |
| `Transferência > DOC` | expense | DOC enviado para terceiro |
| `Transferência > PIX Recebido` | income | PIX recebido de terceiro |
| `Transferência > TED Recebido` | income | TED recebido de terceiro |

## Verification

Após chamar a tool, verificar:
1. ✅ Saldo da conta origem **diminuiu** (se for despesa)
2. ✅ Saldo da conta destino **aumentou** (se for receita OU transferência interna)
3. ✅ Saldo **inalterado** se for transferência entre contas próprias
4. ✅ Mensagem de confirmação faz sentido para o usuário
5. ✅ Idempotency key foi gerada baseada em `sourceMessageId` para evitar duplicatas

## Casos Especiais

### Transferência entre contas próprias com detecção ambígua
Ex: "transferi 100 do nubank" (sem destino explícito)
→ **Perguntar**: "Transferência de qual conta para qual?"

### Pagamento parcial vs total
- Se "paguei 50 de 100" → é despesa de 50
- Se "transfiri o saldo todo" → pegar saldo atual

### Transferência recorrente
- "Todo mês transfiro 1000 pro Nubank" → criar recorrência no app, não via chat
- Sugerir: "Quer configurar como recorrente?"
