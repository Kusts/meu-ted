# PWA Companion App Design

**Data:** 2026-06-14
**Motivo:** pivot de app SwiftUI nativo para PWA companion por ausência de Apple Developer/Mac.
**Spec original:** `docs/superpowers/specs/2026-06-14-iphone-finance-app-design.md` (arquitetura de API mantida; entrega de cliente alterada).

## Context

- WhatsApp permanece interface conversacional com TED/Agent Pi.
- A API `pi-finance-api` já está completa (V1 CRUD + dashboard + insights + auth), com contratos estáveis e Postgres/in-memory dual.
- O app nativo SwiftUI (`pi-finance-ios`) fica **pausado** (spike concluído; código preservado como referência de UX).
- O PWA substitui o SwiftUI como canal de acesso visual V1: dashboard, CRUD, filtros, gráficos.
- `apps/whatsapp-bridge` segue transport-only.
- Usuários: usuário + esposa, um household, sem multi-tenant.
- Prazo de entrega: V1 funcional navegável em navegador + instalável como PWA.

## Decisions

| Decision | Choice | Reason | Rejected |
|---|---|---|---|
| Client stack | React + Vite + TypeScript | ecossistema maduro, PWA tooling, contratação fácil | Vue, Svelte, Solid |
| PWA tooling | vite-plugin-pwa (Workbox) | service worker automático, cache strategies configuráveis | manual sw, next-pwa |
| UI kit | shadcn/ui + Tailwind CSS | copiable, customizável, sem lock-in de lib | MUI, Chakra, Ant |
| Data fetching | TanStack Query v5 | cache, refetch, mutations, offline support | SWR, RTK Query |
| Forms | React Hook Form + Zod | validação client-side sincronizada com contratos API | Formik, react-final-form |
| Charts | Recharts | leve, React-native, PWA-friendly | Chart.js, visx |
| Auth | device token via API, localStorage, PIN local (4 dígitos) | simples, sem dependência de plataforma | WebAuthn (pós-V1) |
| Token storage | localStorage + IndexedDB (idb-keyval) | PWA não tem Keychain; IndexedDB persiste após service worker update | sessionStorage, cookies |
| Backend | `pi-finance-api` (já pronto, sem alterações) | contratos estáveis, endpoints V1 completos | novo backend |
| Deploy | Cloudflare Pages ou Vercel (HTTPS nativo) + Cloudflare Tunnel para API | PWA exige HTTPS; deploy estático é trivial | VPS, Netlify |
| Offline | cache-read-only via Workbox (stale-while-revalidate) | útil para consulta sem rede; sem conflito de escrita | offline writes |
| Scope | um household (server-derived via device token) | igual spec original | multi-tenant |

## Architecture

```
Navegador / PWA instalado
  ├─ React SPA (Vite)
  ├─ service worker (Workbox)
  ├─ localStorage + IndexedDB (token, cache queries)
  └─ HTTPS REST JSON
        ↓
Cloudflare Pages / Vercel (static hosting)
        ↓
Cloudflare Tunnel
        ↓
pi-finance-api (Fastify, in-memory / Postgres)
        ↓
Postgres financeiro (futuro: shared com Agent Pi)
```

**Boundary rules (mantidas da spec original):**

- `apps/whatsapp-bridge` permanece transport-only.
- O PWA não chama endpoints do Evolution/WhatsApp.
- A API `pi-finance-api` é separada do bridge e não adiciona lógica de domínio ao bridge.
- Household é sempre derivado do device token server-side (REQ-3A).
- App e Agent Pi compartilham a mesma verdade de banco (quando Postgres ativo).

## Requirements

