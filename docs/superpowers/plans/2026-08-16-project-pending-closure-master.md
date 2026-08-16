# Project Pending-Closure Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encerrar os 25 itens G6–G7–VAL e seus blockers atuais sob um Goal Mestre persistente, com autonomia máxima segura e rubrica final ≥ 90/100 sem vetos.

**Architecture:** `pi-tasks` mantém uma única missão e a ordem P0→P5; cada macrofase possui plano próprio e cada `/goal` interno cobre apenas a entrega ativa. Gates fail-closed, checkpoints e evidências permitem retomada sem reexecutar trabalho não impactado.

**Tech Stack:** pnpm workspaces, TypeScript, Fastify, Next.js/OpenNext, Cloudflare Workers/Agents, PostgreSQL, Vitest, Playwright, GitHub Actions.

**Agent Orchestration:** **Hierarchical** — um manager mantém o Goal Mestre; cada macrofase tem supervisor próprio; workers executam uma entrega atômica por vez e reviewers independentes validam gates.

**Spec:** `docs/superpowers/specs/2026-08-16-project-pending-closure-design.md`

---

## 1. Arquivos do programa

| Responsabilidade | Arquivo |
|---|---|
| Design aprovado | `docs/superpowers/specs/2026-08-16-project-pending-closure-design.md` |
| Orquestração | `docs/superpowers/plans/2026-08-16-project-pending-closure-master.md` |
| P0 | `docs/superpowers/plans/2026-08-16-p0-stabilization.md` |
| P1 | `docs/superpowers/plans/2026-08-16-p1-api-migration.md` |
| P2 | `docs/superpowers/plans/2026-08-16-p2-runtime-transition.md` |
| P3 | `docs/superpowers/plans/2026-08-16-p3-legacy-retirement.md` |
| P4 | `docs/superpowers/plans/2026-08-16-p4-documentation-governance.md` |
| P5 | `docs/superpowers/plans/2026-08-16-p5-final-validation.md` |
| Retomada e `/goal` ativo | `docs/goals/2026-08-16-project-pending-closure-master.md` |
| Evidências | `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md` |

## 2. Invariantes do manager

- [ ] Manter exatamente uma entrega `active` no `pi-tasks`.
- [ ] Reemitir `/goal` somente a partir da entrega ativa e nunca combinar backlog independente.
- [ ] Exigir evidência antes de marcar uma entrega ou gate como concluído.
- [ ] Após duas falhas idênticas, registrar blocker e trocar de abordagem.
- [ ] Não reduzir critérios, esconder skips, usar `--no-verify`, `@ts-ignore` ou desabilitar regras.
- [ ] Usar staging explícito; nunca `git add -A` ou commit de mudanças alheias.
- [ ] Pausar antes de deploy/mutação de produção, secrets reais, custo, comunicação externa ou remoção irreversível.
- [ ] Consultar `../vps-hostinger/` antes de qualquer afirmação operacional sobre a API de produção.
- [ ] Nunca usar `../pi-finance-web`.

## 3. Sequência de execução

### Task 1: Ativar e fechar P0

**Files:**
- Read: `docs/superpowers/plans/2026-08-16-p0-stabilization.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`

- [ ] **Step 1:** Criar no `pi-tasks` as entregas atômicas de P0 na ordem do plano P0.
- [ ] **Step 2:** Ativar somente a primeira entrega e emitir o `/goal` de P0 registrado no contrato de retomada.
- [ ] **Step 3:** Executar RED→GREEN→adversarial→gate para cada entrega.
- [ ] **Step 4:** Registrar comandos, exit codes, baselines e ownership dos arquivos no goal-run mestre.
- [ ] **Step 5:** Executar o Gate P0 exatamente como definido no plano P0.
- [ ] **Step 6:** Criar checkpoint; marcar P0 concluído somente com Gate P0 verde.

### Task 2: Ativar e fechar P1

**Files:**
- Read: `docs/superpowers/plans/2026-08-16-p1-api-migration.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`

- [ ] **Step 1:** Confirmar que P0 está verde e que a matriz capability→OpenAPI→route→adapter é reproduzível.
- [ ] **Step 2:** Criar/ativar entregas P1 em tracer bullets por capability family, nunca uma migração horizontal gigante.
- [ ] **Step 3:** Para cada family, provar auth server-side, idempotência, audit e cross-workspace denial.
- [ ] **Step 4:** Regenerar adapters somente a partir do OpenAPI validado; proibir edição manual do output gerado.
- [ ] **Step 5:** Executar scans de capability, route inventory, write policy e boundary.
- [ ] **Step 6:** Criar checkpoint; marcar G6.2.1/P1 concluído somente com 1:1 completo e Gate P1 verde.

