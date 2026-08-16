# P5 Final Validation and Rubric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar VAL.1–VAL.10 em ordem, remediar qualquer falha e entregar rubrica final ≥ 90/100 sem vetos.

**Architecture:** Um runner root compõe gates reproduzíveis sem esconder exit codes. Cada VAL produz artefato e evidence row; falha cria uma entrega de remediação e reexecuta somente o gate afetado e dependentes. A rubrica é calculada por dados, depois revisada independentemente.

**Tech Stack:** pnpm, TypeScript, Vitest, PostgreSQL descartável, Playwright, Next/OpenNext, Wrangler build, Docker/security scanners, read-only production smoke.

**Agent Orchestration:** **Supervisor-Workers** — VALs independentes podem coletar baseline em paralelo, mas o supervisor publica resultados na ordem VAL.1→VAL.10 e bloqueia rubrica até todos estarem verdes.

**Prerequisite:** Gate P4 verde.

**Spec:** `docs/superpowers/specs/2026-08-16-project-pending-closure-design.md` §5 P5 e §9.

---

## Task 1: Criar runner e schema de evidência VAL

**Files:**
- Create: `scripts/run-final-validation.mjs`
- Create: `scripts/run-final-validation.test.mjs`
- Create: `docs/reports/2026-08-16-final-validation.json`
- Create: `docs/reports/2026-08-16-final-validation.md`
- Modify: `package.json`

- [ ] **Step 1: RED — ordem e fail-closed**

Fixtures exigem VAL.1→VAL.10, command, exitCode, startedAt, endedAt, summary, artifact e status. Runner para no primeiro vermelho, não converte skip em green e permite `--resume-from` somente quando hashes dos gates anteriores continuam válidos.

- [ ] **Step 2: Implementar subprocess runner**

Capturar stdout/stderr em artefatos com redaction; imprimir no transcript resumo e linhas de prova. Timeout gera `failed`, nunca `skipped`.

- [ ] **Step 3: Adicionar alias**

`validate:final = node scripts/run-final-validation.mjs`.

- [ ] **Step 4: GREEN e commit**

Run test com fixtures success/failure/timeout/hash changed.
Commit: `test: add fail-closed final validation runner`.

## Task 2: VAL.1 — instalação frozen reproduzível

**Files:**
- Verify: `pnpm-lock.yaml`
- Verify: `pnpm-workspace.yaml`
- Verify: `package.json`
- Verify: `apps/api/package.json`
- Verify: `apps/pwa/package.json`
- Verify: `apps/agent/package.json`
- Verify: `apps/whatsapp-bridge/package.json` in the P3 rollback tag
- Update: `docs/reports/2026-08-16-final-validation.json`
- Update: `docs/reports/2026-08-16-final-validation.md`

- [ ] **Step 1:** registrar `git status --short` e commit alvo; arquivos de implementação devem estar commitados/checkpointados e inventário P0 deve explicar qualquer WIP restante.
- [ ] **Step 2:** `pnpm install --frozen-lockfile`.
- [ ] **Step 3:** `git diff --exit-code -- pnpm-lock.yaml`.
- [ ] **Step 4:** repetir frozen install em processo limpo/CI equivalente.

**Pass:** dois exits 0 e lockfile byte-idêntico.

## Task 3: VAL.2 — lint

**Files:**
- Verify: root/workspace lint configs e scripts
- Update: `docs/reports/2026-08-16-final-validation.json`
- Update: `docs/reports/2026-08-16-final-validation.md`

- [ ] **Step 1:** `pnpm lint`.
- [ ] **Step 2:** `pnpm docs:lint`.
- [ ] **Step 3:** verificar no output de `pnpm lint` que os aliases `apps/api format:check`, `apps/pwa lint`, `apps/agent typecheck`, `apps/whatsapp-bridge lint`, `node --test scripts/*.test.mjs` e `pnpm docs:lint` foram executados; se algum não estiver composto, corrigir o alias root e repetir.

**Pass:** todos os apps ativos, scripts e docs com 0 errors; warnings só quando política explicitamente permite e a rubrica os lista.

## Task 4: VAL.3 — typecheck

**Files:**
- Verify: `tsconfig*.json` ativos
- Update: `docs/reports/2026-08-16-final-validation.json`
- Update: `docs/reports/2026-08-16-final-validation.md`

- [ ] **Step 1:** `pnpm typecheck`.
- [ ] **Step 2:** verificar que produção, testes e scripts relevantes estão incluídos nos tsconfigs ou possuem checker próprio.
- [ ] **Step 3:** rodar LSP diagnostics nos arquivos alterados suportados.

**Pass:** todos os workspaces ativos exit 0; nenhum `@ts-ignore`, exclude novo ou ambient shim criado apenas para esconder erro.

## Task 5: VAL.4 — unit e contract sem DB externo

**Files:**
- Verify: unit/contract suites dos apps ativos e scripts
- Update: `docs/reports/2026-08-16-final-validation.json`
- Update: `docs/reports/2026-08-16-final-validation.md`

