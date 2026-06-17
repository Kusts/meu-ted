# Registros Page — UX Redesign

**Data:** 2026-06-15
**Spec anterior:** `docs/superpowers/specs/2026-06-14-pwa-companion-design.md` (definiu Registros como aba V1: lista agrupada, busca, filtros, CRUD).
**Arquivo alvo:** `D:\projetos\pi-finance-web\src\features\records\RecordsPage.tsx`.
**Referência visual:** `D:\projetos\pi-finance-web\src\features\home\HomePage.tsx` + `src\index.css` (tokens teal/clean do PWA).

## Context

- A aba **Registros** é onde o usuário cria, edita, exclui e consulta lançamentos (despesa, receita, transferência).
- Antes deste redesign, a página tinha paginação fixa, filtros espartanos (apenas tipo e conta), sem quick actions, sem sheet dedicado de edição, exclusão sem confirmação e estilo desalinhado da Home.
- O redesign **foca em UX** — sem mudança de contrato de API. O backend `pi-finance-api` permanece intacto, e o `apps/whatsapp-bridge` também.
- Continuidade com o design system já em uso: Tailwind 4 + tokens em `index.css` (`--color-accent`, `--color-expense`, `--color-income`, `--color-transfer`) + classe utilitária `.card` + ícones `lucide-react`.
- Alinhamento com o padrão **"light premium — Copilot Money + Monarch"** da Home: hero gradiente teal, quick actions em 3 colunas, espaçamento generoso, hierarquia por tipografia uppercase tracking-wide.
- O usuário (e esposa) opera majoritariamente em mobile (PWA instalado no iPhone), portanto layout é **mobile-first**, com graceful degradation em desktop via container.
- Alinhamento com REQ-6 da spec V1 (idempotency-key estável por submissão, retry sem fechar sheet, mensagem PT-BR em erro).

## Decisions

| # | Decision | Choice | Reason | Rejected |
|---|---|---|---|---|
| D1 | Layout default | **A) Mês atual primeiro, expansão on-demand** | Foco no que o usuário registra agora; reduz ruído | B) Lista contínua sem mês; C) Tabs por mês |
| D2 | Quick actions | 3 botões topo (Despesa / Receita / Transferência) | Casa com `HomePage.QA`, sem FAB | FAB global, menu lateral, swipe-down |
| D3 | Filtros | Painel **inline** abaixo da search bar | Menos cliques, melhor mobile | Modal de tela cheia, sheet lateral |
| D4 | Filtros-base | Tipo (D/R/T), Conta, Categoria, mín/máx valor, De/Até data, busca textual | Cobre ~90% dos casos | Filtro por etiqueta, subcategoria, status |
| D5 | Cartão | Misturado na lista, **com badge de ícone** quando `accountId.kind === 'credit_card'` | Cartão é despesa; esconder em outra aba = fricção | Aba separada "Cartões" |
| D6 | Visual | Teal/clean, classe `.card`, ícones Lucide, espaçamento `space-y-4` | Continuidade com Home + Wallet | Estilo próprio da Registros |
| D7 | Edição | Bottom sheet simétrico ao de criação | Criar == editar mentalmente | Página dedicada de edição |
| D8 | Exclusão | Dialog de confirmação (não sheet) | Ação destrutiva pede fricção | Swipe-to-delete, undo toast |
| D9 | Limite da list | `limit: 100` (query pagination client-side) | Default seguro de performance, sem paginação server-side nova | Carregar tudo, paginação server-side |
| D10 | Persistência de filtros | **Nenhuma** (estado em `useState`) | Recarregar = começar limpo | Persistir em localStorage |
| D11 | Formulários | RHF + Zod, idempotency-key estável por submissão (`useRef(crypto.randomUUID())`) | Já decidido na spec V1; REQ-6 + REQ-4 | Formik, react-final-form |
| D12 | Retry em falha | Botão vira "Tentar novamente" sem fechar o sheet, mensagem PT-BR no rodapé | REQ-6 da spec V1 | Fechar e perder input |
| D13 | Edição concorrente | Single `formMode` state — clicar em outro item reescreve o estado (UX mais simples) | Não há cenário real de edição paralela | Lock, fila |
| D14 | Empty state | Ícone `Sparkles` (size 32, `text-slate-300`) + "Nenhum lançamento" + hint "Use os botões acima para começar." | Tom encorajador, alinhado com Monarch/Copilot Money | Texto seco "Sem dados" |
| D15 | Identidade visual de cartão | **Dois sinais** se `accountId.kind === 'credit_card'`: (a) ícone de cartão na **row de transação** (`<CreditCard size={12} />` ao lado do nome da conta), (b) branch dedicada em `getAccountIcon()` (`src/lib/ui/account-icon.tsx`) que retorna ícone `CreditCard` + `bg-indigo-50` + `text-indigo-600` | Cartão é visualmente distinto de conta/cash; hoje cai no default `Building2`/`bg-slate-50` | Reutilizar mesmo ícone de tipo (D/R/T) — ambíguo |
| D16 | Filtro de data — atalhos | **3 chips** no topo do painel de filtros: **"Mês atual"** (default selecionado, cobre `[primeiro dia, último dia]` do mês corrente), **"Mês passado"** (cobre `[primeiro dia, último dia]` do mês anterior), **"Personalizado"** (mostra os inputs de data editáveis). Mudar o mês atualiza `startDate`/`endDate` automaticamente. Editar manualmente os inputs muda o chip ativo para "Personalizado". | Default `limit: 100` é não-determinístico em meses densos; chips dão determinismo + flex | Hard filter fixo no mês atual sem possibilidade de navegar; calendário dropdown complexo |