| ID | Type | Requirement |
|---|---|---|
| REQ-1 | ubiquitous | O PWA deve prover acesso visual a contas, categorias, transações, dashboard e insights para um household. |
| REQ-2 | event-driven | Ao abrir o PWA, se nenhum token existir, mostrar tela de registro de dispositivo. Se token existir, mostrar tela de PIN de 4 dígitos. |
| REQ-2A | state-driven | PIN é armazenado como hash em localStorage; não trafega na rede. |
| REQ-3 | state-driven | Enquanto device token estiver ausente, revogado ou inválido, a API deve rejeitar todo endpoint financeiro. |
| REQ-3A | state-driven | A API deriva exatamente um household do device token; ignora household IDs enviados pelo cliente. |
| REQ-4 | event-driven | Ao criar despesa, receita ou transferência, o PWA deve validar campos no client (Zod) e no servidor antes de persistir. |
| REQ-5 | state-driven | Offline, o PWA deve mostrar dashboards e listas cacheados como read-only (Workbox stale-while-revalidate). |
| REQ-6 | unwanted | Se o PWA perder internet durante CRUD, deve manter dados do formulário e mostrar retry, sem criar duplicatas (idempotency key da API). |
| REQ-7 | ubiquitous | O PWA deve suportar filtros por data, conta, categoria, tipo, faixa de valor e busca textual. |
| REQ-8 | ubiquitous | O PWA deve exibir insights estilo TED, rankings, variações e alertas. |
| REQ-9 | state-driven | Módulos não implementados não devem aparecer na UI (sem stubs falsos). |
| REQ-10 | unwanted | Se a validação da API falhar, o PWA deve mostrar mensagem PT-BR humana e preservar input do usuário. |
| REQ-11 | ubiquitous | O PWA deve ser instalável (manifest, service worker, ícones) e funcionar offline para leitura. |

## Modules (V1)

| Order | Module | Scope |
|---|---|---|
| 1 | Base financeira | contas, categorias, transações CRUD, filtros, dashboard básico |
| 2 | Dashboard | saldo, mês atual, fluxo 30d, top despesas/categorias, insights, variação vs mês anterior |
| 3 | Lançamentos | lista agrupada por data, busca, filtros, criar/editar/excluir |
| 4 | Carteira | contas bancárias CRUD, categorias CRUD, transferências recentes |

**V1 visible:** tabs Início, Registros, Carteira.
**Pós-V1:** Planejamento, Insights, Cartões, Metas, Orçamentos, Relatórios (mesma ordem da spec original).

## Navigation (V1)

```
Tab bar (mobile) / Sidebar (desktop)
├─ Início        # dashboard, alertas, insights
├─ Registros     # lista, busca, filtros, CRUD
└─ Carteira      # contas, categorias, transferências

Global +
├─ Nova despesa
├─ Nova receita
└─ Nova transferência
```

## V1 API endpoints (reuso de pi-finance-api)

Todos os endpoints abaixo já existem e estão testados em `pi-finance-api`.

**Auth:**
- `POST /auth/devices/register` — registrar dispositivo, obter token
- `POST /auth/devices/revoke` — revogar token
- `GET /auth/devices/me` — validar token atual

**Read:**
- `GET /accounts` — listar contas ativas
- `GET /categories` — listar categorias
- `GET /transactions` — listar com filtros V1
- `GET /dashboard/summary` — dashboard premium (top categorias, MoM, alertas)
- `GET /insights/quick` — insights rápidos

**Write:**
- `POST /accounts`, `PATCH /accounts/:id`, `POST /accounts/:id/deactivate`
- `POST /categories`, `PATCH /categories/:id`, `POST /categories/:id/deactivate`
- `POST /transactions/expense`, `POST /transactions/income`, `POST /transfers`
- `PATCH /transactions/:id`, `DELETE /transactions/:id`

## Security

- Token armazenado em localStorage; PIN hash em localStorage (SHA-256 + salt).
- PIN não trafega na rede; é verificada localmente antes de liberar UI.
- API requer `X-Device-Token` em todos os endpoints financeiros.
- Service worker não intercepta chamadas de API (apenas assets estáticos e dados de cache read-only).
- HTTPS obrigatório (Cloudflare Pages ou Vercel fornecem).
- Soft-delete para auditabilidade (já implementado na API).

## Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | hooks, validators, formatters, auth PIN |
| Component | Vitest + Testing Library | cards, forms, filters, modals |
| Integration | Vitest + MSW | API client, TanStack Query cache |
| E2E | Playwright | fluxo completo: register → PIN → CRUD → dashboard → offline |
| PWA | Playwright + Lighthouse | install prompt, offline cache, manifest |
| Contract | Zod schema tests | request/response parity com API |

Feature test protocol:
- Unit RED first: validators, PIN hash, formatters.
- Component: renders com dados mockados.
- Integration: MSW intercepta API, valida queries/mutations.
- E2E: Playwright com browser real, service worker ativo.
- Coverage ratchet: ≥80% lines no novo código.

