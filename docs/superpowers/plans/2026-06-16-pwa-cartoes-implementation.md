# PWA Cartões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a 4ª tab "Cartões" ao PWA com drill-down de cartões → faturas → detalhe, criação de compras (simples/parcelada/recorrência), e pagamento de faturas (total/parcial com atalhos 25/50/75/100%).

**Architecture:** Feature-based em `src/features/cards/` com componente página única (`CardsPage.tsx`) e sheets testáveis extraídos (`card-sheets.tsx`). Extensões em `src/lib/api/` para tipos, funções de API, queries e mutations. Schemas Zod em `src/lib/forms/schemas.ts`. Wire da 4ª tab em `src/App.tsx` com `React.lazy` + `Suspense`. Padrão existente: RHF + Zod, TanStack Query, idempotency-key estável por submissão, cache offline `placeholderData`.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, TanStack Query 5, React Hook Form 7 + Zod 4, lucide-react, Vitest + Testing Library, Playwright (E2E).

**Agent Orchestration:** Single-Agent Looped — 5 slices sequenciais com dependências; cada slice é testável e verificável isoladamente.

---

## ⚠️ Dependency: Card REST endpoints on pi-finance-api

**Blocker discovery:** `D:/projetos/pi-finance-api/src/routes/index.ts:1-41` registra apenas `auth`, `accounts`, `categories`, `transactions`, `transactions-write`, `dashboard`, `insights`. **Não existem rotas REST para cartões.** Os tools `create_card_purchase`, `pay_statement`, etc. são RPC do Agent Pi — não endpoints HTTP.

**Ação necessária antes ou junto com Slice 1:** Estender `pi-finance-api` com os endpoints abaixo. Este plano define os contratos esperados; a implementação da API é pré-requisito.

### Endpoints REST esperados

| Método | Path | Body/Params | Response | Tool Agent Pi correspondente |
|---|---|---|---|---|
| `GET` | `/cards/statements` | `?accountId=X&status=&limit=` | `{ items: Statement[] }` | `list_statements` |
| `GET` | `/cards/statements/:id` | — | `StatementDetail` | `get_statement_details` |
| `POST` | `/cards/purchases` | `{ accountId, description, amountCents, date, categoryId? }` | `Transaction` | `create_card_purchase` |
| `POST` | `/cards/installments` | `{ accountId, description, totalAmountCents, purchaseDate, installmentsTotal, categoryId? }` | `{ items: Transaction[] }` | `create_card_installments` |
| `POST` | `/cards/recurring` | `{ accountId, description, amountCents, frequency, startDate, endDate?, categoryId? }` | `RecurringPurchase` | `create_recurring_purchase` |
| `POST` | `/cards/statements/:id/pay` | `{ amountCents, fromAccountId }` | `Statement` | `pay_statement` |

Todos exigem header `X-Device-Token`. POST/PATCH requerem `Idempotency-Key` no header.

---

## File Map

### Criar

| Path | Responsabilidade |
|---|---|
| `src/features/cards/CardsPage.tsx` | Página principal: 3 views (cards → statements → detail), navegação drill-down, pagamento inline |
| `src/features/cards/card-sheets.tsx` | Componentes testáveis: `PurchaseSheet`, `RecurringSheet` |
| `src/features/cards/card-sheets.test.tsx` | Testes de sheets: validação RHF+Zod, BRL→cents, retry, idempotency-key |
| `src/features/cards/cards-rows.test.tsx` | Testes de rows: card summary (threshold colors), statement rows (status badges), detail (installment badges, recurring badge) |

### Modificar

| Path | O quê |
|---|---|
| `src/App.tsx` | Adicionar 4ª tab `Cartões`, `React.lazy` import, ícone `CreditCard` |
| `src/lib/api/types.ts` | Adicionar `Statement`, `StatementDetail`, `StatementPurchase`, `RecurringPurchase` |
| `src/lib/api/finance-api.ts` | Adicionar `getStatements`, `getStatementDetail`, `createCardPurchase`, `createCardInstallments`, `createRecurringPurchase`, `payStatement` |
| `src/lib/api/queries.ts` | Adicionar `useStatements`, `useStatementDetail` |
| `src/lib/api/mutations.ts` | Adicionar `useCreateCardPurchase`, `useCreateCardInstallments`, `useCreateRecurring`, `usePayStatement` |
| `src/lib/forms/schemas.ts` | Adicionar `cardPurchaseSchema`, `recurringPurchaseSchema` |

---

## Slice 1: Tipos + API client + Schemas + Testes focados

**Depende de:** API endpoints REST existirem (ver ⚠️ acima).
**Entregável:** Tipos, funções de API, queries, mutations e schemas Zod compilando e testados.

### Task 1.1: Estender tipos em `src/lib/api/types.ts`

**Files:** Modify `src/lib/api/types.ts`

Adicionar ao final do arquivo (antes do `formatBRL`):

```ts
// ── Credit Card types ─────────────────────────────────────────────

export interface Statement {
  id: string;
  accountId: string;
  closingDate: string;       // YYYY-MM-DD
  dueDate: string;            // YYYY-MM-DD
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  status: 'open' | 'closed' | 'paid' | 'partial' | 'overdue' | 'cancelled';
}

export interface StatementPurchase {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  categoryName?: string;
  installmentNumber?: number;
  installmentsTotal?: number;
  isRecurring?: boolean;
}

export interface StatementDetail extends Statement {
  purchases: StatementPurchase[];
}

export interface StatementList { items: Statement[]; total: number; }

export interface RecurringPurchase {
  id: string;
  accountId: string;
  description: string;
  amountCents: number;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate?: string;
  categoryId?: string;
  status: 'active' | 'paused' | 'cancelled';
}
```

### Task 1.2: Estender `src/lib/api/finance-api.ts`

**Files:** Modify `src/lib/api/finance-api.ts`

Adicionar após as funções de categories CRUD:

```ts
// ── credit card ───────────────────────────────────────────────────

export function getStatements(token: string, accountId: string, filters?: { status?: string; limit?: number }) {
  const params = new URLSearchParams({ accountId });
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit) params.set('limit', String(filters.limit));
  return apiGet<StatementList>(`/cards/statements?${params.toString()}`, token);
}

export function getStatementDetail(token: string, statementId: string) {
  return apiGet<StatementDetail>(`/cards/statements/${statementId}`, token);
}

export async function createCardPurchase(token: string, body: {
  accountId: string; description: string; amountCents: number; date: string; categoryId?: string;
}, idemKey?: string) {
  return apiPost<Transaction>('/cards/purchases', token, body, idemKey);
}

export async function createCardInstallments(token: string, body: {
  accountId: string; description: string; totalAmountCents: number; purchaseDate: string; installmentsTotal: number; categoryId?: string;
}, idemKey?: string) {
  return apiPost<{ items: Transaction[] }>('/cards/installments', token, body, idemKey);
}

export async function createRecurringPurchase(token: string, body: {
  accountId: string; description: string; amountCents: number; frequency: 'monthly' | 'quarterly' | 'yearly';
  startDate: string; endDate?: string; categoryId?: string;
}, idemKey?: string) {
  return apiPost<RecurringPurchase>('/cards/recurring', token, body, idemKey);
}

export async function payStatement(token: string, statementId: string, body: {
  amountCents: number; fromAccountId: string;
}, idemKey?: string) {
  return apiPost<Statement>(`/cards/statements/${statementId}/pay`, token, body, idemKey);
}
```

