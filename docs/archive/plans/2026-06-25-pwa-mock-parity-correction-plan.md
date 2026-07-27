# PWA Mock Parity Correction Plan

**Base:** `docs/superpowers/specs/2026-06-25-pwa-mock-parity-audit.md`
**Objetivo:** levar `apps/pwa` para paridade estrutural, funcional e visual com `design_handoff_pi_financeiro/App Financeiro Pi v2.dc.html`.

## Decisões aprovadas

| Tema | Decisão | Owner | Data | Motivo |
|---|---|---|---|---|
| Persistência | **Backend-first** — dado persiste no `pi-finance-api`; servidor é fonte de verdade | walisson | 2026-06-25 | dados financeiros precisam sobreviver a reload e ser consistentes entre devices |
| Perfil | **Manter `/perfil`**, mas alinhar affordance, navegação e subfluxos ao stack do mock | walisson | 2026-06-25 | menor risco estrutural; cobre divergência sem reabrir arquitetura inteira |
| Notificações | **Desabilitar explicitamente** nesta fase, não fingir fluxo | walisson | 2026-06-25 | evita CTA morto; reduz escopo falso |
| Segurança | **Fora de escopo funcional** nesta fase; manter visual só se claramente sinalizado | walisson | 2026-06-25 | evita abrir subproduto novo |
| Logos / branding | **Badge tintado consistente** como baseline, sem depender de assets de marca | walisson | 2026-06-25 | remove risco de sourcing/licença/escopo |
| Assinaturas | **Construir módulo mínimo** de subscription no `pi-finance-api` (GET/POST/cancel + store/adapters, sem PATCH nem projeção elaborada) | walisson | 2026-06-25 | persistência real de assinaturas, escopado ao que o PWA usa; não infla o milestone |
| Subcategoria | **Adicionar `parentId`, profundidade máxima 1** (categoria > subcategoria, sem aninhar mais) | walisson | 2026-06-25 | mock pede CTA "Nova subcat."; profundidade 1 cobre o caso e mantém anti-ciclo trivial |
| Editar cartão | **Implementar edição** (CardsPage), exige `PATCH /cards` novo no backend | walisson | 2026-06-25 | evita CTA morto; edição de cartão é fluxo esperado |

## Decisão de persistência (Backend-first)

Os fluxos novos (cartão, transferência, pagamento de fatura, parcelamento, conta, categoria, assinatura) **só são considerados prontos quando persistem no `pi-finance-api`**. Implicações:

- **Servidor é fonte de verdade.** O `useState` local do contexto serve apenas como cache otimista de UI, nunca como persistência.
- **Contrato antes da UI.** Para cada fluxo, o endpoint correspondente no `pi-finance-api` (com adapter de legacy schema quando aplicável) e seu contract test existem **antes** de ligar o botão na UI. Isso vira a Fase 0.1.
- **Sem fallback silencioso.** Se a API falhar, a UI reverte o update otimista e sinaliza erro — não finge sucesso local. Padrão: optimistic update → on error, rollback + erro visível.
- **`endpoints.ts` deixa de ser parcial.** Hoje só há create expense/income, delete e markPaid; faltam cartão, transfer, payStatement, installments, account, category, subscription.

## Reidratação / read-path (após reload)

Backend-first só fecha se o read-path estiver definido tão bem quanto o write-path. Regras:

- **Origem do reload.** `AppStateProvider` hidrata no mount via `useEffect` quando `apiUsable()`. Hoje busca accounts/categories/transactions/payables/budgets/goals. Faltam **`fetchSubscriptions`** e **`fetchCards`/statements** — adicionar ao load inicial (cartões hoje vêm de `GET /cards/accounts`/`/cards/statements`).
- **Política de refetch pós-mutação.** Após uma escrita bem-sucedida, refazer fetch do recurso afetado (ou aplicar a entidade retornada pela API) para que listas/KPIs/faturas reflitam o estado canônico. Sem refetch cego de tudo: refetch só do que o fluxo toca (ver matriz de invariantes).
- **Reconciliação de ID otimista ↔ servidor.** O update otimista usa id temporário local (`nextId()`); a resposta da API traz o id real. Substituir a entidade otimista pela retornada (por id temporário) em vez de duplicar. Enviar `Idempotency-Key` evita duplicata se a resposta se perder.
- **Recompute de derivados.** Saldo, fatura aberta, "a pagar" e KPIs são derivados do estado buscado, não persistidos no cliente — recomputam a partir dos dados reidratados.

