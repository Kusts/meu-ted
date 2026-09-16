> **STATUS: ARCHIVED — DO NOT USE AS CURRENT ARCHITECTURE**
>
> Movido de .pi/ em 2026-09-16 (T4.4, SPEC §15 I1–I3). Descreve o Agent Pi / whatsapp-bridge removidos; mantido apenas como histórico.

# Parse Expense — Extraindo Despesas de Texto Livre

## Como Parsear

Ao receber uma mensagem, extraia:

1. **Valor** — sempre obrigatório, pode vir em vários formatos:
   - "50" → 5000 cents
   - "50 reais" → 5000 cents
   - "R$ 50,00" → 5000 cents
   - "50k" → 5000000 cents

2. **Descrição** — o que foi gasto:
   - "lanche" → "Lanche"
   - "pizza" → "Pizza"
   - "cinema com a galera" → "Cinema"

3. **Data** — usar `timestamp` se não especificada

4. **Categoria** — inferir do contexto:
   - "lanche" → `Alimentação > Lanche`
   - "uber" → `Transporte > Uber`
   - "farmácia" → `Saúde > Farmácia`

5. **Conta** — pode vir na mensagem ou perguntar:
   - "no nubank" → Nubank
   - "no itaú" → Itaú

## Few-Shots

### Exemplo 1: Mensagem Simples
```
User: "gastei 50 no lanche"
```
**Parsed:**
- valor: 5000 cents
- descricao: "Lanche"
- categoria: `Alimentação > Lanche`
- data: timestamp
- conta: **PEDIR** (não especificada)

**Resposta:**
```
Categoria: Alimentação > Lanche. De qual conta?
```

### Exemplo 2: Mensagem Completa
```
User: "gastei 50 no lanche no nubank"
```
**Parsed:**
- valor: 5000 cents
- descricao: "Lanche"
- categoria: `Alimentação > Lanche`
- data: timestamp
- conta: Nubank

**Resposta:**
```
💸 Anotado: R$ 50 em Alimentação > Lanche no Nubank.
Se a data estiver errada, é só falar.
```

### Exemplo 3: Valor Alto (confirmação necessária)
```
User: "gastei 800 no paracetamol"
```
**Parsed:**
- valor: 80000 cents
- descricao: "Paracetamol"
- categoria: `Saúde > Farmácia`
- data: timestamp
- conta: **PEDIR**

**Resposta:**
```
🤔 Qual conta?
```

Depois de receber a conta, **antes de registrar**:
```
⚠️ Gasto de R$ 800 em Saúde > Farmácia no Nubank. Confirma?
```

### Exemplo 4: Categoria Nova
```
User: "gastei 30 no psicólogo"
```
**Parsed:**
- valor: 3000 cents
- descricao: "Psicólogo"
- categoria: `Saúde > Consulta` (nova subcategoria!)
- data: timestamp
- conta: **PEDIR**

**Resposta:**
```
🤔 Qual conta?

User: "itau"
```

**Ação:** Criar categoria `Saúde > Consulta` antes de registrar.

### Exemplo 5: Sem Valor
```
User: "comprei uma coisa"
```
**Resposta:**
```
🤔 Qual foi o valor?
```

## Regras de Inferência

| Palavra | Categoria |
|---------|-----------|
| lanche, comida, almoço, janta, café | `Alimentação > Lanche` |
| mercado, supermercado | `Alimentação > Mercado` |
| uber, 99 | `Transporte > Uber` |
| táxi, taxi | `Transporte > Táxi` |
| gasolina, combustível | `Transporte > Gasolina` |
| farmácia, remédio | `Saúde > Farmácia` |
| cinema, filme | `Lazer > Cinema` |
| netflix, spotify, streaming | `Lazer > Streaming` |
| amazon, shopee, loja | `Compras > Geral` |

## Quando Perguntar

| Campo | Perguntar? |
|-------|------------|
| valor | ✅ SEMPRE — se não veio |
| conta | ✅ Só se houver múltiplas possibilidades |
| data | ❌ Não — usar timestamp |
| categoria | ❌ Não — inferir, criar se necessário |