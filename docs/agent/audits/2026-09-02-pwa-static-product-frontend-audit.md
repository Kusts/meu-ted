# Auditoria Estática de Produto e Frontend — PWA — 2026-09-02

**Executor:** Coder 1 (dispatch `ctx_50e219e05a4f`, task `task_0f8f8e58160c`)
**Escopo:** somente leitura. Nenhum código, configuração, dependência ou dado alterado.
**Método:** 3 explorações paralelas (telas/auth/estados; componentes/a11y/navegação/responsividade; PWA/perf/testes/proxy) + spot-check manual das evidências P0/P1 + checks read-only (`pnpm --filter pwa typecheck` ✅ limpo; `pnpm --filter pwa lint` ❌ 1 erro, 3 warnings).
**Caminhos abaixo são relativos a `apps/pwa/src/` salvo indicação.**

---

## 1. Resumo executivo

A base é sólida em autenticação (AuthGate com 401/offline), optimistic updates com rollback, design system com tokens semânticos e proxy de API com testes. Porém há **3 achados P0** (dupla criação de dados financeiros sem Idempotency-Key + double-submit; app completo sem auth em modo mock em origins não configuradas; PWA standalone quebrada em iOS por safe-area inerte) e um conjunto de P1s de correção de dados (conta sempre `kind:"bank"`, dado cross-workspace stale, offline shell que nunca atualiza). Lint falha com 1 erro real em `convite/page.tsx`.

## 2. Achados — P0

### P0-1. Nenhuma mutation envia `Idempotency-Key` + botões de salvar sem disabled durante POST → dupla criação de transações/pagamentos
- **Impacto:** duplo toque em rede lenta cria duas transações/pagamentos reais; viola regra do projeto (AGENTS.md exige Idempotency-Key em toda mutação financeira); anti-double-submit depende só de flags de UI.
- **Evidência:** `lib/api/endpoints.ts:91-95` (`POST /transactions/expense` sem header), `:329-333` (`POST /payables`), `:372-375` (`payables/{id}/pay`), `:158-162` (`cards/statements/{id}/pay`); contrato aceita a chave mas é ignorado (`lib/state/commands.ts:47-80` — `idempotencyKey?` em todos os inputs, jamais propagado). Único uso é `undoLastAction` com `crypto.randomUUID()` **a cada chamada** (`lib/api/endpoints.ts:508`) — retry após timeout refaz o undo com chave nova.
- **Double-submit:** `components/NewTransactionSheet.tsx:1142-1145` — `disabled={amountCents <= 0 || checkingDuplicate}`; durante `doSave` o botão continua habilitado. Mesmo padrão em `features/payables/PayablesPage.tsx:120`, `features/goals/GoalsPage.tsx:267`, `features/budgets/BudgetsPage.tsx:255`, `features/categories/CategoriesPage.tsx:46`, `features/accounts/AccountsPage.tsx:165`.
- **Recomendação:** gerar UUID no `guarded()`/`createCommands` e repassar via `apiFetch(..., { idempotencyKey })` (infra já existe em `lib/api/client.ts:107-109`); adicionar `saving` state que desabilita o botão durante o POST em todos os sheets. Corrigir `undoLastAction` para aceitar chave gerada pelo chamador (reutilizada em retry).

### P0-2. App completo renderiza sem autenticação em modo mock fora do host de produção
- **Impacto:** qualquer origin não-listada (previews Cloudflare, domínio custom, abre o standalone local sem `.env`) renderiza saldo/contas **fictícios como se fossem reais** e sem login — risco de confusão/dados falsos em contexto financeiro.
- **Evidência:** `components/RootProviders.tsx:50` — `const tree = isApiConfigured() ? <AuthGate>{inner}</AuthGate> : inner;`; `lib/api/client.ts:36-45` — fallback só cobre o host hardcoded `pi-finance-pwa.walissonead.workers.dev`; sem env, `baseUrl()` retorna `undefined` → `mock-data`.
- **Recomendação:** fail-closed em builds de produção (origin allow-list ou env obrigatória no build) e banner explícito "modo demonstração" quando mock (como já faz `features/pending-operations/PendingOperationsPage.tsx:196-200`).

