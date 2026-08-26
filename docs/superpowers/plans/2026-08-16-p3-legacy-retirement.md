# P3 Legacy Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir G6.2.8–G6.GATE retirando Evolution/webhook/bridge/`.pi` por estágios, tratando secrets e provando 48 horas sem dependência crítica do WhatsApp.

**Architecture:** P3 separa descoberta read-only, rehearsal, consentimento e mutação. Git tag + backup verificado formam o rollback de código; backup/restore verificado protege dados. O corte ocorre um estágio por vez e uma janela persistente de 48 horas bloqueia a conclusão.

**Tech Stack:** Git, SSH, Docker/Compose, Hostinger VPS, Cloudflare, PostgreSQL backup/restore, CI smoke, Node scripts.

**Agent Orchestration:** **Supervisor-Workers** — lanes read-only de topologia, código/referências, backup e observabilidade; um único supervisor executa ações externas aprovadas sequencialmente.

**Prerequisite:** Gate P2 verde e aceite capability por capability.

**Spec:** `docs/superpowers/specs/2026-08-16-project-pending-closure-design.md` §5 P3.

---

## Task 1: Confirmar topologia real sem mutação

**Files:**
- Verify: `docs/ops/vps-access.md`
- Verify: `../vps-hostinger/.env` (somente nomes necessários; nunca conteúdo no transcript)
- Create: `docs/ops/g6-production-topology.md`
- Create: `scripts/capture-production-topology.mjs`
- Create: `scripts/capture-production-topology.test.mjs`

- [ ] **Step 1: RED — parser sanitizado**

Testar parser de outputs `docker ps`, `docker compose ls`, `systemctl --failed`, health HTTP e Cloudflare metadata. O relatório deve rejeitar URL com credencial, cookie, token, senha ou private key.

- [ ] **Step 2: Implementar captura read-only**

O script recebe outputs por stdin/files e produz apenas nome do serviço, image/release, status, health, owner e dependências. Não abre `.env`; shell externo carrega apenas `VPS_IP`, `VPS_SSH_USER` e `VPS_SSH_KEY_PATH`.

- [ ] **Step 3: Executar pre-flight VPS read-only**

```bash
VPS_ENV=../vps-hostinger/.env
set -a; . "$VPS_ENV"; set +a
ssh -i "$VPS_SSH_KEY_PATH" "$VPS_SSH_USER@$VPS_IP" \
  'hostname; uptime; docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"; docker compose ls; systemctl --failed'
```

Expected: inventário real sem restart/up/down/migration.

- [ ] **Step 4: Cloudflare/PWA read-only**

Registrar deployment ativo, domínio, health e status da PWA sem deploy. Credenciais permanecem no provider/browser, não no arquivo.

- [ ] **Step 5: GREEN e commit**

Run sanitizer tests e revisar relatório por secrets.
Commit: `docs: capture production runtime topology`.

## Task 2: Inventariar legado e referências residuais

**Files:**
- Create: `docs/ops/g6-legacy-retirement-inventory.md`
- Create: `scripts/check-legacy-runtime-references.mjs`
- Create: `scripts/check-legacy-runtime-references.test.mjs`
- Verify: `apps/whatsapp-bridge/`
- Verify: `.pi/extensions/financial-tools/`
- Verify: Docker/compose/systemd/PM2 config do repositório e VPS

- [ ] **Step 1: RED — classes de referência**

Checker separa:

- `active-runtime`: bloqueia Gate P3;
- `rollback-only`: permitido até fim da janela;
- `historical-doc`: permitido com marca histórica;
- `test-fixture`: permitido se não alcançável em produção;
- `secret-name`: exige rotação/remoção, nunca valor.

- [ ] **Step 2: Gerar inventário determinístico**

Cada row contém path/service, class, owner, removal stage, proof command e rollback. Incluir Evolution webhook, bridge service/container, Pi RPC, `.pi/extensions/financial-tools`, env names, workflows e DNS/routes relevantes.

- [ ] **Step 3: Provar alcance de produção**

Cruzar entrypoints/compose/systemd observados na Task 1 com imports e configs do repo. Não marcar arquivo como ativo apenas pelo nome.

- [ ] **Step 4: GREEN**

Run checker em modo `pre-retirement`; expected inventário completo e lista explícita do que ainda bloqueia, não zero prematuro.

- [ ] **Step 5: Commit:** `docs: inventory legacy whatsapp runtime`.

## Task 3: Preparar rollback de código e dados

