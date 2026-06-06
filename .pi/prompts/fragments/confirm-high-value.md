# Confirm High Value — Confirmação de Gastos Altos

## Fragmento

```
⚠️ Esse gasto é de R$ {valor}. Confirma?
```

## Contexto de Uso

Usado quando:
- Valor > R$ 500,00
- Precisa confirmação explícita antes de registrar

## Comportamento

1. Parsear a mensagem
2. Detectar valor > 50000 cents
3. Perguntar a conta (se não especificada)
4. Pedir confirmação antes de chamar a tool
5. Só registrar após resposta positiva

## Exemplo

```
User: "gastei 1200 no notebook"

Agent: "Qual conta?"
User: "nubank"

Agent: "⚠️ Esse gasto é de R$ 1.200 em Compras > Eletrônico no Nubank. Confirma?"
User: "sim"

Agent: "✅ Anotado: R$ 1.200 em Compras > Eletrônico no Nubank."
Tool call: create_expense(...)
```