### Matriz de refetch por mutator

Após sucesso da API, refazer fetch só do que o fluxo toca (estado canônico, evita drift):

| Mutator | Refetch após sucesso |
|---|---|
| `addCard` / `updateCard` | `fetchCards` (lista de cartões) |
| `addAccount` | `fetchAccounts` |
| `addCategory` | `fetchCategories` |
| `addSubscription` | `fetchSubscriptions` |
| `transfer` | `fetchAccounts` + `fetchTransactions` |
| `payStatement` | `fetchCards`/statements + `fetchAccounts` + `fetchTransactions` |
| `createInstallments` | `fetchCards`/statements + `fetchTransactions` |

KPIs (saldo total, fatura aberta, gasto do mês) são derivados desses fetches — não têm refetch próprio.

## Precedência de fonte de verdade

Para qualquer divergência durante a execução, vale a ordem já fixada na spec (REQ-5):

`design_handoff_pi_financeiro/App Financeiro Pi v2.dc.html` > `README` / handoff auxiliar > app atual.

## Estratégia de execução

| Fase | Foco | Prioridade | Cobertura da spec |
|---|---|---|---|
| 0 | Backend slice + camada de estado e API | crítica | A3, A4, A5, A6, A7 |
| 1 | Paridade estrutural | crítica | A1, A2, V8 |
| 2 | Paridade funcional | crítica | A3, A4, A5, A6, A7, A8, A9, A10 |
| 3 | Paridade visual | alta | V1, V2, V3, V4, V5, V6, V7, V8 |
| 4 | QA visual e fechamento | crítica | A11, Bucket C |

**Cobertura sem ação direta (documental / fora de escopo):**

| ID | Achado | Tratamento |
|---|---|---|
| B1 | Hero da home (`Receitas/Despesas/Resultado`) | app já alinhado ao `.dc.html`, sem ação |
| B2 | KPIs da home (`vs mês anterior`) | app já alinhado ao `.dc.html`, sem ação |
| B3 | Relatórios período (`Mês/Anterior/Trim./Ano`) | app já alinhado ao `.dc.html`, sem ação |
| B4 | Perfil baseado em sheets | tratado na Fase 1.2 |
| A10 | Itens de segurança só visuais | fora de escopo funcional (ver Decisões aprovadas); tratado visualmente na Fase 2.3 |

## Convenção de testes (todas as fases)

Cada bloco **Testes desta fase** segue TDD red-green-refactor: escrever o teste e vê-lo **falhar (RED)** antes de qualquer implementação, depois implementar até passar (GREEN) e refatorar. Nenhum critério verificável é marcado como concluído sem o teste correspondente primeiro falhando e depois passando.

### Matriz de testes por fase e tipo

| Fase | Unit | Contract | Snapshot/render | E2E |
|---|---|---|---|---|
| 0.1 backend | — | endpoints `pi-finance-api` (sucesso + erro) | — | — |
| 0.2 estado | `app-state-context` por mutator (sucesso + rollback) | mapping/client-integration de `endpoints.ts` | — | — |
| 1 estrutural | active-state por rota | — | `BottomNav`, `AppShell` | — |
| 2 funcional | — | — | `NewTransactionSheet`, `CardsPage`, `ProfilePage` | CTA crítico + **persistência após reload** |
| 3 visual | — | — | ausência de emoji crítico; presença de badge | — |
| 4 fechamento | rerun fases 0–3 | rerun | rerun | smoke dos fluxos críticos |

**Ownership de contrato:** o `pi-finance-api` é dono do contrato (contract tests no backend definem o shape). O PWA testa **mapping e integração de cliente** (`endpoints.ts` traduz resposta → tipo do app), não redefine o contrato.

**E2E mínimos nomeados** (cada um prova "persiste após reload"):
- criar cartão → reload → cartão presente
- pagar fatura parcial → reload → saldo e fatura aberta atualizados
- transferência → reload → saldo das 2 contas correto
- criar subcategoria → reload → subcat aparece sob o pai
- editar cartão → reload → dados do cartão atualizados

## Fase 0. Backend slice + camada de estado e API

**Cobre:** A3, A4, A5, A6, A7