## Requirements (EARS)

| ID | Type | Requirement |
|---|---|---|
| REQ-R1 | state-driven | A página Registros deve listar lançamentos do **mês atual por padrão** (chips "Mês atual"/"Mês passado"/"Personalizado" no painel, ver REQ-R22..R25), com `limit: 100` como teto de segurança da query. |
| REQ-R2 | event-driven | Ao tocar em "Expandir" / "Carregar mais", o PWA deve carregar meses anteriores em ordem decrescente. *Não implementado em V1.1 — os chips de período (REQ-R22..R25) cobrem 90% do caso de uso sem expansão explícita.* |
| REQ-R3 | state-driven | Enquanto a query estiver carregando, o PWA deve mostrar "Carregando…" centralizado. |
| REQ-R4 | state-driven | Se a query falhar, o PWA deve mostrar mensagem PT-BR humana com botão "Tentar novamente". |
| REQ-R5 | event-driven | Ao tocar em "Despesa" / "Receita" / "Transferência", o PWA deve abrir o bottom sheet correspondente. |
| REQ-R6 | state-driven | Se `online === false`, os 3 botões de criar devem estar desabilitados. |
| REQ-R7 | ubiquitous | A lista deve ser agrupada por data, com header `dd MMM` (ex: "15 jun") e ordem DESC. |
| REQ-R8 | state-driven | Lançamentos cuja `accountId` aponta para conta do tipo `credit_card` devem aparecer misturados na lista, com **badge `<CreditCard size={12} />` do lucide-react** ao lado do nome da conta (distingue lançamento de cartão vs. conta/cash). |
| REQ-R9 | event-driven | Ao tocar em uma linha de lançamento, o PWA deve abrir o sheet de edição pré-preenchido. |
| REQ-R10 | state-driven | A edição deve aceitar mudança de: descrição, valor, data, conta, categoria. **Não** permite mudar `kind` (despesa continua despesa). |
| REQ-R11 | event-driven | Ao tocar no ícone de lixeira, o PWA deve abrir dialog de confirmação. |
| REQ-R12 | unwanted | A exclusão **não** deve exigir PIN ou 2FA extra (já autenticado no `AuthGate`). |
| REQ-R13 | ubiquitous | Filtros devem ser aplicáveis de forma combinada (AND lógico). |
| REQ-R14 | state-driven | Quando há filtro ativo, deve aparecer botão "Limpar filtros". |
| REQ-R15 | unwanted | O PWA **não** deve permitir edição concorrente — sheet é exclusivo: clicar em outro item reescreve o estado sem prompt. |
| REQ-R16 | unwanted | O PWA **não** deve persistir filtros em localStorage — reset a cada reload. |
| REQ-R17 | event-driven | Ao criar/editar com sucesso, o sheet deve fechar e a lista deve refletir o novo dado (TanStack Query invalida). |
| REQ-R18 | unwanted | Erros de API devem mostrar mensagem PT-BR no rodapé do sheet, **sem** fechar o sheet. |
| REQ-R19 | event-driven | O botão de submit vira "Tentar novamente" após erro, e a re-submissão **reusa** o mesmo idempotency-key (evita duplicata no retry). |
| REQ-R20 | state-driven | Lançamentos com `accountId.kind === 'credit_card'` devem mostrar `kind='expense'` (não `'transfer'`) — o badge diferencia a origem, não a natureza. |
| REQ-R21 | state-driven | Contas com `kind === 'credit_card'` devem ser renderizadas com ícone `CreditCard` (lucide-react) em `bg-indigo-50 text-indigo-600` em **todos os pontos onde `getAccountIcon()` é chamado** (HomePage saldos, Wallet lista, e qualquer outra exibição de conta). |
| REQ-R22 | state-driven | Ao abrir a página Registros (estado inicial, sem filtros salvos), o filtro de data deve vir pré-selecionado como **"Mês atual"**, com `startDate` = primeiro dia do mês corrente e `endDate` = último dia do mês corrente. |
| REQ-R23 | event-driven | O painel de filtros deve exibir **3 chips de período** logo acima dos inputs de data: "Mês atual", "Mês passado", "Personalizado". Tocar em um chip deve atualizar `startDate`/`endDate` para o intervalo correspondente e marcar o chip como ativo. |
| REQ-R24 | state-driven | Editar manualmente um dos inputs `De` / `Até` deve mudar o chip ativo para "Personalizado" (custom). |
| REQ-R25 | state-driven | O chip ativo é renderizado com `bg-accent text-white`; os demais com `bg-white border border-[var(--color-border)] text-slate-600`. Todos usam `rounded-full px-3 py-1.5 text-xs font-medium`. |