## Non-goals V1

- Sem substituição do WhatsApp.
- Sem multi-tenant SaaS.
- Sem WebAuthn / passkey (pós-V1).
- Sem sincronização offline de escrita.
- Sem lógica de domínio financeiro no bridge.
- Sem módulo de cartões, metas, orçamentos, parcelamentos.
- Sem deploy público (apenas Cloudflare Tunnel para dev/prod local).
- Sem notificações push nativas (PWA pode usar Notification API pós-V1).

---

## Status de implementação (as-built) — 2026-06-15

**Repositório:** `D:\projetos\pi-finance-web` (separado deste repo).
**Verificação:** `npm run typecheck` ✅ · `npm test` ✅ (9 arquivos, 21 testes) · `npm run build` ✅ (gera `dist/sw.js` + `dist/manifest.webmanifest`, precache 7 entries).
**Conclusão geral:** V1 navegável e instalável **concluído**, com partials documentados abaixo (REQ-4, REQ-6, REQ-7, REQ-11) e divergências de arquitetura em relação ao plano.

### Requisitos vs implementação

| ID | Status | Evidência / observação |
|---|---|---|
| REQ-1 | ✅ atendido | `HomePage`, `RecordsPage`, `WalletPage` cobrem contas, categorias, transações, dashboard e insights. |
| REQ-2 | ✅ atendido | `AuthGate` decide `register → setup-pin → unlock → unlocked`. |
| REQ-2A | ✅ superado | `pin-store.ts` usa **PBKDF2 (100k iterações, SHA-256, salt 16 bytes)** em localStorage, não simples SHA-256+salt. PIN não trafega na rede. |
| REQ-3 | ✅ atendido (server-side) | Cliente envia `X-Device-Token`; rejeição é responsabilidade da API. |
| REQ-3A | ✅ atendido (server-side) | Household derivado do token na API; cliente não envia householdId. |
| REQ-4 | ✅ atendido | Validação **server-side** + **client via React Hook Form + Zod** (`src/lib/forms/schemas.ts`, `zodResolver`). Mensagens de erro PT-BR por campo. |
| REQ-5 | ✅ atendido | `src/lib/cache.ts` (localStorage) + `placeholderData` no TanStack Query + Workbox `StaleWhileRevalidate`; ações de escrita desabilitadas quando offline (`online` prop). |
| REQ-6 | ✅ atendido | Idempotency-Key **estável por submissão** (`useRef(crypto.randomUUID())` no sheet) em expense/income/transfer → o **retry reusa a mesma key**, então o servidor deduplica e não cria duplicata. Em falha, RHF preserva o input e o botão vira **"Tentar novamente"**. Coberto por teste (`transaction-sheets.test.tsx`). |
| REQ-7 | ✅ atendido | UI filtra por **tipo, conta, categoria, faixa de valor (mín/máx), data início/fim e busca textual** + botão "Limpar filtros". |
| REQ-8 | ✅ atendido | Insights, top categorias (despesa+receita), variação MoM e alertas via `/dashboard/summary` + `/insights/quick`. |
| REQ-9 | ✅ atendido | Apenas 3 tabs visíveis; módulos pós-V1 ausentes da UI. |
| REQ-10 | ✅ atendido | `getErrorMessage` + `ApiError` retornam mensagem PT-BR; RHF preserva input. |
| REQ-11 | ✅ atendido | Manifest + service worker (Workbox) + ícones gerados no build; instalável e offline para leitura. **Lighthouse (mobile): Acessibilidade 100, Best Practices 100.** A categoria "PWA" do Lighthouse foi descontinuada (Lighthouse 12); instalabilidade garantida por `manifest.webmanifest` + `sw.js`. |

### Módulos V1

| Módulo | Status | Observação |
|---|---|---|
| 1 — Base financeira | ✅ | CRUD de contas, categorias e transações + filtros + dashboard. |
| 2 — Dashboard | ✅ superado | Além do planejado: 2 PieCharts (despesa **e** receita), LineChart de fluxo, saldos de conta, cards de variação MoM. |
| 3 — Lançamentos | ✅ (filtros parciais) | Lista agrupada por data, busca, criar/editar/excluir; filtros parciais (ver REQ-7). |
| 4 — Carteira | ✅ | CRUD de contas e categorias + transferências recentes. |