### P0-3. Safe-area inerte em PWA standalone iOS (`viewport-fit: cover` ausente)
- **Impacto:** em standalone iOS, `env(safe-area-inset-bottom)` resolve 0 → bottom-nav encosta na home indicator; FAB do TED e badge de convites ignoram safe-area; conteúdo pode ficar sob a notch/barra.
- **Evidência:** `components/BottomNav.tsx:36` usa `pb-[env(safe-area-inset-bottom)]`, mas `app/layout.tsx:43-48` exporta `Viewport` só com `themeColor` (sem `viewportFit: "cover"`); grep `viewportFit|viewport-fit` = 0 em `apps/pwa`. `components/TedChatLauncher.tsx:16` (`bottom-[88px]`) e `components/AppShell.tsx:324` (badge `fixed bottom-20 right-5`) ignoram safe-area.
- **Recomendação:** adicionar `viewportFit: "cover"` ao `Viewport` e usar `calc(... + env(safe-area-inset-bottom))` nos elementos fixed.

## 3. Achados — P1

### P1-1. Troca de workspace exibe dados do workspace anterior em memória
- **Impacto:** dado financeiro cross-workspace visível após troca (corrige-se só com reload manual) — viola o isolamento por workspace percebido pelo usuário.
- **Evidência:** `lib/auth/workspace-context.tsx:260-274` — `selectWorkspace` limpa snapshot/sessão e troca o id, mas não remonta/recarrega o estado; `lib/state/app-state-context.tsx:417-419` — bootstrap bloqueado por `loadedRef.current` (roda 1x por mount); `components/RootProviders.tsx:41-44` sem `key` por workspace.
- **Recomendação:** `key={activeWorkspaceId}` no `AppStateProvider` (em RootProviders) ou reload controlado no switch.

### P1-2. Modais sem gerenciamento de foco (trap/Escape/focus restore) em 4 componentes
- **Impacto:** teclado e leitores de tela ficam atrás do overlay em `aria-modal`; `ConfirmActionDialog` usado em fluxos destrutivos não fecha com Escape nem expõe o título (`aria-labelledby` ausente).
- **Evidência:** `components/ui/Dialog.tsx:58-122`, `components/ui/BottomSheet.tsx:51-88` (sem portal, sem aria-labelledby; scroll-lock sobrescreve `body.style.overflow=""` de outro modal — `:22-31`), `components/ConfirmActionDialog.tsx:40-50` (sem Escape, h3 sem id), `components/ted/TedChat.tsx:105-114`.
- **Recomendação:** extrair hook comum `useDialogA11y` (foco inicial, trap, Escape, restore, scroll-lock com contador) usado pelos 4.

### P1-3. Z-index: dialog de confirmação renderiza sob o BottomSheet
- **Impacto:** AppShell abre o discard dialog com a sheet ainda aberta (`components/AppShell.tsx:144-154, 308-320`); o confirm (z-30) pode ficar coberto pelo overlay da sheet (z-40/painel z-50) — usuário não vê o diálogo.
- **Evidência:** `components/ConfirmActionDialog.tsx:40` (`z-30`) vs `components/ui/BottomSheet.tsx:52,61` (`z-40` overlay, `z-50` painel).
- **Recomendação:** escala de z documentada (sheet 40, confirm 60, toasts 70).

### P1-4. Bottom nav usa botão + `router.push` em vez de `<Link>`
- **Impacto:** sem prefetch, sem abrir em nova aba, foco perdido pós-navegação; inconsistente com `SidebarRail` que usa `<Link>`.
- **Evidência:** `components/BottomNav.tsx:43-63`, `components/AppShell.tsx:288-294`.
- **Recomendação:** trocar por `Link` preservando o guard de unsaved changes via `onNavigate`.

