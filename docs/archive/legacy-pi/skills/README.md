> **STATUS: ARCHIVED — DO NOT USE AS CURRENT ARCHITECTURE**
>
> Movido de .pi/ em 2026-09-16 (T4.4, SPEC §15 I1–I3). Descreve o Agent Pi / whatsapp-bridge removidos; mantido apenas como histórico.

# Skills (.pi/skills/)

Este diretório guarda **descrições e contratos** de skills que o Agent
Pi pode usar. Aqui **não há código Node** — todo o código financeiro
mora no Agent Pi (Pi CLI rodando `pi --mode rpc`).

## Convenção

```
.pi/skills/
├── <skill-name>/
│   ├── SKILL.md          # descrição, quando usar, entradas, saídas
│   └── examples.md       # exemplos few-shot
```

> Se você está migrando conteúdo de `packages/agent-prompts/` (removido)
> ou `docs/superpowers/specs/`, coloque a versão final aqui.

## Skills já previstas (placeholders)

| Skill | Quando usar |
|---|---|
| `parse-expense` | `"gastei X em Y"`, `"comprei X"` etc. |
| `parse-income` | `"recebi X de Y"` |
| `parse-transfer` | `"transferi X de A para B"` |
| `confirm-high-value` | valores > R$500 pedem confirmação extra |
| `monthly-report` | `"balanço do mês"`, `"gastos de outubro"` |
| `categorize` | sugere categoria a partir da descrição |

> Os nomes acima são **sugestões**. O Agent Pi decide o shape final.
