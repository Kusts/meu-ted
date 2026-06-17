# PWA Contas a Pagar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar módulo Contas a Pagar ao PWA com surface híbrida: resumo na Home, mini resumo/atalhos na Carteira, tela dedicada com filtros, criação avulsa/recorrente, templates, pagamento com despesa automática e configuração de lembretes.

**Architecture:** Feature-based em `src/features/payables/` com `PayablesPage` (filtros + lista agrupada + FAB), sheets testáveis (`payable-sheets.tsx`), extensões em `src/lib/api/` (tipos, funções, queries, mutations), schemas Zod. Wire da 5ª tab em `App.tsx`. Backend: 10 endpoints REST a serem adicionados à `pi-finance-api`. `HomePage` ganha card de resumo e `WalletPage` ganha mini resumo + CTAs operacionais. Padrão herdado: RHF + Zod, TanStack Query, idempotency-key, cache offline, mobile-first.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, TanStack Query 5, React Hook Form 7 + Zod 4, lucide-react, Vitest + Testing Library, Playwright.

**Agent Orchestration:** Single-Agent Looped — 6 slices sequenciais com dependências; cada slice testável isoladamente.

---

## ⚠️ Dependency: Payables REST endpoints on pi-finance-api

**Auditoria:** `D:/projetos/pi-finance-api/src/routes/index.ts:1-41` registra apenas `auth`, `accounts`, `categories`, `transactions`, `transactions-write`, `dashboard`, `insights`, `cards`. **Não existem rotas REST para payables, templates ou notifications.** Os tools do Agent Pi (`accounts_payable.ts`, `payable_templates.ts`, `notifications.ts`) são RPC — não endpoints HTTP.

**Blocker:** Slice P-0 (backend) é pré-requisito para qualquer slice web.

### Endpoints REST a implementar (Slice P-0)

| Método | Path | Body/Params | Agent Pi Tool | Response |
|---|---|---|---|---|
| `GET` | `/payables` | `?status=&type=&dueWithinDays=` | `list_accounts_payable` | `{ items: Payable[], total }` |
| `POST` | `/payables` | `{ accountId, description, amountCents, dueDate, type?, frequency?, endDate?, reminderDaysBefore?, notes? }` | `create_account_payable` | `Payable` |
| `POST` | `/payables/:id/pay` | `{ paidDate?, createTransaction?, prepayMonths? }` | `mark_account_paid` | `Payable` |
| `POST` | `/payables/:id/cancel` | `{ reason? }` | `cancel_account_payable` | `Payable` |
| `GET` | `/payables/templates` | — | `list_payable_templates` | `{ items: PayableTemplate[], total }` |
| `POST` | `/payables/templates` | `{ accountId, name, description, amountCents, frequency, dayOfMonth, reminderDaysBefore?, notes? }` | `create_payable_template` | `PayableTemplate` |
| `POST` | `/payables/from-template` | `{ templateId?, templateName?, dueDate, amountOverrideCents? }` | `create_payable_from_template` | `Payable` |
| `GET` | `/payables/reminders` | — | `check_payable_reminders` | `{ items: Payable[] }` |
| `POST` | `/notifications` | `{ chatId, notificationType, enabled, scheduleHour?, scheduleMinute?, daysOfWeek?, thresholdDays? }` | `configure_notification` | `NotificationConfig` |
| `GET` | `/notifications` | `?chatId=` | `list_notifications` | `{ items: NotificationConfig[] }` |

Todos exigem `X-Device-Token`. POST requerem `Idempotency-Key`.

**Migration necessária:** `V005__payables.sql` — criar tabelas `accounts_payable`, `payable_templates`, `notification_configs` (seguindo padrão V004 de Cartões).

---

## File Map

### Criar

| Path | Responsabilidade |
|---|---|
| `src/features/payables/PayablesPage.tsx` | Página principal: filtros + lista agrupada + FAB |
| `src/features/payables/payable-sheets.tsx` | `PayableSheet`, `TemplateSheet`, `PayConfirmSheet` |
| `src/features/payables/payables-rows.test.tsx` | Testes de rows, filtros, agrupamento |
| `src/features/payables/payable-sheets.test.tsx` | Testes de sheets |
| `../pi-finance-api/src/routes/payables.ts` | Rotas REST de payables |
| `../pi-finance-api/src/read-models/sql/V005__payables.sql` | Migration do schema |

