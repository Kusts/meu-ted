# iPhone Finance App V1 — Implementation Plan

**Data:** 2026-06-14
**Baseado no spec:** `docs/superpowers/specs/2026-06-14-iphone-finance-app-design.md`
**Status:** 🟡 V1 SLICE 1 (read + demo) executado · próximos slices pendentes
**Scope V1:** Base financeira + dashboard básico (módulos 1 e 2 parciais), com API read-only demo-backed e iOS demo-backed.

## Resumo do Estado Atual

| Componente | Estado | Localização |
|---|---|---|
| Spec | ✅ Aprovado (2026-06-14) | `docs/superpowers/specs/2026-06-14-iphone-finance-app-design.md` |
| API V1 read endpoints | ✅ Implementado e testado | `/d/projetos/pi-finance-api` (repo próprio, branch `main`, 1 commit) |
| iOS V1 SwiftUI | ✅ Fontes escritas, demo-backed | `/d/projetos/pi-finance-ios` (repo próprio, branch `main`, 1 commit) |
| `apps/whatsapp-bridge` | ⛔ NÃO TOCADO por este plano | `/d/projetos/pi-financeiro/apps/whatsapp-bridge` |
| Persistência real | ⏳ Não iniciada (in-memory V1) | — |
| Auth Face ID / Keychain | ⏳ Não iniciada (V1 stub) | — |
| CRUD de transações | ⏳ Próximo slice | — |
| CRUD de contas / categorias | ⏳ Próximo slice | — |

## Arquitetura (do spec, mantida)

```
iPhone SwiftUI ──HTTPS──▶ Cloudflare Tunnel ──▶ pi-finance-api
                                                     │
                                                     ▼
                                          ReadModelStore (in-memory V1)
                                                     │ (futuro)
                                                     ▼
                                          Postgres financeiro
                                                     ▲
                                                     │
                              Agent Pi tools / WhatsApp bridge
                              (apps/whatsapp-bridge: transport-only,
                               sem domínio financeiro)
```

**Boundary rules (inalteradas do spec):**

- `apps/whatsapp-bridge` permanece transport-only.
- O app iOS não chama endpoints do Evolution/WhatsApp.
- A API é separada do bridge e não adiciona lógica de domínio ao bridge.
- Household é sempre derivado do device token server-side (REQ-3A) — nunca client-supplied.
- App e Agent Pi compartilham a mesma verdade de banco (persiste depois).

## Slices Executados

### SLICE-1 — API V1 read + iOS Início/Registros demo ✅ (2026-06-14)

**Objetivo:** disponibilizar a primeira fatia navegável do app com dados demo, contratos estáveis, sem dependência de persistência.

#### API — `/d/projetos/pi-finance-api`

| Endpoint | Contrato | Testes | Arquivo de teste |
|---|---|---|---|
| `GET /health` | `{ status: "ok" }` | smoke (server.test) | `tests/server/server.test.ts` |
| `GET /auth/devices/me` | `{ deviceId, householdId }` | 3 (auth flow) | `tests/auth/device-token.test.ts` |
| `GET /accounts?kind=` | `{ items, total }` | 6 (kind + scoping) | `tests/routes/accounts-categories.test.ts` |
| `GET /categories?kind=` | `{ items, total }` | 6 (kind + scoping) | `tests/routes/accounts-categories.test.ts` |
| `GET /transactions?…` | `{ items, total, limit, offset }` | 16 (todos os filtros V1 + scoping) | `tests/routes/transactions.test.ts` |
| `GET /dashboard/summary` | `DashboardSummary` | 6 (totals, top, scoping) | `tests/routes/dashboard.test.ts` |
| `GET /insights/quick` | `{ items: QuickInsight[] }` | 3 (cap 5, severities) | `tests/routes/insights.test.ts` |

**Stack:** Fastify 5 + TypeScript strict + Zod + Vitest. In-memory read models com `DEMO_HOUSEHOLD_ID` seed. Device-token store injetável (testável). `tsconfig` com `exactOptionalPropertyTypes`.

**Filtros V1 (Zod-enforced):** `startDate`, `endDate`, `accountId`, `categoryId`, `kind`, `minAmountCents`, `maxAmountCents`, `query`, `limit`, `offset`. Refinements: `startDate ≤ endDate`, `minAmountCents ≤ maxAmountCents`.

#### iOS — `/d/projetos/pi-finance-ios`

