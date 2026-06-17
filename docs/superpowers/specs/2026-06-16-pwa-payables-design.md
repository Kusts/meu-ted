# PWA Contas a Pagar — Module Design

**Data:** 2026-06-16
**Motivo:** segundo módulo pós-V1 da sequência PWA aprovada pelo usuário. Contas a pagar foi eleito slice #2 pelo audit `audit:pwa-next-slices` (necessidade diária: tracking de contas recorrentes, templates, lembretes).
**Spec anterior:** `docs/superpowers/specs/2026-06-14-pwa-companion-design.md` (definiu Pós-V1 genérico); `docs/superpowers/specs/2026-06-16-pwa-cartoes-design.md` (primeiro módulo, referência de estrutura).
**API:** `pi-finance-api` — endpoints de contas a pagar via Agent Pi tools: `create_account_payable`, `list_accounts_payable`, `mark_account_paid`, `cancel_account_payable`, `create_payable_template`, `create_payable_from_template`, `list_payable_templates`, `check_payable_reminders`, `configure_notification`, `list_notifications`.

## Context

- O PWA V1 (Resumo / Registros / Carteira) e módulo Cartões estão completos e verificados (137 unit tests, 28 E2E).
- Contas a pagar são o próximo gap operacional: o usuário gerencia contas recorrentes (luz, internet, aluguel, assinaturas) e avulsas (boleto, IPVA) via WhatsApp, mas não tem visibilidade consolidada no PWA.
- A API `pi-finance-api` expõe ferramentas de contas a pagar como tools do Agent Pi — o PWA as consumirá via REST (endpoints a serem adicionados ao backend, seguindo o padrão do módulo Cartões).
- `apps/whatsapp-bridge` segue transport-only.
- O módulo Contas a Pagar adiciona: uma tela própria `PayablesPage` na tab bar OU uma seção dentro de Carteira/Início + tela dedicada, conforme decisão D1.
- Continuidade com o design system: Tailwind 4 + tokens em `index.css` + classe `.card` + ícones `lucide-react` + padrão "light premium — Copilot Money + Monarch".
- Mobile-first (PWA instalado no iPhone), com graceful degradation em desktop.
- Padrões herdados dos módulos V1 e Cartões: RHF + Zod para forms, TanStack Query para dados, idempotency-key estável por submissão, retry sem fechar sheet, mensagens PT-BR, cache offline read-only.

## Decisions

