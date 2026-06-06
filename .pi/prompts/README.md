# Prompts (.pi/prompts/)

Fragmentos de prompt que o Agent Pi pode carregar via `pi --mode rpc`
ou referenciar em `.pi/AGENTS.md`. **Não há código Node aqui** — todo
prompt é texto markdown.

## Convenção

```
.pi/prompts/
├── <topic>.md          # prompt completo, pronto para colar
└── fragments/
    └── <nome>.md       # snippet reutilizável
```

## Prompts já previstos (placeholders)

| Arquivo | Conteúdo |
|---|---|
| `system-finance.md` | Persona, regras CRÍTICAS, lista de tools |
| `parse-expense.md` | Few-shot de como extrair despesa de texto livre |
| `parse-income.md` | Few-shot de como extrair receita |
| `reply-style.md` | Tom, PT-BR, uso de emojis, tamanho de mensagem |
| `error-reporting.md` | Como reportar erro de tool ao usuário |

> O conteúdo pode ter vindo de `packages/agent-prompts/` (removido)
> ou `docs/superpowers/specs/`. Não há cópia automática — revisite
> manualmente.