### P1-5. `router.back` inexistente; botão "Voltar" do perfil empilha histórico
- **Impacto:** em PWA standalone, gesto de back do SO sai do app; botão "Voltar" do perfil faz push duplicado.
- **Evidência:** grep `router.back` = 0 hits em `src/`; `features/profile/ProfilePage.tsx:236` (`aria-label="Voltar"`).
- **Recomendação:** `router.back()` quando `history.length > 1`, fallback `router.push("/")`.

### P1-6. Offline shell nunca atualiza após deploy
- **Impacto:** usuários ficam com a primeira versão do shell offline até limpar cache manualmente — mina a proposta de valor do PWA offline.
- **Evidência:** `sw.ts:79-80` — `{ url: OFFLINE_HTML, revision: null }` (revision null = "URL contém hash próprio"; arquivos não têm hash).
- **Recomendação:** revision = hash do conteúdo no build, ou URLs versionadas (`/offline-shell.v3.html`).

### P1-7. Proxies sem timeout no upstream e erro opaco
- **Impacto:** API VPS pendurada segura o Worker até o limite da plataforma; falha de DNS/TLS vira 500 opaco sem log estruturado.
- **Evidência:** `app/api/backend/[...path]/route.ts:58-63` e `app/api/agent/[...path]/route.ts:48-53` — `await fetch(...)` sem `AbortSignal.timeout`, sem try/catch.
- **Recomendação:** `AbortSignal.timeout(10_000)` + try/catch retornando 502 JSON; encaminhar `accept-language`/`x-request-id`.

### P1-8. God-context re-render + fetches duplicados no boot
- **Impacto:** cada keystroke em qualquer formulário re-renderiza todas as páginas consumidoras de `useAppState()`; no boot, Profile/Insights são buscados 2x.
- **Evidência:** `lib/state/app-state-context.tsx:1498-1551` — value literal não memoizado com ~22 `useState` (`:237-271`); `lib/state/sync-engine.ts:49-52` vs `app-state-context.tsx:443-459` (refetch duplicado).
- **Recomendação:** separar `AppStateDataContext` (memoizado) e `AppStateActionsContext` (estável); `runBootstrap` retorna profile/insights/summary.

### P1-9. Lint falha: erro real em `convite/page.tsx`
- **Impacto:** gate `pnpm lint` vermelho no workspace PWA.
- **Evidência:** `app/convite/page.tsx:46` — `react-hooks/set-state-in-effect` (setState direto no effect); warnings: `agent-client.test.ts:159`, `workspaces.test.ts:4`, `middleware.ts:37` (disable unused).
- **Recomendação:** mover a validação de token para render condicional/handler; limpar warnings.

## 4. Achados — P2 (seleção com maior impacto)