| # | Decision | Choice | Reason | Rejected |
|---|---|---|---|---|
| D1 | Surface | **Híbrida**: resumo na Home + mini resumo/atalhos na Carteira + tela própria `Contas` na tab bar | Home concentra urgência, Carteira concentra atalhos operacionais, e a tela dedicada dá visão completa com filtros. Mantém descoberta alta sem misturar a lista principal em Carteira | Só Home, só Carteira, só tela dedicada |
| D2 | Layout da tela | **Lista com filtros + FAB de criação**: filtros no topo (status, tipo), lista agrupada por status (vencidas → próximas → pagas), botão "+" para criar | Mobile-first, prioriza urgência. FAB evita poluir com quick actions fixas | Abas por status, grid de cards |
| D3 | Criação de conta | **Sheet unificado com toggle one_time/recurring**: se `one_time`, campos: descrição, valor, vencimento, conta, categoria. Se `recurring`, adicional: frequência, dia do mês, lembrete | Um ponto de entrada, menos confusão que dois botões separados | Dois sheets distintos, wizard multi-step |
| D4 | Templates | **Lista de templates + "Criar a partir de template"**: tela ou seção dedicada com templates salvos (ex: "Netflix todo dia 15"). Criar conta preenche campos automaticamente a partir do template | Reduz fricção para contas recorrentes comuns. Templates são opcionais, não obrigatórios | Sem templates, só criação manual |
| D5 | Marcar como paga | **Botão "Pagar" no row + confirmação**: ao marcar paga, cria despesa automática na conta selecionada. Valor pode ser o da conta ou custom (ex: pagou parcial) | Simplifica o fluxo mais comum. Despesa automática mantém consistência contábil | Só marcar paga sem criar despesa; pagamento parcial complexo |
| D6 | Pagamento — despesa automática | **Cria expense com mesma descrição, valor, conta, categoria e data do pagamento** via `create_expense`. Usa idempotency-key do pagamento | Consistência: toda conta paga gera despesa real nos relatórios. Sem duplicata | Marcar paga sem transação financeira |
| D7 | Filtros | **Status (pending/paid/overdue/cancelled) + Tipo (one_time/recurring) + Próximos N dias**: chips de status + toggle de tipo + date range opcional | Cobre 90% dos casos: "o que vence essa semana?", "quais estão atrasadas?" | Filtro por conta, categoria, valor |
| D8 | Lembretes | **Configuração inline de lembrete por conta**: ao criar/editar conta recorrente, toggle "Lembrar X dias antes" + horário. Configuração persiste via `configure_notification`. Envio real é responsabilidade do backend (WhatsApp) | Usuário controla quando ser notificado. Backend gerencia envio; PWA só configura | Lembretes sem configuração; envio via PWA (não suportado) |
| D9 | Visual — status | **Cores por status**: overdue = red, pending = amber (se next 7d) ou slate, paid = green, cancelled = slate line-through. Ícone `AlertCircle` para vencidas, `CheckCircle` para pagas | Scan visual rápido; hierarquia de urgência | Apenas texto, sem diferenciação |
| D10 | Templates — escopo V1 | Criar template (**sem editar, sem cancelar template**) | Templates são criados a partir de contas recorrentes existentes ou manualmente. Edição pós-V1 | CRUD completo de templates |
| D11 | Offline | **Read-only** com cache (TanStack Query `placeholderData` + Workbox SWR); ações de escrita desabilitadas com `disabled={!online}` | Padrão consolidado V1 + Cartões | Offline writes |
| D12 | Conta pagadora | **Qualquer conta ativa (bank/cash)** — não filtra por tipo. Padrão: primeira conta da lista | Simples; o usuário escolhe de onde pagou | Filtro por tipo, sugestão inteligente |

## Architecture

### Surface híbrida

```
HomePage (resumo)
├─ Card "Próximas contas" (se houver pending nos próximos 7 dias)
│  ├─ Lista compacta: nome, valor, vencimento
│  └─ Link "Ver todas" → PayablesPage
└─ Card "Contas vencidas" (se houver overdue)
   └─ N contas com valor total

WalletPage (mini resumo + atalhos)
├─ Card compacto "Contas a pagar"
│  ├─ KPIs: próximas 7d, atrasadas
│  ├─ CTA "Nova conta"
│  └─ CTA "Templates"

PayablesPage (tab "Contas")
├─ Filtros: chips status (Todas/Vencidas/Próximas/Pagas) + toggle tipo (Todas/Avulsa/Recorrente)
├─ Lista agrupada por status: vencidas → próximas 7d → demais pending → pagas (recentes)
├─ FAB "+" → PayableSheet (one_time / recurring toggle)
└─ Seção "Templates" (link ou collapsible)
   └─ Lista de templates → tap preenche PayableSheet com dados do template
```

### File map (alvo)

```
src/features/payables/
├── PayablesPage.tsx           # página principal: filtros + lista + FAB + integração sheets
├── payable-sheets.tsx         # PayableSheet (one_time/recurring unified), TemplateSheet, PayConfirmSheet
├── payables-rows.test.tsx     # testes de componente: rows, filtros, agrupamento
└── payable-sheets.test.tsx    # testes de sheet: validação, criação avulsa/recorrente, templates

src/lib/api/
├── finance-api.ts             # + funções: getPayables, createPayable, markPayablePaid, cancelPayable, getTemplates, createTemplate, createFromTemplate, getReminders, configureNotification, listNotifications
├── queries.ts                 # + hooks: usePayables, useTemplates, useNotifications
├── mutations.ts               # + hooks: useCreatePayable, useMarkPayablePaid, useCancelPayable, useCreateTemplate, useCreatePayableFromTemplate, useConfigureNotification
└── types.ts                   # + tipos: Payable, PayableTemplate, NotificationConfig, PayableFilters

src/lib/forms/
└── schemas.ts                 # + schemas: payableFormSchema, templateFormSchema, notificationFormSchema
```