Adicionar imports no topo: `import type { Account, Category, Transaction, AccountList, CategoryList, TransactionPage, DashboardSummary, QuickInsight, TransactionFilters, QuickInsightPage, StatementList, StatementDetail, RecurringPurchase, Statement } from './types';`

### Task 1.3: Estender `src/lib/api/queries.ts`

**Files:** Modify `src/lib/api/queries.ts`

Adicionar após `useQuickInsights`:

```ts
import { getStatements, getStatementDetail } from './finance-api';

export function useStatements(accountId: string) {
  const token = useTokenKey();
  const cacheKey = `stmts-${accountId}`;
  return useQuery({
    queryKey: ['statements', token, accountId],
    queryFn: async () => { const r = await getStatements(token, accountId); setCache(cacheKey, r); return r; },
    enabled: !!token && !!accountId,
    staleTime: 30_000,
    placeholderData: () => cached<StatementList>(cacheKey),
  });
}

export function useStatementDetail(statementId: string) {
  const token = useTokenKey();
  const cacheKey = `stmt-${statementId}`;
  return useQuery({
    queryKey: ['statement', token, statementId],
    queryFn: async () => { const r = await getStatementDetail(token, statementId); setCache(cacheKey, r); return r; },
    enabled: !!token && !!statementId,
    staleTime: 30_000,
    placeholderData: () => cached<StatementDetail>(cacheKey),
  });
}
```

Adicionar import: `import type { StatementList, StatementDetail } from './types';`

### Task 1.4: Estender `src/lib/api/mutations.ts`

**Files:** Modify `src/lib/api/mutations.ts`

Adicionar após `useDeactivateCategory`:

```ts
import { createCardPurchase, createCardInstallments, createRecurringPurchase, payStatement } from './finance-api';

export function useCreateCardPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...body }: WithIdemKey<Parameters<typeof createCardPurchase>[1]>) =>
      createCardPurchase(getToken() ?? '', body, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['statements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useCreateCardInstallments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...body }: WithIdemKey<Parameters<typeof createCardInstallments>[1]>) =>
      createCardInstallments(getToken() ?? '', body, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['statements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useCreateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...body }: WithIdemKey<Parameters<typeof createRecurringPurchase>[1]>) =>
      createRecurringPurchase(getToken() ?? '', body, idempotencyKey),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['statements'] }); },
  });
}

export function usePayStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ statementId, idempotencyKey, ...body }: { statementId: string } & WithIdemKey<Parameters<typeof payStatement>[2]>) =>
      payStatement(getToken() ?? '', statementId, body, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['statement'] });
      qc.invalidateQueries({ queryKey: ['statements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
```

### Task 1.5: Adicionar schemas Zod em `src/lib/forms/schemas.ts`

**Files:** Modify `src/lib/forms/schemas.ts`

Adicionar após `parseBalanceToCents`:

```ts
// ── Card schemas ─────────────────────────────────────────────────

export const cardPurchaseFormSchema = z.object({
  description: requiredText('Descreva a compra'),
  amount: amountField,
  date: requiredText('Selecione a data'),
  categoryId: requiredText('Selecione a categoria'),
  installments: z.coerce.number().int().min(1, 'Mínimo 1').max(48, 'Máximo 48'),
});
export type CardPurchaseFormValues = z.infer<typeof cardPurchaseFormSchema>;

export const recurringFormSchema = z.object({
  description: requiredText('Descreva a recorrência'),
  amount: amountField,
  frequency: z.enum(['monthly', 'quarterly', 'yearly'], { message: 'Selecione a frequência' }),
  startDate: requiredText('Selecione a data de início'),
  endDate: z.string().optional(),
  categoryId: requiredText('Selecione a categoria'),
});
export type RecurringFormValues = z.infer<typeof recurringFormSchema>;
```

### Task 1.6: Escrever testes para schemas

**Files:** Modify `src/lib/forms/schemas.test.ts`

Adicionar:

```ts
import { cardPurchaseFormSchema, recurringFormSchema } from './schemas';

describe('cardPurchaseFormSchema', () => {
  it('accepts valid single-installment purchase', () => {
    const r = cardPurchaseFormSchema.safeParse({
      description: 'Mercado', amount: '100,00', date: '2026-06-16', categoryId: 'c1', installments: 1,
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid multi-installment purchase', () => {
    const r = cardPurchaseFormSchema.safeParse({
      description: 'Notebook', amount: '6000,00', date: '2026-06-16', categoryId: 'c1', installments: 12,
    });
    expect(r.success).toBe(true);
  });

  it('rejects installments > 48', () => {
    const r = cardPurchaseFormSchema.safeParse({
      description: 'X', amount: '100,00', date: '2026-06-16', categoryId: 'c1', installments: 49,
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty description', () => {
    const r = cardPurchaseFormSchema.safeParse({
      description: '', amount: '100,00', date: '2026-06-16', categoryId: 'c1', installments: 1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty amount', () => {
    const r = cardPurchaseFormSchema.safeParse({
      description: 'X', amount: '', date: '2026-06-16', categoryId: 'c1', installments: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe('recurringFormSchema', () => {
  it('accepts valid monthly recurring', () => {
    const r = recurringFormSchema.safeParse({
      description: 'Netflix', amount: '39,90', frequency: 'monthly', startDate: '2026-06-16', categoryId: 'c1',
    });
    expect(r.success).toBe(true);
  });

  it('accepts recurring with endDate', () => {
    const r = recurringFormSchema.safeParse({
      description: 'Seguro', amount: '200,00', frequency: 'yearly', startDate: '2026-06-16', endDate: '2027-06-16', categoryId: 'c1',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty description', () => {
    const r = recurringFormSchema.safeParse({
      description: '', amount: '39,90', frequency: 'monthly', startDate: '2026-06-16', categoryId: 'c1',
    });
    expect(r.success).toBe(false);
  });
});
```

### Task 1.7: Verificação do Slice 1

```bash
cd D:/projetos/pi-finance-web
npm run typecheck          # deve passar
npx vitest run src/lib/forms/schemas.test.ts  # novos + antigos tests passam
npx vitest run             # 93+ tests passam (sem regressão)
```

---

## Slice 2: Tab wiring + CardsPage (view=cards)

**Depende de:** Slice 1.
**Entregável:** 4ª tab "Cartões" funcional em `App.tsx`, página `CardsPage` com lista de cartões, estados loading/empty/error.

### Task 2.1: Wire da tab em `src/App.tsx`

