---
type: error
id: ERR-2026-08-26-pwa-server-failed-to-respond-windows-opennext
title: "PWA Server failed to respond após deploy Windows — opennext incompatível + wrangler Node 20"
created: 2026-08-26
severity: crítica
status: corrigido
area: pwa
sintoma: "Server failed to respond."
---

# ERR-2026-08-26 — PWA Server failed to respond (deploy Windows)

## Sintoma

- Após `pnpm --dir apps/pwa exec wrangler deploy` manual em Windows (deploy `a5df4b96-626b-465a-9e3d-820232160424 2026-08-26T20:54`), a página `https://pi-finance-pwa.walissonead.workers.dev` não carrega e exibe `Server failed to respond.` (erro genérico do Workers runtime, sem HTML).
- `curl -I https://pi-finance-pwa.walissonead.workers.dev` retornava `500`/`no response` em vez de `200 OK`.
- `wrangler deployments list --name pi-finance-pwa` mostrava último deploy 7 dias atrás (`6bc2b25b-281e-40a2-a671-df15eca7be8b 2026-08-20T19:46:36`) antes do deploy quebrado; usuário reportou exatamente “últimos deploys tanto do agente quando do pwa são de 7 dias atrás”.

## Causa Raiz

1. **Deploy quebrado em Windows:** `apps/pwa/package.json:16` define `build:cloudflare: next build --webpack && node scripts/prepare-standalone.mjs && pnpm opennextjs-cloudflare build --skipBuild`. Rodado em Windows, `opennextjs-cloudflare` emite `WARN OpenNext is not fully compatible with Windows. For optimal performance, use WSL` (`apps/pwa/.open-next/worker.js` gerado com paths/escaping Windows). O worker resultante sobe (`Uploaded pi-finance-pwa 13.38s`), mas em runtime o `workerd` falha ao resolver assets/server-functions → `Server failed to respond`.
   - Build Windows log: `✓ Compiled successfully` mas `open-next` com warning, e `wrangler tail` não mostrava logs de request (worker nem iniciava).
   - Mesmo padrão se tentado via `docker run -v` com `node_modules` de Windows ou via `wsl` com `node_modules` de Windows (`Error: Cannot find module '@ast-grep/napi-linux-x64-gnu'` — binding nativo divergente).

2. **`pwa-ci.yml` não deployava:** `.github/workflows/pwa-ci.yml:1` roda em `ubuntu-latest` com `pnpm --dir apps/pwa build:cloudflare` apenas para CI (lint, typecheck, lhci, e2e), sem `wrangler deploy`. Logo `push main` com fixes de `apps/pwa/src/features/auth/AuthGate.tsx` (commit `fd95178`) nunca chegava à produção — explica hiato de 7 dias.

3. **Node 20 no CI quebra wrangler 4.104:** Primeiro `pwa-deploy.yml` criado com `node-version: 20` falhou em `Deploy to Cloudflare Workers` com `Wrangler requires at least Node.js v22.0.0. You are using v20.20.2.` (`gh run 33015546606`, job `98332697431`). `wrangler 4.104.0` exige `>=22`.

## Solução Aplicada (2026-08-26)

### 1. Rollback imediato

```bash
pnpm --dir apps/pwa exec wrangler rollback 6bc2b25b-281e-40a2-a671-df15eca7be8b --name pi-finance-pwa -y
# SUCCESS Worker Version 6bc2b25b has been deployed to 100% of traffic.
```
`curl -I` voltou a `200 OK` com HTML `Carregando…`.

### 2. Auto-deploy Linux + Node 22

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `.github/workflows/pwa-deploy.yml` (novo) | inexistente | `on: push: branches:[main] paths: apps/pwa/**, pnpm-lock.yaml, .github/workflows/pwa-deploy.yml` + `workflow_dispatch`, `runs-on: ubuntu-latest`, `node-version: 22`, `pnpm install --frozen-lockfile`, `pnpm --dir apps/pwa build:cloudflare`, `wrangler deploy` com `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` (`gh secret set`) |
| `gh secret set CLOUDFLARE_API_TOKEN` | — | `cfut_BkL3M5rTeb1DVTR0E4aYl6jQTlGD4HMsNBmaNYjb409a3505` (Workers write) |
| `gh secret set CLOUDFLARE_ACCOUNT_ID` | — | `1396fe3fb16f79f1ea131f8502730fac` (`wrangler whoami`) |

Commits:
- `7ebab7c ci(pwa): auto deploy via Linux opennext` — cria workflow com `node 20` (falha).
- `099445d ci(pwa): use Node 22 for wrangler` — corrige para `22`, `gh run 33015722394` → `✓ Deploy to Cloudflare Workers` (1m39s), `Version b62e05fa-547c-4d56-a33e-cefa906339dd 2026-08-26T21:32:40` ativo, `curl -I` `200 OK`.

### 3. Validação do fix iPhone

O deploy Linux `b62e05fa` já contém o fix de `ERR-2026-08-26-registro-dispositivo-desabilitado-iphone` (`apps/pwa/src/features/auth/AuthGate.tsx:59` `Authorization: Bearer`), antes quebrado pelo deploy Windows. `wrangler deployments list` agora mostra `2026-08-26T21:32:40` como `100%` e página carrega.

## Validação

- `gh run view 33015722394` → `✓ deploy`.
- `wrangler deployments list --name pi-finance-pwa` → `b62e05fa 2026-08-26T21:32:40`.
- `curl -I https://pi-finance-pwa.walissonead.workers.dev` → `200`, `content-security-policy: connect-src 'self' https://api.synkroo.com.br`, `x-frame-options: DENY`, HTML com `Carregando…`.
- `wrangler versions view b62e05fa` → `Compatibility Date: 2025-06-23`, bindings `WORKER_SELF_REFERENCE`, `ASSETS`, `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL`.

## Arquivos Alterados

- `apps/pwa/src/features/auth/AuthGate.tsx:59` (já no deploy, mas só chegou via Linux).
- `.github/workflows/pwa-deploy.yml:1` (novo).
- `gh secret` (infra, não versionado).

## Lição / Prevenção

- **Nunca `opennextjs-cloudflare build` em Windows nativo** — sempre `ubuntu-latest` (ou `wsl` com `node_modules` Linux isolado). Manter `pwa-ci.yml` apenas para CI e `pwa-deploy.yml` para CD separado, ou unificar com `needs: [pwa]` + `wrangler deploy`.
- **Alinhar Node:** `wrangler >=4.104` exige `>=22`; manter `actions/setup-node@v4` em `22` (ou `24`), não `20` (deprecado `2025-09-19`).
- **Monitorar hiato de deploy:** `wrangler deployments list` deve ser checado em smoke; hiato >2 dias com `push main` indica CI sem CD. Adicionar alerta ou badge.
- **Rollback documentado:** `wrangler rollback <version-id> --name pi-finance-pwa` restaura em segundos; guardar `Version ID` do último deploy saudável (`6bc2b25b`).

## Referências

- `apps/pwa/wrangler.jsonc:1` (`name: pi-finance-pwa`, `compatibility_date: 2025-06-23`).
- `apps/pwa/package.json:16` (`build:cloudflare`).
- `docs/erros-e-solucoes/2026-08-26-registro-dispositivo-desabilitado-iphone.md` — fix que só entrou via deploy Linux.
- Vault: `Erros/2026-08-26-pwa-server-failed-to-respond-windows-opennext.md`.