### Feature tree

```
PayablesPage
├─ state: filters (status, type, daysAhead), sheetMode, selectedPayableId
├─ data:  payables (usePayables), templates (useTemplates), accounts (useAccounts), categories (useCategories)
├─ groupByStatus(items) → { overdue, upcoming, pending, paid }
│
├─ Filtros
│  ├─ Chips de status: Todas | Vencidas | Próximas (7d) | Pagas
│  └─ Toggle tipo: Todas | Avulsa | Recorrente
│
├─ Lista (agrupada)
│  ├─ Grupo "Vencidas" (overdue)
│  │  └─ PayableRow: ícone AlertCircle red, nome, valor, vencimento, dias atraso, botão "Pagar"
│  ├─ Grupo "Próximas" (pending, due within 7d)
│  │  └─ PayableRow: ícone Clock amber, nome, valor, vencimento, "em X dias", botão "Pagar"
│  ├─ Grupo "A vencer" (pending, due >7d)
│  │  └─ PayableRow: ícone Calendar slate, nome, valor, vencimento
│  └─ Grupo "Pagas" (paid, últimos 30d)
│     └─ PayableRow: ícone CheckCircle green, nome, valor, data pagamento, line-through suave
│
├─ Empty states
│  ├─ Nenhuma conta: "Nenhuma conta a pagar" + hint "Crie sua primeira conta"
│  ├─ Nenhuma no filtro: "Nenhuma conta neste filtro"
│  └─ Nenhum template: "Nenhum template salvo"
│
├─ FAB "+" (condicional: visível apenas na view principal)
│  └─ Abre PayableSheet
│
├─ Templates (collapsible section abaixo da lista ou no topo)
│  └─ TemplateRow: nome, valor, frequência, "Usar" → preenche PayableSheet
│
└─ Sheets
   ├─ PayableSheet (mode: create/from-template)
   │  ├─ Toggle: Avulsa / Recorrente
   │  ├─ Campos comuns: descrição, valor BRL, vencimento, conta, categoria
   │  ├─ Campos recorrente: frequência (mensal/trimestral/anual), dia do mês, lembrete (dias antes), data fim opcional
   │  └─ Preview recorrente: "R$ X todo dia Y" ou "a cada Z meses"
   ├─ TemplateSheet (criar/editar template)
   │  └─ Mesmos campos do PayableSheet recorrente, sem vencimento específico
   └─ PayConfirmSheet
      ├─ Valor a pagar (default = valor da conta, editável para pagamento parcial)
      ├─ Conta de origem (select)
      └─ Data do pagamento (default hoje)
```

### Reuso de infra existente

| Componente | Local | Reuso |
|---|---|---|
| `Sheet` | `src/components/ui/Sheet.tsx` | PayableSheet, TemplateSheet, PayConfirmSheet |
| `formatBRL` | `src/lib/api/types.ts` | Valores monetários |
| `getErrorMessage` | `src/lib/get-error-message.ts` | Mensagens PT-BR |
| `apiGet`/`apiPost` | `src/lib/api/client.ts` | Chamadas autenticadas |
| `cache.ts` | `src/lib/cache.ts` | `placeholderData` offline |
| `useNetworkStatus` | `src/lib/use-network-status.ts` | `online` prop |
| `amount.ts` | `src/lib/forms/amount.ts` | Parser BRL → cents |
| `getAccountIcon` | `src/lib/ui/account-icon.tsx` | Ícones de conta no selector |
| `useAccounts`/`useCategories` | `src/lib/api/queries.ts` | Select de conta/categoria nos sheets |

## Requirements (EARS)