Backend-first: a 0.1 (servidor) é pré-requisito da 0.2 (PWA), que é pré-requisito de toda a Fase 2.

### 0.1 Slice de backend no `pi-finance-api`

**Escopo:** `../pi-finance-api` (repo do backend)

> **Verificado em 2026-06-25:** o backend (Fastify + CQRS, write store legacy/postgres) já cobre a maioria dos fluxos. Restam 3 frentes de escrita (cartão criar/editar, módulo de assinaturas, `parentId` em categoria). Endpoints já têm `DomainError` estruturado (code/message/statusCode) e suporte a `Idempotency-Key` — os mutators do PWA devem enviar idempotency key.

**Endpoints que JÁ existem (Fase 0.2 só precisa ligar no PWA, sem trabalho de backend):**

| Fluxo | Endpoint existente |
|---|---|
| transferência | `POST /transfers` |
| pagar fatura | `POST /cards/statements/:id/pay` |
| parcelamento | `POST /cards/installments` |
| criar conta (bank/cash) | `POST /accounts` |
| criar categoria | `POST /categories` |
| compra avulsa no cartão | `POST /cards/purchases` |
| recorrente no cartão | `POST /cards/recurring` |

**Lacunas reais de backend (precisam de contrato + endpoint + contract test):**

| Fluxo | Situação | Ação |
|---|---|---|
| `addCard` + `updateCard` (criar e editar a entidade cartão) | não existe `POST /cards` nem `PATCH /cards/:id`; `createAccountInputSchema` só aceita `kind: bank \| cash` (rejeita credit_card); `CardStore` só tem purchase/installments/recurring | criar endpoints de criação **e edição** de cartão (limite, dia fechamento, dia vencimento) + store + read-model + adapter legacy |
| `addSubscription` | não existe módulo de assinaturas (sem rota, store ou read-model); hoje é 100% mock no PWA | **construir módulo mínimo** (decisão aprovada 2026-06-25): novo `src/subscriptions/` (store + in-memory + legacy-postgres + postgres) + `routes/subscriptions.ts` (só GET/POST/cancel) + registro em `routes/index.ts` |
| subcategoria | `createCategoryInputSchema` é flat (`kind: expense \| income`), sem `parentId` | **adicionar `parentId`, profundidade máxima 1** (decisão aprovada 2026-06-25): categoria > subcategoria e para. **Cuidados:** (a) migração/backfill da coluna `parent_id` nullable; (b) anti-ciclo simples — `parentId` precisa apontar para categoria de topo (`parent.parentId` deve ser null); rejeitar subcat de subcat; (c) consumidores flat atuais (relatórios, picker) continuam funcionando com `parentId` null |

**Módulo de assinaturas — escopo (decisão aprovada: módulo mínimo):**
- `src/subscriptions/store.ts` (interface) + `in-memory.ts`, `legacy-postgres.ts`, `postgres.ts` (espelhando o padrão enxuto de `payables/`)
- `src/routes/subscriptions.ts`: **só** `GET /subscriptions`, `POST /subscriptions`, `POST /subscriptions/:id/cancel` (sem PATCH/edit — a tela atual não edita)
- entidade flat: `name, amountCents, cycle, day, paymentMethod, status` (espelha o tipo do PWA)
- registrar `subscriptionStore` em `RouteDeps` e `registerRoutes`
- sem projeção mensal elaborada nesta fase (só a soma que a tela/home já usa)
- contract tests por endpoint (GET/POST/cancel)

**Atomicidade (requisito de backend — não basta rollback de UI):**
- **Verificado:** o store `writes/` (transfer/expense/income) usa `withTransaction`; transfer é **um único row** (`from_account_id`+`to_account_id`), inerentemente atômico.
- **Defeito confirmado:** o store `cards/` **não usa `withTransaction`**. `createCardInstallments` faz N `INSERT` auto-commitados + `recalcStatement` por parcela; `payStatement` insere transaction + atualiza statement em queries separadas. Falha parcial deixa dados quebrados que o reload traz de volta — rollback de UI não resolve.
- **Ação:** envolver em `withTransaction` os writes multi-row: `createCardInstallments`, `payStatement`, e os novos `addCard`/subscription. Cada fluxo crítico grava tudo-ou-nada.

