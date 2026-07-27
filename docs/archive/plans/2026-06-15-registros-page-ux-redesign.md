# Registros Page UX Redesign — Implementation Plan

**Data:** 2026-06-15
**Spec:** `docs/superpowers/specs/2026-06-15-registros-page-ux-redesign.md`
**Repositório:** `D:\projetos\pi-finance-web` (separado deste monorepo)
**Branch:** `main` · `origin/main` no commit `7e7a76f` (push 2026-06-15).

## Resumo do Estado Atual (pré-redesign)

| Componente | Estado |
|---|---|
| `RecordsPage` | V1 funcional (lista paginada, criar/editar/excluir) |
| Filtros | Apenas `kind` (expense/income/transfer) e `accountId` |
| Quick actions | Não existia (form só via menu) |
| Edição | Inline simples, sem sheet dedicado |
| Exclusão | Sem confirmação |
| Cards | Misturados, sem distinção visual |
| Estilo | Desalinhado da `HomePage` (sem teal, espaçamento inconsistente) |
| Formulários | Sem validação client-side, sem retry estruturado |

## Stack Alvo (sem mudanças vs V1)

- React 19 + Vite 8 + TypeScript 6
- TanStack Query 5
- React Hook Form 7 + Zod 4
- Tailwind 4 + `lucide-react`
- **Sem dependência nova** (apenas organização interna)

## Slices (as-built, retroativo)

### SLICE-R0 — Spec + plan docs

**Objetivo:** documentar decisões e requisitos EARS **antes** da execução.

Tarefas:
1. Criar `docs/superpowers/specs/2026-06-15-registros-page-ux-redesign.md` (decisões D1–D14, REQ-R1..R20).
2. Criar `docs/superpowers/plans/2026-06-15-registros-page-ux-redesign.md` (este doc).