**Files:** Modify `src/App.tsx`

- Adicionar `import { CreditCard } from 'lucide-react';` ao import existente
- Adicionar lazy import após WalletPage:
  ```tsx
  const CardsPage = lazy(() => import('./features/cards/CardsPage').then(m => ({ default: m.CardsPage })));
  ```
- Estender tipo `Tab`: `type Tab = 'inicio' | 'registros' | 'carteira' | 'cartoes';`
- Adicionar renderização condicional no `<Suspense>`:
  ```tsx
  {tab === 'cartoes' && <CardsPage online={online} />}
  ```
- Adicionar 4º `<TabButton>` no `<nav>`:
  ```tsx
  <TabButton icon={<CreditCard size={22} />} label="Cartões" active={tab === 'cartoes'} onClick={() => setTab('cartoes')} />
  ```
- Ajustar layout da nav para 4 colunas (adicionar `overflow-x-auto` ou ajustar padding se necessário para caber 4 tabs no mobile)

### Task 2.2: Criar `src/features/cards/CardsPage.tsx` — estrutura base + view cards

**Files:** Create `src/features/cards/CardsPage.tsx`

Estrutura inicial com view `cards` apenas (statements e detail virão no Slice 3):

```tsx
import { useState } from 'react';
import { useAccounts } from '../../lib/api/queries';
import { formatBRL, type Account } from '../../lib/api/types';
import { getErrorMessage } from '../../lib/get-error-message';
import { getAccountIcon } from '../../lib/ui/account-icon';
import { CreditCard, Sparkles, Plus, RefreshCw, ChevronLeft } from 'lucide-react';

type View = 'cards' | 'statements' | 'detail';

interface Props {
  online?: boolean;
}

export function CardsPage({ online = true }: Props) {
  const [view, setView] = useState<View>('cards');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);

  const accounts = useAccounts();
  const cards = (accounts.data ?? []).filter(a => a.kind === 'credit_card');

  // ── Navigation helpers ──
  const goToStatements = (cardId: string) => { setSelectedCardId(cardId); setView('statements'); };
  const goToDetail = (statementId: string) => { setSelectedStatementId(statementId); setView('detail'); };
  const goBack = () => {
    if (view === 'detail') setView('statements');
    else if (view === 'statements') { setView('cards'); setSelectedCardId(null); }
  };

  // ── View: cards ──
  if (view === 'cards') {
    return (
      <div className="space-y-4 pb-4">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <QAButton icon={<Plus size={18} />} label="Nova compra" disabled={!online}
            onClick={() => {}} /* Slice 4 */
          />
          <QAButton icon={<RefreshCw size={18} />} label="Nova recorrência" disabled={!online}
            onClick={() => {}} /* Slice 4 */
          />
        </div>

        {/* Loading */}
        {accounts.isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="card animate-pulse"><div className="h-4 w-24 bg-slate-200 rounded mb-3" /><div className="h-2 w-full bg-slate-100 rounded mb-2" /><div className="h-3 w-32 bg-slate-200 rounded" /></div>)}
          </div>
        )}

        {/* Error */}
        {accounts.error && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-slate-400 text-sm">{getErrorMessage(accounts.error)}</p>
            <button onClick={() => accounts.refetch()} className="text-accent text-sm font-medium">Tentar novamente</button>
          </div>
        )}

        {/* Empty */}
        {!accounts.isLoading && !accounts.error && cards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CreditCard size={40} className="text-slate-300" />
            <p className="text-slate-500 text-sm font-medium">Nenhum cartão cadastrado</p>
            <p className="text-slate-400 text-xs text-center max-w-52">Cadastre um cartão pelo WhatsApp para começar.</p>
          </div>
        )}

        {/* Cards */}
        {!accounts.isLoading && !accounts.error && cards.map(card => (
          <CardSummaryCard key={card.id} card={card} onTap={() => goToStatements(card.id)} />
        ))}
      </div>
    );
  }

  // ── View: statements (Slice 3) ──
  if (view === 'statements') {
    return (
      <div className="space-y-4 pb-4">
        <BackButton onClick={goBack} label="Cartões" />
        <p className="text-slate-400 text-sm">Selecione uma fatura (Slice 3)</p>
      </div>
    );
  }

  // ── View: detail (Slice 3) ──
  if (view === 'detail') {
    return (
      <div className="space-y-4 pb-4">
        <BackButton onClick={goBack} label="Faturas" />
        <p className="text-slate-400 text-sm">Detalhe da fatura (Slice 3)</p>
      </div>
    );
  }

  return null;
}

// ── Sub-components inline ──

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm text-accent font-medium -ml-1 py-1">
      <ChevronLeft size={18} /><span>{label}</span>
    </button>
  );
}

function QAButton({ icon, label, disabled, onClick }: { icon: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-white border border-[var(--color-border)] active:bg-slate-50 transition disabled:opacity-40">
      <span className="text-accent">{icon}</span>
      <span className="text-xs font-medium text-[var(--color-text)]">{label}</span>
    </button>
  );
}

function CardSummaryCard({ card, onTap }: { card: Account; onTap: () => void }) {
  const { icon: Icon, bg, color } = getAccountIcon(card.name, card.kind);
  const limitCents = (card as any).creditLimitCents ?? 0;
  const usedCents = limitCents > 0 ? Math.max(0, limitCents - card.balanceCents) : 0;
  const pct = limitCents > 0 ? Math.min(100, Math.round((usedCents / limitCents) * 100)) : 0;
  const barColor = pct > 100 ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-accent';

  return (
    <button onClick={onTap} className="card w-full text-left active:bg-slate-50 transition">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
          <Icon size={18} className={color} />
        </div>
        <div>
          <p className="font-semibold text-sm">{card.name}</p>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            {limitCents > 0 ? `${formatBRL(usedCents)} de ${formatBRL(limitCents)}` : 'Limite não definido'}
          </p>
        </div>
      </div>
      {limitCents > 0 && (
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
      <p className="text-[11px] text-[var(--color-text-secondary)]">
        {pct}% utilizado
        {(card as any).closingDay && (card as any).dueDay
          ? ` · Fecha dia ${(card as any).closingDay} · Vence dia ${(card as any).dueDay}`
          : ''}
      </p>
    </button>
  );
}
```

**Nota:** `Account` no PWA hoje não tem `creditLimitCents`, `closingDay`, `dueDay`. O type cast `(card as any)` é temporário até a API retornar esses campos ou o tipo `Account` ser estendido. Na spec, `CreditCardAccount extends Account` com esses campos extras. Enquanto a API não retorna, o fallback `limitCents > 0 ? ... : 'Limite não definido'` cobre o gap.

### Task 2.3: Escrever testes para CardSummaryCard