### Task 3: Ativar e fechar P2

**Files:**
- Read: `docs/superpowers/plans/2026-08-16-p2-runtime-transition.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`

- [ ] **Step 1:** Confirmar P1 verde e definir ownership inicial Pi-responde/Pi-executa.
- [ ] **Step 2:** Ativar shadow read-only com side-effect guards e logs sanitizados.
- [ ] **Step 3:** Integrar bridge→Agent com identidade e workspace resolvidos server-side.
- [ ] **Step 4:** Exercitar feature flags e provar exatamente um owner por estágio.
- [ ] **Step 5:** Congelar writes Pi e coletar aceite capability por capability.
- [ ] **Step 6:** Executar soak técnico e rollback; criar checkpoint com Gate P2 verde.

### Task 4: Ativar e fechar P3

**Files:**
- Read: `docs/superpowers/plans/2026-08-16-p3-legacy-retirement.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`

- [ ] **Step 1:** Produzir inventário exato de serviços, arquivos, webhooks, secrets e referências.
- [ ] **Step 2:** Preparar backup, rollback e diff de remoção sem executar ação irreversível.
- [ ] **Step 3:** Solicitar consentimento único contendo operações exatas de produção, remoção e secrets.
- [ ] **Step 4:** Após aprovação, retirar o legado por estágio e verificar referências residuais.
- [ ] **Step 5:** Iniciar janela observável de 48 horas; persistir timestamps e critérios no `pi-tasks`.
- [ ] **Step 6:** Encerrar G6 somente com integridade, zero alerta crítico e rollback exercitado.

### Task 5: Ativar e fechar P4

**Files:**
- Read: `docs/superpowers/plans/2026-08-16-p4-documentation-governance.md`
- Modify/Create: `README.md`, `AGENTS.md`, `PRODUCT.md`, `ARCHITECTURE-CURRENT.md`, `ARCHITECTURE-TARGET.md`, `ROADMAP.md`, `docs/adr/README.md`, `docs/architecture/runtime-facts.json`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`

- [ ] **Step 1:** Derivar fatos do código estabilizado e da topologia real, não de planos históricos.
- [ ] **Step 2:** Atualizar docs canônicos e ADRs.
- [ ] **Step 3:** Arquivar planos/specs superados com staging explícito e rollback simples.
- [ ] **Step 4:** Implementar lint documental e integrar ao CI.
- [ ] **Step 5:** Criar checkpoint somente após Gate P4 verde.

### Task 6: Ativar e fechar P5

**Files:**
- Read: `docs/superpowers/plans/2026-08-16-p5-final-validation.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`
- Create: `docs/reports/2026-08-16-project-pending-closure-rubric.md`

- [ ] **Step 1:** Executar VAL.1–VAL.10 em ordem sobre checkout reproduzível.
- [ ] **Step 2:** Para cada falha, criar remediação e reexecutar o gate afetado e seus dependentes.
- [ ] **Step 3:** Não executar mutação de produção; smoke permanece read-only.
- [ ] **Step 4:** Calcular rubrica com evidência por dimensão e aplicar vetos antes da média.
- [ ] **Step 5:** Solicitar reviewer independente para a rubrica e os vetos.
- [ ] **Step 6:** Encerrar o Goal Mestre somente com ≥90/100, nenhum veto e relatório final entregue.

## 4. Handoff entre entregas

Ao concluir qualquer entrega, atualizar `docs/goals/2026-08-16-project-pending-closure-master.md` com:

```markdown
## Estado atual
- Macroposição: P<n>
- Entrega concluída: <ID e resumo>
- Evidência: <IDs pi-tasks + arquivos>
- Commit/checkpoint: <hash ou path>
- Blockers: <nenhum ou lista tipada>
- Próxima entrega: <ID>
- Próximo /goal: <condição completa e verificável>
```

O próximo `/goal` deve:

- ter uma única entrega observável;
- exigir comandos e outputs no transcript;
- não ultrapassar 4000 caracteres;
- não repetir implementação já comprovada;
- preservar os consent gates da spec.

## 5. Gate final do programa

- [ ] P0–P5 possuem evidência e checkpoint.
- [ ] Os 25 itens G6–G7–VAL possuem resultado explícito.
- [ ] Todos os blockers estão resolvidos, aceitos com autorização ou não aplicáveis com prova.
- [ ] VAL.1–VAL.10 estão verdes.
- [ ] Rubrica ≥ 90/100.
- [ ] Nenhum veto da spec está ativo.
- [ ] Relatório final inclui estado de produção, riscos residuais e rollback.
- [ ] Reviewer independente confirmou a rastreabilidade entre spec, planos, evidências e score.
