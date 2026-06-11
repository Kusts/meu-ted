# Recovery Baseline — pi-financeiro — 2026-06-11

## Fonte de Verdade Recomendada

**Worktree `D:/projetos/pi-financeiro-worker1`** (branch `worker1`, commit `ae923417`) é a fonte de verdade recomendada para o estado atual do projeto.

**Checkout principal `D:/projetos/pi-financeiro`** (branch `master`, commit `ae923417`, 26 commits ahead of tracked history) contém diff ruidoso e NÃO contém o bugfix real — apenas mudanças de formatação.

---

## Diff Úteis a Preservar

### Worktree —2 arquivos, diff limpo e focado

| Arquivo | Mudança |
|---------|---------|
| `apps/whatsapp-bridge/src/webhook-handler.ts` | Wrap `responseSender.send()` em try/catch; falha não-crítica não derruba webhook |
| `apps/whatsapp-bridge/src/webhook-bridge.test.ts` | Teste novo: `returns status=forwarded when responseSender.send() fails` |

**Diff real do webhook-handler.ts (worktree):**
```diff
-    await responseSender.send(sourceMsg.remoteJid, result.data.message);
+    try {
+      await responseSender.send(sourceMsg.remoteJid, result.data.message);
+    } catch (err) {
+      console.warn('[webhook-handler] responseSender.send() failed (non-critical):', ...);
+    }
```
Mesma proteção aplicada ao fallback send().

### Checkout Principal — diff poluído (NÃO usar como base)

| Padrão | Count |
|--------|-------|
| Tool files com mudança de indentação (tabs→espaços) | ~50 |
| Arquivos deletados (docker/pi-isolated/*, start-*.bat) | 5 |
| Untracked junk files (temp-pi-*, qrcode*, bridge-log.txt) | ~15 |
| peer-control-ledger.jsonl + peer messages | untracked |

⚠️ O checkout principal **NÃO** tem o bugfix em `webhook-handler.ts` — só formatação.

---

## Riscos Imediatos

- **node_modules corrompido**: `typescript` module not found em `apps/whatsapp-bridge/`. `pnpm typecheck` e `pnpm test` falham.
- **Checkout principal poluído**:61 files changed com formatação ruidosa. Aplicar `git checkout -- .` descartaria o bugfix do worktree se não for mergeado antes.
- **Três tasks anteriores desconectadas** (ctrl_mq9e7xbo, ctrl_mq9e7xbr, ctrl_mq9e7xbt) — não houve resolução formal, worktree ficou em estado intermediário.
- **Arquivos docker deletados**: `docker/pi-isolated/` removido do tracking sem justificativa documentada.

---

## Próximos Slices Recomendados

1. **FIX-1**: Repair `node_modules` — `pnpm install` no workspace root e/ou por app
2. **FIX-2**: Merge worktree `worker1` → `master` (o bugfix do webhook está pronto)
3. **FIX-3**: Limpar checkout principal — `git checkout -- .` para descartar diff de formatação; ou fazer `git reset --hard ae923417` e aplicar o bugfix do worktree via cherry-pick
4. **FIX-4**: Remover arquivos untracked junk (`temp-pi-*/`, `qrcode*.png`, `bridge-log.txt`, `nul`, `*.bak`, `tmp-*.mjs`, `test-payload.json`, `apps/webhook-test-output.txt`)
5. **FIX-5**: Restaurar ou documentar remoção de `docker/pi-isolated/`

---

## Comandos Executados e Saída Resumida

### Checkout principal
```bash
$ git status -s
# 50+ M (modified) files — tool files with formatting diff
# 3 D (deleted): docker/pi-isolated/Dockerfile, README.md, start-*.bat
# 20+ ?? (untracked): temp dirs, logs, qrcode, peer files
$ git diff --stat
# 61 files changed, 878 insertions(+), 948 deletions(-)
# Webhook-handler.ts diff = only formatting (tabs→spaces), NO semantic fix
$ git log --oneline -10
# ae923417 fix: add pi.extensions manifest to eliminate extension loader path conflict
# (26 commits ahead of tracked ref)
```

### Worktree
```bash
$ git status -s
# M apps/whatsapp-bridge/src/webhook-bridge.test.ts
# M apps/whatsapp-bridge/src/webhook-handler.ts
$ git diff --stat
# 2 files changed, 27 insertions(+), 11 deletions(-)
# Semantic fix present: try/catch around responseSender.send()
$ git branch -v
# * worker1  ae923417 (same commit as master)
```

### Verificação leve
```bash
$ pnpm typecheck
# ERR: Cannot find module 'typescript' in apps/whatsapp-bridge/node_modules
# Exit1 — node_modules corrompido
```

---

## Resumo de Estado por Local

| Local | Commit | Bugfix webhook? | Formatting noise? | node_modules |
|-------|--------|-----------------|-------------------|--------------|
| `master` (checkout principal) | ae923417 | ❌ NÃO | ✅50+ files | ❌ broken |
| `worker1` (worktree) | ae923417 | ✅ SIM | ❌ limpo | ❌ broken |
| `refactor/minimal-whatsapp-pi-bridge` | c1554ad4 | histórico | histórico | ? |

---

## Decisão Arquitetural Pendente

O PLANNER deve decidir:
- **Opção A**: Merge worktree `worker1` → `master`, depois `git reset --hard` no checkout principal para limpar ruído
- **Opção B**: Descartar worktree, aplicar cherry-pick manual do bugfix no checkout principal
- **Opção C**: Investigar se o diff de formatação dos50+ tool files é intent (padronização) ou ruído acidental antes de limpar

---

*Gerado por worker1 — Phase 0 — stabilize-pi-financeiro-2026-06-11*
