# Matriz de Triagem P1/P2 — Auditoria PWA — 2026-09-02

**Executor:** Coder 1 (dispatch `ctx_fc665e745f5d`, task `task_0751051da10f`)
**Escopo:** somente leitura + este relatório. Nenhum código/config/dado alterado.
**Base:** `2026-09-02-pwa-static-product-frontend-audit.md`, `2026-09-02-pwa-runtime-audit.md`, `2026-09-02-pwa-audit-review.md`, conferidos contra o worktree atual.

**Contexto do worktree no momento da triagem:** P0-1 (idempotência) já remediado em `endpoints.ts`/`commands.ts` + testes; P0-2 (fail-closed mock — `ApiUnconfiguredScreen`) e P0-3 (`viewportFit: "cover"` + `viewport.test.ts`) já remediados por trabalho em andamento NÃO commitado (`layout.tsx`, `RootProviders.tsx`, `RootProviders.test.tsx` dirty). Ondas abaixo devem evitar `RootProviders.tsx` até o merge do trabalho P0.

## 1. Matriz P1

| ID | Achado | Status | Arquivo(s)/símbolo(s) | Teste de regressão indicado |
|---|---|---|---|---|
| P1-1 | Troca de workspace exibe dado stale em memória | **CONFIRMADO** | `components/RootProviders.tsx:54` (`AppStateProvider` sem `key={activeWorkspaceId}`); `lib/state/app-state-context.tsx:418` (`loadedRef` bloqueia re-bootstrap) | Teste de provider: trocar `activeWorkspaceId` e afirmar remontagem + refetch com estado zerado |
| P1-2 | Modais sem a11y (trap/Escape/restore/scroll-lock) | **CONFIRMADO (parcial)** | `components/ConfirmActionDialog.tsx:40-50` (sem Escape, sem `aria-labelledby`, sem trap); `ui/Dialog.tsx` e `ui/BottomSheet.tsx` já têm Escape + testes, mas seguem sem portal/trap; scroll-lock sobrescrito (`BottomSheet.tsx:22-31`) | `ConfirmActionDialog`: Escape fecha, título exposto (`aria-labelledby`), foco restaurado; scroll-lock com contador |
| P1-3 | Confirm renderiza sob o BottomSheet | **CONFIRMADO** | `ConfirmActionDialog.tsx:40` (`z-30`) vs `ui/BottomSheet.tsx:52,61` (`z-40`/`z-50`) | DOM: com sheet + confirm abertos, confirm acima (z-60) — snapshot de classes |
| P1-4 | BottomNav `router.push` em vez de `Link` | **REBAIXADO (P2)** pelo review | `BottomNav.tsx:43-63`, `AppShell.tsx:288-294` | Render: âncora com `href` + guard `onNavigate` preservado |
| P1-5 | `router.back` inexistente / "Voltar" empilha | **REBAIXADO (P3)** pelo review | `ProfilePage.tsx:236` | — (não agendar agora) |
| P1-6 | Offline shell nunca invalida | **CONFIRMADO** | `sw.ts:78-79` (`revision: null` p/ `OFFLINE_HTML` e `OFFLINE_JS`) | Unit do precache manifest: revision = hash do build (fixture de build) |
| P1-7 | Proxies sem timeout upstream, erro opaco | **CONFIRMADO** | `app/api/backend/[...path]/route.ts:58-63` (sem `AbortSignal.timeout`/try-catch no proxy); `app/api/agent/[...path]/route.ts:48` idem | Mock fetch pendurado → 504 JSON; fetch rejeita → 502 JSON com log estruturado |
| P1-8 | God-context re-render + fetches duplicados no boot | **CONFIRMADO** | `app-state-context.tsx:1500` (value inline, ~22 useState), `sync-engine.ts:51-52` vs `app-state-context.tsx:443-449` (profile/insights 2x) | Spy em `fetchProfile`: 1 chamada por boot; contagem de renders do consumidor após keystroke |
| P1-9 | Lint vermelho (`convite/page.tsx`) | **CONFIRMADO** (reproduzido em `pnpm lint` nesta sessão, 17:16) | `app/convite/page.tsx:46` (`set-state-in-effect`) + warnings `agent-client.test.ts:159`, `workspaces.test.ts:4`, `middleware.ts:37` | Gate: `pnpm --filter pwa lint` verde |

## 2. Matriz P2 (seleção auditada)