## Architecture

A página é um único componente `RecordsPage` em `src/features/records\RecordsPage.tsx`. Sub-componentes ficam **inline** (não em arquivos próprios), exceto os sheets e conectores que viraram arquivos separados por causa de testabilidade.

```ts
RecordsPage (página)
├─ state: filters, query, showFilters, formMode, editTx, deleteId
├─ query:  useTransactions({ ...filters, query, limit: 100 })
├─ data:   accounts (useAccounts), cats (useCategories)
├─ groupByDate(items) → [{ key, items }]   // pure helper
│
├─ UI topo
│  ├─ Search bar (com clear button)
│  └─ 3 QuickButtons (Despesa / Receita / Transferência) com disabled={!online}
│
├─ Painel de filtros (condicional showFilters)
│  ├─ Tipo, Conta, Categoria  (Select)
│  ├─ Valor mín. / Valor máx. (Fld number)
│  ├─ De / Até                (Fld date)
│  └─ "Limpar filtros"        (se hasActiveFilters)
│
├─ Lista
│  ├─ loading: "Carregando…"
│  ├─ error:   getErrorMessage(...)
│  ├─ empty:   ícone Sparkles + texto + hint
│  └─ items:   groupByDate → rows com ícone de tipo, badge de cartão (futuro), valor colorido
│
└─ Forms
   ├─ ExpenseConnector → TransactionSheet mode="expense"
   ├─ IncomeConnector  → TransactionSheet mode="income"
   ├─ TransferConnector → TransferSheet
   ├─ EditConnector    → EditSheet
   └─ DeleteDialog     (confirmação)
```