- [ ] **Step 1:** remover/unset `DATABASE_URL`, `DATABASE_URL_TEST` e `DB_TEST_MARKER` do subprocesso unitário.
- [ ] **Step 2:** `pnpm test:unit`.
- [ ] **Step 3:** enumerar arquivos/tests/passed/skipped por workspace.
- [ ] **Step 4:** qualquer tentativa de conexão externa falha o gate.

**Pass:** zero failed e zero dependência externa; skips somente de integração explicitamente fora desse comando.

## Task 6: VAL.5 — coverage ≥ 80%

**Files:**
- Verify/Modify: `vitest.config.ts`
- Verify/Modify: `apps/api/vitest.config.ts`
- Verify/Modify: `apps/pwa/vitest.config.ts`
- Verify/Modify: `apps/agent/vitest.config.ts`
- Verify/Modify: `apps/whatsapp-bridge/vitest.config.ts`
- Update: `docs/reports/2026-08-16-final-validation.json`
- Update: `docs/reports/2026-08-16-final-validation.md`

- [ ] **Step 1:** `pnpm test:coverage`.
- [ ] **Step 2:** produzir JSON/text summary por workspace ativo.
- [ ] **Step 3:** exigir ≥80% statements, branches, functions e lines no escopo canônico; arquivos de produção sem testes aparecem como 0, não somem do relatório.
- [ ] **Step 4:** mutation/adversarial sampling nos módulos críticos de auth, idempotência, pending operations e ownership.

**Pass:** quatro métricas ≥80% por workspace/escopo acordado e mutantes críticos detectados.

## Task 7: VAL.6 — integração PostgreSQL descartável

**Files:**
- Verify: migrations e integration suites
- Verify: destructive DB guards
- Update: `docs/reports/2026-08-16-final-validation.json`
- Update: `docs/reports/2026-08-16-final-validation.md`

- [ ] **Step 1:** subir PostgreSQL descartável compatível com CI.
- [ ] **Step 2:** criar marker server-side e exportar `DATABASE_URL_TEST`/`DB_TEST_MARKER` sem imprimir senha.
- [ ] **Step 3:** aplicar migrations do zero e verificar fingerprint.
- [ ] **Step 4:** `pnpm test:integration`.
- [ ] **Step 5:** executar backup/restore rehearsal e integração de IDOR/idempotência/lock/replay/ownership.
- [ ] **Step 6:** destruir somente o banco descartável identificado pelo marker.

**Pass:** zero failed/skip, migrations/fingerprint/backup/restore verdes e guards rejeitam target sem marker.

## Task 8: VAL.7 — E2E crítico e authz

**Files:**
- Verify: `apps/pwa/e2e/`
- Verify: Agent/bridge transition E2E artifacts
- Update: `docs/reports/2026-08-16-final-validation.json`
- Update: `docs/reports/2026-08-16-final-validation.md`

- [ ] **Step 1:** iniciar fixture/API/PWA/Agent locais com readiness e cleanup traps.
- [ ] **Step 2:** `pnpm test:e2e` com workers/retries canônicos.
- [ ] **Step 3:** repetir a suíte completa duas vezes consecutivas com retries 0.
- [ ] **Step 4:** provar criar/editar/pagar, pending approve/reject, invite, workspace switch, chat, logout/revoke, offline/update e cross-workspace denial.
- [ ] **Step 5:** preservar traces/screenshots/logs apenas para falhas e redigir dados sensíveis.

**Pass:** duas execuções verdes, todos os IDs da matriz possuem owner e zero guard failure.

## Task 9: VAL.8 — builds ativos e bridge transitório

**Files:**
- Verify: manifests/build configs de API, PWA e Agent ativos
- Verify: pre-retirement tag de P3 para bridge
- Update: `docs/reports/2026-08-16-final-validation.json`
- Update: `docs/reports/2026-08-16-final-validation.md`

- [ ] **Step 1:** `pnpm build:all` para todos os apps ativos no checkout final.
- [ ] **Step 2:** confirmar que artefatos gerados não sujam o working tree versionado.
- [ ] **Step 3:** validar o requisito histórico do bridge transitório em worktree temporário do tag `pre-g6-legacy-retirement-*`:

```bash
PRE_RETIREMENT_TAG="$(git tag --list 'pre-g6-legacy-retirement-*' --sort=-creatordate | head -n1)"
: "${PRE_RETIREMENT_TAG:?pre-retirement tag ausente}"
TMP_WORKTREE="$(mktemp -d -t pi-finance-bridge-XXXXXX)"
trap 'git worktree remove --force "$TMP_WORKTREE" 2>/dev/null || true' EXIT
git worktree add --detach "$TMP_WORKTREE" "$PRE_RETIREMENT_TAG"
pnpm --dir "$TMP_WORKTREE" install --frozen-lockfile
pnpm --dir "$TMP_WORKTREE/apps/whatsapp-bridge" build
git worktree remove "$TMP_WORKTREE"
trap - EXIT
```

O bridge não é restaurado ao checkout ativo; a prova confirma que o rollback tag continua compilável.

**Pass:** API/PWA/Agent ativos buildam; bridge do rollback tag builda isoladamente; checkout final permanece sem runtime legado ativo.