| ID | Achado | Status | Arquivo(s)/símbolo(s) | Teste de regressão indicado |
|---|---|---|---|---|
| P2-1 | Conta sempre `kind:"bank"`, cor descartada | **CONFIRMADO** | `features/accounts/AccountsPage.tsx:70` (ternário tudo `"bank"`), `bankColor` só vira nome (`:67`). **Atenção:** `AccountsPage.test.tsx:173,195` congela o comportamento errado — atualizar no fix | `onAdd` recebe kind mapeado (checking/savings/investment) + `bankColor` propagado |
| P2-2 | 401 fora do AppState não expira sessão | **CONFIRMADO** | `lib/api/client.ts:127-136` (só fecha sockets); `features/cards/CardsPage.tsx:594,605` (+ catches vazios `:139,264,394,492`) | `apiFetch` com 401 dispara expiração global; CardsPage trata `ApiError` 401 |
| P2-3 | Fire-and-forget em sheets de contas/categorias | **CONFIRMADO** | `features/categories/CategoriesPage.tsx:138,270`; `features/accounts/AccountsPage.tsx:192` | `onSave` rejeitando → sheet permanece aberta com erro (padrão PayablesPage) |
| P2-4 | Retry da Home é no-op | **INCONCLUSIVO / reavaliar pós P1-1** | CTA já existe e é testado (`HomePage.test.tsx:141` — `router.refresh`); eficácia depende de `loadedRef` (P1-1) | Verificação runtime: refresh dispara refetch de dados client |
| P2-5 | Páginas sem banners padrão | **PARCIALMENTE RESOLVIDO** | `SubscriptionsPage.tsx:477-479` agora tem `WriteErrorBanner`+`StaleBanner`; `WalletPage.tsx` segue sem (grep 0 hits) | Render WalletPage com `writeError`/stale → banners visíveis |
| P2-6 | `/pendentes` e `/pending` duplicadas | **CONFIRMADO** | `app/pendentes/page.tsx` + `app/pending/page.tsx`; nav usa `/pending` (`SidebarRail.tsx:37`, `AppShell.tsx:230`) | Redirect 308 `/pendentes` → `/pending` (teste de rota) |
| P2-7 | Labels sem `htmlFor`/`id` | **CONFIRMADO** | `NewTransactionSheet.tsx:422,530,935` (label sem associação); `ui/Input.tsx:38-59` é o padrão correto | `getByLabelText` nos campos dos sheets |
| P2-8 | Contraste `--text-muted` ≈ 3.4:1 | **CONFIRMADO (cálculo estático)** | `app/globals.css:93` (`#828E85`), `:157` (dark `#667269`) | Unit: parse dos tokens e ratio ≥ 4.5:1 vs `--background` |
| P2-9 | Stale após approve/reject em `/pending` | **CONFIRMADO** | `PendingOperationsPage.tsx:106-107,121-122` (só remove item local; nenhum refetch de domínios) | Aprovar → invalidação/refetch das entidades afetadas (transação/conta) |
| P2-10 | RUM sem same-origin/auth/rate-limit | **CONFIRMADO** | `app/api/observability/rum/route.ts` (sanitização ALLOWED_KEYS existe; sem origin/limit/cap) | POST cross-origin → 403; body oversize → 413 |
| P2-11 | Cobertura por lista estática congelada | **CONFIRMADO** | `vitest.config.ts:4` (`cb57847e..HEAD`), `:89` (`include: CHANGED_PRODUCTION`) | Config: `include: src/**` (menos config/test) e coverage rodando |
| P2-12 | `onPay` sem statement fecha sheet em silêncio | **CONFIRMADO** | `features/cards/CardsPage.tsx:857-859` (`if (selectedStatementId) return ...`) | `onPay` sem statement → erro visível, sheet aberta |
| P2-13 | Dark default hardcoded | **CONFIRMADO** | `lib/theme/theme-script.ts:6` (`: 'dark'`), `theme-provider.tsx:29` (`defaultTheme = "dark"`) | Sem stored + `prefers-color-scheme: light` → resolvedTheme `light` |
| P2-14 | Div clicável sem teclado | **CONFIRMADO** | `features/goals/GoalsPage.tsx:385,528` (`div.cursor-pointer onClick`, sem role/tabIndex); CardsPage análogo | Card focável: `role="button"` + Enter/Space abre detalhe |

## 3. Colisões de arquivo

| Arquivo | Itens que o tocam | Onda única |
|---|---|---|
| `lib/state/app-state-context.tsx` | P1-1, P1-8, P2-4, P2-9 | A |
| `components/RootProviders.tsx` | P1-1 (**+ P0-2 em andamento, não commitado** — aguardar merge) | A |
| `lib/api/client.ts` | P2-2 (expiração global), já tocado por P0-1 (somente leitura) | A |
| `components/ConfirmActionDialog.tsx`, `ui/Dialog.tsx`, `ui/BottomSheet.tsx` | P1-2, P1-3 | B |
| `features/accounts/AccountsPage.tsx` | P2-1, P2-3 | B |
| `features/cards/CardsPage.tsx` | P2-2, P2-12, P2-14 | B (P2-2 via client.ts central reduz o toque) |
| `app/api/backend/[...path]/route.ts`, `app/api/agent/[...path]/route.ts` | P1-7 (agent também tem o achado P3 do `includes("127.0.0.1")`) | C |
| `sw.ts` | P1-6 | C |
| `app/convite/page.tsx` | P1-9 | C |

## 4. Ondas paralelizáveis (máx. 3)

**Onda A — Estado & Sessão** (núcleo: `app-state-context`/`client.ts`):
P1-1 (remount por workspace — após merge do P0-2), P1-8 (contextos separados + dedupe de fetches), P2-2 (401 central no `apiFetch`), P2-9 (invalidação pós-approve), reavaliar P2-4 após P1-1.

**Onda B — UI & A11y** (núcleo: `components/ui` + sheets/features):
P1-3 + P1-2 (z-index e `useDialogA11y` comum), P2-1 + P2-3 (Accounts/Categories), P2-7, P2-12, P2-13, P2-14, P2-5 (WalletPage), P1-4 (rebaixado, se houver capacidade).

**Onda C — Plataforma, SW & Proxies** (núcleo: `sw.ts`, rotas `app/api/**`, lint):
P1-6 (revision do shell), P1-7 (timeout/502 nos dois proxies), P2-10 (RUM hardening), P2-6 (redirect 308), P2-11 (vitest include), P1-9 (lint convite + warnings).

Sequência recomendada: A primeiro (isolamento de dados — maior risco financeiro residual), B e C em paralelo; P1-1 só entra após o merge do trabalho P0 dirty em `RootProviders.tsx`.
