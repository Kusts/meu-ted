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