### Modificar

| Path | O quê |
|---|---|
| `src/App.tsx` | 5ª tab `Contas` com `React.lazy` |
| `src/features/home/HomePage.tsx` | Card de resumo "Próximas contas" |
| `src/features/wallet/WalletPage.tsx` | Mini resumo de contas a pagar + CTAs `Nova conta` e `Templates` |
| `src/lib/api/types.ts` | `Payable`, `PayableTemplate`, `PayableFilters`, `NotificationConfig` |
| `src/lib/api/finance-api.ts` | `getPayables`, `createPayable`, `markPayablePaid`, `cancelPayable`, `getTemplates`, `createTemplate`, `createFromTemplate`, `getReminders`, `configureNotification`, `listNotifications` |
| `src/lib/api/queries.ts` | `usePayables`, `useTemplates`, `useNotifications` |
| `src/lib/api/mutations.ts` | `useCreatePayable`, `useMarkPayablePaid`, `useCancelPayable`, `useCreateTemplate`, `useCreatePayableFromTemplate`, `useConfigureNotification` |
| `src/lib/forms/schemas.ts` | `payableFormSchema`, `templateFormSchema`, `notificationFormSchema` |
| `e2e/helpers/api-mock.ts` | Mocks de `/payables/*`, `/notifications/*` |
| `../pi-finance-api/src/routes/index.ts` | Registrar `registerPayableRoutes` |
| `../pi-finance-api/src/server/index.ts` | Injetar `PayableStore` |
| `../pi-finance-api/src/types/domain.ts` | Tipos `Payable`, `PayableTemplate`, `NotificationConfig` |

---

## Slice P-0: Backend — Payables REST endpoints

**Depende de:** Nada (pré-requisito).
**Entregável:** 10 endpoints REST funcionais com testes.

### Task P-0.1: Migration V005__payables.sql

```sql
CREATE TABLE IF NOT EXISTS accounts_payable (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID NOT NULL,
    account_id          UUID NOT NULL REFERENCES accounts(id),
    description         TEXT NOT NULL,
    amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
    due_date            DATE NOT NULL,
    type                TEXT NOT NULL DEFAULT 'one_time' CHECK (type IN ('one_time', 'recurring')),
    frequency           TEXT CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
    end_date            DATE,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
    paid_date           DATE,
    paid_amount_cents   BIGINT,
    reminder_days_before INTEGER DEFAULT 0,
    notes               TEXT,
    category_id         UUID REFERENCES categories(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payable_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID NOT NULL,
    account_id          UUID NOT NULL REFERENCES accounts(id),
    name                TEXT NOT NULL,
    description         TEXT NOT NULL,
    amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
    frequency           TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
    day_of_month        INTEGER NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
    reminder_days_before INTEGER DEFAULT 0,
    notes               TEXT,
    active              BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_configs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID NOT NULL,
    chat_id             TEXT NOT NULL,
    notification_type   TEXT NOT NULL CHECK (notification_type IN ('overdue_reminder', 'due_today_reminder', 'upcoming_reminder', 'daily_summary', 'weekly_summary')),
    enabled             BOOLEAN NOT NULL DEFAULT true,
    schedule_hour       INTEGER DEFAULT 9,
    schedule_minute     INTEGER DEFAULT 0,
    days_of_week        INTEGER[] DEFAULT '{1,2,3,4,5}',
    threshold_days      INTEGER DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (household_id, chat_id, notification_type)
);

CREATE INDEX IF NOT EXISTS payables_household_status_idx ON accounts_payable (household_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS payables_due_date_idx ON accounts_payable (household_id, due_date) WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS templates_household_active_idx ON payable_templates (household_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS notification_household_chat_idx ON notification_configs (household_id, chat_id);
```

### Task P-0.2: PayableStore + implementações

Seguir o padrão de `CardStore`:
- `src/payables/store.ts` — interface `PayableStore`
- `src/payables/in-memory.ts` — implementação in-memory
- `src/payables/postgres.ts` — implementação postgres

### Task P-0.3: Rotas REST

`src/routes/payables.ts` — 10 endpoints seguindo o padrão de `cards.ts`:
- `GET /payables` → `list_accounts_payable`
- `POST /payables` → `create_account_payable`
- `POST /payables/:id/pay` → `mark_account_paid`
- `POST /payables/:id/cancel` → `cancel_account_payable`
- `GET /payables/templates` → `list_payable_templates`
- `POST /payables/templates` → `create_payable_template`
- `POST /payables/from-template` → `create_payable_from_template`
- `GET /payables/reminders` → `check_payable_reminders`
- `POST /notifications` → `configure_notification`
- `GET /notifications` → `list_notifications`