| Camada | Arquivo | Notas |
|---|---|---|
| App entry | `Sources/FinanceApp/App/FinanceAppApp.swift` | TabView Início/Registros |
| Env | `Sources/FinanceApp/App/AppEnvironment.swift` | Seção única demo↔live via `FINANCE_API_BASE` |
| Models | `Sources/FinanceApp/Models/Models.swift` | Mirror do contrato API; BRL formatter |
| API client | `Sources/FinanceApp/Networking/APIClient.swift` | URLSession + Zod-equivalent; `APIError` PT-BR |
| Demo | `Sources/FinanceApp/Demo/DemoData.swift` | `DemoAPIClient : APIClientProtocol` |
| Auth | `Sources/FinanceApp/Auth/DeviceTokenStore.swift` | V1 stub `dev-token-1` (Keychain depois) |
| Início | `Sources/FinanceApp/Features/Inicio/InicioView.swift` | Saldo, mês, fluxo 30d, top, insights |
| Registros | `Sources/FinanceApp/Features/Registros/RegistrosView.swift` | Grouped list, busca, filtros |
| Shared | `Sources/FinanceApp/Features/Shared/AsyncStateView.swift` | `AsyncContent`, `FinanceCard`, `SeverityPill` |
| Tests | `Tests/FinanceAppTests/{Demo,Models,Networking}/...swift` | XCTest, 12 cases core |
| Build | `Package.swift` (SwiftPM library + tests), `Resources/{Info.plist, Assets.xcassets}` | Xcode wiring documentado no README |

**V1 navigation implementada:** `Início` (dashboard) + `Registros` (lista). Carteira tab e demais diferidas (módulos 2+).

**Limitação local registrada:** `xcodebuild` / `swift` indisponíveis neste host (Windows). Testes do core (`swift test`) e build do app exigem Mac. README descreve o wiring Xcode.

## REQ → Surface / Teste

| REQ | Tipo | Surface (atual) | Teste(s) | Status |
|---|---|---|---|---|
| REQ-1 | ubiquitous | `GET /accounts`, `/categories`, `/transactions`, `/dashboard/summary`, `/insights/quick` + telas Início/Registros | accounts-categories (6), transactions (16), dashboard (6), insights (3) | ✅ coberto para V1 read |
| REQ-2 | event-driven | ⏳ Face ID / PIN gate (V1 sem gate) | — | ⏳ módulo 1 follow-up |
| REQ-3 | state-driven | API rejeita sem token (todas as rotas testadas em auth + smoke) | `device-token.test.ts` (3) + smoke `requires auth` em todas as rotas | ✅ |
| REQ-3A | state-driven | Household derivado do device token; testes de scoping A vs B | `transactions.test.ts` ("ignora household client-supplied", "tokens diferentes veem households diferentes") | ✅ |
| REQ-4 | event-driven | ⏳ CRUD ainda não implementado | — | ⏳ próximo slice |
| REQ-5 | state-driven | ⏳ Read-only cache offline (V1 demo, app requer online) | — | ⏳ follow-up |
| REQ-6 | unwanted | ⏳ Retry sem duplicação em CRUD (sem CRUD ainda) | — | ⏳ próximo slice |
| REQ-7 | ubiquitous | Filtros V1 na API + sheet de filtros em Registros | `transactions.test.ts` (date/account/category/kind/amount/query) | ✅ API; ✅ UI sheet de filtros implementada |
| REQ-8 | ubiquitous | `GET /insights/quick` + cards de insight no Início | `insights.test.ts` (3) | ✅ |
| REQ-9 | state-driven | Tab bar V1 expõe só Início/Registros; Carteira/Planejamento/Insights escondidos | navegação conforme spec | ✅ |
| REQ-10 | unwanted | `APIError` PT-BR no client; `AsyncContent` mostra mensagem humana | `APIClientErrorTests.testMissingTokenThrows` | ✅ base; ⏳ cobertura completa após CRUD |

## Comandos de Verificação Executados

| Comando | Exit | Notas |
|---|---|---|
| `cd /d/projetos/pi-finance-api && pnpm install` | 0 | 180 packages, 0 vulnerabilities |
| `cd /d/projetos/pi-finance-api && pnpm test` | 0 | 6 test files · **36/36 passed** (1.27s) |
| `cd /d/projetos/pi-finance-api && pnpm typecheck` | 0 | `tsc -p tsconfig.json --noEmit`, sem erros |
| Server smoke `PORT=3099 pnpm start` + `curl` | manual | `/health`=200, `/transactions`=200 c/ token, =401 s/ token |
| iOS `swift test` | n/a | `xcodebuild`/`swift` ausentes no host; documentado em `pi-finance-ios/README.md` |
| `git -C /d/projetos/pi-financeiro status` | 0 | bridge **intocado** (apenas diff pré-existente de outra task) |

## Riscos Imediatos