**Critério verificável**
- endpoints de `addCard`/`updateCard` e do módulo de subscription existem, com contrato e contract test passando
- `POST /categories` aceita `parentId` e o read-model devolve a hierarquia pai/filho
- `createCardInstallments`, `payStatement` e novos writes multi-row são atômicos (`withTransaction`); teste de falha no meio não deixa estado parcial
- erro de domínio retorna `DomainError` (já é o padrão do projeto)

**Testes desta fase**
- contract tests no `pi-finance-api` para: addCard/updateCard, `GET/POST/cancel /subscriptions`, categoria com `parentId` (incluindo rejeição de subcat de subcat)
- caso de sucesso + caso de erro de validação por endpoint novo (incluindo `parentId` inválido/ciclo)

### 0.2 Estender a camada de estado do PWA

**Arquivos**
- `apps/pwa/src/lib/state/app-state-context.tsx`
- `apps/pwa/src/lib/api/endpoints.ts`
- `apps/pwa/src/lib/state/types.ts`

**Entregas**
- adicionar em `endpoints.ts` as chamadas para os endpoints da 0.1
- criar mutators no contexto para:
  - `addCard`
  - `updateCard`
  - `addAccount`
  - `addCategory`
  - `addSubscription`
  - `payStatement`
  - `transfer`
  - `createInstallments` ou equivalente
- seguir o padrão de persistência aprovado:
  - **update otimista de UI → chamada à API (fonte de verdade) → on error: rollback + erro visível**
  - servidor é a persistência; `useState` é só cache de UI
  - enviar header `Idempotency-Key` nos mutators (o backend já suporta replay idempotente)
- corrigir bug de transferência: o endpoint `POST /transfers` **já existe** no backend; o bug é client-side — `AppShell` monta duas transactions e roteia via `addTransaction` (cai em income). Ligar no endpoint correto.
- alinhar tipos para suportar cartões, parcelamento, contas e assinaturas (módulo novo da 0.1)

**Critério verificável**
- mutators existem no contexto e chamam a API real
- nenhum fluxo persiste só em `useState` local
- ao falhar a API, o update otimista é revertido e o erro aparece
- transferência usa fluxo dedicado e endpoint correto

**Testes desta fase**
- unit do `app-state-context.tsx` por mutator (sucesso + rollback em erro de API)
- mapping/client integration de `endpoints.ts` contra os endpoints da 0.1 (o contrato é testado no backend, não aqui)

### Matriz de invariantes por fluxo

Cada mutator novo precisa satisfazer esta tabela. Sem ela o `app-state-context.tsx` vira patchwork e saldo/fatura/KPI divergem.

| Fluxo | Entidades tocadas | Aggregates/KPIs afetados | Persiste após reload | Atomicidade backend | Rollback de UI se API falhar |
|---|---|---|---|---|---|
| `transfer` | 1 transaction (from+to), 2 accounts | saldo de ambas as contas | sim (servidor) | ok (1 row, `withTransaction`) | reverter a transaction otimista |
| `payStatement` | payment tx, account, fatura/cartão | saldo da conta, fatura aberta, "a pagar" | sim (servidor) | **exige `withTransaction`** (hoje não tem) | reverter tx + fatura + saldo |
| `createInstallments` | N transactions, fatura do cartão | fatura aberta, gasto do mês, limite usado | sim (servidor) | **exige `withTransaction`** (hoje não tem) | reverter todas as parcelas geradas |
| `addCard` | card, (limite) | lista de cartões, limite total | sim (servidor) | `withTransaction` no write novo | remover o card otimista |
| `updateCard` | card (limite, fechamento, vencimento) | lista de cartões, limite total | sim (servidor) | ok (1 row) | restaurar valores anteriores do card |
| `addAccount` | account | lista de contas, saldo total | sim (servidor) | ok (1 row) | remover a conta otimista |
| `addCategory` | category (+ parentId) | lista de categorias, agrupamento de relatórios | sim (servidor) | ok (1 row) | remover a categoria otimista |
| `addSubscription` | subscription | lista de assinaturas (+ soma mensal já existente) | sim (servidor — módulo mínimo, Fase 0.1) | ok (1 row) | remover a assinatura otimista |

## Fase 1. Paridade estrutural

### 1.1 Corrigir active state da bottom nav

**Cobre:** A1, A2, V8

**Arquivos**
- `apps/pwa/src/components/AppShell.tsx`
- `apps/pwa/src/components/BottomNav.tsx`

