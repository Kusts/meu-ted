# Tools (.pi/tools/)

Specs de tools que o Agent Pi invoca. **Não há código Node aqui** —
o Agent Pi implementa as tools via integrações próprias, skills internas
ou acesso controlado ao banco. Este repositório não conhece essas tools.

## Convenção

```
.pi/tools/
├── <tool-name>.md      # contrato: entradas, saídas, erros
```

## Schema mínimo por tool

```md
# <tool-name>

## Quando usar
<1-2 frases>

## Entradas (JSON Schema)
```json
{ ... }
```

## Saída de sucesso
```json
{ ... }
```

## Erros possíveis
- `MISSING_FIELDS`: ...
- `INSUFFICIENT_BALANCE`: ...
```

## Tools já previstas (placeholders)

| Tool | Responsabilidade |
|---|---|
| `create_expense` | registrar despesa após parsing/validação/confirmação |
| `create_income` | registrar receita após parsing/validação/confirmação |
| `create_transfer` | registrar transferência entre contas |
| `list_accounts` | consultar contas disponíveis para esclarecimento |
| `list_categories` | consultar categorias disponíveis para classificação |
| `monthly_report` | gerar resumo mensal |
| `confirm_pending` | confirmar operação conversacional pendente |

> A implementação concreta das tools é responsabilidade do Agent Pi.
> O **bridge** (este repo) só conhece o contrato `piClient.send(prompt, ...)`:
> texto livre → texto livre.