**Files:**
- Modify: `docs/runbooks/backup-restore.md`
- Create: `docs/ops/g6-legacy-rollback.md`
- Verify: `scripts/backup-db.mjs`
- Verify: `scripts/restore-db.mjs`
- Verify: `scripts/backup-restore-rehearsal.test.mjs`

- [ ] **Step 1: Rehearsal de dados em DB descartável**

Run: `pnpm test:backup-restore`
Expected: dump, SHA256, restore e contagens canônicas passam; dump adulterado é rejeitado.

- [ ] **Step 2: Criar rollback de código**

Definir tag anotada `pre-g6-legacy-retirement-YYYYMMDDHHMM`, commit exato, imagens/releases atuais e comando de redeploy. A tag só será criada imediatamente antes da mutação aprovada.

- [ ] **Step 3: Definir rollback operacional**

Ordem: restaurar stage `pi_owner` → reativar bridge/webhook → validar health/read → liberar writes somente após idempotency check. Restore de DB só ocorre se integridade exigir; nunca por default.

- [ ] **Step 4: Testar runbook sem produção**

Executar em ambiente descartável/staging com containers equivalentes. Registrar tempo, gaps e health checks.

- [ ] **Step 5: Commit:** `docs: rehearse legacy runtime rollback`.

## Task 4: Produzir dry-run exato das remoções

**Files:**
- Create: `scripts/plan-legacy-retirement.mjs`
- Create: `scripts/plan-legacy-retirement.test.mjs`
- Create: `docs/ops/g6-legacy-retirement-change-set.md`
- Verify: `docs/ops/g6-legacy-retirement-inventory.md`
- Verify: `docs/ops/g6-production-topology.md`
- Verify: `scripts/check-legacy-runtime-references.mjs`
- Verify: `apps/whatsapp-bridge/`
- Verify: `.pi/extensions/financial-tools/`

- [ ] **Step 1: RED — nenhuma operação fora do inventário**

O planner falha se uma remoção/disable/rotation não tiver row, backup, rollback e proof. Dry-run nunca executa shell mutável.

- [ ] **Step 2: Produzir estágios**

1. desabilitar entrada Evolution/webhook;
2. observar Agent owner;
3. parar/remover bridge service/container;
4. remover código `apps/whatsapp-bridge/`;
5. arquivar/remover `.pi/extensions/financial-tools/` com tag Git como fonte de rollback;
6. remover refs/configs ativas;
7. rotacionar/remover secrets residuais.

- [ ] **Step 3: Gerar comandos exatos**

Cada comando inclui target, expected before/after, health check e rollback. Valores de secrets aparecem como placeholders de nome, nunca valor.

- [ ] **Step 4: GREEN e revisão independente**

Reviewer compara change-set com topologia/inventário; expected zero operação implícita.

- [ ] **Step 5: Commit:** `docs: plan staged legacy retirement`.

## Task 5: Consent gate externo consolidado

**Files:**
- Modify: `docs/ops/g6-legacy-retirement-change-set.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`

- [ ] **Step 1: Apresentar pacote de aprovação**

Incluir:

- commit/tag alvo;
- serviços e paths exatos;
- backup ID/checksum status sem segredo;
- ordem e duração estimada;
- impacto esperado;
- health/smoke após cada estágio;
- rollback testado;
- secrets por nome/provider;
- janela de 48 horas.

- [ ] **Step 2: Solicitar decisões separáveis**

O usuário aprova ou rejeita: (A) disable webhook, (B) stop/remove bridge, (C) remoção de código, (D) rotação de secrets, (E) início da janela. Não inferir aprovação de uma operação a partir de outra.

- [ ] **Step 3: Persistir decisão**

Registrar decisão e timestamp; operação rejeitada mantém P3 bloqueado sem executar etapas dependentes.

## Task 6: Executar cutover por estágios aprovados