| ID | Type | Requirement |
|---|---|---|
| REQ-P1 | state-driven | A tab Contas deve exibir **todas as contas a pagar** do household, agrupadas por status: vencidas (overdue), próximas (pending, vence em ≤7 dias), a vencer (pending, vence >7 dias), pagas (paid, últimos 30 dias). |
| REQ-P2 | state-driven | Cada `PayableRow` deve mostrar: ícone de status colorido, descrição, valor formatado em BRL, data de vencimento (`dd MMM`), e indicador de recorrência (`RefreshCw`) se aplicável. Vencidas mostram dias de atraso em vermelho. Próximas mostram "em X dias". Pagas mostram data de pagamento com line-through suave. |
| REQ-P3 | state-driven | Os **filtros** devem permitir selecionar status (Todas / Vencidas / Próximas / Pagas) via chips horizontais, e tipo (Todas / Avulsa / Recorrente) via toggle. O filtro padrão ao abrir a tela é "Todas". |
| REQ-P4 | event-driven | Ao tocar no **FAB "+"**, deve abrir o `PayableSheet` com toggle Avulsa/Recorrente e campos correspondentes. |
| REQ-P5 | state-driven | O `PayableSheet` no modo **Avulsa** deve conter: descrição (texto), valor (BRL), vencimento (date), conta (select de contas ativas), categoria (select de categorias de despesa). |
| REQ-P6 | state-driven | O `PayableSheet` no modo **Recorrente** deve conter, além dos campos comuns: frequência (mensal/trimestral/anual), dia do mês (1-31), lembrete (dias antes, 0-30, default 1), data fim (opcional). Deve exibir preview: "R$ X todo dia Y" ou "R$ X a cada Z meses a partir de data". |
| REQ-P7 | state-driven | Ao criar uma conta recorrente, o usuário pode opcionalmente **salvar como template** (checkbox "Salvar como template"). Se marcado, chama `create_payable_template` após `create_account_payable`. |
| REQ-P8 | state-driven | A seção de **templates** (collapsible ou link no topo) deve listar templates ativos com: nome, valor, frequência, dia do mês. Ao tocar em "Usar", abre `PayableSheet` pré-preenchido com os dados do template, pronto para definir vencimento e confirmar. |
| REQ-P9 | event-driven | Ao tocar no botão **"Pagar"** em uma `PayableRow` pendente/vencida, deve abrir `PayConfirmSheet` com: valor (default = valor da conta, editável), conta de origem (select de contas bank/cash ativas), data do pagamento (default hoje). |
| REQ-P10 | event-driven | Ao confirmar pagamento no `PayConfirmSheet`, deve: (a) chamar `mark_account_paid` com `createTransaction: true`, (b) o backend cria a despesa automaticamente. Em sucesso: fechar sheet, invalidar queries de payables, dashboard e transactions. |
| REQ-P11 | state-driven | O `PayConfirmSheet` deve usar **idempotency-key estável** (`useRef(crypto.randomUUID())`) para evitar duplicata no retry. Em erro: sheet permanece aberto, mensagem PT-BR, botão "Tentar novamente". |
| REQ-P12 | state-driven | Contas com status **cancelled** não devem aparecer na lista padrão. Deve haver um filtro ou toggle "Incluir canceladas" para visualização histórica (pós-V1 ou stretch). |
| REQ-P13 | state-driven | **Offline**: lista de contas exibe dados cacheados. FAB e botões "Pagar" ficam `disabled`. Nenhuma escrita offline permitida. |
| REQ-P14 | state-driven | **Empty states**: (a) sem contas → ícone `FileText` + "Nenhuma conta a pagar" + hint "Toque no + para criar"; (b) sem contas no filtro → "Nenhuma conta neste filtro"; (c) sem templates → "Nenhum template salvo" + hint "Crie uma conta recorrente e salve como template". |
| REQ-P15 | state-driven | **Loading states**: lista → 4 skeleton rows com `animate-pulse`; templates → 2 skeleton rows. |
| REQ-P16 | state-driven | Na **HomePage**, se houver contas vencidas ou próximas (7 dias), exibir card de resumo: "Você tem N contas a pagar" com total, e lista compacta das 3 mais urgentes. Card com link "Ver todas" que navega para a tab Contas. |
| REQ-P17 | state-driven | Na **WalletPage**, exibir card compacto "Contas a pagar" com contagem de próximas 7d e atrasadas, mais CTAs rápidos "Nova conta" e "Templates". |
| REQ-P18 | ubiquitous | A tab Contas deve ser acessível via **5ª tab** na barra inferior (ícone `FileText` ou `CalendarDays`, label "Contas"). Segue padrão de lazy loading (`React.lazy` + `Suspense`) e code-splitting. |
| REQ-P19 | state-driven | **Lembretes**: ao criar/editar conta recorrente, toggle "Lembrar X dias antes" com valor padrão 1. A configuração é persistida via `configure_notification`. O envio real do lembrete é responsabilidade do backend (WhatsApp); o PWA apenas configura. |
| REQ-P20 | state-driven | **Status colors**: overdue = `text-red-600` + ícone `AlertCircle`, pending (≤7d) = `text-amber-600` + ícone `Clock`, pending (>7d) = `text-slate-500` + ícone `Calendar`, paid = `text-green-600` + ícone `CheckCircle` + line-through `text-slate-400`. |
| REQ-P21 | unwanted | **V1 não permite**: editar conta a pagar existente; editar template; cancelar template; pagamento parcial com tracking de saldo (paga o valor informado e considera quitada se valor ≥ total); renegociação/parcelamento de dívida; rateio entre contas; anexos; aprovação multi-usuário; push notifications nativas. |
| REQ-P22 | state-driven | Ao **cancelar** uma conta (via long-press ou menu), deve abrir dialog de confirmação com motivo opcional. A conta marcada como `cancelled` permanece visível via filtro mas não aparece na lista padrão. |
| REQ-P23 | state-driven | Templates são **somente leitura na V1**. Criados a partir do checkbox no PayableSheet recorrente. Listados na seção de templates. Sem edição ou exclusão na V1. |
| REQ-P24 | state-driven | O **FAB "+"** deve ser renderizado como botão flutuante fixo no canto inferior direito (`fixed bottom-20 right-4`), acima da tab bar. Visível apenas na view principal (não durante sheets abertos). |
| REQ-P25 | state-driven | As queries de payables devem usar **cache offline** (`placeholderData` + `setCache`/`getCache`) com `staleTime: 30_000`, seguindo o padrão de `useAccounts`, `useCreditCardAccounts`. |