### Task P-0.4: Wire no servidor

- `routes/index.ts`: `registerPayableRoutes(app, { payableStore, resolveToken, idempotency })`
- `RouteDeps`: `payableStore?: PayableStore`
- `server/index.ts`: criar `PayableStore` em cada modo (in-memory / postgres)

### Task P-0.5: Testes

`tests/routes/payables.test.ts` — ≥20 testes cobrindo CRUD, filtros, pagamento, templates, notificações.

### Task P-0.6: Verificação

```bash
cd D:/projetos/pi-finance-api
npx tsc --noEmit
npx vitest run tests/routes/payables.test.ts
npx vitest run  # full suite, sem regressão
```

---

## Slice P-1: Tipos + API client + Hooks + Schemas (Web)

**Depende de:** P-0 (backend endpoints).
**Entregável:** Tipos, funções de API, queries, mutations e schemas compilando e testados.

### Task P-1.1: Estender `types.ts`

Adicionar `Payable`, `PayableTemplate`, `PayableFilters`, `NotificationConfig`, `PayableList`, `TemplateList`.

### Task P-1.2: Estender `finance-api.ts`

Adicionar: `getPayables`, `createPayable`, `markPayablePaid`, `cancelPayable`, `getTemplates`, `createTemplate`, `createPayableFromTemplate`, `getReminders`, `configureNotification`, `listNotifications`.

### Task P-1.3: Estender `queries.ts`

Adicionar: `usePayables(filters)`, `useTemplates()`, `useNotifications()`.

### Task P-1.4: Estender `mutations.ts`

Adicionar: `useCreatePayable`, `useMarkPayablePaid`, `useCancelPayable`, `useCreateTemplate`, `useCreatePayableFromTemplate`, `useConfigureNotification`.

### Task P-1.5: Estender `schemas.ts`

Adicionar: `payableFormSchema` (one_time + recurring unificado), `templateFormSchema`, `payConfirmSchema`, `notificationFormSchema`.

### Task P-1.6: Testes de schemas

16+ novos testes em `schemas.test.ts`.

### Task P-1.7: Verificação

```bash
cd D:/projetos/pi-finance-web
npx tsc --noEmit
npx vitest run src/lib/forms/schemas.test.ts
npx vitest run  # full
```

---

## Slice P-2: Home + Carteira + Tab wiring

**Depende de:** P-1.
**Entregável:** Card de resumo na Home + mini resumo/atalhos na Carteira + 5ª tab `Contas` + `PayablesPage` base.

### Task P-2.1: Card de resumo na HomePage

Adicionar `usePayables({ status: 'pending', dueWithinDays: 7 })` em `HomePage.tsx`. Se houver contas, renderizar card "Próximas contas" com lista compacta e link "Ver todas" → navega para tab Contas via novo callback `onNavigateToPayables`.

### Task P-2.2: Mini resumo na WalletPage

Adicionar `usePayables({ status: 'pending', dueWithinDays: 7 })` em `WalletPage.tsx`. Renderizar card compacto `Contas a pagar` com:
- total próximas 7d
- total atrasadas
- CTA `Nova conta`
- CTA `Templates`

### Task P-2.3: Tab wiring em App.tsx

- Adicionar `CalendarDays` icon
- `type Tab` estendido com `'contas'`
- Lazy import: `const PayablesPage = lazy(() => import('./features/payables/PayablesPage')...)`
- `<TabButton>` 5º item

### Task P-2.4: PayablesPage base (placeholder)

Criar `PayablesPage.tsx` com estados loading/empty/error usando `usePayables({})`. Lista simples sem agrupamento ainda. FAB desabilitado até Slice 3.

### Task P-2.5: Testes

`payables-rows.test.tsx` — mock de `usePayables`, verificar estados loading/empty/error/list.
`WalletPage.test.tsx` — card de mini resumo + CTAs aparecem quando há payables urgentes.

### Task P-2.6: Verificação

```bash
npx tsc --noEmit
npx vitest run src/features/payables/ src/App.test.tsx src/features/home/HomePage.test.tsx src/features/wallet/WalletPage.test.tsx
npx vitest run  # full
```