**Entregas**
- mapear corretamente todas as rotas do PWA para estado ativo
- garantir comportamento correto em:
  - `/cartoes`
  - `/contas`
  - `/assinaturas`
  - `/orcamentos`
  - `/metas`
  - `/categorias`
  - `/relatorios`
  - `/perfil`
  - `/patrimonio`
- alinhar labels persistentes com o mock
- alinhar peso tipográfico da label com o mock

**Critério verificável**
- rota ativa correta em todas as páginas principais
- labels dos 4 slots laterais sempre visíveis
- peso tipográfico da nav ajustado conforme mock

**Testes desta fase**
- `apps/pwa/src/components/__tests__/AppShell.test.tsx`
- `apps/pwa/src/components/__tests__/BottomNav.test.tsx` se necessário criar

### 1.2 Ajustar fluxo estrutural do Perfil

**Cobre:** B4, V8

**Arquivos**
- `apps/pwa/src/app/perfil/page.tsx`
- `apps/pwa/src/features/profile/ProfilePage.tsx`
- `apps/pwa/src/features/home/HomePage.tsx`

**Entregas**
- manter `/perfil`, mas alinhar experiência ao stack do mock:
  - back affordance coerente
  - subfluxos consistentes
  - mesma linguagem de entrada/saída
- remover divergência gritante entre home e rota dedicada

**Critério verificável**
- fluxo de entrada no perfil é coerente
- subfluxos de perfil seguem o mesmo padrão visual e de navegação

**Testes desta fase**
- ampliar testes de render/navegação do perfil

### 1.3 Fundação de primitivos visuais compartilhados

**Por quê aqui:** `CardsPage`, `NewTransactionSheet`, `AppShell` e telas de lista são tocadas tanto na Fase 2 (funcional) quanto na Fase 3 (visual). Criar os primitivos compartilhados **antes** do trabalho tela-a-tela evita mexer duas vezes nos mesmos arquivos.

**Arquivos**
- `apps/pwa/src/lib/ui/tokens.ts`
- `apps/pwa/src/app/globals.css`
- novo registro de ícones vetoriais (ex.: `apps/pwa/src/components/ui/Icon.tsx`)
- novo `apps/pwa/src/components/ui/Badge.tsx` (badge tintado de identidade)

**Entregas**
- registro de ícones vetoriais consistente para substituir emoji (consumido por categorias, atalhos, sheets, nav)
- componente `Badge` tintado para identidade de conta/cartão/assinatura (baseline sem asset de marca)
- helpers de token para cores/gradientes/radii usados de forma repetida

**Critério verificável**
- primitivos existem e são importáveis
- Fases 2 e 3 consomem esses primitivos em vez de reintroduzir emoji/monograma/hardcode

**Testes desta fase**
- render dos primitivos (`Icon`, `Badge`) com props esperadas

## Fase 2. Paridade funcional

### 2.1 Fechar gaps do sheet de nova transação

**Cobre:** A3, A4, V1

**Arquivos**
- `apps/pwa/src/components/NewTransactionSheet.tsx`
- `apps/pwa/src/components/AppShell.tsx`
- dependência direta da Fase 0

**Entregas**
- implementar criação inline usando os mutators da Fase 0 (persistência no backend) para:
  - categoria
  - subcategoria
  - conta
  - cartão
- implementar parcelamento com persistência real via `createInstallments`
- alinhar presets de parcelas ao mock final
- corrigir fluxo de transferência usando `transfer` dedicado

**Critério verificável**
- cada botão `Nova/Novo` do sheet abre fluxo real
- salvar criação inline persiste no backend (sobrevive reload)
- parcelamento gera parcelas persistidas e consistentes nos KPIs
- transferência usa handler dedicado e endpoint correto

**Testes desta fase**
- `apps/pwa/src/components/__tests__/NewTransactionSheet.test.tsx`
- cobrir:
  - abrir criação inline
  - salvar criação inline
  - mudar estado ao parcelar
  - transferência

### 2.2 Fechar fluxo de cartões

**Cobre:** A5, A6, A7, V5

**Arquivos**
- `apps/pwa/src/features/cards/CardsPage.tsx`
- dependência direta da Fase 0

**Entregas**
- `Novo cartão` persistindo no `pi-finance-api` via `addCard`
- `Pagar fatura` total/parcial persistindo via `payStatement`
- histórico de faturas clicável (dados reais, não sintéticos)
- detail de fatura equivalente ao mock
- `Editar` cartão funcional, persistindo via `updateCard` (`PATCH /cards/:id`)

