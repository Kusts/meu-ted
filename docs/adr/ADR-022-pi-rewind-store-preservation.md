# ADR-022 — Preservação de `refs/pi-rewind/store` sem GC/rewrite/rotação nesta etapa

**Status:** Aceito
**Data:** 2026-09-19

## Contexto

O objeto local `11b82e8` ("pi rewind snapshot", contém `.env.e2e.creds` real)
é inalcançável de qualquer branch/tag, mas persiste localmente pendurado via
snapshot/reflog (`docs/reports/v4.1-public-safety.md:69-83`,
`docs/reports/v4.1-publication-readiness.md:22`). A remediação completa
(`git stash drop`, `gc --prune`, rewrite de histórico, rotação de
credenciais) exige gate humano (§3.4 do plano) e nunca foi autorizada nem
executada.

A sessão release-bridge (2026-09-18) apurou o bloqueador concreto:
`refs/pi-rewind/store` mantém **1.970 commits locais exclusivos**, de modo
que qualquer GC/rewrite/rotação sem plano de preservação destruiria histórico
local exclusivo (`docs/reports/v4.1-release-bridge-execution.md:81,91`).

O owner decidiu nesta sessão: **preservar `refs/pi-rewind/store` sem
GC/rewrite/rotação nesta etapa**.

## Decisão

1. **Preservação integral nesta etapa.** `refs/pi-rewind/store` e seus 1.970
   commits locais exclusivos são mantidos como estão. Nenhuma operação de
   limpeza, reescrita ou rotação é autorizada por este ADR.
2. **Operações proibidas.** Sem `git stash drop`, sem `git gc --prune` (ou
   qualquer GC agressivo), sem `git filter-repo`/`filter-branch`/rebase com
   rewrite publicado, sem rotação de credenciais e2e, sem deleção da ref
   `refs/pi-rewind/store` — nesta etapa, por qualquer agente ou automação.
3. **Gatilho para revisão.** A decisão será reaberta quando (qualquer um):
   (a) existir plano explícito de preservação dos 1.970 commits (exportação/
   bundle verificado + inventário do que é exclusivo vs. já alcançável);
   (b) houver janela e autorização do owner para rewrite + rotação de
   credenciais com rollback documentado; (c) a publicação do repositório
   exigir prova de ausência de segredos em objetos locais (gate
   `public-safety --strict` + auditoria de objetos inalcançáveis).

## Risco residual (explícito)

- **Credenciais e2e reais persistem em objeto local** (`11b82e8`,
  `.env.e2e.creds` de 5 linhas, contas reais). Risco via push normal: nenhum
  (objeto inalcançável de branch/tag — `branch --contains` / `tag --contains`
  vazios, `merge-base --is-ancestor` falso). Risco local: persiste — qualquer
  pessoa com acesso ao disco/à máquina lê o objeto; vazamento de backup de
  disco ou cópia integral do `.git` carrega o segredo.
- **Acúmulo de histórico exclusivo.** Os 1.970 commits crescem o custo de
  qualquer futura operação de limpeza e ampliam a superfície do que precisa
  de triagem antes de publicar.
- **Falsa sensação de "limpo".** `public-safety` verde em refs alcançáveis
  não cobre objetos locais — relatórios devem continuar distinguindo os dois
  universos.

## Consequências

- GC, rewrite, rotação e deleção da ref seguem bloqueados até o gatilho §3.4
  com plano de preservação — cada um exige autorização, janela e backup
  próprios, fora deste ADR.
- Rollback deste ADR: revogar por novo ADR acompanhado do plano de
  preservação/execução acima; a execução em si segue rito próprio.
- **Este ADR não autoriza deploy, DML/DDL, acesso a produção/VPS, GC,
  rewrite, rotação de credenciais ou qualquer operação destrutiva de Git.**

## Referências

- `docs/reports/v4.1-public-safety.md:69-83` (objetos locais, §3.4 gate humano).
- `docs/reports/v4.1-publication-readiness.md:22` (conteúdo de `11b82e8`).
- `docs/reports/v4.1-release-bridge-execution.md:72-91` (1.970 commits
  exclusivos como bloqueador de GC).
- `docs/reports/v4.1-final-report.md:13,30` (objeto pendente como débito).