---

## Slice P-3: PayablesPage — Filtros + Agrupamento

**Depende de:** P-2.
**Entregável:** Lista agrupada por status com cores, filtros por status/tipo.

### Task P-3.1: Filtros

Chips de status (Todas / Vencidas / Próximas / Pagas) + toggle de tipo (Todas / Avulsa / Recorrente).

### Task P-3.2: Agrupamento

Helper `groupByStatus(items)` → `{ overdue, upcoming, pending, paid }`. Cada grupo com header e cor. `PayableRow` com ícone de status, dias até/deste vencimento, botão "Pagar".

### Task P-3.3: Testes

Testes de agrupamento e filtros em `payables-rows.test.tsx`.

### Task P-3.4: Verificação

```bash
npx vitest run src/features/payables/
```

---

## Slice P-4: Sheets — Criar, Template, Pagar

**Depende de:** P-3.
**Entregável:** `PayableSheet` unificado, `TemplateSheet`, `PayConfirmSheet`, FAB funcional.

### Task P-4.1: PayableSheet

Componente testável com toggle one_time/recurring, campos condicionais, preview recorrente, checkbox "Salvar como template".

### Task P-4.2: TemplateSheet + seção de templates

Lista de templates na PayablesPage. Botão "Usar" preenche PayableSheet.

### Task P-4.3: PayConfirmSheet

Valor default, conta origem, data, idempotency-key, submit com `markPayablePaid (createTransaction: true)`.

### Task P-4.4: FAB

Botão flutuante `fixed bottom-20 right-4` abrindo `PayableSheet`.

### Task P-4.5: Testes

`payable-sheets.test.tsx` — 15+ testes: validação one_time/recurring, preview, template checkbox, pay confirm, idempotency-key.

### Task P-4.6: Verificação

```bash
npx vitest run src/features/payables/
npx vitest run  # full
```

---

## Slice P-5: Lembretes + Notificações

**Depende de:** P-4.
**Entregável:** Configuração de lembretes no PayableSheet recorrente, tela/listagem de notificações.

### Task P-5.1: Configuração de lembrete

No `PayableSheet` recorrente: toggle "Lembrar X dias antes" com slider/input. Persiste via `configure_notification`.

### Task P-5.2: Listagem de notificações

Seção ou tela de notificações com `useNotifications()`. Exibe tipo, horário, status (enabled/disabled).

### Task P-5.3: Verificação

```bash
npx vitest run  # full
```

---

## Slice P-6: E2E + Polish + Verificação final

**Depende de:** P-5.
**Entregável:** E2E spec, mocks, ajustes offline/disabled.

### Task P-6.1: E2E mocks

Estender `e2e/helpers/api-mock.ts` com endpoints `/payables/*` e `/notifications/*`.

### Task P-6.2: E2E spec

`e2e/payables.spec.ts` — fluxo: abrir tab → criar avulsa → ver lista → criar recorrente com template → pagar → ver status.

### Task P-6.3: Polish

Revisão de `disabled={!online}` em FAB, botões Pagar, sheets. OfflineBanner.

### Task P-6.4: Verificação final

```bash
cd D:/projetos/pi-finance-web
npx tsc --noEmit
npx vitest run
npm run build
npm run e2e
```

---

## Verification Commands (por slice)

| Slice | Comando | Esperado |
|---|---|---|
| P-0 | `npx tsc --noEmit && npx vitest run` (api) | typecheck 0, tests pass |
| P-1 | `npx tsc --noEmit && npx vitest run src/lib/forms/schemas.test.ts` (web) | typecheck 0, tests pass |
| P-2 | `npx tsc --noEmit && npx vitest run src/features/payables/ src/App.test.tsx` | typecheck 0, tests pass |
| P-3 | `npx vitest run src/features/payables/` | tests pass |
| P-4 | `npx vitest run src/features/payables/ && npx vitest run` | full suite pass |
| P-5 | `npx vitest run` | full suite pass |
| P-6 | `npm run build && npm run e2e` | build 0, e2e pass |

---

## Non-goals (reforçados da spec)

- Sem edição de conta existente
- Sem edição/exclusão de template
- Sem pagamento parcial com tracking de saldo
- Sem renegociação/parcelamento
- Sem anexos
- Sem push nativo
- Sem calendário avançado
- Sem bulk actions
- Sem escrita offline
