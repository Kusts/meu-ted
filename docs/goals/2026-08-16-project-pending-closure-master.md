# Goal Mestre — Encerramento das Pendências

- **Projeto:** `D:/projetos/pi-financeiro`
- **Criado:** 2026-08-16
- **Harness:** Pi (`pi-tasks` persistente + `@amaster.ai/pi-goal` session-scoped)
- **Status:** planejamento concluído; implementação ainda não iniciada
- **Autonomia:** máxima segura
- **Rubrica final:** ≥90/100 e nenhum veto

## Contratos canônicos

- Spec: `docs/superpowers/specs/2026-08-16-project-pending-closure-design.md`
- Master plan: `docs/superpowers/plans/2026-08-16-project-pending-closure-master.md`
- P0: `docs/superpowers/plans/2026-08-16-p0-stabilization.md`
- P1: `docs/superpowers/plans/2026-08-16-p1-api-migration.md`
- P2: `docs/superpowers/plans/2026-08-16-p2-runtime-transition.md`
- P3: `docs/superpowers/plans/2026-08-16-p3-legacy-retirement.md`
- P4: `docs/superpowers/plans/2026-08-16-p4-documentation-governance.md`
- P5: `docs/superpowers/plans/2026-08-16-p5-final-validation.md`

## Modelo de execução

Há um único Goal Mestre lógico. `pi-tasks` mantém a fila P0→P5 e somente uma entrega pode estar ativa. Cada `/goal` interno cobre a entrega ativa; ao concluí-la, o manager registra evidência/checkpoint e emite a condição da próxima entrega. Em reinício, retomar `pi-tasks` e reemitir apenas o `/goal` registrado neste arquivo.

## Ordem obrigatória

1. P0 — estabilização e consolidação;
2. P1 — G6.2.1 API migration;
3. P2 — G6.2.2–G6.2.7 transição;
4. P3 — G6.2.8–G6.GATE retirada/48h;
5. P4 — G7.1–G7.5 documentação;
6. P5 — VAL.1–VAL.10 e rubrica.

## Consent gates

Pausar antes de deploy/mutação de produção, secret/credencial real, custo externo, comunicação externa, remoção irreversível ou mudança de produto. Preparar operação, impacto, backup, rollback e prova antes de pedir aprovação.

## Estado atual

- **Macroposição:** P0
- **Entrega ativa planejada:** P0.1 — preservar e classificar o working tree
- **Implementação:** não iniciada
- **Último commit documental:** `7b1a0ff` — design do Goal Mestre
- **Baseline:** 43 arquivos modificados e 519 não rastreados; API 182 testes falhos; PWA 44 worker errors; bridge typecheck TS2345
- **Blockers externos:** nenhum para P0.1
- **Próximo checkpoint:** após P0.1 verde e commit explícito

## Primeiro `/goal`

```text
/goal [MASTER P0.1] Preservar e classificar o working tree atual do pi-financeiro sem apagar ou sobrescrever trabalho existente. Execute somente a Task 1 de docs/superpowers/plans/2026-08-16-p0-stabilization.md. Concluído somente quando: (1) docs/recovery/2026-08-16-working-tree-inventory.md contém cada path retornado por `git status --porcelain=v1 --untracked-files=all`, com class, owner P0–P5, action e rationale; (2) classes e actions pertencem aos enums do plano; (3) scripts/check-working-tree-inventory.mjs e seu teste falham para path sem owner, classe/action inválida e passam para o inventário real; (4) `node --test scripts/check-working-tree-inventory.test.mjs` passa duas vezes consecutivas com a mesma contagem e zero path sem owner; (5) nenhum arquivo classificado foi deletado, movido, sobrescrito ou incluído em `.gitignore` sem prova explícita; (6) nenhum valor de secret, token, cookie, senha, private key ou URL de banco aparece no inventário/transcript; (7) o commit usa staging explícito somente dos arquivos da Task 1; (8) `git diff --check` passa. Após duas falhas idênticas, registre blocker e mude de abordagem; não reduza os critérios. Claude must echo the full output of each verification command in the transcript, incluindo exit codes, contagens antes/depois, staged files e hash do commit. Ao concluir, atualize este arquivo e o pi-tasks com evidência, checkpoint e o próximo `/goal`; não execute P0.2 nesta mesma condição.
```

## Template de handoff

```markdown
- Macroposição: P<n>
- Entrega concluída: <ID>
- Evidence IDs: <pi-tasks>
- Artifacts: <paths>
- Commit/checkpoint: <hash/path>
- Blockers: <estado tipado>
- Próxima entrega: <ID>
- Próximo /goal: <condição completa>
```
