# PWA Companion App — Implementation Plan

**Data:** 2026-06-14
**Spec:** `docs/superpowers/specs/2026-06-14-pwa-companion-design.md`
**API:** `pi-finance-api` (completa, sem alterações necessárias)
**iOS repo:** pausado (`pi-finance-ios` preservado como referência)
**Bridge:** `apps/whatsapp-bridge` intocado

## Resumo do Estado Atual

| Componente | Estado |
|---|---|
| `pi-finance-api` | ✅ Completo (read + write + auth + dashboard premium) |
| `pi-finance-ios` | ⏸️ Pausado (código preservado) |
| `apps/whatsapp-bridge` | ⛔ Intocado |
| PWA spec | ✅ `docs/superpowers/specs/2026-06-14-pwa-companion-design.md` |
| PWA repo | ❌ Não criado (`/d/projetos/pi-finance-web`) |

## Stack Alvo

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node ≥20 | LTS |
| Framework | React 19 + Vite 6 | latest |
| Language | TypeScript 5.7+ | strict |
| PWA | vite-plugin-pwa (Workbox 7) | latest |
| UI | Tailwind CSS 4 + shadcn/ui | latest |
| Data | TanStack Query 5 + Zod 3 | latest |
| Forms | React Hook Form 7 + @hookform/resolvers | latest |
| Charts | Recharts 2 | latest |
| Auth | localStorage + IndexedDB (idb-keyval) | — |
| Test | Vitest + Testing Library + MSW + Playwright | latest |
| Deploy | Cloudflare Pages / Vercel | — |

## Slices

### SLICE-0 — Scaffold + repo

**Duração estimada:** 1h
**Objetivo:** inicializar repositório local e remoto com stack completa funcionando.