Sheets ficam em **`src/features/records/transaction-sheets.tsx`** (arquivo próprio, testável):

- `TransactionSheet` (mode = expense | income) — **carrega `idempotencyKey` via `useRef(crypto.randomUUID())`** para REQ-6.
- `TransferSheet` — **mesmo padrão de idempotency-key**.
- `EditSheet` — **sem idempotency-key** (PATCH não é POST; não há dedupe server-side pra reuso).

Todos recebem `onSubmit` / `pending` / `error` / `onClose` por prop. As mutations vivem na `RecordsPage` (como connectors) para:
- habilitar o **retry** (REQ-6 da spec V1) sem duplicar lógica,
- manter sheets **agnósticos de hook** (testáveis sem mockar TanStack Query).

Validação:
- `src/lib/forms/schemas.ts` (Zod) — schemas para expense, income, transfer, edit
- `src/lib/forms/amount.ts` — parser BRL → cents (input `1.234,56` → `123456`)

UI primitiva:
- `src/components/ui/Sheet.tsx` — wrapper **bottom-sheet responsivo** (`flex items-end sm:items-center`), `max-w-md` (448px) e `max-h-[90dvh]`, `bg-black/30` no backdrop, **fecha no click do backdrop** (`onClick={onClose}` no container, `e.stopPropagation()` no painel), botão X com `aria-label="Fechar"`. **Não tem swipe-to-close nem focus trap** (limitação conhecida — ver REQ pendente). Reutilizado pela Wallet.

Identidade visual de conta:
- `src/lib/ui/account-icon.tsx` — `getAccountIcon(name, kind)` retorna `{ icon, bg, color }` baseado em heurística de nome + branch explícita para `kind === 'cash'`. **Não tem branch para `credit_card`** — hoje cai no default `Building2`+`bg-slate-50`. Ver D15 e pendência P1.

## Status de implementação (as-built) — 2026-06-15

**Repositório:** `D:\projetos\pi-finance-web` (separado deste monorepo).
**V1 base** (pushed): `npm run typecheck` ✅ · `npm test` ✅ (13 files, 52 tests) · `npm run build` ✅ (PWA SW gerado).
**V1.1 follow-ups** (local, não-pushed em 2026-06-15):
- P1: badge cartão em `RecordsPage` + branch `credit_card` em `getAccountIcon` (REQ-R8, REQ-R21).
- P2: decisão arquitetural — opção C (chips de período, REQ-R22..R25 + D16).
- P3: chips de período em `RecordsPage` + helpers `month-bounds`.
- P4: code-splitting (entry 730 kB → 13 kB, 9 chunks on-demand).
- P5: Playwright setup + 1 smoke E2E (mobile-first 390×844, `e2e/smoke.spec.ts`).

**Verificação V1.1 final:**
- `npm run typecheck` ✅ exit 0
- `npm test` ✅ 16 files, 76 tests passed (era 13/52 → +3 files, +24 tests)
- `npm run build` ✅ exit 0, sem warnings (era warning de chunk >500 kB; agora entry 13 kB)
- `npm run e2e` ✅ 1 test passed (smoke de AuthGate render + no 404/500) em ~2.6s

**Push V1:** `origin/main` em `7e7a76f feat: complete PWA spec — RHF+Zod forms, filters, safe retry, a11y` (junto com chain de 4 commits de design prévios).
**Push V1.1:** *pendente — planner autoriza.*

### Requisitos vs implementação