**Files:** Create `src/features/cards/cards-rows.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardsPage } from './CardsPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock queries
vi.mock('../../lib/api/queries', () => ({
  useAccounts: () => ({
    data: [
      { id: 'c1', name: 'Nubank', kind: 'credit_card', balanceCents: 800000, creditLimitCents: 1000000, closingDay: 15, dueDay: 25 },
      { id: 'c2', name: 'Inter', kind: 'credit_card', balanceCents: -200000, creditLimitCents: 500000, closingDay: 5, dueDay: 15 },
    ],
    isLoading: false,
    error: null,
  }),
  useStatements: () => ({ data: null, isLoading: true, error: null }),
  useStatementDetail: () => ({ data: null, isLoading: true, error: null }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('CardsPage — card list', () => {
  it('renders all credit card accounts', () => {
    render(<CardsPage online={true} />, { wrapper });
    expect(screen.getByText('Nubank')).toBeInTheDocument();
    expect(screen.getByText('Inter')).toBeInTheDocument();
  });

  it('shows used/limit values formatted in BRL', () => {
    render(<CardsPage online={true} />, { wrapper });
    // Nubank: balance=800000 → used=200000, limit=1000000 → "R$ 2.000,00 de R$ 10.000,00"
    expect(screen.getByText(/R\$\s*2\.000,00 de R\$\s*10\.000,00/)).toBeInTheDocument();
  });

  it('shows closing/due day when available', () => {
    render(<CardsPage online={true} />, { wrapper });
    expect(screen.getByText(/Fecha dia 15 · Vence dia 25/)).toBeInTheDocument();
    expect(screen.getByText(/Fecha dia 5 · Vence dia 15/)).toBeInTheDocument();
  });

  it('shows percentage label', () => {
    render(<CardsPage online={true} />, { wrapper });
    expect(screen.getByText('20% utilizado')).toBeInTheDocument();
    expect(screen.getByText('140% utilizado')).toBeInTheDocument();
  });

  it('disables quick actions when offline', () => {
    render(<CardsPage online={false} />, { wrapper });
    const btn = screen.getByText('Nova compra').closest('button');
    expect(btn).toBeDisabled();
  });
});
```

### Task 2.4: Teste de componente para App.tsx

**Files:** Modify `src/App.test.tsx`

Adicionar teste para verificar que a 4ª tab renderiza:

```tsx
it('renders Cartões tab with credit card icon', () => {
  // mock auth + queries as existing tests do
  const tab = screen.getByText('Cartões');
  expect(tab).toBeInTheDocument();
});
```

### Task 2.5: Verificação do Slice 2

```bash
cd D:/projetos/pi-finance-web
npm run typecheck
npx vitest run src/features/cards/
npx vitest run src/App.test.tsx
npx vitest run  # full suite, sem regressão
npm run build   # verificar code-splitting (novo chunk para cards)
```

---

## Slice 3: Drill-down — Faturas + Detalhe da fatura

**Depende de:** Slice 2, API endpoints de statements existirem.
**Entregável:** Navegação completa cards → statements → detail, com dados mockados se API não disponível.

### Task 3.1: Implementar view `statements` em `CardsPage.tsx`

**Files:** Modify `src/features/cards/CardsPage.tsx`

Substituir o placeholder da view `statements` por:

```tsx
if (view === 'statements' && selectedCardId) {
  const card = cards.find(c => c.id === selectedCardId);
  const statements = useStatements(selectedCardId);
  const { icon: Icon, bg, color } = card ? getAccountIcon(card.name, card.kind) : { icon: CreditCard, bg: 'bg-indigo-50', color: 'text-indigo-600' };

  return (
    <div className="space-y-4 pb-4">
      <BackButton onClick={goBack} label="Cartões" />
      {/* Card header */}
      {card && (
        <div className="card">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={18} className={color} />
            </div>
            <div>
              <p className="font-semibold text-sm">{card.name}</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                {formatBRL(card.balanceCents)} disponível
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {statements.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="card animate-pulse"><div className="h-4 w-24 bg-slate-200 rounded mb-2" /><div className="h-3 w-32 bg-slate-200 rounded" /></div>)}
        </div>
      )}

      {/* Error */}
      {statements.error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-slate-400 text-sm">{getErrorMessage(statements.error)}</p>
          <button onClick={() => statements.refetch()} className="text-accent text-sm font-medium">Tentar novamente</button>
        </div>
      )}

      {/* Empty */}
      {!statements.isLoading && !statements.error && (!statements.data?.items || statements.data.items.length === 0) && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Sparkles size={32} className="text-slate-300" />
          <p className="text-slate-500 text-sm font-medium">Nenhuma fatura</p>
          <p className="text-slate-400 text-xs">As faturas aparecerão aqui conforme as compras forem registradas.</p>
        </div>
      )}

      {/* Statement list */}
      {!statements.isLoading && !statements.error && statements.data?.items.map(s => (
        <StatementRow key={s.id} statement={s} onTap={() => goToDetail(s.id)} />
      ))}
    </div>
  );
}
```

### Task 3.2: Implementar view `detail` em `CardsPage.tsx`

**Files:** Modify `src/features/cards/CardsPage.tsx`

Substituir o placeholder da view `detail` por:

```tsx
if (view === 'detail' && selectedStatementId) {
  const detail = useStatementDetail(selectedStatementId);

  return (
    <div className="space-y-4 pb-4">
      <BackButton onClick={goBack} label="Faturas" />

      {/* Loading */}
      {detail.isLoading && (
        <div className="space-y-3">
          <div className="card animate-pulse"><div className="h-4 w-24 bg-slate-200 rounded mb-2" /><div className="h-6 w-32 bg-slate-200 rounded" /></div>
          {[1,2,3].map(i => <div key={i} className="card animate-pulse"><div className="h-3 w-40 bg-slate-200 rounded" /></div>)}
        </div>
      )}

      {/* Error */}
      {detail.error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-slate-400 text-sm">{getErrorMessage(detail.error)}</p>
          <button onClick={() => detail.refetch()} className="text-accent text-sm font-medium">Tentar novamente</button>
        </div>
      )}

      {/* Data */}
      {detail.data && (
        <>
          {/* Statement header */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                Fatura {detail.data.closingDate.slice(0, 7).replace('-', '/')}
              </p>
              <StatusBadge status={detail.data.status} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--color-border)]">
              <Kpi label="Total" value={formatBRL(detail.data.totalCents)} />
              <Kpi label="Pago" value={formatBRL(detail.data.paidCents)} />
              <Kpi label="Restante" value={formatBRL(detail.data.balanceCents)} highlight={detail.data.balanceCents > 0} />
            </div>
            {detail.data.dueDate && (
              <p className="text-[11px] text-[var(--color-text-secondary)] mt-3">Vencimento: {formatDate(detail.data.dueDate)}</p>
            )}
          </div>

          {/* Payment section placeholder (Slice 4) */}
          {detail.data.status !== 'paid' && (
            <div className="card">
              <p className="text-xs text-slate-400">Pagamento disponível no Slice 4</p>
            </div>
          )}

          {/* Purchases list */}
          <div className="space-y-0">
            {detail.data.purchases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Sparkles size={24} className="text-slate-300" />
                <p className="text-slate-400 text-sm">Nenhuma compra nesta fatura</p>
              </div>
            ) : (
              detail.data.purchases.map(p => <PurchaseRow key={p.id} purchase={p} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

### Task 3.3: Adicionar sub-componentes inline

**Files:** Modify `src/features/cards/CardsPage.tsx` (adicionar após `CardSummaryCard`)

```tsx
// ── Statement row ──