| # | Achado | Evidência | Recomendação |
|---|---|---|---|
| P2-1 | Conta criada sempre `kind:"bank"`; cor escolhida descartada — corrompe relatórios por tipo | `features/accounts/AccountsPage.tsx:70` (todos os ramos `"bank"`; `bankColor:63` nunca enviado) | mapear checking/savings/investment para os kinds reais da API e passar `bankColor` |
| P2-2 | 401 fora do AppState não expira sessão (CardsPage, Audit, Pending, Adoption) — tela trava sem login | `lib/api/client.ts:127-136` (só fecha sockets); `features/cards/CardsPage.tsx:592-594` (`.catch(() => setStmtDetail(null))`), `:605-607` (`catch {}` vazio) | centralizar reação a 401 no `apiFetch` (evento/callback) |
| P2-3 | Double-submit fire-and-forget: sheets de contas/categorias fecham antes do await; erro invisível | `features/accounts/AccountsPage.tsx:66-76`, `features/categories/CategoriesPage.tsx:18-23` | `await onSave(...)` + manter dirty em falha (padrão PayablesPage.tsx:55-75) |
| P2-4 | HomePage "Tentar novamente" é no-op (refresh RSC não refaz client bootstrap bloqueado por `loadedRef`) | `features/home/HomePage.tsx:448-451`; `app-state-context.tsx:418` | usar reload (como StaleBanner default, `components/StaleBanner.tsx:15-19`) ou refetch real |
| P2-5 | SubscriptionsPage sem loading/erro de fetch; WalletPage sem WriteErrorBanner/StaleBanner | `features/subscriptions/SubscriptionsPage.tsx:427-441`; `features/wallet/WalletPage.tsx:37-88` | adotar os banners padrão |
| P2-6 | `/pending` e `/pendentes` duplicadas; `/pendentes` sem nenhum link (código morto, confunde i18n EN/PT) | `app/pendentes/page.tsx`, `app/pending/page.tsx`; nav usa `/pending` (`components/SidebarRail.tsx:37`) | redirect 308 `/pendentes` → `/pending` ou remover |
| P2-7 | Labels visuais sem `htmlFor`/`id` em formulários-chave (a11y + autofill) | `components/TransactionEditSheet.tsx:103-181`, `NewTransactionSheet.tsx:882-894,1057-1072` | usar `components/ui/Input.tsx` (faz certo, `:38-59`) |
| P2-8 | Contraste `--text-muted` ≈ 3.4:1 (AA exige 4.5:1) em textos de 9.5–12px | `app/globals.css:93,157`; uso em `NewTransactionSheet.tsx:622`, `SidebarRail.tsx:62` | escurecer token light / clarear dark (~#6B776D) |
| P2-9 | Stale após approve/reject em `/pending` (domínios não recarregados) | `features/pending-operations/PendingOperationsPage.tsx:106,121`; bootstrap único `app-state-context.tsx:418` | invalidar/refetch dos domínios afetados |
| P2-10 | Proxies: sem timeout já em P1-7; RUM é escrita sem auth/origin/rate-limit | `app/api/observability/rum/route.ts:66-91` (sem auth; `buildId` sem cap) | exigir same-origin, cap de tamanho, rate limit |
| P2-11 | Cobertura de testes por lista estática congelada; feature price-alerts inteira sem teste | `vitest.config.ts:10-47` (lista "files changed in cb57847e..HEAD") | incluir `src/**` menos config |
| P2-12 | CardsPage: `onPay` sem statement selecionado fecha o sheet em silêncio | `features/cards/CardsPage.tsx:857-860` | validar e mostrar erro |
| P2-13 | Dark mode default hardcoded `dark` (ignora `prefers-color-scheme` até escolha explícita) | `lib/theme/theme-script.ts:6`, `theme-provider.tsx:29` | default "system" |
| P2-14 | Div clicável sem teclado (sem role/tabIndex/onKeyDown) em Goals/Cards | `features/goals/GoalsPage.tsx:385,528`, `features/cards/CardsPage.tsx:692,790` | `role="button"` + teclado ou `<button>` |

## 5. Achados — P3 (seleção)

- Badge de notificação fixo na Home, sem dado por trás (`features/home/HomePage.tsx:508-511`).
- Badge de convites colide com FAB do TED em mobile (`AppShell.tsx:324` vs `TedChatLauncher.tsx:16`); e é `aria-label` em `div` sem role (`:324`).
- Ícones duplicados na navegação (wallet para Contas e Patrimônio; folder-open para Categorias e Workspaces) (`SidebarRail.tsx:27,30,35,36`).
- "Limpar filtros" de `/registros` não reseta `accountFilter` nem datas (`features/records/RecordsPage.tsx:459-469`).
- `updateBudget` ignora `alertThreshold` no merge otimista (`app-state-context.tsx:1196-1207`).
- Terminologia inconsistente: "Tentar novamente" vs "Tentar de novo" (`StaleBanner.tsx:86` vs `WriteErrorBanner.tsx:34`); nav "A pagar" vs página "Contas a pagar".
- `StatusBar` deprecated ainda montado em 2 telas (`HomePage.tsx:446`, `WorkspaceManagerPage.tsx:324`).
- Manifest sem `id`/`scope`; só 1 shortcut (`app/manifest.ts:13-67`).
- Sem UX de instalação (`beforeinstallprompt` = 0 hits) — sugerir CTA em `/perfil`.
- `style-src 'unsafe-inline'` no CSP (`lib/middleware/proxy-utils.ts:63`) — compromisso Tailwind; considerar nonces para styles.
- CacheFirst de `/_next/static` sem ExpirationPlugin (`sw.ts:91`).
- Stryker cobre só `snapshot-db.ts`; sem mutação em `commands.ts`/`client.ts` (`vitest.stryker.config.ts:4-6`).
- `rawFetch` é código morto (só o próprio teste importa) (`lib/api/fetch-core.ts:15`).
- Kill-switch probe `/pwa-control` sem `.catch` no SW → navegação offline falha em vez de cair no shell (`sw.ts:229-250`).
- `force-dynamic` no layout raiz desliga shell estático (`app/layout.tsx:7-8`).
- Origem local no proxy do agent por substring (`includes("127.0.0.1")` aceita `127.0.0.1.evil.com`) — reusar `isLocalOrigin` do backend (`app/api/agent/[...path]/route.ts:37`).

## 6. Pontos fortes (para calibrar o review)

- AuthGate robusto (401 → logout, erro de rede com token → desbloqueio offline) (`features/auth/AuthGate.tsx:31-49`).
- Optimistic updates com rollback consistente em ~15 mutators (`app-state-context.tsx`).
- `WriteErrorBanner`/`StaleBanner` com `role` correto aplicados na maioria das telas.
- `/convite` e `/pending` exemplares em loading/erro/empty/duplo-submit.
- SW com update flow decente (dirty-gated `skipWaiting`, kill-switch remoto) (`lib/sw-coordinator.tsx:47-57,106-119`).
- Proxy `/api/backend` sem double-encoding, streaming e cookies corretos (testado em `app/api/backend/[...path]/route.test.ts:32-35`).
- Tabs com roving tabindex + setas (`components/ui/Tabs.tsx:28-42`); zero `text-gray-*` (tokens semânticos).
- lucide-react por ícone nomeado; skeletons presentes; sem libs de data (Intl nativo).

## 7. Não verificado (limitações desta auditoria)

- **Runtime de navegador:** erros de console/medidas reais de re-render e bundle não foram capturados (browser tool bloqueia `127.0.0.1`); análise de performance é estática.
- **Testes não executados nesta sessão** (typecheck e lint executados; suíte vitest/Playwright não rodada — proporcionalidade); qualidade avaliada estaticamente.
- **Contraste**: valores calculados a partir dos tokens em `globals.css`, não medidos em screenshot.
- **Comportamento no runtime Cloudflare** dos proxies (timeout/500) é inferência do código, não reproduzida.
- **CSP `unsafe-inline`/nonce em styles**: impacto real não medido.

## 8. Ordem sugerida de correção (top 6)

1. Idempotency-Key automática + disabled durante save (P0-1) — dinheiro.
2. Fail-closed do mock mode (P0-2) — dados falsos em produção.
3. `viewportFit: "cover"` + safe-area nos fixed elements (P0-3) — PWA iOS.
4. Remount do AppState por workspace (P1-1) — isolamento.
5. 401 global no `apiFetch` + erros engolidos em Cards/Adoption (P2-2) — sessão travada.
6. `useDialogA11y` comum + z-index do confirm (P1-2/P1-3) — acessibilidade bloqueante.