| ID | Status | Evidência / observação |
|---|---|---|
| REQ-R1 | ⚠️ **parcial** | Default `limit: 100` lista até 100 itens; ordenação DESC faz o mês atual aparecer primeiro. **Não há filtro hard de mês** — mês é responsabilidade do range `startDate/endDate` nos filtros. |
| REQ-R2 | ❌ **não implementado** | Não há "Expandir"/"Carregar mais" — paginação é por `limit`, sem botão explícito. 100 itens cobre o caso comum. |
| REQ-R3 | ✅ | `tx.isLoading` → "Carregando…" |
| REQ-R4 | ✅ | `tx.error` → `getErrorMessage(tx.error)` (sem botão "Tentar novamente" inline na lista — reload manual da página) |
| REQ-R5 | ✅ | 3 QuickButtons topo (Despesa/Receita/Transferência) |
| REQ-R6 | ✅ | `disabled={!online}` nos QuickButtons |
| REQ-R7 | ✅ | `groupByDate` ordena DESC, header = `t.date` |
| REQ-R8 | ✅ **atendido (2026-06-15, P1)** | `RecordsPage` renderiza `<CreditCard size={12} className="text-indigo-600 shrink-0" data-testid="card-badge" />` ao lado da descrição, **apenas** se `getAccountForTx(accounts, t)?.kind === 'credit_card'`. Helper `getAccountForTx(accounts, tx)` extraído em `RecordsPage.tsx`. Coberto por `records-rows.test.tsx` (2 testes: badge shown for credit_card, hidden for bank). |
| REQ-R9 | ✅ | onClick na row → `setEditTx(t); setFormMode('edit')` |
| REQ-R10 | ✅ | `EditSheet` aceita `patch` com description, amountCents, date, accountId, categoryId. `kind` **não** está no schema de patch. |
| REQ-R11 | ✅ | onClick no Trash2 → `setDeleteId(t.id)` → `DeleteDialog` |
| REQ-R12 | ✅ | `DeleteDialog` sem auth extra |
| REQ-R13 | ✅ | Filters spread: `{ ...filters, kind, accountId, categoryId, minAmountCents, maxAmountCents, startDate, endDate }` |
| REQ-R14 | ✅ | `hasActiveFilters(filters)` → botão "Limpar filtros" |
| REQ-R15 | ✅ | Single `formMode` state, clicar em outro item reescreve |
| REQ-R16 | ✅ | `useState<TransactionFilters>({ limit: 100 })` — sem persist |
| REQ-R17 | ✅ | `m.mutate(p, { onSuccess: onClose })` — TanStack invalida queries |
| REQ-R18 | ✅ | `error` prop no sheet, sem `onClose` em erro |
| REQ-R19 | ✅ | Idempotency-key via `useRef(crypto.randomUUID())` no sheet — reuso entre submit e retry. Coberto por `transaction-sheets.test.tsx`. |
| REQ-R20 | ✅ | `kind` da transação já vem do backend como `expense` para cartão (não `transfer`). |

### Divergências vs spec (resumo)

1. **REQ-R1/R2 (mês default + expansão):** implementação usa `limit: 100` em vez de mês como boundary. Visualmente o mês atual aparece primeiro (ordenação DESC), mas a UX não força mês hard. **Não é divergência técnica** — é aceito pela spec revisada. Ver REQ-R1 acima.
2. **REQ-R8 (badge de cartão):** ~~pendência aberta (P1)~~ **atendido 2026-06-15** — ver tabela acima.
3. **REQ-R21 (ícone de cartão em `getAccountIcon`):** ~~branch `credit_card` ausente~~ **atendido 2026-06-15** — branch adicionada em `src/lib/ui/account-icon.tsx` (`if (kind === 'credit_card') return { icon: CreditCard, bg: 'bg-indigo-50', color: 'text-indigo-600' }`), posicionada **antes** das heurísticas por nome. Coberto por `account-icon.test.ts` (10 testes: 4 credit_card + 1 cash + 5 regressão).
4. **Sheet primitivo:** sem swipe-to-close, sem focus trap, sem animação. Funcional mas não-premium. Ver pendência V1.1.
5. **Filtro de mês dedicado:** ausente. Range de datas (`startDate`/`endDate`) é o mecanismo, sem atalho "Mês atual" / "Mês passado".

### Pendências para V1.1

