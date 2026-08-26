# P4 Documentation and Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir G7.1–G7.5 deixando documentação canônica consistente com o runtime estabilizado, ADRs ativas, planos superados arquivados e lint documental no CI.

**Architecture:** Fatos são extraídos por scripts do código/topologia e então usados para escrever docs humanas. Documentação histórica recebe status explícito; somente documentos ativos aparecem nos índices canônicos. O lint valida links, paths e fatos contáveis.

**Tech Stack:** Markdown, Node.js, Git, CI, checkers de inventory/governance.

**Agent Orchestration:** **Supervisor-Workers** — lanes produto, arquitetura, ADR/archive e lint; supervisor reconcilia termos e executa Gate P4.

**Prerequisite:** Gate P3/G6 verde.

**Spec:** `docs/superpowers/specs/2026-08-16-project-pending-closure-design.md` §5 P4.

---

## Task 1: Gerar facts snapshot do runtime estabilizado

**Files:**
- Create: `scripts/generate-documentation-facts.mjs`
- Create: `scripts/generate-documentation-facts.test.mjs`
- Create: `docs/architecture/runtime-facts.json`
- Verify: `package.json`, `pnpm-workspace.yaml`, `apps/api/package.json`, `apps/pwa/package.json`, `apps/agent/package.json`, `apps/api/src/routes/route-inventory.ts`, `docs/architecture/tool-capability-inventory.md`, `apps/api/src/read-models/sql/`, `.github/workflows/ci.yml`, `.github/workflows/production-smoke.yml`, `docs/ops/g6-production-topology.md`

- [ ] **Step 1: RED — fatos contáveis**

Exigir JSON determinístico com workspaces ativos, apps ativos, capabilities por status, routes, migrations, workflows, production services, canonical PWA e legacy status. Paths inexistentes falham.

- [ ] **Step 2: Implementar gerador read-only**

Não inferir arquitetura por texto histórico. Ler manifests/inventories e o relatório de topologia P3; ordenar arrays e omitir secrets.

- [ ] **Step 3: Adversarial**

Fixture com contagem divergente, path depreciado como ativo, bridge removido ainda listado e `pi-finance-web` canônico deve falhar.

- [ ] **Step 4: GREEN e commit**

Run twice; segunda geração não altera bytes.
Commit: `docs: generate canonical runtime facts`.

## Task 2: Reescrever README e AGENTS

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Verify: `apps/pwa/AGENTS.md`
- Verify: `docs/architecture/runtime-facts.json`
- Test: `scripts/documentation-facts-contract.test.mjs` (create)

- [ ] **Step 1: RED — remover fatos históricos falsos**

Teste rejeita afirmações de que existem somente 2 apps, domínio mora no Pi, WhatsApp é runtime ativo, backend roda localmente ou `../pi-finance-web` é canônico.

- [ ] **Step 2: Escrever README atual**

Cobrir produto, apps ativos, setup, comandos canônicos, auth/workspaces, API/Agent/PWA, produção Hostinger/Cloudflare, testes e referências.

- [ ] **Step 3: Escrever AGENTS mínimo**

Manter instruções operacionais duráveis: PWA canônica, produção na VPS, consent gates, docs canônicos e precedência. Não duplicar a arquitetura inteira.

- [ ] **Step 4: GREEN e commit**

Run facts contract + links focados.
Commit: `docs: describe current project architecture`.

## Task 3: Criar os quatro documentos canônicos

**Files:**
- Create: `PRODUCT.md`
- Create: `ARCHITECTURE-CURRENT.md`
- Create: `ARCHITECTURE-TARGET.md`
- Create: `ROADMAP.md`
- Test: `scripts/canonical-docs-contract.test.mjs` (create)

- [ ] **Step 1: RED — contrato dos quatro docs**

Cada arquivo deve existir, referenciar `runtime-facts.json`, declarar `Last verified`, não conter placeholder e possuir seção própria exigida.

- [ ] **Step 2: PRODUCT.md**

Personas, problemas, fluxos críticos, capabilities atuais, constraints financeiras e fora de escopo.

- [ ] **Step 3: ARCHITECTURE-CURRENT.md**

Componentes ativos, data/auth flow, source of truth, deployment, observability, security boundaries e rollback.

- [ ] **Step 4: ARCHITECTURE-TARGET.md**

Somente gaps ainda aceitos após o Goal Mestre; se target=current, declarar convergência e critérios para mudança futura.

- [ ] **Step 5: ROADMAP.md**