**Critério verificável**
- `Novo cartão` persiste no backend (sobrevive reload)
- `Pagar fatura` persiste e atualiza saldo + fatura aberta
- item do histórico abre detail real
- `Editar` cartão persiste a alteração (sobrevive reload)

**Testes desta fase**
- `apps/pwa/src/features/cards/__tests__/CardsPage.test.tsx`
- cobrir:
  - criação de cartão
  - edição de cartão
  - pagamento total/parcial
  - abertura de detail da fatura

### 2.3 Fechar fluxo de perfil

**Cobre:** A8, A9, A10

**Arquivos**
- `apps/pwa/src/features/profile/ProfilePage.tsx`
- `apps/pwa/src/features/home/HomePage.tsx`

**Entregas**
- notificações **desabilitadas explicitamente** nesta fase
- botão sair funcional
- segurança mantida fora de escopo funcional, sem fingir ação real

**Critério verificável**
- item de notificações fica oculto, desabilitado ou sinalizado
- botão sair tem handler real
- itens de segurança não aparecem como fluxo funcional inexistente

**Testes desta fase**
- `apps/pwa/src/features/profile/__tests__/ProfilePage.test.tsx`
- cobrir:
  - sair da conta
  - estado visual do item notificações
  - estado visual de segurança fora de escopo

### 2.4 Revisar gaps funcionais secundários

**Cobre:** achados secundários de metas/registros/payables

**Arquivos**
- `apps/pwa/src/features/goals/GoalsPage.tsx`
- `apps/pwa/src/features/records/RecordsPage.tsx`
- `apps/pwa/src/features/payables/PayablesPage.tsx`

**Entregas**
- validar CTA de metas/dívidas
- validar affordance de edição/exclusão em registros
- validar `marcar pago` em contas a pagar

**Critério verificável**
- handler existe para CTA crítico ou item fica explicitamente sinalizado como fora de escopo
- ações críticas persistem no backend (sobrevivem reload)

**Testes desta fase**
- `apps/pwa/src/features/goals/__tests__/GoalsPage.test.tsx`
- `apps/pwa/src/features/records/__tests__/RecordsPage.test.tsx`
- `apps/pwa/src/features/payables/__tests__/PayablesPage.test.tsx`

## Fase 3. Paridade visual

### 3.1 Unificar sistema de ícones

**Cobre:** V1, V2, V7, V8

**Arquivos**
- `apps/pwa/src/components/NewTransactionSheet.tsx`
- `apps/pwa/src/features/categories/CategoriesPage.tsx`
- `apps/pwa/src/components/AppShell.tsx`
- `apps/pwa/src/components/BottomNav.tsx`

**Entregas**
- aplicar o registro de ícones da Fase 1.3 nas telas, removendo emoji como base de iconografia
- revisar ícones do menu `Mais`
- alinhar peso tipográfico e labels da nav

**Critério verificável**
- nenhum ícone principal de categoria/atalho usa emoji
- menu `Mais` usa semântica coerente
- bottom nav bate em label + peso tipográfico

**Testes desta fase**
- testes de render verificando ausência de emojis críticos nos componentes auditados

### 3.2 Corrigir identidades visuais placeholder

**Cobre:** V3, V4, V5, V6

**Arquivos**
- `apps/pwa/src/features/home/HomePage.tsx`
- `apps/pwa/src/features/accounts/AccountsPage.tsx`
- `apps/pwa/src/features/wallet/WalletPage.tsx`
- `apps/pwa/src/features/cards/CardsPage.tsx`
- `apps/pwa/src/features/subscriptions/SubscriptionsPage.tsx`

**Entregas**
- aplicar o componente `Badge` da Fase 1.3 no lugar dos monogramas
- melhorar face visual de cartões sem depender de assets de marca
- alinhar assinaturas a identidade visual consistente, sem logo licenciado obrigatório

**Critério verificável**
- contas, cartões e assinaturas não dependem só de `slice(0, 2).toUpperCase()` para identidade principal
- badges e cores seguem padrão consistente entre telas

**Testes desta fase**
- testes de render validando presença do badge visual esperado por componente

### 3.3 Reduzir drift de estilos locais

**Cobre:** bloco de desvio de design tokens