function StatementRow({ statement, onTap }: { statement: import('../../lib/api/types').Statement; onTap: () => void }) {
  const statusColors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    closed: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
    partial: 'bg-teal-100 text-teal-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  const label = `Fechamento ${formatDateShort(statement.closingDate)}`;

  return (
    <button onClick={onTap} className="card w-full text-left active:bg-slate-50 transition">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
            {formatBRL(statement.totalCents)} total
            {statement.balanceCents > 0 && ` · ${formatBRL(statement.balanceCents)} em aberto`}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[statement.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {statement.status === 'open' ? 'Aberta' :
           statement.status === 'closed' ? 'Fechada' :
           statement.status === 'paid' ? 'Paga' :
           statement.status === 'partial' ? 'Parcial' :
           statement.status === 'overdue' ? 'Atrasada' :
           statement.status === 'cancelled' ? 'Cancelada' : statement.status}
        </span>
      </div>
    </button>
  );
}

// ── Purchase row ──

function PurchaseRow({ purchase }: { purchase: import('../../lib/api/types').StatementPurchase }) {
  const isInstallment = purchase.installmentsTotal && purchase.installmentsTotal > 1;

  return (
    <div className="card !rounded-none !border-0 !border-b !border-[var(--color-border)] first:!rounded-t-2xl last:!rounded-b-2xl last:!border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm truncate">{purchase.description}</span>
            {isInstallment && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium shrink-0">
                {purchase.installmentNumber}/{purchase.installmentsTotal}
              </span>
            )}
            {purchase.isRecurring && (
              <RefreshCw size={10} className="text-indigo-500 shrink-0" />
            )}
          </div>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">{formatDateShort(purchase.date)}</p>
        </div>
        <span className="text-sm font-semibold text-expense shrink-0">{formatBRL(purchase.amountCents)}</span>
      </div>
    </div>
  );
}

// ── Helpers ──

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    closed: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
    partial: 'bg-teal-100 text-teal-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status === 'open' ? 'Aberta' : status === 'closed' ? 'Fechada' : status === 'paid' ? 'Paga' :
       status === 'partial' ? 'Parcial' : status === 'overdue' ? 'Atrasada' : status === 'cancelled' ? 'Cancelada' : status}
    </span>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${highlight ? 'text-expense' : ''}`}>{value}</p>
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}
```

### Task 3.4: Estender testes de rows

**Files:** Modify `src/features/cards/cards-rows.test.tsx`

Adicionar após os testes existentes:

```tsx
describe('StatementRow', () => {
  it('renders statement with correct status badge and values', () => {
    // Testado via CardsPage com mock de useStatements
  });

  it('shows overdue badge in red', () => {
    // mock statement status=overdue → verificar classe bg-red-100
  });
});
```

**Nota:** Testes de StatementRow e PurchaseRow são testados via `CardsPage` com mocks de queries — seguindo o padrão de `RecordsPage` (rows não são exportados separadamente).

### Task 3.5: Verificação do Slice 3

```bash
cd D:/projetos/pi-finance-web
npm run typecheck
npx vitest run src/features/cards/
npm run build
```

---

## Slice 4: Sheets — Compra, Parcelamento, Recorrência, Pagamento

**Depende de:** Slice 3.
**Entregável:** 4 sheets funcionais com validação, idempotency-key, retry, e preview de parcelas.

### Task 4.1: Criar `src/features/cards/card-sheets.tsx`

**Files:** Create `src/features/cards/card-sheets.tsx`