### Divergências em relação à spec/plano

1. **Arquitetura de pastas:** feature-based (`src/features/{auth,home,records,wallet}/`) + `src/lib/api/{client,finance-api,queries,mutations,types}.ts`, em vez do plano `src/pages/` + `src/components/<domínio>/` + `src/hooks/use-*.ts`.
2. **Componentes co-localizados:** cada página é um arquivo único com sub-componentes inline (sheets, cards, KPIs), em vez de arquivos separados (`BalanceCard.tsx`, `TransactionRow.tsx`, etc.).
3. **Nomenclatura:** páginas em inglês (`HomePage`/`RecordsPage`/`WalletPage`); tabs na UI são **"Resumo", "Registros", "Carteira"** (não "Início").
4. **Forms:** **React Hook Form + Zod** (adotados em 2026-06-15). Sheets extraídos como componentes testáveis (`src/features/records/transaction-sheets.tsx`, `src/features/wallet/wallet-sheets.tsx`) recebendo `onSubmit`/`error`/`pending` por prop; mutations ligadas por "connectors" no page (habilita o retry do REQ-6). Schemas em `src/lib/forms/{amount,schemas}.ts`.
5. **UI kit:** **sem shadcn/ui**. Tailwind 4 puro + componentes custom + `lucide-react`. Tema "light premium — Copilot Money + Monarch".
6. **Token storage:** **localStorage apenas**; sem IndexedDB / `idb-keyval` (não instalado). Spec previa `localStorage + IndexedDB`.
7. **Offline cache:** `src/lib/cache.ts` (localStorage) + `placeholderData` + Workbox SWR, em vez de `networkMode: 'offlineFirst'` do plano.
8. **Charts:** **LineChart** de fluxo de caixa (evoluiu de BarChart), derivação **client-side de 14 dias** (`deriveFlow`) em vez de endpoint dedicado; eixo Y com domínio dinâmico.
9. **Adições não previstas:** validação de token no boot contra `/auth/devices/me` + reset de sessão em 401 (reauth após troca de DB); ícones de conta por heurística de nome; quick actions na Home navegando para Registros via `sessionStorage`.
10. **Stack mais nova que o plano:** React 19, **Vite 8**, **TS 6**, Tailwind 4, **Recharts 3**, **Zod 4** (vs plano Vite 6 / TS 5.7 / Recharts 2).
11. **Modelo:** `Account.kind` inclui `credit_card` além de `bank`/`cash`.
12. **Manifest duplicado:** `public/manifest.json` (manual) coexiste com o `manifest.webmanifest` gerado pelo `vite-plugin-pwa` (config inline em `vite.config.ts`). Redundância a limpar.
13. **Sem `global-fab`:** quick action buttons na Home/Registros substituem o FAB global planejado.

### Estratégia de testes (real)

- **Implementado:** Vitest + Testing Library — **51 testes / 13 arquivos**. Inclui validadores puros (`amount`, `schemas`), forms RHF+Zod (`transaction-sheets`, `wallet-sheets`: validação bloqueia submit vazio, conversão para cents, retry em erro) além de `pin-store`, `token-store`, `client`, `format`, `get-error-message`, `reset-session`, `AuthGate`, `HomePage`, `App`.
- **Não implementado:** MSW (integration), Playwright (E2E). Coverage ratchet ≥80% não medido.
- **Lighthouse (2026-06-15, mobile, build de produção):** Acessibilidade **100**, Best Practices **100**. SEO 63 e `is-crawlable` falham **por design** (`robots.txt` com `Disallow: /` — app privado). `llms-txt` não aplicável.

### Pendências para fechar V1 / pós-V1

Fechado em 2026-06-15: REQ-4 (RHF+Zod), REQ-6 (retry), REQ-7 (filtros categoria + faixa de valor), REQ-11 (Lighthouse a11y/best-practices 100), manifest duplicado removido.

Restante:
- [ ] Deploy real (Cloudflare Pages + Tunnel) — instruções prontas no README, requer credenciais do usuário.
- [ ] MSW (integration) e Playwright (E2E) — opcionais pós-V1.
- [ ] Code-splitting: bundle JS ~730 kB (warning de chunk >500 kB após adotar RHF/Zod).
