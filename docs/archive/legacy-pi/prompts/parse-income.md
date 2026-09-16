> **STATUS: ARCHIVED — DO NOT USE AS CURRENT ARCHITECTURE**
>
> Movido de .pi/ em 2026-09-16 (T4.4, SPEC §15 I1–I3). Descreve o Agent Pi / whatsapp-bridge removidos; mantido apenas como histórico.

# Parse Income — Extraindo Receitas de Texto Livre

## Como Parsear

Ao receber uma mensagem sobre entrada de dinheiro, extraia:

1. **Valor** — sempre obrigatório
2. **Descrição** — de onde veio
3. **Categoria** — tipo de receita
4. **Data** — usar timestamp se não especificada
5. **Conta** — onde vai entrar

## Categorias de Receita

> **Nota**: O AGENTS.md original foca em despesas. Estas categorias de receita
> são sugestões — adapte conforme a casa do usuário.

| Macro | Subcategorias |
|-------|--------------|
| Salário | Mensal, Bônus, Extra |
| Freelance | Projeto, Consultoria, Serviço |
| Investimento | Dividendos, Juros, Rendimentos |
| Vendas | Produto, Pessoal, Online |

## Few-Shots

### Exemplo 1: Salário
```
User: "chegou salário de 5000"
```
**Parsed:**
- valor: 500000 cents
- descricao: "Salário"
- categoria: `Salário > Mensal`
- data: timestamp
- conta: **PEDIR**

**Resposta:**
```
💰 Salário de R$ 5.000 detectado. Qual conta?
```

### Exemplo 2: Freelance
```
User: "recebi 800 do freela no nubank"
```
**Parsed:**
- valor: 80000 cents
- descricao: "Freela"
- categoria: `Freelance > Projeto`
- data: timestamp
- conta: Nubank

**Resposta:**
```
💰 Entrada registrada: R$ 800 em Freelance > Projeto no Nubank.
```

### Exemplo 3: Dividendos
```
User: "caíram 150 de dividendos"
```
**Parsed:**
- valor: 15000 cents
- descricao: "Dividendos"
- categoria: `Investimento > Dividendos`
- data: timestamp
- conta: **PEDIR**

**Resposta:**
```
💰 R$ 150 de Dividendos. Qual conta?
```

## Regras de Inferência

| Palavra | Categoria |
|---------|-----------|
| salário, paycheck, pagamento | `Salário > Mensal` |
| freela, freelance, projeto | `Freelance > Projeto` |
| dividendos, juros, rendimento | `Investimento > Dividendos` |
| vendi, venda | `Vendas > Pessoal` |
| bônus, prêmio, ganho | `Salário > Bônus` |

## Quando Perguntar

| Campo | Perguntar? |
|-------|------------|
| valor | ✅ SEMPRE |
| conta | ✅ Se não especificada |
| categoria | ✅ Inferir, criar se necessário |
| data | ❌ Não — usar timestamp |