**Onde:** em `pi-financeiro\docs\superpowers\` (vault de docs do projeto, mesmo lugar das specs/plans 06-14 PWA companion).

**Status:** ✅ criado em 2026-06-15.

---

### SLICE-R1 — Layout A + quick actions

**Objetivo:** aplicar decisão de layout (mês atual default + expansão on-demand) e quick actions topo.

Tarefas:
1. Reorganizar `RecordsPage.tsx`: search bar topo, 3 QuickButtons abaixo, lista agrupada.
2. `groupByDate(items)` puro helper, ordena DESC por `t.date`.
3. Estado local: `filters`, `query`, `showFilters`, `formMode`, `editTx`, `deleteId`.
4. QuickButtons com `disabled={!online}` (REQ-R6).
5. Estilo: `.card`, `--color-accent`, ícones Lucide (`ArrowDownCircle`, `ArrowUpCircle`, `ArrowLeftRight`).
6. `sessionStorage` para deep-link de quick action da Home (`pi-finance:pending-action`).

**Critério:** página navegável com botões, sem sheets ainda, mobile-first.

**Commit:** `5042797 design: real reorg of Records + Wallet pages` (parte de Records).

---

### SLICE-R2 — Painel de filtros inline

**Objetivo:** filtros aplicáveis combinados (AND) com botão "Limpar".

Tarefas:
1. Adicionar state `showFilters` + painel condicional abaixo da search bar.
2. `Select` reutilizável (label + `<select>` estilizado).
3. `Fld` reutilizável (label + `<input type>`).
4. 6 filtros: **Tipo, Conta, Categoria, mín/máx valor, De/Até data, busca textual** (busca fica na search bar, fora do painel).
5. `hasActiveFilters(filters)` + botão "Limpar filtros" condicional.
6. `parseAmountToCents()` (futuro helper de `amount.ts`) inline até SLICE-R4.

**Critério:** combinar 3+ filtros simultâneos, lista reage corretamente, "Limpar" zera tudo.

**Commit:** `5042797` (parte de).

---

### SLICE-R3 — Polimento visual (teal/clean, alinhamento com Home)

**Objetivo:** casar visual com `HomePage.tsx` e tokens de `index.css`.

Tarefas:
1. **Tipografia:** mesma escala da Home (text-[11px] uppercase tracking-wide para labels, text-sm font-medium para conteúdo).
2. **Cores:** tokens `--color-expense` (#DC2626), `--color-income` (#059669), `--color-transfer` (#2563EB), `--color-accent` (#0f766e).
3. **Cards:** `.card` com borda `--color-border`, sombra sutil (`shadow-[0_1px_3px_rgba(0,0,0,0.04)]`).
4. **Espaçamento:** `space-y-4 pb-4` na raiz, `space-y-1` dentro do grupo, `gap-2` entre QuickButtons.
5. **Empty state:** ícone `Sparkles` + texto "Nenhum lançamento" + hint "Use os botões acima para começar."
6. **Backgrounds por tipo:** `bg-red-50` (expense), `bg-green-50` (income), `bg-blue-50` (transfer) nos ícones de 9×9 rounded-lg.

**Commits:**
- `48a9f3b design: dynamic Y-axis scale, Records + Wallet visual alignment`
- `b035e45 design: LineChart cash flow + account icons by name heuristic`
- `f273585 design: BarChart polish, account balance cards, MoM comparison cards`

---

### SLICE-R4 — Sheets RHF + Zod + retry

**Objetivo:** formulários criar/editar/transferir com React Hook Form + Zod, safe retry, mensagens PT-BR, idempotency-key estável.

Tarefas:
1. **Validador puro** `src/lib/forms/amount.ts` — `parseAmountToCents("1.234,56")` → `123456` (suporta vírgula BR, ponto como milhar, vazio = 0, inválido = `null`).
2. **Schemas Zod** `src/lib/forms/schemas.ts` — 4 schemas: `expenseSchema`, `incomeSchema`, `transferSchema`, `editSchema`. Mensagens PT-BR inline.
3. **Sheet UI primitivo** `src/components/ui/Sheet.tsx` — bottom sheet com backdrop, swipe-to-close, focus trap mínimo.
4. **Sheets de Registros** `src/features/records/transaction-sheets.tsx`:
   - `TransactionSheet` (mode = expense | income) — campos: amount, description, date, accountId, categoryId
   - `TransferSheet` — campos: amount, description, date, fromAccountId, toAccountId
   - `EditSheet` — pré-preenchido, só campos editáveis (kind travado)
5. **4 connectors** em `RecordsPage`: `ExpenseConnector`, `IncomeConnector`, `TransferConnector`, `EditConnector` — cada um amarra `useXxxMutation` ao sheet correspondente.
6. **Idempotency-key estável por submissão** — `useRef(crypto.randomUUID())` no sheet. Reuso entre submit e retry (sem novo UUID).
7. **Retry UX** — botão vira "Tentar novamente" após erro, **sem** fechar o sheet. Mensagem `getErrorMessage(error)` no rodapé.
8. **`DeleteDialog`** com `getErrorMessage` no erro (mesmo padrão de retry do sheet).

**Testes:**
- `amount.test.ts` — 3 casos: `parseAmountToCents("123,45")` → 12345, `"1.234,56"` → 123456, `""` → null, `"abc"` → null.
- `schemas.test.ts` — 5+ casos por schema: required, formato de data, valor > 0, descrição não-vazia.
- `transaction-sheets.test.tsx` — 4 casos: submit vazio bloqueado, submit válido converte BRL→cents, erro API renderiza mensagem e mantém sheet, retry reusa mesma idempotency-key.

**Commit:** `7e7a76f feat: complete PWA spec — RHF+Zod forms, filters, safe retry, a11y` (+818/-88, 17 arquivos).

---

## Progresso Planejado (as-built)

| Slice | Descrição | Status | Commit |
|---|---|---|---|
| SLICE-R0 | Spec + plan docs | ✅ | (este doc) |
| SLICE-R1 | Layout A + quick actions | ✅ | `5042797` (parte) |
| SLICE-R2 | Painel de filtros | ✅ | `5042797` (parte) |
| SLICE-R3 | Polimento visual | ✅ | `48a9f3b`, `b035e45`, `f273585` |
| SLICE-R4 | Sheets RHF + Zod + retry | ✅ | `7e7a76f` |

**Total estimado original:** ~10h (1h spec + 3h layout/filtros + 2h visual + 4h sheets).

**Verificação final (2026-06-15):**
- `npm run typecheck` ✅ (tsc --noEmit, sem erros)
- `npm test` ✅ (13 files, 52 tests, 60s)
- `npm run build` ✅ (vite build, PWA SW gerado, 13s)
- `git push origin main` ✅ (`5042797..7e7a76f`, fast-forward)

## Divergências vs spec

1. **Sem expansão explícita de mês (REQ-R1/R2):** `limit: 100` é o limite prático. 100 transações cobrem o caso normal do mês. **Spec revisada aceita** — ver REQ-R1 atualizado. Decisão sobre hard filter postergada para V1.1.
2. **Sem badge de cartão (REQ-R8):** ~~pendência aberta~~ **atendido 2026-06-15** — `<CreditCard size={12} className="text-indigo-600 shrink-0" data-testid="card-badge" />` na row de `RecordsPage`. Helper `getAccountForTx()` extraído. 2 testes em `records-rows.test.tsx`.
3. **`getAccountIcon` sem branch `credit_card` (REQ-R21):** ~~bug latente~~ **atendido 2026-06-15** — branch adicionada em `src/lib/ui/account-icon.tsx` (antes das heurísticas de nome). 10 testes em `account-icon.test.ts` (4 credit_card + 1 cash + 5 regressão).
4. **Sheet primitivo sem swipe/focus-trap/animação:** funcional mas não-premium. Aceito para V1.
5. **Filtro de mês dedicado (D4):** ausente. Range de datas (`startDate`/`endDate`) é o mecanismo. Sem atalho "Mês atual".

## Pendências para V1.1

- [x] **P1 (ampliado):** ✅ **atendido 2026-06-15** — `account-icon.tsx` + `RecordsPage.tsx` + 2 test files. Verificação: `npm run typecheck` ✅ · `npm test` ✅ (15/64) · `npm run build` ✅. **Commit local não-autoralizado — planner autoriza push.**
- [x] **P2 (decisão):** ✅ **2026-06-15 — opção C** (atalho "Mês atual" pré-selecionado, não A status-quo nem B hard filter). Spec ganhou D16 + REQ-R22..R25.
- [x] **P3 (impl):** ✅ **atendido 2026-06-15** — `month-bounds.ts` + chips no `RecordsPage.tsx` + 3 testes. Verificação: typecheck ✅ · 16/76 tests ✅ · build ✅.
- [x] **P4 (code-splitting):** ✅ **atendido 2026-06-15** — `React.lazy()` + `Suspense` em `App.tsx` + `manualChunks` em `vite.config.ts`. Entry 730 kB → 13 kB (-98.2%). Verificação: typecheck ✅ · 16/76 tests sem regressão · build ✅ sem warnings · SW PWA intacta.
- [x] **P5 (Playwright E2E, slice focado):** ✅ **atendido 2026-06-15** — `playwright.config.ts` + `e2e/smoke.spec.ts`. 1 test passed (2.6s).
- [x] **P6 (E2E completo via `page.route()`):** ✅ **atendido 2026-06-15** — `e2e/helpers/{api-mock,seed-data,setup}.ts` + 4 specs (auth, crud, features, smoke). **10 tests passed em 7.7s** (4 workers parallel). Cobre Auth (register/PIN/unlock), CRUD (criar/editar/excluir), retry idempotency, card badge, chips de mês. Verificação: typecheck 0 · test 16/76 sem regressão · build 0 · e2e 10/10.
- [x] **P7 (Deploy prep):** ✅ **atendido 2026-06-15** — `.github/workflows/deploy.yml` (CI/CD fail-fast) + `wrangler.toml` + README com 3 caminhos de deploy. Verificação: typecheck 0 · test 16/76 · build 0. **Deploy real depende de credenciais Cloudflare.** API/CRUD slice focado — slice completo (com MSW ou API mock) fica para V1.2.
- [ ] **Sheet premium:** adicionar swipe-to-close (touch events), focus trap mínimo, animação slide-up. *NÃO implementado em V1.1 — fica para V1.2 se desejado.*
- [ ] Lighthouse PWA score (Lighthouse 12 descontinuou a categoria PWA, usar `manifest.webmanifest` + `sw.js` como proxy).

## Boundary verification

- [x] `pi-financeiro\apps\whatsapp-bridge` intocado
- [x] `pi-finance-api` sem alterações
- [x] Sem dependência nova no `package.json` para P1-P4 (apenas organização interna de código existente)
- [x] P5 **adiciona** `@playwright/test` (devDep) — autorizado pelo planner para setup de test infra
- [x] Sem secret em código (apenas `VITE_API_BASE_URL` via `.env.local`, template em `.env.example`)
- [x] Sem hardcoded URLs de produção
- [x] Sem mudança de schema/modelo de domínio (apenas camada de apresentação)

## File map final (as-built)

```
D:/projetos/pi-finance-web/
└── src/
    ├── components/
    │   └── ui/
    │       └── Sheet.tsx                          # primitiva bottom-sheet responsiva
    ├── features/
    │   ├── records/
    │   │   ├── RecordsPage.tsx                    # página (~190 linhas, +getAccountForTx helper + CreditCard badge)
    │   │   ├── records-rows.test.tsx              # 2 testes (badge credit_card) — NOVO em P1
    │   │   ├── transaction-sheets.tsx             # TransactionSheet + TransferSheet + EditSheet (256 linhas)
    │   │   └── transaction-sheets.test.tsx        # 4 testes
    │   └── auth/
    │       └── AuthGate.tsx                       # modificado: passa `online` prop
    └── lib/
        ├── api/
        │   └── mutations.ts                       # modificado: idempotency-key via connector
        ├── forms/
        │   ├── amount.ts                          # parseAmountToCents (9 linhas)
        │   ├── amount.test.ts                     # 3 testes
        │   ├── schemas.ts                         # Zod schemas (69 linhas)
        │   └── schemas.test.ts                    # 5+ testes
        └── ui/
            ├── account-icon.tsx                   # getAccountIcon(name, kind) — +branch credit_card (P1)
            ├── account-icon.test.ts               # 10 testes (4 credit_card + 1 cash + 5 regressão) — NOVO em P1
            ├── format-category-label.ts
            └── ...
```

---

*Doc retroativo gerado em 2026-06-15 para fechar o ciclo de documentação da spec V1.5 (PWA Redesign da aba Registros).*
