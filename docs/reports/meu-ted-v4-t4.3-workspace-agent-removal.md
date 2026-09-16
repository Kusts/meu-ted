# T4.3 — Remoção do WorkspaceAgent (SPEC §11 E4, INV-07)

**Data:** 2026-09-16 · **Branch:** `feat/meu-ted-v4-hardening` (código, sem deploy)
**Pré-condição:** ARCH-V4-06a verde (0 consumidores externos, prova da T4.2)

## O que foi removido (ordem do ADR-016)

1. Rota `/agents/workspace/*` + handlers legados (`history/export/stream/abort`,
   `message/:id/process|retry` 410) — `apps/agent/src/worker.ts`.
2. `syncLegacyHistory` e o re-roteamento `/message` → `/rpc/chat`
   (incl. import dinâmico de `runtime-config-client` e `AGENT_CONFIG_TOKEN`).
3. Classe `WorkspaceAgent` + `exportFullWorkspaceHistory` + gateway legado de
   `apps/agent/src/index.ts` (módulo reduzido ao boundary de autorização
   `authorizeWorkspaceMembership`); tipo `LegacyAgentStub` removido.
4. Binding `AGENT` de `apps/agent/wrangler.jsonc` + fallthroughs
   (`Env.AGENT`, `getAgentByName`, worker legado do `index.ts`).
5. **Preservado (E5):** tags de migration DO `v1`/`v2` no `wrangler.jsonc` e
   todo o SQL de `apps/agent/migrations/` — `git diff` confirma: nada em
   `migrations/` foi tocado.
6. Testes: `agent-scaffold.test.ts` virou invariante single-runtime
   (binding único, worker/index sem superfície legada, 404 na rota retirada);
   `legacy-history-migration.test.ts` mantém só a prova de import (1, 3, 5);
   gateway reescrito como passthrough pós-remoção; testes do DO legado e do
   gateway legado do `index.ts` excluídos (sujeito extinto); cobertura
   canônica equivalente permanece em `finance-chat-agent-integration`,
   `finance-chat-agent-rest-contract`, `sdk-runtime-contract`,
   `worker-canonical-namespace`, `worker-actor-spoof` (nível DO),
   `agent-antireplay`, `agent-device-binding`.
7. Guard: 06a PASS; 06b reduzido de 82 para 2 ocorrências (ver pendências).
8. `XLT-06` (`apps/pwa/e2e/xlt/xlt-06-canonical-agent-runtime.spec.ts`):
   round-trip canônico via browser real, 404 na rota retirada sem tocar DO,
   binding único no health, superfície estática travada.

## Evidência

- `node scripts/check-legacy-runtime-references.mjs --check=06a` → PASS (0 externos).
- 06b: 82 → 2 (restantes fora do escopo T4.3, ver abaixo).
- `pnpm --filter pi-finance-agent test` → VERDE (84 files, 462 passed, 1 skipped).
- `pnpm --filter pwa test` → VERDE (207 files, 1789 passed).
- `pnpm typecheck` (4 workspaces) → VERDE.
- XLT via `e2e/xlt/xlt.config.ts` → VERDE 32/32, incluindo XLT-06 4/4.
- `node --test scripts/check-workspace-agent-guard.test.mjs` → VERDE 6/6
  (o subteste e ainda assera 06b vermelho — verdadeiro apenas pelos 2
  resíduos fora de escopo; ver decisão 3).
- `migrations/` intacto: `git status/diff` vazio em `apps/agent/migrations/`.
- Ajuste de robustez no caminho: forward do gateway agora bufferiza o corpo
  (`arrayBuffer`) em vez de repassar o stream — o padrão anterior quebrava
  fora do runtime Workers (Node exige `duplex`) e nenhum teste exercitava
  POST pelo gateway; sem mudança de comportamento no deploy.

## Pendências de deploy (R3/E5 — NÃO executadas nesta sessão)

- Validação contra o runtime PUBLICADO (Cloudflare) + smoke pós-deploy.
- Observação de 48h sem erros de histórico em produção.
- Deploy progressivo com rollback = redeploy do SHA anterior com binding
  `AGENT` restaurado (ADR-016); reconciliar `executing` antes de rollback
  de state machine.

## Decisões que excedem o escopo T4.3 (devolvidas ao Planner)

1. **Tag `v1` (`new_sqlite_classes: ["WorkspaceAgent"]`) vs 06b zero.**
   E5/ADR-016 mandam preservar as migration tags; o guard 06b não tem
   isenção para tags de migration — 06b PASS pleno exige emenda do guard
   (`scripts/`, dono T4.1) OU waiver documentado do Planner.
2. **`scripts/canonical-docs-contract.test.mjs:49,55`** — literal da rota
   retirada dentro do contrato I5 (dono T4.4). Mesma situação: emenda mínima
   em `scripts/` OU waiver.
3. **Golden test do guard (`scripts/check-workspace-agent-guard.test.mjs`,
   subteste e)** — ainda assera 06b vermelho pré-remoção; pós-remoção ele
   falha. Atualização de uma linha em `scripts/` (dono do guard).