## Task 10: VAL.9 — segurança

**Files:**
- Verify: `.gitleaks.toml`
- Verify: `package.json`
- Verify: `scripts/security-secrets.mjs`
- Verify: `scripts/security-containers.mjs`
- Verify: `apps/api/Dockerfile`
- Verify: active Agent/PWA container or Worker build manifests from `docs/architecture/runtime-facts.json`
- Update: `docs/reports/2026-08-16-final-validation.json`
- Update: `docs/reports/2026-08-16-final-validation.md`

- [ ] **Step 1:** `pnpm security:secrets` com history completo.
- [ ] **Step 2:** `pnpm security:deps`.
- [ ] **Step 3:** buildar imagens ativas e `pnpm security:containers`.
- [ ] **Step 4:** executar SAST configurado; se alias estiver ausente, corrigir `security:check` e CI.
- [ ] **Step 5:** revisar findings por ID/CVSS/fix/waiver; waiver não pode esconder CRITICAL e exige owner/expiry.

**Pass:** zero secret novo, zero CRITICAL e todos HIGH com correção ou decisão explícita compatível com a política.

## Task 11: VAL.10 — smoke read-only de produção

**Files:**
- Verify: `.github/workflows/production-smoke.yml`
- Verify: `apps/pwa/e2e/specs/production-smoke.spec.ts`
- Verify: `docs/ops/g6-production-topology.md`
- Verify: `docs/ops/g6-legacy-rollback.md`
- Verify: `apps/pwa/e2e/playwright.config.ts`
- Update: `docs/reports/2026-08-16-final-validation.json`
- Update: `docs/reports/2026-08-16-final-validation.md`

- [ ] **Step 1:** `pnpm production:smoke:contract` prova localmente que o projeto Playwright é read-only e recusa writes.
- [ ] **Step 2:** obter URL implantada da PWA e API a partir da topologia P3; não usar processos locais como produção.
- [ ] **Step 3:** executar localmente contra produção:

```bash
: "${PWA_PRODUCTION_URL:?carregue a URL de docs/ops/g6-production-topology.md}"
E2E_PRODUCTION_SMOKE=1 \
E2E_PRODUCTION_URL="$PWA_PRODUCTION_URL" \
pnpm --dir apps/pwa exec playwright test \
  --config=e2e/playwright.config.ts \
  --project=production-smoke --workers=1 --retries=0
```

- [ ] **Step 4:** verificar health 200, auth deny esperado, assets/deep links, Agent health e referência de rollback; zero mutação/registro/login destrutivo.

**Pass:** smoke exit 0 e logs provam somente GET/HEAD ou requests explicitamente não mutáveis.

## Task 12: Calcular rubrica e aplicar vetos

**Files:**
- Create: `scripts/calculate-project-rubric.mjs`
- Create: `scripts/calculate-project-rubric.test.mjs`
- Create: `docs/reports/2026-08-16-project-pending-closure-rubric.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`

- [ ] **Step 1: RED — pesos e vetos**

Teste pesos `15+15+15+15+15+10+10+5=100`, rejeita score sem evidence IDs e força `REPROVADO` para qualquer veto da spec mesmo com 100 pontos.

- [ ] **Step 2: Implementar cálculo determinístico**

Cada dimensão recebe pontos inteiros e justificativa derivada dos artifacts VAL/P0–P4. Sem evidência = 0 naquela linha; veto é avaliado antes do veredito.

- [ ] **Step 3: Gerar relatório**

Incluir score, evidências, 25 itens, blockers, riscos residuais, produção, consent gates, rollback e veredito.

- [ ] **Step 4: GREEN**

Run: `node --test scripts/calculate-project-rubric.test.mjs && node scripts/calculate-project-rubric.mjs docs/reports/2026-08-16-final-validation.json docs/reports/2026-08-16-project-pending-closure-rubric.md`.
Expected: score ≥90, nenhum veto para permitir encerramento; 80–89 mantém Goal Mestre aberto.

- [ ] **Step 5: Commit:** `docs: publish project closure rubric`.

## Task 13: Review independente e Gate P5

**Files:**
- Modify: `docs/reports/2026-08-16-project-pending-closure-rubric.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`

- [ ] **Step 1:** reviewer rastreia cada item G6/G7/VAL a evidence IDs e comandos.
- [ ] **Step 2:** reviewer recalcula score sem confiar no total publicado.
- [ ] **Step 3:** reviewer tenta ativar cada veto: capability gap, SQL boundary, cross-workspace, skip/failure, data risk, secret/CRITICAL, rollback, WhatsApp dependency, docs/runtime mismatch e consent violation.
- [ ] **Step 4:** corrigir qualquer finding e reexecutar gates impactados.
- [ ] **Step 5:** `git diff --check`, docs lint e working-tree inventory final.
- [ ] **Step 6:** encerrar pi-task/Goal Mestre somente com ≥90, nenhum veto, P0–P5 verdes e relatório entregue.

**Gate P5:** VAL.1–VAL.10 verdes, rubrica reproduzível ≥90/100, nenhum veto e review independente aprovado.