- [x] **REQ-R8 + REQ-R21 (P1, ampliado):** ✅ **atendido 2026-06-15**. Commit local não-autoralizado — planner autoriza push. Verificação: `npm run typecheck` ✅ · `npm test` ✅ (15 files, 64 tests, +2 files/+12 tests vs V1) · `npm run build` ✅.
- [x] **P2 (decisão):** ✅ **2026-06-15 — opção C (atalho "Mês atual" pré-selecionado)**. Decisão D16 + REQ-R22..R25 adicionados.
- [x] **P3 (impl):** ✅ **atendido 2026-06-15** — `month-bounds.ts` (helpers puros) + chips no `RecordsPage.tsx` + 3 testes em `records-rows.test.tsx`. Verificação: typecheck ✅ · 16 files, 76 tests (era 15/64, +1 file, +12 tests) · build ✅.
- [x] **P4 (code-splitting):** ✅ **atendido 2026-06-15** — `React.lazy()` + `Suspense` em `App.tsx` + `manualChunks` em `vite.config.ts`. Entry **730 kB → 13 kB** (-98.2%), 9 chunks on-demand. Verificação: typecheck ✅ · test 16/76 sem regressão · build ✅ sem warnings · SW PWA intacta.
- [x] **P5 (Playwright E2E, slice focado):** ✅ **atendido 2026-06-15** — `playwright.config.ts` (mobile-first 390×844, webServer auto-start) + `e2e/smoke.spec.ts` (smoke de AuthGate render). 1 test passed em 2.6s. API/CRUD não cobertos (precisaria MSW ou API up) — slice focado. Verificação: typecheck ✅ · test 16/76 sem regressão · build ✅ · e2e 1/1 ✅.
- [x] **P6 (E2E completo via `page.route()`):** ✅ **atendido 2026-06-15** — `e2e/helpers/{api-mock,seed-data,setup}.ts` + 4 specs novos (auth, crud, features, smoke refatorado). **10 tests passed em 7.7s** (4 workers). Cobre Auth (register/PIN/unlock), CRUD (criar/editar/excluir), retry idempotency, card badge, chips. Verificação: typecheck 0 · test 16/76 sem regressão · build 0 · e2e 10/10.
- [x] **P7 (Deploy prep):** ✅ **atendido 2026-06-15** — `.github/workflows/deploy.yml` (CI/CD fail-fast) + `wrangler.toml` + README com 3 caminhos de deploy. Verificação: typecheck 0 · test 16/76 · build 0. **Deploy real depende de credenciais Cloudflare (API token + account ID).**
- [ ] **Sheet primitivo:** adicionar swipe-to-close (touch events), focus trap mínimo (focus no primeiro input ao abrir, retorno ao trigger ao fechar), e animação de slide-up. Atualmente é funcional mas não-premium.
- [ ] Code-splitting do bundle (~730 kB após RHF/Zod) — `React.lazy()` em `HomePage`/`RecordsPage`/`WalletPage` + vendor chunk.
- [ ] E2E Playwright para fluxo: criar despesa → editar → excluir → criar com retry em erro de rede.

## Testing Strategy

| Layer | Tool | Cobertura atual |
|---|---|---|
| Unit | Vitest | `amount.ts` (3 testes), `schemas.ts` (5+ testes) |
| Component | Vitest + Testing Library | `transaction-sheets.test.tsx`: validação bloqueia submit vazio, BRL→cents, retry em erro, idempotency-key estável |
| Integration | — | Não aplicado |
| E2E | — | Não aplicado |

**RED-first aplicado em:** validadores puros (`amount.ts`, `schemas.ts`) e sheets (`transaction-sheets.tsx`). Conectores e `RecordsPage` em si **não** têm teste — risco baixo (conector é thin wrapper sobre mutation hook, sem lógica).

## Non-goals (pós-V1)

- Sem paginação server-side
- Sem infinite scroll
- Sem persistência de filtros
- Sem swipe-to-delete
- Sem undo (exclusão é terminal)
- Sem edição de `kind` (continua sendo UI-only mudança de comportamento, não domínio)
- Sem bulk actions (selecionar N e excluir em massa)
- Sem agrupamento alternativo por categoria ou conta (só por data)