## Data / API Matrix

### Endpoints (a serem expostos pelo backend — seguindo padrão REST do módulo Cartões)

| UI Action | API Endpoint (esperado) | Agent Pi Tool | Response |
|---|---|---|---|
| Listar contas | `GET /payables?status=&type=&dueWithinDays=` | `list_accounts_payable` | `{ items: Payable[], total }` |
| Criar conta avulsa | `POST /payables` | `create_account_payable` (type=one_time) | `Payable` |
| Criar conta recorrente | `POST /payables` | `create_account_payable` (type=recurring) | `Payable` |
| Marcar como paga | `POST /payables/:id/pay` | `mark_account_paid` | `Payable` |
| Cancelar conta | `POST /payables/:id/cancel` | `cancel_account_payable` | `Payable` |
| Listar templates | `GET /payables/templates` | `list_payable_templates` | `{ items: PayableTemplate[], total }` |
| Criar template | `POST /payables/templates` | `create_payable_template` | `PayableTemplate` |
| Criar conta por template | `POST /payables/from-template` | `create_payable_from_template` | `Payable` |
| Verificar lembretes | `GET /payables/reminders` | `check_payable_reminders` | `{ items: Payable[] }` |
| Configurar notificação | `POST /notifications` | `configure_notification` | `NotificationConfig` |
| Listar notificações | `GET /notifications` | `list_notifications` | `{ items: NotificationConfig[] }` |

### Tipos TypeScript

