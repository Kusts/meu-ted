# Arquivo legado do Agent Pi — ARQUIVADO

> **STATUS: ARCHIVED — DO NOT USE AS CURRENT ARCHITECTURE**
>
> Arquivado em 2026-09-16 (T4.4, SPEC §15 I1–I3). Todo o conteúdo deste
> diretório descreve o Agent Pi / whatsapp-bridge removidos (P3 `f640e84`,
> 2026-08-25) e é mantido apenas como histórico. A arquitetura vigente é:
> `apps/api` como única autoridade financeira, `FinanceChatAgent`
> (`apps/agent`) como runtime ativo e PostgreSQL como persistência de
> produção.

## Origem

Todo o conteúdo veio de `.pi/` (removido do repositório nesta mesma tarefa;
o diretório ficou vazio e foi excluído — o Git não rastreia diretórios
vazios). Histórico preservado via `git mv`.

## Inventário do arquivamento

| Item arquivado | Motivo |
|---|---|
| `AGENTS.md` | Descrevia o Agent Pi como "cérebro do sistema" e dono de interpretação/persistência/UI (`:1-5`, `:173-176`), e o whatsapp-bridge como transporte ativo — contradição direta com a arquitetura vigente |
| `prompts/` (12 arquivos: `system-finance.md`, `parse-expense.md`, `parse-income.md`, `reply-style.md`, `error-reporting.md`, `transfer-detection.md`, `duplicate-detection.md`, `fragments/*`, `README.md`) | Corpus de prompts do runtime Pi removido: formato `[WhatsApp Message]`, invocação via `pi --mode rpc`, tools do Agent Pi |
| `skills/` (7 arquivos: `README.md` + 6 `SKILL.md` com frontmatter preservado) | Contratos de skills executadas pelo Agent Pi (`pi --mode rpc`); o código financeiro correspondente foi removido em `f640e84` |
| `settings.json` | Referenciava `packages: ["extensions/financial-tools"]` — extensão removida em `f640e84`; arquivo nem sequer era rastreado pelo Git (ignorado em `.gitignore:61`) |

## O que restou em `.pi/` e por quê

Nada. Todos os 4 itens acima descreviam o Agent Pi como autoridade
operacional e foram arquivados; o diretório `.pi/` ficou vazio e foi
removido. Não há inventário residual.

## Avisos de leitura

- Cada `.md` deste diretório carrega o cabeçalho `STATUS: ARCHIVED` (após o
  frontmatter YAML quando existir).
- `settings.json` não recebeu cabeçalho interno (JSON não admite comentários);
  este índice é o seu marcador de arquivamento.
- Referências a `.pi/extensions/financial-tools` que ainda existem em
  `scripts/` são intencionais e categoria `rollback-only` do guard
  `check-legacy-runtime-references` — não são runtime ativo.