**Files:**
- Modify/Delete somente targets aprovados no change-set
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`
- Modify: `docs/ops/g6-production-topology.md`

- [ ] **Step 1: Criar tag/checkpoint e verificar backup**

Confirmar commit limpo do change-set, criar tag anotada aprovada e verificar checksum/restore rehearsal antes da primeira mutação.

- [ ] **Step 2: Desabilitar entrada Evolution/webhook**

Executar somente comando aprovado. Validar API/PWA/Agent health, ownership e ausência de nova mensagem no bridge.

- [ ] **Step 3: Observar antes de remover**

Executar smoke financeiro via PWA/Agent, idempotency probe e métricas de erro. Se veto, rollback imediato e blocker.

- [ ] **Step 4: Parar/remover bridge**

Executar serviço/container aprovado; validar que Agent continua owner e que nenhum supervisor o recria.

- [ ] **Step 5: Remover código legado**

Aplicar diff revisado para `apps/whatsapp-bridge/` e `.pi/extensions/financial-tools/`; preservar histórico na tag, não duplicar código ativo em outro diretório.

- [ ] **Step 6: GREEN pós-estágio**

Após cada etapa, rodar health, auth deny, owner, idempotency e `node scripts/check-legacy-runtime-references.mjs --stage=N`, substituindo `N` pelo inteiro executado entre 1 e 7. Falha interrompe o próximo estágio.

- [ ] **Step 7: Commit:** `refactor: retire legacy whatsapp runtime`.

## Task 7: Rotacionar e remover secrets residuais aprovados

**Files:**
- Modify: provider/VPS secret stores externos (consentimento obrigatório)
- Modify: `.env.example`, deployment manifests e runbooks sem valores reais
- Modify: `docs/ops/g6-legacy-retirement-inventory.md`

- [ ] **Step 1: Inventário por nome/provider**

Exigir owner, consumer atual, replacement/removal action e proof. Não ler/imprimir valor antigo.

- [ ] **Step 2: Rotação sequencial**

Um secret por vez: criar novo → atualizar consumer aprovado → health → revogar antigo → health. Secret sem consumer é removido após prova.

- [ ] **Step 3: Scanners**

Run `pnpm security:secrets` e busca por nomes/referências ativas. Historical docs devem estar marcadas; nenhum valor no git/history novo.

- [ ] **Step 4: Commit docs/config públicas:** `chore: remove legacy runtime secret references`.

## Task 8: Executar janela persistente de 48 horas

**Files:**
- Create: `docs/ops/g6-48h-gate.md`
- Create: `scripts/g6-soak-status.mjs`
- Create: `scripts/g6-soak-status.test.mjs`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`

- [ ] **Step 1: RED — relógio e critérios**

Script exige `startedAt`, `endsAt=startedAt+48h`, checkpoints, owner, health, alert count, data-integrity probes e rollback marker. Não aceita edição retroativa do início sem nova janela.

- [ ] **Step 2: Iniciar após consentimento**

Registrar timestamp UTC, release/tag, owner e baselines. Persistir wait no `pi-tasks`; não depender de memória de sessão.

- [ ] **Step 3: Checkpoints read-only**

No início, 1h, 6h, 12h, 24h, 36h e ≥48h: health API/PWA/Agent, error/alert count, duplicate/idempotency probe, sample read aggregates e ausência de bridge/webhook ativo.

- [ ] **Step 4: Política de falha**

Alerta crítico, data mismatch, duplicate write, owner ausente/duplo ou dependência WhatsApp reinicia rollback e invalida a janela. Aviso não crítico exige classificação explícita.

- [ ] **Step 5: Fechar janela**

Run: `node scripts/g6-soak-status.mjs docs/ops/g6-48h-gate.md`
Expected após 48h reais: `elapsedHours>=48`, zero veto e todos checkpoints presentes.

- [ ] **Step 6: Commit:** `ops: record g6 48-hour independence gate`.

## Task 9: Gate P3 / G6

**Files:**
- Modify: `docs/ops/g6-production-topology.md`
- Modify: `docs/ops/g6-legacy-retirement-inventory.md`
- Modify: `docs/ops/g6-48h-gate.md`
- Modify: `docs/superpowers/goal-runs/MASTER-PENDING-CLOSURE.md`
- Modify: `docs/goals/2026-08-16-project-pending-closure-master.md`

- [ ] **Step 1:** `check-legacy-runtime-references --stage=final` retorna zero `active-runtime` e zero `secret-name` pendente.
- [ ] **Step 2:** topologia read-only mostra Agent/API/PWA saudáveis e bridge/Evolution/Pi runtime ausentes ou inativos conforme change-set.
- [ ] **Step 3:** janela ≥48h válida, zero alerta crítico, integridade e idempotência verdes.
- [ ] **Step 4:** rollback foi exercitado antes do corte e continua documentado a partir da tag/release.
- [ ] **Step 5:** security secrets/deps passam sem CRITICAL relacionado.
- [ ] **Step 6:** reviewer independente valida consentimentos, targets e ausência de ação externa não aprovada.
- [ ] **Step 7:** checkpoint e próximo `/goal` P4.

**Gate P3/G6:** nenhum fluxo crítico depende do WhatsApp, runtime legado retirado com consentimento, secrets tratados, 48 horas verdes e rollback preservado.