```ts
export interface Payable {
  id: string;
  householdId: string;
  accountId: string;
  description: string;
  amountCents: number;
  dueDate: string;
  type: 'one_time' | 'recurring';
  frequency?: 'monthly' | 'quarterly' | 'yearly';
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paidDate?: string;
  reminderDaysBefore?: number;
  notes?: string;
}

export interface PayableTemplate {
  id: string;
  accountId: string;
  name: string;
  description: string;
  amountCents: number;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  dayOfMonth: number;
  reminderDaysBefore?: number;
  notes?: string;
}

export interface PayableFilters {
  status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
  type?: 'one_time' | 'recurring';
  dueWithinDays?: number;
}

export interface NotificationConfig {
  id: string;
  chatId: string;
  notificationType: 'overdue_reminder' | 'due_today_reminder' | 'upcoming_reminder';
  enabled: boolean;
  scheduleHour?: number;
  scheduleMinute?: number;
  daysOfWeek?: number[];
  thresholdDays?: number;
}
```

## UX Flows / States

### Flow 1: Visualizar contas

```
Tab "Contas" → PayablesPage
  │
  ├─ [loading]  → 4 skeleton rows
  ├─ [error]    → "Não foi possível carregar suas contas." + "Tentar novamente"
  ├─ [empty]    → FileText icon + "Nenhuma conta a pagar" + hint
  └─ [data]     → Lista agrupada
       ├─ Grupo "Vencidas" (overdue)
       ├─ Grupo "Próximas" (pending, ≤7d)
       ├─ Grupo "A vencer" (pending, >7d)
       └─ Grupo "Pagas" (paid, 30d)
```

### Flow 2: Criar conta (avulsa ou recorrente)

```
PayablesPage
  └─ [tap FAB "+"] → PayableSheet
       │
       ├─ Toggle: Avulsa / Recorrente
       ├─ Preenche campos (RHF + Zod)
       ├─ Se recorrente + checkbox "Salvar como template"
       ├─ [submit] → useCreatePayable (+ useCreateTemplate se checkbox)
       │    ├─ [success] → sheet fecha, queries invalidadas
       │    └─ [error]   → mensagem PT-BR, "Tentar novamente", sheet aberto
       └─ [backdrop / X] → fecha sem salvar
```

### Flow 3: Pagar conta

```
PayablesPage → PayableRow (overdue ou pending)
  └─ [tap "Pagar"] → PayConfirmSheet
       │
       ├─ Valor (default = valor da conta, editável)
       ├─ Conta origem (select)
       ├─ Data pagamento (default hoje)
       ├─ [confirmar] → useMarkPayablePaid (createTransaction: true)
       │    ├─ [success] → sheet fecha, queries invalidadas
       │    └─ [error]   → mensagem PT-BR, "Tentar novamente"
       └─ [cancelar] → fecha sem ação
```

### Flow 4: Criar a partir de template

```
PayablesPage → Seção "Templates" (expandida)
  └─ [tap "Usar" no template] → PayableSheet (pré-preenchido)
       │
       ├─ Campos preenchidos com dados do template
       ├─ Vencimento: calculado a partir do dayOfMonth + mês corrente
       ├─ [submit] → useCreatePayable (type=recurring)
       │    └─ (mesmo comportamento de sucesso/erro)
       └─ [backdrop / X] → fecha sem salvar
```

### State machine: filtros

```
states: all | overdue | upcoming | paid
default: all
transitions:
  tap chip → set status filter, refetch
  tap type toggle → set type filter, refetch
  combined: status + type aplicados como AND
```

## Error & Offline Behavior

| Situação | Comportamento |
|---|---|
| Erro ao carregar contas | Mensagem PT-BR + "Tentar novamente" |
| Erro ao criar conta | Sheet aberto, mensagem PT-BR, "Tentar novamente", idempotency-key reusada |
| Erro ao pagar | Sheet aberto, mensagem PT-BR, "Tentar novamente", idempotency-key reusada |
| Erro ao carregar templates | Seção de templates mostra mensagem de erro compacta |
| Offline | Lista cacheada visível. FAB "➕" e botões "Pagar" desabilitados. OfflineBanner global visível |

## Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Validadores Zod (payableFormSchema, templateFormSchema), helpers de agrupamento `groupByStatus`, cálculo de dias até vencimento |
| Component | Vitest + Testing Library | `PayableRow`: status colors, valores formatados, dias de atraso. `PayablesPage`: filtros, agrupamento, empty/loading/error states. `payable-sheets.test.tsx`: PayableSheet (validação one_time/recurring, preview, template checkbox), PayConfirmSheet (default amount, idempotency-key), TemplateSheet |
| Integration | Vitest + MSW | Hooks (`usePayables`, `useMarkPayablePaid`, etc.) com mock da API |
| E2E | Playwright | Fluxo completo: abrir tab Contas → criar conta avulsa → ver na lista → criar recorrente com template → pagar → ver status atualizado |
| Contract | Zod schema tests | Paridade request/response com API de payables |

**Feature test protocol (RED-first):**
1. Unit RED: validators, groupByStatus, date helpers.
2. Component RED: sheets com RHF (validação, toggle one_time/recurring, preview, template flow).
3. Integration: hooks com MSW.
4. E2E: Playwright com `page.route()` mock da API de payables.
5. Coverage ratchet: ≥80% lines no novo código.

## Milestones / Implementation Order

| # | Slice | Escopo | Entregável |
|---|---|---|---|
| P-0 | Backend endpoints | Adicionar `GET /payables`, `POST /payables`, `POST /payables/:id/pay`, `POST /payables/:id/cancel`, `GET /payables/templates`, `POST /payables/templates`, `POST /payables/from-template`, `GET /payables/reminders`, `POST /notifications`, `GET /notifications` à `pi-finance-api` | Rotas REST no backend |
| P-1 | Tipos + API client + hooks | `types.ts`: `Payable`, `PayableTemplate`, `PayableFilters`, `NotificationConfig`. `finance-api.ts`: funções de API. `queries.ts`: `usePayables`, `useTemplates`. `mutations.ts`: `useCreatePayable`, `useMarkPayablePaid`, `useCancelPayable`, `useCreateTemplate`, `useCreatePayableFromTemplate`. Schemas Zod. Testes focados. | `src/lib/api/*`, `src/lib/forms/schemas.ts` |
| P-2 | PayablesPage + tab wiring | `PayablesPage.tsx` com filtros, lista agrupada, FAB, estados loading/empty/error. Wire da 5ª tab em `App.tsx`. HomePage card de resumo. | `src/features/payables/PayablesPage.tsx`, `src/App.tsx`, `src/features/home/HomePage.tsx` |
| P-3 | Sheets | `PayableSheet` (unified one_time/recurring), `TemplateSheet`, `PayConfirmSheet`. Integração com mutations. | `src/features/payables/payable-sheets.tsx` |
| P-4 | Templates + lembretes | Seção de templates, checkbox "Salvar como template", tela/config de notificações. | `src/features/payables/PayablesPage.tsx` (templates section) |
| P-5 | E2E + polish final | `e2e/payables.spec.ts`, mock de endpoints no `api-mock.ts`, ajustes finais de disabled/error/offline. Verificação completa. | `e2e/payables.spec.ts`, `e2e/helpers/api-mock.ts` |

## Non-goals (V1)

- Sem edição de conta a pagar existente.
- Sem edição ou exclusão de template.
- Sem cancelamento de template.
- Sem pagamento parcial com tracking de saldo devedor (paga o valor informado, considera quitada se valor ≥ total).
- Sem renegociação ou parcelamento de dívida.
- Sem rateio de conta entre múltiplas contas bancárias.
- Sem anexos de comprovantes.
- Sem aprovação multiusuário.
- Sem push notifications nativas (PWA Notification API).
- Sem calendário avançado (date picker custom).
- Sem exportação de relatório de contas.
- Sem bulk actions (pagar múltiplas de uma vez).
- Sem escrita offline.
- Sem suporte a múltiplos households.