- **Sem compilador iOS no host Windows.** Sources validados só por inspeção + contratos com a API. Mac-side `swift test` e iOS Simulator build são obrigatórios antes de merge para V1 closeout.
- **Demo data parity:** `DemoAPIClient` e `DEMO_TRANSACTIONS` no API mantidos em sync manualmente. Próximo slice pode extrair um JSON compartilhado.
- **`DeviceTokenStore` retorna `dev-token-1` hardcoded.** Keychain + Face ID / PIN ficam para REQ-2/REQ-6 follow-up.
- **Worktree branch `worker1` no bridge tem diff não mergeado de tasks anteriores** (group filter, trim msg). Não pertence a este plano — não mergeado aqui.
- **Sem persistência ainda.** Crash ou restart do processo zera o estado in-memory. Persistência real é pré-requisito para V1 closeout (ver próximo slice).

## Próximos Slices Recomendados (ordenados)

### SLICE-2 — Persistência real (Postgres adapter)

Pré-requisito do CRUD e do REQ-1 closeout. Implementar adapter `PostgresReadModelStore : ReadModelStore` mantendo o mesmo contrato. In-memory vira fallback de dev/test.

- Tabelas: `accounts`, `categories`, `transactions`, `device_tokens`.
- Adapter em `pi-finance-api/src/read-models/postgres-store.ts`.
- Migrações em `pi-finance-api/migrations/` ou reaproveitar do Agent Pi.
- Tests: `tests/read-models/postgres-store.test.ts` com testcontainers ou transaction-rollback.
- Critério: API V1 read continua passando contra Postgres em CI.

### SLICE-3 — CRUD V1 (Base financeira módulo 1 closeout)

Cobre REQ-4 e prepara REQ-10 (erros PT-BR em formulários).

- Endpoints novos: `POST /accounts`, `PATCH /accounts/{id}`, `POST /accounts/{id}/deactivate` (e equivalentes para categories); `POST /transactions/expense`, `POST /transactions/income`, `POST /transfers`, `PATCH /transactions/{id}`, `DELETE /transactions/{id}` (soft delete).
- Validação: amount > 0, date válida, account/category pertecentes ao household derivado, idempotency key.
- iOS: telas `Criar/Editar Despesa`, `Criar/Editar Receita`, `Criar Transferência`; flow de erro PT-BR preservando input.
- Tests: 30+ API tests (validação, household scoping, idempotência, soft-delete).

### SLICE-4 — Auth completa (Face ID / PIN + Keychain)

Cobre REQ-2 e fecha o ciclo de segurança.

- App: tela de unlock com `LocalAuthentication`; token movido para Keychain com `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.
- API: `POST /auth/devices/register` + `POST /auth/devices/{id}/revoke`; housekeeping de tokens revogados.
- Tests: App unit test do `DeviceTokenStore` Keychain-backed (precisa Mac); API integration test de revoke.

### SLICE-5 — Read-only cache offline (REQ-5)

SwiftUI app: persistir última resposta de `/dashboard/summary`, `/accounts`, `/categories`, `/transactions` em SwiftData ou arquivo JSON criptografado. Mostrar cache quando API indisponível, com badge "modo offline".

### SLICE-6 — Module 2 (Dashboard) e Módulo 4 (Carteira) full

Fecha os tabs do V1 (Início expandido + Carteira). Inclui gráficos, rankings mensais, top categorias, alertas.

### SLICE-7 — Onboarding + primeiro seed (se aplicável)

Para usuário + esposa, se não houver devices registrados. Atalho até REQ-2.

## Out of V1 (confirmado pelo spec)

- Módulos 5–11 do spec: Insights avançados, Cartões, Contas a pagar, Orçamentos, Metas, Parcelamentos, Relatórios.
- Multi-tenant SaaS, public App Store, account/password auth, offline writes sync, force-push, regressão para stub fake (REQ-9).

## Critérios de V1 Closeout (acumulado)

- [x] SLICE-1: read API + iOS Início/Registros demo (este plano)
- [ ] SLICE-2: Postgres adapter com mesmos contratos
- [ ] SLICE-3: CRUD V1 com validação e idempotência
- [ ] SLICE-4: Face ID / PIN + Keychain
- [ ] SLICE-5: Read-only cache offline
- [ ] SLICE-6: Module 2 + Module 4 (tabs Início expandido + Carteira)
- [ ] iOS build verde em Xcode 16+ / iOS 17+
- [ ] API `pnpm test` + `pnpm typecheck` verdes em CI
- [ ] `apps/whatsapp-bridge` segue intocado (verificável via `git log`/diff)

---

*Gerado por worker1 — slice de rastreabilidade — 2026-06-14.*