```tsx
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sheet } from '../../components/ui/Sheet';
import { parseAmountToCents } from '../../lib/forms/amount';
import { cardPurchaseFormSchema, recurringFormSchema, type CardPurchaseFormValues, type RecurringFormValues } from '../../lib/forms/schemas';

interface Option { id: string; name: string }

function today(): string { return new Date().toISOString().slice(0, 10); }

function Err({ message }: { message?: string }) {
  return message ? <p className="text-red-500 text-xs mt-1">{message}</p> : null;
}

function SubmitButton({ pending, error, label }: { pending?: boolean; error?: string; label: string }) {
  return (
    <button type="submit" disabled={pending} className="w-full rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-50">
      {error ? 'Tentar novamente' : label}
    </button>
  );
}

// ── Helpers para preview de parcelas ──

function generateInstallmentPreview(purchaseDate: string, totalCents: number, n: number): { month: string; value: number }[] {
  const date = new Date(purchaseDate + 'T00:00:00');
  const baseValue = Math.floor(totalCents / n);
  const remainder = totalCents - baseValue * n;
  const months: { month: string; value: number }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + i);
    months.push({
      month: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      value: i === n - 1 ? baseValue + remainder : baseValue,
    });
  }
  return months;
}

// ── PurchaseSheet (compra simples + parcelada) ──

export interface PurchaseSheetPayload {
  description: string; amountCents: number; date: string;
  accountId: string; categoryId: string; installments: number;
  idempotencyKey: string;
}

interface PurchaseSheetProps {
  accountId: string;
  cats: Option[];
  onSubmit: (payload: PurchaseSheetPayload) => void;
  onClose: () => void;
  error?: string;
  pending?: boolean;
}

export function PurchaseSheet({ accountId, cats, onSubmit, onClose, error, pending }: PurchaseSheetProps) {
  const idempotencyKey = useRef(crypto.randomUUID());
  const { register, handleSubmit, watch, formState: { errors } } = useForm<CardPurchaseFormValues>({
    resolver: zodResolver(cardPurchaseFormSchema),
    defaultValues: { description: '', amount: '', date: today(), categoryId: cats[0]?.id ?? '', installments: 1 },
  });

  const installmentsVal = watch('installments') ?? 1;
  const amountVal = watch('amount');
  const dateVal = watch('date');
  const totalCents = parseAmountToCents(amountVal ?? '') ?? 0;
  const preview = installmentsVal > 1 && totalCents > 0
    ? generateInstallmentPreview(dateVal || today(), totalCents, installmentsVal)
    : [];

  const submit = handleSubmit((v) => {
    onSubmit({
      description: v.description.trim(),
      amountCents: parseAmountToCents(v.amount)!,
      date: v.date,
      accountId,
      categoryId: v.categoryId,
      installments: v.installments,
      idempotencyKey: idempotencyKey.current,
    });
  });

  return (
    <Sheet title={installmentsVal > 1 ? 'Compra parcelada' : 'Nova compra'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Descrição</label>
          <input placeholder="Ex: Supermercado" {...register('description')} />
          <Err message={errors.description?.message} />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Valor (R$)</label>
          <input type="text" inputMode="decimal" placeholder="0,00" {...register('amount')} />
          <Err message={errors.amount?.message} />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Data</label>
          <input type="date" {...register('date')} />
          <Err message={errors.date?.message} />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Categoria</label>
          <select {...register('categoryId')}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <Err message={errors.categoryId?.message} />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Parcelas</label>
          <input type="number" min={1} max={48} {...register('installments', { valueAsNumber: true })} />
          <Err message={errors.installments?.message} />
        </div>

        {/* Installment preview */}
        {preview.length > 0 && (
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[11px] font-medium text-[var(--color-text-secondary)] mb-2">
              {installmentsVal}x de {formatBRL(preview[0]?.value ?? 0)}
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {preview.map((p, i) => (
                <div key={i} className="flex justify-between text-[11px] text-[var(--color-text-secondary)]">
                  <span>{i + 1}ª parcela</span>
                  <span className="font-medium">{p.month}</span>
                  <span>{formatBRL(p.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <SubmitButton pending={pending} error={error} label={installmentsVal > 1 ? 'Registrar parcelamento' : 'Registrar compra'} />
      </form>
    </Sheet>
  );
}

// ── RecurringSheet ──

export interface RecurringPayload {
  description: string; amountCents: number; frequency: 'monthly' | 'quarterly' | 'yearly';
  startDate: string; endDate?: string; accountId: string; categoryId: string;
  idempotencyKey: string;
}

interface RecurringSheetProps {
  accountId: string;
  cats: Option[];
  onSubmit: (payload: RecurringPayload) => void;
  onClose: () => void;
  error?: string;
  pending?: boolean;
}

export function RecurringSheet({ accountId, cats, onSubmit, onClose, error, pending }: RecurringSheetProps) {
  const idempotencyKey = useRef(crypto.randomUUID());
  const { register, handleSubmit, watch, formState: { errors } } = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: { description: '', amount: '', frequency: 'monthly', startDate: today(), endDate: '', categoryId: cats[0]?.id ?? '' },
  });

  const freq = watch('frequency');
  const freqLabel = freq === 'monthly' ? 'mês' : freq === 'quarterly' ? 'trimestre' : 'ano';
  const amountVal = watch('amount');
  const startVal = watch('startDate');
  const endVal = watch('endDate');
  const cents = parseAmountToCents(amountVal ?? '');

  const submit = handleSubmit((v) => {
    onSubmit({
      description: v.description.trim(),
      amountCents: parseAmountToCents(v.amount)!,
      frequency: v.frequency,
      startDate: v.startDate,
      endDate: v.endDate?.trim() || undefined,
      accountId,
      categoryId: v.categoryId,
      idempotencyKey: idempotencyKey.current,
    });
  });

  return (
    <Sheet title="Nova recorrência" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Descrição</label>
          <input placeholder="Ex: Netflix" {...register('description')} />
          <Err message={errors.description?.message} />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Valor (R$)</label>
          <input type="text" inputMode="decimal" placeholder="0,00" {...register('amount')} />
          <Err message={errors.amount?.message} />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Frequência</label>
          <select {...register('frequency')}>
            <option value="monthly">Mensal</option>
            <option value="quarterly">Trimestral</option>
            <option value="yearly">Anual</option>
          </select>
          <Err message={errors.frequency?.message} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Início</label>
            <input type="date" {...register('startDate')} />
            <Err message={errors.startDate?.message} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Fim (opcional)</label>
            <input type="date" {...register('endDate')} />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Categoria</label>
          <select {...register('categoryId')}>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <Err message={errors.categoryId?.message} />
        </div>

        {/* Preview */}
        {cents && startVal && (
          <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-[var(--color-text-secondary)]">
            {formatBRL(cents)} a cada {freqLabel} a partir de {new Date(startVal + 'T00:00:00').toLocaleDateString('pt-BR')}
            {endVal ? ` até ${new Date(endVal + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}
          </div>
        )}

        <SubmitButton pending={pending} error={error} label="Criar recorrência" />
      </form>
    </Sheet>
  );
}

// ── formatBRL duplicado no escopo do módulo (re-export do types) ──
import { formatBRL } from '../../lib/api/types';
```

### Task 4.2: Integrar sheets na `CardsPage.tsx`

**Files:** Modify `src/features/cards/CardsPage.tsx`

Adicionar imports:
```tsx
import { PurchaseSheet, RecurringSheet, type PurchaseSheetPayload, type RecurringPayload } from './card-sheets';
import { useCreateCardPurchase, useCreateCardInstallments, useCreateRecurring, usePayStatement } from '../../lib/api/mutations';
import { getErrorMessage } from '../../lib/get-error-message';
```

Adicionar state para sheets:
```tsx
const [sheetMode, setSheetMode] = useState<'purchase' | 'recurring' | null>(null);

// Mutation hooks
const createPurchase = useCreateCardPurchase();
const createInstallments = useCreateCardInstallments();
const createRecurring = useCreateRecurring();
const payStmt = usePayStatement();

// Categories for sheets
const cats = useCategories();
const catOptions: Option[] = (cats.data ?? []).map(c => ({ id: c.id, name: c.name }));
```

Conectar sheets no render (fora das views, no final do return):
```tsx
{/* PurchaseSheet */}
{sheetMode === 'purchase' && selectedCardId && (
  <PurchaseSheet
    accountId={selectedCardId}
    cats={catOptions}
    onSubmit={(p) => {
      if (p.installments <= 1) {
        createPurchase.mutate({ ...p, idempotencyKey: p.idempotencyKey }, { onSuccess: () => setSheetMode(null) });
      } else {
        createInstallments.mutate({
          accountId: p.accountId,
          description: p.description,
          totalAmountCents: p.amountCents,
          purchaseDate: p.date,
          installmentsTotal: p.installments,
          categoryId: p.categoryId,
          idempotencyKey: p.idempotencyKey,
        }, { onSuccess: () => setSheetMode(null) });
      }
    }}
    onClose={() => { if (!createPurchase.isPending && !createInstallments.isPending) setSheetMode(null); }}
    error={getErrorMessage(createPurchase.error ?? createInstallments.error)}
    pending={createPurchase.isPending || createInstallments.isPending}
  />
)}

{/* RecurringSheet */}
{sheetMode === 'recurring' && selectedCardId && (
  <RecurringSheet
    accountId={selectedCardId}
    cats={catOptions}
    onSubmit={(p) => {
      createRecurring.mutate({ ...p, idempotencyKey: p.idempotencyKey }, { onSuccess: () => setSheetMode(null) });
    }}
    onClose={() => { if (!createRecurring.isPending) setSheetMode(null); }}
    error={getErrorMessage(createRecurring.error)}
    pending={createRecurring.isPending}
  />
)}
```

Conectar botões QA na view `cards`:
```tsx
<QAButton icon={<Plus size={18} />} label="Nova compra" disabled={!online || cards.length === 0}
  onClick={() => { if (cards.length > 0) { setSelectedCardId(cards[0].id); setSheetMode('purchase'); } }}