**Arquivos**
- `apps/pwa/src/app/globals.css`
- telas e componentes com alto volume de hardcode local

**Entregas**
- migrar gradientes, cores e radii locais para os helpers de token da Fase 1.3
- extrair padrões visuais recorrentes restantes
- alinhar tokens usados com o sistema existente

**Critério verificável**
- componentes críticos usam tokens compartilhados onde aplicável
- diminuição de hardcodes visuais repetidos

**Testes desta fase**
- sem foco em unit profundo; validar render sem regressão visual estrutural

## Fase 4. QA visual e fechamento

### 4.1 QA visual final em navegador

**Cobre:** Bucket C

**Entregas**
- checklist tela a tela contra `.dc.html`
- revisão de:
  - iconografia
  - pesos tipográficos
  - spacing
  - hierarquia
  - affordance
- captura manual/browser para validar itens pendentes da auditoria estática

**Critério verificável**
- captura visual comparada ao mock
- cada item do Bucket C marcado como resolvido, aceito ou fora de escopo

### 4.2 Fechamento de regressão

**Cobre:** A11

**Entregas**
- rerun dos testes adicionados nas fases 0–3
- consolidar suíte de paridade funcional (nav + CTA críticos), fechando o gap de A11
- revisão final dos fluxos críticos
- checagem de ausência de CTA morto nas telas principais

**Critério verificável**
- testes passam
- item não interativo está sinalizado ou removido
- rota ativa correta
- sheet abre/fecha corretamente
- estado muda quando esperado

## Ordem de arquivos tocados

> **Não é "implementar tudo e testar no fim".** O teste nasce dentro de cada fase (RED antes da implementação, ver Convenção de testes). Esta lista é só a sequência de arquivos/áreas tocados; os testes de cada item acompanham aquele item, não o passo 16.

1. `../pi-finance-api` — endpoints + contract tests (Fase 0.1)
2. `apps/pwa/src/lib/api/endpoints.ts`
3. `apps/pwa/src/lib/state/types.ts`
4. `apps/pwa/src/lib/state/app-state-context.tsx`
5. `apps/pwa/src/components/AppShell.tsx`
6. `apps/pwa/src/components/BottomNav.tsx`
7. primitivos visuais — `components/ui/Icon.tsx`, `components/ui/Badge.tsx`, `lib/ui/tokens.ts` (Fase 1.3)
8. `apps/pwa/src/components/NewTransactionSheet.tsx`
9. `apps/pwa/src/features/cards/CardsPage.tsx`
10. `apps/pwa/src/features/profile/ProfilePage.tsx`
11. `apps/pwa/src/features/home/HomePage.tsx`
12. `apps/pwa/src/features/accounts/AccountsPage.tsx`
13. `apps/pwa/src/features/wallet/WalletPage.tsx`
14. `apps/pwa/src/features/subscriptions/SubscriptionsPage.tsx`
15. `apps/pwa/src/features/categories/CategoriesPage.tsx`
16. QA visual final

(Testes não são um passo final: cada arquivo acima entra com seu teste RED-first dentro da fase correspondente.)

## Prioridade prática

| Ordem | Item | Motivo |
|---|---|---|
| 1 | backend slice + camada de estado | sem persistência real a Fase 2 não fecha; servidor é fonte de verdade |
| 2 | nav e active state | quebra percepção global do app |
| 3 | CTA mortos | frustração direta do usuário |
| 4 | cartões / pagamento | fluxo financeiro crítico |
| 5 | perfil | CTA falsos e inconsistência de fluxo |
| 6 | iconografia / badges | fidelidade visual e acabamento |
| 7 | limpeza de tokens | estabilidade futura |
| 8 | QA final | fechar regressões |

## Definição de pronto

- spec corrigida e aceita
- decisões aprovadas registradas (owner/data)
- endpoints do `pi-finance-api` para os fluxos novos existem e têm contract test passando
- camada de estado ampliada, com mutators chamando a API real
- nav correta
- **CTA críticos persistem no backend e sobrevivem a reload** (verificado por E2E)
- erro de API reverte o update otimista e é sinalizado (sem fallback silencioso)
- sem placeholders visuais óbvios
- ícones e identidades usam os primitivos compartilhados, alinhados ao mock
- testes distribuídos por fase cobrindo fluxos principais (unit + contract + render + E2E)
- QA visual final concluído contra `.dc.html`
