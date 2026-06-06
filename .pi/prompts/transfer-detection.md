# Transfer Detection — Identificando Transferências

## O que é uma transferência

Transferência é saída de dinheiro de uma conta para **outra conta**. Pode ser:

- **Entre contas próprias** (Nubank → Carteira)
- **Para terceiro** (PIX para João Silva, TED para Imobiliária)

## Métodos suportados

| Método | Descrição | Default |
|--------|-----------|---------|
| **PIX** | Transferência instantânea 24/7 | ✅ Sim (default) |
| **TED** | Transferência Eletrônica Disponível (horário bancário) | Não |
| **DOC** | Documento de Crédito (1 dia útil) | Não |
| **TRANSFER** | Entre contas próprias (genérico) | Não |
| **CASH** | Dinheiro em espécie | Não |

## Como extrair do texto do usuário

O usuário pode falar:
- "**PIX** para João Silva 50 reais" → `method=PIX`, `recipient=João Silva`
- "**TED** aluguel imobiliária 2500" → `method=TED`, `recipient=Imobiliária`
- "transferi 100 pra Carteira" → `method=PIX` (default), `recipient=null` (conta própria)
- "paguei 50 pro João" → `method=PIX` (default), `recipient=João`

**Se o usuário não citar método, use PIX como default.**

## Fluxo de parsing

```
User: "fiz um TED de 2500 pra imobiliária são josé pelo nubank"

TED extrai:
  method = "TED"          (detectou da palavra "TED")
  recipient = "Imobiliária São José"  (extraiu da descrição)
  amount = 2500 reais = 250000 cents
  description = "TED Aluguel - Imobiliária São José"
  accountId = nubank (perguntar se houver múltiplas)

TED confirma com usuário:
  "Confirma: TED R$ 2.500 para Imobiliária São José no Nubank?"
```

## Quando perguntar vs. inferir

| Campo | Perguntar? |
|-------|-----------|
| Método | ❌ Não — infere ou usa PIX |
| Destinatário | ❌ Não — extrai da descrição |
| Valor | ✅ Sempre se não veio explícito |
| Conta origem | ✅ Só se houver múltiplas |
| Conta destino | ❌ Não — para terceiros vai sempre pra "conta padrão" ou cria uma "Conta Terceiros" |
| CPF/CNPJ | ❌ Não — opcional |

## Conta destino (para terceiros)

Por padrão, o sistema usa uma **conta de "Saída"** para o dinheiro sair. Mas isso
fica complicando o saldo. **Recomendação atual**: tratar transferências para
terceiros como **despesas** (`create_expense`) com categoria especial
`Transferência > PIX` ou similar.

Quando o usuário disser "transferi para João":
- Pergunte: "Isso é uma despesa (registrar como gasto) ou uma transferência real entre contas?"
- Se for **despesa**: use `create_expense` com categoria `Transferência > [Método]`
- Se for **transferência real** (ex: "movi 500 do Nubank pra Carteira"): use `create_transfer`

## Validações importantes

- ❌ **Mesma conta origem = destino**: rejeitar
- ❌ **Conta inexistente**: rejeitar
- ❌ **Documento inválido**: rejeitar (CPF deve ter 11 dígitos, CNPJ 14)
- ✅ **Documento opcional**: se não veio, tudo bem
- ✅ **Acento/case no destinatário**: normalizar para evitar duplicatas

## Detecção de duplicata

A `create_transfer` já detecta duplicatas por:
1. **Idempotency key** (match exato)
2. **Similaridade semântica** (Jaccard >= 60% + mesmo valor + mesmas contas + 1 dia)

Se detectar duplicata, retorna warning com `duplicate_detected: true`.

## Mensagens de confirmação (após registro)

**Com destinatário**:
```
✅ PIX R$ 50.00 para João Silva em 2026-07-20
```

**Sem destinatário (entre contas próprias)**:
```
✅ PIX R$ 100.00 transferido em 2026-07-20
```

**Com documento**:
```
✅ TED R$ 2.500.00 para Imobiliária São José (CNPJ 12.345.678/0001-90) em 2026-07-12
```

## Erros comuns

| Erro | Mensagem |
|------|----------|
| Mesma conta | "from_account_id and to_account_id must be different" |
| Conta inexistente | "One or both accounts not found or inactive" |
| Documento inválido | "recipient_document must be a valid CPF (11 digits) or CNPJ (14 digits)" |
| Valor inválido | "amount_cents must be positive" |
| Data inválida | "date must be YYYY-MM-DD" |

## Resumo

| Pergunta do usuário | Ação |
|---------------------|------|
| "transferi X para Y" | `create_transfer` com `method` (PIX default) + `recipient=Y` |
| "paguei X para Y" | Provavelmente `create_expense` com categoria apropriada |
| "movi X da conta A pra B" | `create_transfer` entre contas próprias |
| "PIX de X para Y" | `create_transfer` com `method=PIX` |
| "TED de X para Y" | `create_transfer` com `method=TED` |