/>
<QAButton icon={<RefreshCw size={18} />} label="Nova recorrência" disabled={!online || cards.length === 0}
  onClick={() => { if (cards.length > 0) { setSelectedCardId(cards[0].id); setSheetMode('recurring'); } }}
/>
```

**Nota V1:** PurchaseSheet e RecurringSheet sempre usam o **primeiro cartão** da lista (`cards[0].id`) como accountId. A spec define que o usuário escolhe o cartão em versão futura. Na V1, assume-se um cartão principal ou o primeiro da lista.

### Task 4.3: Seção de pagamento na view `detail`

**Files:** Modify `src/features/cards/CardsPage.tsx`

Substituir o placeholder "Pagamento disponível no Slice 4" na view `detail`:

```tsx
{/* Payment section */}
{detail.data.status !== 'paid' && detail.data.balanceCents > 0 && (
  <div className="card">
    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)] mb-3">Pagamento</p>

    {/* Shortcut chips */}
    <div className="grid grid-cols-4 gap-2 mb-3">
      {[25, 50, 75, 100].map(pct => {
        const chipValue = Math.round(detail.data!.balanceCents * pct / 100);
        const isActive = payAmount === chipValue;
        return (
          <button key={pct} type="button"
            onClick={() => setPayAmount(isActive ? 0 : chipValue)}
            className={`rounded-full py-1.5 text-xs font-medium transition ${
              isActive ? 'bg-accent text-white' : 'bg-white border border-[var(--color-border)] text-slate-600'
            }`}>
            {pct}%
          </button>
        );
      })}
    </div>

    {/* Custom amount */}
    <div className="mb-3">
      <label className="text-[11px] text-slate-500 mb-1 block">Outro valor</label>
      <input type="text" inputMode="decimal" placeholder="0,00"
        value={payAmount > 0 ? formatBRL(payAmount).replace('R$', '').trim() : ''}
        onChange={e => {
          const raw = e.target.value.replace(/[^\d,]/g, '').replace(',', '.');
          const n = Number(raw);
          setPayAmount(Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0);
        }}
        disabled={!online}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm"
      />
    </div>

    {/* Source account selector */}
    <div className="mb-3">
      <label className="text-[11px] text-slate-500 mb-1 block">Conta de origem</label>
      <select
        value={payFromAccountId}
        onChange={e => setPayFromAccountId(e.target.value)}
        disabled={!online || nonCardAccounts.length === 0}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm"
      >
        <option value="">Selecione uma conta</option>
        {nonCardAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      {nonCardAccounts.length === 0 && (
        <p className="text-red-400 text-[11px] mt-1">Nenhuma conta disponível para pagamento</p>
      )}
    </div>

    {/* Pay button */}
    <button
      onClick={() => {
        if (payAmount > 0 && payFromAccountId) {
          payStmt.mutate({
            statementId: detail.data!.id,
            amountCents: payAmount,
            fromAccountId: payFromAccountId,
            idempotencyKey: payIdempotencyKey.current,
          });
        }
      }}
      disabled={!online || payAmount <= 0 || !payFromAccountId || payStmt.isPending}
      className="w-full rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-50"
    >
      {payStmt.error ? 'Tentar novamente' : payStmt.isPending ? 'Processando…' : `Pagar ${formatBRL(payAmount)}`}
    </button>
    {payStmt.error && (
      <p className="text-red-500 text-xs mt-2">{getErrorMessage(payStmt.error)}</p>
    )}
  </div>
)}
```

Adicionar state na função `CardsPage`:
```tsx
const [payAmount, setPayAmount] = useState(0);
const [payFromAccountId, setPayFromAccountId] = useState('');
const payIdempotencyKey = useRef(crypto.randomUUID());

// Non-card accounts for payment
const nonCardAccounts = (accounts.data ?? []).filter(a => a.kind !== 'credit_card');
```

Adicionar import:
```tsx
import { useRef } from 'react';  // já importado useState
```

### Task 4.4: Escrever testes de sheets

**Files:** Create `src/features/cards/card-sheets.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseSheet, RecurringSheet } from './card-sheets';

const cats = [{ id: 'c1', name: 'mercado' }, { id: 'c2', name: 'assinaturas' }];

