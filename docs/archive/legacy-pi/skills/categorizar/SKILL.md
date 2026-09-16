---
name: categorizar
description: Detecta automaticamente a macro e subcategoria de uma despesa ou receita baseado em palavras-chave. Cria categorias novas automaticamente se não existirem.
version: 1
created: 2026-08-01
updated: 2026-08-01
---

> **STATUS: ARCHIVED — DO NOT USE AS CURRENT ARCHITECTURE**
>
> Movido de .pi/ em 2026-09-16 (T4.4, SPEC §15 I1–I3). Descreve o Agent Pi / whatsapp-bridge removidos; mantido apenas como histórico.

# Skill: Categorizar Automaticamente

## When to Use

Use esta skill SEMPRE que o usuário registrar uma despesa ou receita e a categoria não foi especificada. O usuário pode usar linguagem natural como:

- "gastei 50 no lanche" → sem categoria
- "almoço executivo no restaurante" → sem categoria
- "Uber para o trabalho" → sem categoria
- "comprei paracetamol" → sem categoria
- "salário caiu" → sem categoria
- "recebi dividendos da PETR4" → sem categoria

**NÃO use** se:
- O usuário já especificou a categoria explicitamente
- A categoria é ambígua e precisa confirmação

## Modelo Conceitual

Categorias são **hierárquicas** no formato `Macro > Subcategoria`:

| Macro | Subcategorias Suportadas |
|-------|--------------------------|
| **Alimentação** | Lanche, iFood, Restaurante, Café, Padaria, Mercado, Delivery, Bebida |
| **Transporte** | Uber, Táxi, Gasolina, Estacionamento, Ônibus, Pedágio, Manutenção, Aluguel de Carro |
| **Saúde** | Farmácia, Consulta, Exames, Plano de Saúde, Academia |
| **Moradia** | Aluguel, Condomínio, Água, Luz, Internet, Gás, IPTU |
| **Lazer** | Cinema, Streaming, Jogos, Bar, Balada, Viagem |
| **Educação** | Curso, Livro, Material, Mensalidade |
| **Compras** | Roupa, Eletrônico, Decoração, Supermercado Online |
| **Serviços** | Assinatura, Streaming |
| **Pets** | Ração, Veterinário |
| **Trabalho** | Material de Escritório |
| **Salário** | Mensal, Bônus, 13º, Férias |
| **Freelance** | Projeto, Consultoria |
| **Investimento** | Dividendos, Rendimento, Venda de Ação |
| **Vendas** | Produto, Pessoal |
| **Transferência** | PIX, TED, DOC, TRANSFER, CASH |

## Fluxo de Decisão

```
Usuário registra transação
       ↓
[1] Descrição tem keywords conhecidas?
   ├── SIM → matchCategoria() retorna macro+sub
   └── NÃO → null (criar categoria genérica "Outros")
       ↓
[2] Categoria já existe?
   ├── SIM → usar existente
   └── NÃO → findOrCreateCategory()
       ↓
[3] Retornar categoryId
```

## Procedure

### 1. Parsear a mensagem

```typescript
import { matchCategory, autoCategorize, findOrCreateCategory } from "./tools/categorizer";

// Match only (sem criar)
const match = matchCategory(description, kind);
// → { macro, subcategory, fullName, kind, confidence, matchedKeyword }

// Match + create no banco
const result = await autoCategorize(pool, householdId, description, kind);
// → { id, match } ou null
```

### 2. Confiança

| Faixa | Ação |
|-------|------|
| >= 80% | Usar categoria diretamente |
| 60-80% | Usar mas mencionar a confiança |
| < 60% | Perguntar ao usuário |

### 3. Criação automática

Se `autoCategorize` retorna `null` (nenhuma regra matcha):
- Crie uma categoria "Outros > [palavra-chave]" automaticamente
- OU pergunte ao usuário qual categoria usar

## Exemplos

### Match direto (sem precisar de banco)

```typescript
matchCategory("gastei 50 no lanche", "expense")
// → { fullName: "Alimentação > Lanche", confidence: 0.72, ... }

matchCategory("Uber para o trabalho", "expense")
// → { fullName: "Transporte > Uber", confidence: 0.68, ... }

matchCategory("salário de 5000", "income")
// → { fullName: "Salário > Mensal", confidence: 0.74, ... }
```

### Match + criação automática

```typescript
const result = await autoCategorize(pool, householdId, "comprei ração para o cachorro", "expense");
// Primeira vez: cria "Pets > Ração"
// Próximas vezes: reusa a mesma categoria
// → { id: "uuid...", match: { fullName: "Pets > Ração", ... } }
```

### Mensagens do usuário

| Usuário | Categoria Detectada |
|---------|---------------------|
| "gastei 50 no lanche" | Alimentação > Lanche |
| "almoço no ifood" | Alimentação > iFood |
| "Uber para o trabalho" | Transporte > Uber |
| "comprei paracetamol" | Saúde > Farmácia |
| "aluguel do mês" | Moradia > Aluguel |
| "Netflix" | Lazer > Streaming |
| "aluguel de carro" | Transporte > Aluguel de Carro |
| "salário caiu" | Salário > Mensal |
| "freela do site" | Freelance > Projeto |
| "dividendos da PETR4" | Investimento > Dividendos |

## Pitfalls

- ❌ **Não confie em < 60% confiança** sem perguntar
- ❌ **Não crie categoria nova** se já existe uma similar
- ❌ **Não confunda** "almoço" (refeição) com "almoço no iFood" (delivery)
- ❌ **Não infira** se a descrição for muito vaga (ex: "gastei X")
- ✅ **Sempre use `name_normalized`** para comparar (já tem trigger)
- ✅ **Respeite o kind** (expense/income) — keywords não cruzam

## Arquivo: tools/categorizer.ts

### Funções disponíveis

| Função | Uso |
|--------|-----|
| `matchCategory(desc, kind)` | Match apenas (sem DB) |
| `findOrCreateCategory(pool, hh, name, kind)` | Encontra ou cria |
| `autoCategorize(pool, hh, desc, kind)` | Match + findOrCreate |
| `formatMatch(match)` | Formata para exibição |

### Adicionando novas regras

Edite o array `CATEGORY_RULES` no início do arquivo:

```typescript
{
  macro: "Nova Macro",
  subcategory: "Nova Sub",  // ou null
  keywords: ["keyword1", "keyword2"],
  kind: "expense",  // ou "income"
}
```

⚠️ **Ordem importa**: regras mais específicas (ex: "ifood") devem vir ANTES de regras mais genéricas (ex: "restaurante").

## Verification

Após categorizar, verificar:
1. ✅ Categoria retornada faz sentido semântico
2. ✅ Confiança >= 60% (ou usuário confirmou)
3. ✅ Categoria já existe no banco ou foi criada
4. ✅ Macro está na lista de macros válidas

## Integração com outras tools

A skill `categorizar` deve ser usada **antes** de `create_expense` / `create_income`:

```typescript
// 1. Parsear a mensagem
const { amount, description, account } = parseMessage(userText);

// 2. Categorizar automaticamente
const cat = await autoCategorize(pool, householdId, description, "expense");

// 3. Se não categorizou, perguntar
if (!cat) {
  // Criar categoria genérica "Outros > [palavra]" ou perguntar
  return await askUser("Qual a categoria? (Alimentação, Transporte, ...)");
}

// 4. Criar despesa com categoria
return await create_expense({
  description,
  amountCents: amount,
  categoryId: cat.id,
  accountId: account.id,
  date: timestamp,
});
```