Estado P0–P5 e backlog futuro não ativo, com dependências e critérios; não copiar planos executáveis.

- [ ] **Step 6: GREEN e commit**

Run canonical docs contract.
Commit: `docs: add canonical product architecture and roadmap`.

## Task 4: Consolidar ADRs ativas

**Files:**
- Modify: `docs/adr/README.md`
- Create/Modify: `docs/adr/003-workspace-server-side.md`
- Create/Modify: `docs/adr/004-api-source-of-truth.md`
- Create/Modify: `docs/adr/005-generated-agent-tools.md`
- Create/Modify: `docs/adr/006-runtime-ownership-retirement.md`
- Create/Modify: `docs/adr/007-production-topology.md`
- Create/Modify: `docs/adr/008-consent-rollback-policy.md`
- Modify: `scripts/check-decision-governance.mjs`
- Test: `scripts/check-decision-governance.test.mjs`

- [ ] **Step 1: RED — índice resolve status**

Toda decisão D01–D19 e decisões posteriores relevantes devem apontar para exatamente uma ADR `accepted` ou `superseded`; link quebrado/duplicata falha.

- [ ] **Step 2: Extrair decisões ativas**

Criar ADRs somente para decisões ainda operantes: Better Auth, workspace server-side, API source of truth, generated tools, ownership/runtime retirement, production topology e consent/rollback. Preservar alternativas e evidência original.

- [ ] **Step 3: Marcar superseded**

ADRs/specs antigas não são apagadas; status e substituta aparecem no cabeçalho/índice.

- [ ] **Step 4: GREEN e commit**

Run governance tests e checker.
Commit: `docs: consolidate active architecture decisions`.

## Task 5: Arquivar specs e planos superados

**Files:**
- Move: plans concluídos de `docs/superpowers/plans/` para `docs/superpowers/plans/archive/`
- Move: specs superadas de `docs/superpowers/specs/` para `docs/superpowers/specs/archive/`
- Create: `scripts/check-active-plan-status.mjs`
- Create: `scripts/check-active-plan-status.test.mjs`
- Modify: links internos afetados

- [ ] **Step 1: RED — diretório ativo sem concluídos**

Checker exige front matter/status `active|blocked` nos arquivos diretamente em plans; `done|superseded|historical` deve estar em archive. Master/spec/plan atual não podem ser movidos antes de P5.

- [ ] **Step 2: Produzir move manifest**

Listar source→destination, status, replacement e links afetados. Usar `git mv` somente para arquivos versionados; untracked é movido explicitamente após confirmação do inventário P0.

- [ ] **Step 3: Atualizar links**

Nenhum redirect implícito; substituir links por path arquivado ou documento canônico.

- [ ] **Step 4: GREEN e commit**

Run checker + link scan. Revisar `git diff --name-status` para assegurar somente moves aprovados.
Commit: `docs: archive superseded plans and specs`.

## Task 6: Implementar lint documental

**Files:**
- Create: `scripts/lint-docs.mjs`
- Create: `scripts/lint-docs.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: RED com fixtures**

Cobrir link interno quebrado, anchor ausente, path citado inexistente, contagem divergente de workspaces/apps/capabilities/routes, placeholder e documento ativo sem status/data.

- [ ] **Step 2: Implementar lint**

Escanear Markdown versionado; ignorar URL externa quanto à disponibilidade, mas validar sintaxe. Fatos contáveis vêm de `runtime-facts.json`, não regex arbitrária.

- [ ] **Step 3: Alias e CI**

Adicionar `docs:lint` e job `documentation`; incluir no gate global. CI usa frozen install.

- [ ] **Step 4: GREEN**

Run twice: `pnpm docs:lint && node --test scripts/lint-docs.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit:** `ci: enforce documentation consistency`.

## Task 7: Gate P4

**Files:**
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`

- [ ] **Step 1:** gerar facts e confirmar diff vazio na segunda geração.
- [ ] **Step 2:** `pnpm governance:check` passa.
- [ ] **Step 3:** `pnpm docs:lint` passa com links/fatos/active-plan status.
- [ ] **Step 4:** confirmar presença e consistência de README, AGENTS, PRODUCT, ARCHITECTURE-CURRENT, ARCHITECTURE-TARGET e ROADMAP.
- [ ] **Step 5:** reviewer independente compara docs com código, route/capability inventory e topologia P3.
- [ ] **Step 6:** `git diff --check`, checkpoint e próximo `/goal` P5.

**Gate P4:** documentação canônica representa o runtime real, ADRs/status/archives estão consistentes e CI impede regressão documental.