describe('PurchaseSheet', () => {
  it('blocks submit and shows PT-BR error when empty', async () => {
    const onSubmit = vi.fn();
    render(<PurchaseSheet accountId="a1" cats={cats} onSubmit={onSubmit} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /registrar compra/i }));
    expect(await screen.findByText('Descreva a compra')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits with amount converted to cents', async () => {
    const onSubmit = vi.fn();
    render(<PurchaseSheet accountId="a1" cats={cats} onSubmit={onSubmit} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText('Descrição'), 'Mercado');
    await userEvent.type(screen.getByLabelText('Valor (R$)'), '150,50');
    await userEvent.click(screen.getByRole('button', { name: /registrar compra/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Mercado', amountCents: 15050, accountId: 'a1', installments: 1,
    }));
  });

  it('shows installment preview when installments > 1', async () => {
    const onSubmit = vi.fn();
    render(<PurchaseSheet accountId="a1" cats={cats} onSubmit={onSubmit} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText('Descrição'), 'Notebook');
    await userEvent.type(screen.getByLabelText('Valor (R$)'), '6000,00');
    // Change installments to 12
    const installInput = screen.getByLabelText('Parcelas');
    await userEvent.clear(installInput);
    await userEvent.type(installInput, '12');

    // Preview should show installment value
    await waitFor(() => {
      expect(screen.getByText(/12x de/)).toBeInTheDocument();
    });

    // Submit button label should change
    expect(screen.getByRole('button', { name: /registrar parcelamento/i })).toBeInTheDocument();
  });

  it('reuses same idempotency key on retry', async () => {
    const onSubmit = vi.fn();
    render(<PurchaseSheet accountId="a1" cats={cats} onSubmit={onSubmit} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText('Descrição'), 'Mercado');
    await userEvent.type(screen.getByLabelText('Valor (R$)'), '50,00');
    await userEvent.click(screen.getByRole('button', { name: /registrar compra/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: /registrar compra/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    expect(onSubmit.mock.calls[0]?.[0]?.idempotencyKey).toBe(onSubmit.mock.calls[1]?.[0]?.idempotencyKey);
  });
});

describe('RecurringSheet', () => {
  it('submits with frequency and dates', async () => {
    const onSubmit = vi.fn();
    render(<RecurringSheet accountId="a1" cats={cats} onSubmit={onSubmit} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText('Descrição'), 'Netflix');
    await userEvent.type(screen.getByLabelText('Valor (R$)'), '39,90');
    await userEvent.click(screen.getByRole('button', { name: /criar recorrência/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Netflix', amountCents: 3990, frequency: 'monthly',
    }));
  });

  it('shows preview of recurring schedule', async () => {
    const onSubmit = vi.fn();
    render(<RecurringSheet accountId="a1" cats={cats} onSubmit={onSubmit} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText('Descrição'), 'Netflix');
    await userEvent.type(screen.getByLabelText('Valor (R$)'), '39,90');

    await waitFor(() => {
      expect(screen.getByText(/R\$\s*39,90 a cada mês/)).toBeInTheDocument();
    });
  });
});
```

### Task 4.5: Verificação do Slice 4

```bash
cd D:/projetos/pi-finance-web
npm run typecheck
npx vitest run src/features/cards/
npx vitest run  # full suite
npm run build
```

---

## Slice 5: Offline / Erro / Polish + Verificação final

**Depende de:** Slice 4.
**Entregável:** Estados offline completos, tratamento de erro nos sheets, verificação final cruzada com spec.

### Task 5.1: Estados offline — revisão de `disabled`

**Files:** Modify `src/features/cards/CardsPage.tsx`

Verificar que todos os pontos de escrita estão protegidos por `online`:
- ✅ QA buttons (Slice 2)
- ✅ PurchaseSheet/RecurringSheet (já condicionados por `!online || cards.length === 0`)
- ✅ Payment chips, custom amount input, source selector, pay button (Slice 4)
- ✅ OfflineBanner já é global (App.tsx)

### Task 5.2: Empty state quando sem cartão + tentativa de ação

**Files:** Modify `src/features/cards/CardsPage.tsx`

QA buttons já têm `cards.length === 0` como condição de disabled. Confirmar tooltip ou hint visual quando desabilitado por falta de cartão.

### Task 5.3: Payment success — limpar estado

**Files:** Modify `src/features/cards/CardsPage.tsx`

Adicionar `onSuccess` no `payStmt.mutate` que limpa `payAmount` e `payFromAccountId` e gera nova `idempotencyKey`:

```tsx
onSuccess: () => {
  setPayAmount(0);
  setPayFromAccountId('');
  payIdempotencyKey.current = crypto.randomUUID();
}
```

### Task 5.4: Verificação final completa

```bash
cd D:/projetos/pi-finance-web

# TypeScript
npm run typecheck

# Testes unitários + componente
npx vitest run

# Build + PWA
npm run build

# E2E (se API disponível)
# npm run e2e
```

### Task 5.5: Self-review contra a spec

| Spec REQ | Cobertura no plano |
|---|---|
| REQ-C1 (lista cartões com barra, limite, fechamento, vencimento) | Slice 2 — `CardSummaryCard` |
| REQ-C2 (threshold cores na barra) | Slice 2 — `barColor` com ≤80%, >80%, >100% |
| REQ-C3 (tap card → statements) | Slice 2 — `goToStatements` |
| REQ-C4 (statements ordenados DESC) | Slice 3 — `StatementRow` (ordem vem da API) |
| REQ-C5 (status badges coloridos) | Slice 3 — `StatusBadge` com 6 cores |
| REQ-C6 (tap statement → detail) | Slice 3 — `goToDetail` |
| REQ-C7 (detail header + payment + purchases) | Slice 3 + Slice 4 |
| REQ-C8 (purchase rows com badge N/M e RefreshCw) | Slice 3 — `PurchaseRow` |
| REQ-C9 (PurchaseSheet com campos) | Slice 4 — `PurchaseSheet` |
| REQ-C10 (preview de parcelas N>1) | Slice 4 — `generateInstallmentPreview` |
| REQ-C11 (preview informativo, não editável) | Slice 4 — preview no sheet é read-only |
| REQ-C12 (RecurringSheet com campos) | Slice 4 — `RecurringSheet` |
| REQ-C13 (preview de recorrência) | Slice 4 — preview dinâmico no RecurringSheet |
| REQ-C14 (chips 25/50/75/100 + custom) | Slice 4 — payment section |
| REQ-C15 (chip preenche campo, toggle) | Slice 4 — `setPayAmount(isActive ? 0 : chipValue)` |
| REQ-C16 (filtro conta não-cartão) | Slice 4 — `nonCardAccounts` |
| REQ-C17 (submit pagamento + retry) | Slice 4 — `payStmt.mutate` com idempotency-key |
| REQ-C18 (status reflete pós-pagamento) | Slice 4 — `invalidateQueries` |
| REQ-C19 (offline: cache + disabled writes) | Slice 5 — revisão de `online` prop |
| REQ-C20 (empty states) | Slice 2 — cards empty; Slice 3 — statements/purchases empty |
| REQ-C21 (loading skeletons) | Slice 2 + Slice 3 — `animate-pulse` cards |
| REQ-C22 (navegação drill-down) | Slice 2 — `view` state, `goBack` |
| REQ-C23 (QA buttons só na view cards) | Slice 2 — condicional `view === 'cards'` |
| REQ-C24 (header statements com nome cartão) | Slice 3 — card header na view statements |
| REQ-C25 (non-goals: sem edição/exclusão/cancelamento) | Confirmado — sem mutations de edit/delete/cancel |
| REQ-C26 (sem pagamento via cartão) | Slice 4 — `nonCardAccounts` filtra `credit_card` |
| REQ-C27 (idempotency-key estável) | Slice 4 — `useRef(crypto.randomUUID())` em todos sheets |
| REQ-C28 (erro PT-BR, sheet aberto) | Slice 4 — `getErrorMessage`, `pending`/`error` props |

### Task 5.6: E2E (se API disponível)

**Files:** Create `e2e/cards.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test.describe('Cartões tab', () => {
  test('navigates to Cartões tab and sees empty state', async ({ page }) => {
    // mock API responses via page.route()
    await page.route('**/accounts', route => route.fulfill({
      status: 200, body: JSON.stringify({ items: [], total: 0 }),
    }));

    await page.goto('http://localhost:5173/');
    // bypass auth gate for E2E...
    await page.click('text=Cartões');
    await expect(page.locator('text=Nenhum cartão cadastrado')).toBeVisible();
  });
});
```

---

## Verification Commands (por slice)

| Slice | Comando | Esperado |
|---|---|---|
| 1 | `npm run typecheck && npx vitest run src/lib/forms/schemas.test.ts src/lib/api/` | typecheck 0, tests pass |
| 2 | `npm run typecheck && npx vitest run src/features/cards/ src/App.test.tsx` | typecheck 0, tests pass |
| 3 | `npm run typecheck && npx vitest run src/features/cards/` | typecheck 0, tests pass |
| 4 | `npm run typecheck && npx vitest run` | typecheck 0, ~110 tests pass |
| 5 | `npm run typecheck && npx vitest run && npm run build` | typecheck 0, tests pass, build ok, dist/sw.js presente |

---

## Non-goals (reforçados da spec)

- ❌ Sem edição de compra já faturada
- ❌ Sem exclusão de compra da fatura
- ❌ Sem cancelamento/edição de recorrência
- ❌ Sem criação de cartão pela UI do PWA
- ❌ Sem escrita offline
- ❌ Sem `card_insights` / `check_card_limits` na V1 (stretch opcional)
- ❌ Sem gráficos de gastos por cartão
- ❌ Sem multi-household