Tarefas:
1. Criar repo local `/d/projetos/pi-finance-web` com `git init`.
2. `npm create vite@latest pi-finance-web -- --template react-ts` ou scaffold manual.
3. Instalar dependências: `tailwindcss @tailwindcss/vite`, `vite-plugin-pwa`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod`, `recharts`, `lucide-react`.
4. Adicionar shadcn/ui via `npx shadcn@latest init`.
5. Configurar `vite.config.ts`: PWA plugin com `registerType: 'autoUpdate'`, Tailwind, alias `@/`.
6. Criar `public/manifest.json` com `"display": "standalone"`, `"theme_color"`, ícones placeholder.
7. Criar `.github/workflows/ci.yml`: `pnpm install && pnpm typecheck && pnpm test`.
8. Commit: `feat: scaffold pi-finance-web with Vite + React + PWA + Tailwind`.
9. Criar repo privado `Kusts/pi-finance-web` e pushar.

**Critério:** `pnpm dev` abre página React com título "Pi Financeiro" e service worker registrado.

---

### SLICE-1 — Auth + PIN + API client

**Duração estimada:** 3h
**Objetivo:** fluxo completo de autenticação e cliente HTTP tipado.

Tarefas:
1. Criar `src/lib/api-client.ts`: wrapper sobre `fetch` com `X-Device-Token` header, tipagem genérica, erros PT-BR (`ApiError`).
2. Criar `src/lib/auth.ts`: `registerDevice(name)`, `getMe()`, `revokeToken()`, `AuthProvider` React context.
3. Criar `src/lib/pin.ts`: `hashPin(pin)`, `verifyPin(pin, hash)`, `setPinHash(hash)`, `getPinHash()` — SHA-256 + salt.
4. Criar `src/components/auth/PinGate.tsx`: tela de PIN (4 dígitos, teclado numérico virtual, feedback visual).
5. Criar `src/components/auth/DeviceSetup.tsx`: formulário de primeiro registro (nome do dispositivo), chama `POST /auth/devices/register`, salva token em `localStorage`.
6. Criar `src/components/auth/AuthGate.tsx`: wrapper que decide entre DeviceSetup → PinGate → children.
7. Criar `src/lib/token-store.ts`: `getToken()`, `setToken()`, `clearToken()` (localStorage + IndexedDB fallback via `idb-keyval`).
8. Testes unitários: `pin.test.ts` (hash/verify), `token-store.test.ts`, `api-client.test.ts` (MSW mock).
9. Testes de componente: `PinGate.test.tsx` (digitação, submit, erro), `DeviceSetup.test.tsx`.

**Critério:** fluxo completo navegável: abrir app → DeviceSetup → inserir PIN → salvar token → reabrir → PinGate → dashboard vazio.

---

### SLICE-2 — API client CRUD + TanStack Query hooks

**Duração estimada:** 2h
**Objetivo:** hooks tipados para todas as operações de API, com cache e mutations.

Tarefas:
1. Criar `src/hooks/use-accounts.ts`: `useAccounts()`, `useCreateAccount()`, `useUpdateAccount()`, `useDeactivateAccount()`.
2. Criar `src/hooks/use-categories.ts`: `useCategories()`, `useCreateCategory()`, `useUpdateCategory()`, `useDeactivateCategory()`.
3. Criar `src/hooks/use-transactions.ts`: `useTransactions(filters)`, `useCreateExpense()`, `useCreateIncome()`, `useCreateTransfer()`, `useUpdateTransaction()`, `useDeleteTransaction()`.
4. Criar `src/hooks/use-dashboard.ts`: `useDashboardSummary()`, `useQuickInsights()`.
5. Cada hook usa `@tanstack/react-query` com `staleTime: 30_000` para reads e `onSuccess: invalidateQueries` para writes.
6. Testes de integração: cada hook com MSW mock da API, valida cache hit/miss.

**Critério:** `pnpm test` cobre todos os hooks com dados mockados da API.

---

### SLICE-3 — Dashboard (Início)

**Duração estimada:** 3h
**Objetivo:** tela Início completa com cards, gráficos e insights.

Tarefas:
1. Criar `src/components/dashboard/BalanceCard.tsx`: saldo total formatado (BRL).
2. Criar `src/components/dashboard/MonthCard.tsx`: receitas/despesas/saldo do mês com variação vs mês anterior.
3. Criar `src/components/dashboard/CashFlowCard.tsx`: fluxo 30 dias com mini bar chart (Recharts).
4. Criar `src/components/dashboard/TopCategoriesCard.tsx`: ranking de categorias de despesa com barras horizontais.
5. Criar `src/components/dashboard/TopExpensesCard.tsx`: lista das 5 maiores despesas.
6. Criar `src/components/dashboard/InsightsCard.tsx`: cards de insight com severity pill.
7. Criar `src/components/dashboard/AlertsBanner.tsx`: banner de alertas (saldo negativo, overspend).
8. Criar `src/pages/InicioPage.tsx`: compõe todos os cards acima, com loading/error/empty states.
9. Criar `src/components/ui/skeleton-card.tsx` (shadcn Skeleton wrapper).
10. Testes de componente: cada card renderiza dados mockados, estados de loading/error.

**Critério:** tela Início renderiza dashboard completo com dados da API, responsivo mobile/desktop.

---

### SLICE-4 — Registros (lista + CRUD)

**Duração estimada:** 4h
**Objetivo:** tela de lançamentos com lista, filtros e CRUD completo.

Tarefas:
1. Criar `src/pages/RegistrosPage.tsx`: layout com search bar, filter strip, lista agrupada por data.
2. Criar `src/components/transactions/TransactionList.tsx`: lista infinita com `useInfiniteQuery`, agrupamento por data.
3. Criar `src/components/transactions/TransactionRow.tsx`: valor colorido (verde/vermelho/azul), ícone de tipo, data.
4. Criar `src/components/transactions/TransactionFilters.tsx`: sheet/modal com filtros (data, conta, categoria, tipo, valor, busca).
5. Criar `src/components/transactions/CreateExpenseDialog.tsx`: formulário React Hook Form + Zod, campos: valor BRL, descrição, data, conta, categoria.
6. Criar `src/components/transactions/CreateIncomeDialog.tsx`: mesmo padrão, categorias de receita.
7. Criar `src/components/transactions/CreateTransferDialog.tsx`: campos: valor, descrição, data, conta origem, conta destino.
8. Criar `src/components/transactions/TransactionDetailSheet.tsx`: visualização completa com botão editar e excluir.
9. Criar `src/components/transactions/EditTransactionSheet.tsx`: formulário pré-preenchido, validação, submit.
10. Criar `src/components/ui/global-fab.tsx`: botão flutuante "+" com menu (despesa/receita/transferência).
11. Testes de componente: formulários com validação, diálogo de confirmação de exclusão, filtros.

**Critério:** fluxo completo: filtrar → ver lista → criar despesa → ver na lista → editar → excluir → lista atualizada.

---

### SLICE-5 — Carteira

**Duração estimada:** 2h
**Objetivo:** tela de contas, categorias e transferências recentes.

Tarefas:
1. Criar `src/pages/CarteiraPage.tsx`: layout com seções de contas, categorias e transferências.
2. Criar `src/components/accounts/AccountList.tsx`: cards com saldo, ícone do banco, menu de ações.
3. Criar `src/components/accounts/CreateAccountDialog.tsx`: formulário de nova conta (nome, tipo, saldo inicial).
4. Criar `src/components/accounts/AccountRenameSheet.tsx`: renomear conta.
5. Criar `src/components/accounts/AccountDeactivateAlert.tsx`: diálogo de confirmação.
6. Criar `src/components/categories/CategoryList.tsx`: lista com dot colorido (despesa/receita).
7. Criar `src/components/categories/CreateCategoryDialog.tsx`: formulário de nova categoria.
8. Criar `src/components/transfers/RecentTransfers.tsx`: lista das últimas 10 transferências.
9. Testes de componente: cards de conta, diálogos de criação/renomeação/desativação.

**Critério:** tela Carteira mostra contas com saldo, categorias, e transferências recentes; CRUD de conta/categoria funcional.

---

### SLICE-6 — PWA + offline cache

**Duração estimada:** 2h
**Objetivo:** PWA instalável, cache offline para leitura, fallback offline UI.

Tarefas:
1. Configurar `vite-plugin-pwa`: `workbox.runtimeCaching` com `staleWhileRevalidate` para API GET, `NetworkFirst` para página HTML.
2. Criar `public/manifest.json` com ícones reais (SVG ou PNG 192x192 + 512x512).
3. Criar `public/sw.js` (ou deixar Workbox gerar automaticamente).
4. Criar `src/components/OfflineBanner.tsx`: badge "Você está offline" quando `navigator.onLine === false`.
5. Criar `src/hooks/use-network-status.ts`: hook reativo para online/offline.
6. Configurar TanStack Query `networkMode: 'offlineFirst'` para permitir cache em modo offline.
7. Teste E2E com Playwright: verificar que service worker registra, que página carrega offline, que dados cacheados aparecem.

**Critério:** PWA instalável, Lighthouse PWA score ≥90, dashboard carrega offline com dados cacheados.

---

### SLICE-7 — Deploy + HTTPS

**Duração estimada:** 1h
**Objetivo:** deploy estático com HTTPS para desenvolvimento.

Tarefas:
1. Deploy para Cloudflare Pages via `wrangler pages deploy dist` ou Vercel via CLI.
2. Configurar `FINANCE_API_BASE` como variável de ambiente no deploy (apontando para Cloudflare Tunnel).
3. Configurar domínio customizado (ex: `pwa.pi-financeiro.local`) ou usar URL do Cloudflare Pages.
4. Testar fluxo completo: instalar PWA no iPhone/Android → abrir → registrar → usar offline.
5. Documentar setup no `README.md` do repo.

**Critério:** PWA acessível via HTTPS, instalável, funcional.

## Progresso Planejado

| Slice | Descrição | Estimativa | Status |
|---|---|---|---|
| SLICE-0 | Scaffold + repo | 1h | ✅ concluído (`40e28e4`) |
| SLICE-1 | Auth + PIN + API client | 3h | ✅ concluído (`7c74bbb`) |
| SLICE-2 | API client CRUD + hooks | 2h | ✅ concluído (`90768df`) |
| SLICE-3 | Dashboard (Início) | 3h | ✅ concluído (`863101d`…`5042797`, design) |
| SLICE-4 | Registros (CRUD) | 4h | ✅ concluído (`8137537`) |
| SLICE-5 | Carteira | 2h | ✅ concluído (`fda65d0`) |
| SLICE-6 | PWA + offline | 2h | ✅ concluído (`1b15895`) |
| SLICE-7 | Deploy + HTTPS | 1h | ⚠️ parcial — docs/instruções prontas (`7aaf244`), deploy real não confirmado |

**Total estimado:** 18h

> **Status 2026-06-15:** V1 concluído e verificado (typecheck + 21 testes + build ok). Divergências de arquitetura, REQs parciais (REQ-4/6/7/11) e pendências documentados em `docs/superpowers/specs/2026-06-14-pwa-companion-design.md` → seção *Status de implementação (as-built)*. Obs.: a numeração de SLICE nas mensagens de commit difere desta tabela (ex.: Registros foi commitado como "SLICE-3").

## File map (alvo)

```
src/
├── lib/
│   ├── api-client.ts          # fetch wrapper tipado
│   ├── auth.ts                # AuthProvider, register, me, revoke
│   ├── pin.ts                 # hash/verify PIN
│   └── token-store.ts         # localStorage + IndexedDB
├── hooks/
│   ├── use-accounts.ts
│   ├── use-categories.ts
│   ├── use-transactions.ts
│   ├── use-dashboard.ts
│   └── use-network-status.ts
├── components/
│   ├── ui/                    # shadcn/ui + custom (global-fab, skeleton-card, offline-banner)
│   ├── auth/                  # PinGate, DeviceSetup, AuthGate
│   ├── dashboard/             # BalanceCard, MonthCard, CashFlowCard, ...
│   ├── transactions/          # TransactionList, TransactionRow, forms, dialogs
│   ├── accounts/              # AccountList, dialogs
│   ├── categories/            # CategoryList, dialogs
│   └── transfers/             # RecentTransfers
├── pages/
│   ├── InicioPage.tsx
│   ├── RegistrosPage.tsx
│   └── CarteiraPage.tsx
├── App.tsx                    # rotas + AuthGate + layout
└── main.tsx                   # entry + QueryClientProvider + PWA register
```

## Boundary verification

- [ ] `apps/whatsapp-bridge` intocado
- [ ] `pi-finance-api` sem alterações (apenas leitura de contratos)
- [ ] `pi-finance-ios` pausado, não deletado
- [ ] Novo repo `pi-finance-web` isolado
- [ ] Sem hardcoded secrets no código

---

*Gerado por worker1 — 2026-06-14.*
