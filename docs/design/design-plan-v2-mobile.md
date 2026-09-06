# Plano de Redesign v2 — Mobile Excellence + Identidade

**Data:** 2026-09-06 · **Status:** APROVADO — em implementação (Run `run_9b08c9baf165`)
**Base:** [`design-plan.md`](design-plan.md) (Emerald Titanium, v1 — já implementado)
**Debate:** Orca Run `run_9b08c9baf165` — pareceres de OC1 (`ctx_1f7f9f741ff3`) e OC2 (`ctx_ac91f6ca5695`). AGY indisponível (sign-in pendente no terminal).

## Decisões finais do usuário (2026-09-06)

- **Nome: "Meu Ted"** · slogan **"Tudo em dia."** · agente TED = pessoa da marca.
- **Direção visual: evoluir o esmeralda** (Emerald Titanium), dark como default,
  light de primeira classe; zero ruptura de paleta.
- Commit, push e deploy **autorizados** (deploy Cloudflare do PWA no fim;
  API intocada nesta v2 — sem deploy VPS).

---

## 0. Resultado do debate (2026-09-06)

**Nome (consenso dos 2 coders + checagem de mercado):**
- Synkroo **rejeitado** como marca do produto (repo distinto ativo em
  `D:/projetos/synkroo` = colisão; soletrado difícil em pt-BR; sabor de
  infra). `synkroo.com.br` permanece só como infraestrutura.
- Bolso **rejeitado** (mercado saturado: usebolso.com, Bolso Finanças,
  Meu Bolso).
- Finalistas: **Lume** (OC2; 4 letras, "luz sobre o dinheiro", casa com TED;
  logo: faísca/ponto de luz em esmeralda sobre titânio), **Junta** (OC2;
  "juntar" = guardar + household/workspaces; logo: duas formas que se juntam
  virando seta/moeda), **Quito** (OC1; de quitar — emoção de sair das
  dívidas; ressalva: homônimo da capital do Equador).
- Sem colisão fintech BR direta encontrada para Lume/Junta/Quito (checagem
  web 2026-09-06); decisão final do usuário.

**Direção visual (consenso): EVOLUIR o esmeralda, não romper.**
- Confiança = consistência + números tabulares + contraste já calibrado
  (WCAG AA). Promover **dark como default** com light de primeira classe.
- Corrigir hardcodeds (A9/A10) via tokens; nenhum rebrand de paleta.

**Decisões técnicas:**
- **Swipe (F1):** touch handlers + `router.push` (SEM scroll-snap pager —
  quebraria fetch por rota, deep-link e precache do SW; View Transitions só
  como enhancement progressivo). `lib/ui/swipe-nav.tsx` client-only,
  threshold ~60px + velocidade, dominância horizontal (|dx| > |dy|×1.2),
  animação de entrada 240–280ms keyed por pathname, zonas `[data-no-swipe]`,
  desabilitado com overlay aberto e em `prefers-reduced-motion`; desktop
  ≥860px sem gestos. Sequenciar F1 antes de F4; F0/F2 paralelizáveis.
- **Pull-to-refresh (F4):** viável hand-rolled; páginas rolam no window/body;
  hook `lib/ui/use-pull-to-refresh.ts` com gate `window.scrollY===0`,
  `preventDefault` só após ~70px com listener `passive:false`,
  `overscroll-behavior-y:none` apenas durante o pull; só `(pointer:coarse)`;
  desabilitado com `lockCount>0`/`sheetKind!==null`; integrar com
  `refreshDomains`/`refreshDashboardSummary` existentes.
- **Safe-area (A2):** compor no uso: `pt-[calc(var(--page-pt)+env(safe-area-inset-top))]`
  em `PageHeader.tsx` (choke point ~15 páginas) + hero do `HomePage.tsx`
  (não usa PageHeader). Precedente: `TedChat.tsx`.
- **TED FAB (A1):** overlay-count global via `lib/ui/overlay-a11y.ts`
  (lockCount já ref-counted; sheet-context só vê a sheet de transação).
  `useIsOverlayOpen()` + hide no `TedChatLauncher` (e no badge de convites
  `AppShell.tsx`). ~2 arquivos.

---

## 1. Contexto

A v1 (tokens, dark/light, primitives, lucide, Bento desktop) está implementada.
Esta v2 parte de uma **nova auditoria** (código + evidência visual mobile em
viewport 390×844, light e dark) e dos **novos pedidos do produto**:

1. Experiência mobile de primeira classe (gestos, swipe, pull-to-refresh).
2. Correção das lacunas residuais de UX encontradas na auditoria.
3. Nova identidade: **nome** e **logo**.
4. Refatorações do código de front que ficou monolítico.

**Referências de mercado** (pesquisa 2026-09): Copilot Money (ritual diário,
UI impecável, dark-first), Monarch (patrimônio líquido como eixo), Nubank
(acessibilidade, ilustração, local), UXDA (confiança > tudo), tendência
agentic finance (TED já é nosso diferencial). Síntese: **confiança,
glanceability, uma mão só, sessões curtas, números tabulares, empty states
que ensinam.**

---

## 2. Achados da auditoria (2026-09-06)

### 2.1 Defeitos de UX (corrigir)

| # | Achado | Evidência | Severidade |
|---|--------|-----------|------------|
| A1 | FAB "Assistente TED" fica **sobreposto** às sheets (Novo lançamento, Mais) e ao conteúdo — z-index/ausência de hide | `14-sheet-nova.png`, `15-mais.png`; `TedChatLauncher` não reage a overlay aberto | ALTA |
| A2 | Títulos de página colados na borda superior — **sem `env(safe-area-inset-top)`** (viewportFit=cover) | `10-a-pagar.png` ("Contas a pagar" cortado); `PageHeader.tsx` usa `pt-[--page-pt]`=14px fixo | ALTA (real em notched phones standalone) |
| A3 | Badge "Offline" do `WorkspaceSwitcher` lê-se como "sem internet" | `08-home-authenticated.png` (dev sem socket) | MÉDIA |
| A4 | Empty states só com texto, sem ilustração/CTA ("Nada encontrado", "Minhas contas" vazio, Insights) — `EmptyState` existe mas não é usado aqui | `09-registros.png` | MÉDIA |
| A5 | `userScalable: false` bloqueia zoom (WCAG 1.4.4) | `layout.tsx` viewport | MÉDIA |
| A6 | Ícones duplicados no drawer "Mais" (Categorias=Workspaces=folder, Orçamentos=Relatórios=chart) | `15-mais.png`, `AppShell.moreItems` | BAIXA |
| A7 | Convites pendentes usam emoji 🔔 e cor fixa; erro usa ⚠ texto | `AppShell.tsx:324`, `HomePage` erro banner | BAIXA |
| A8 | "Setembro **De** 2026" — capitalização errada de mês | `12-relatorios.png` | BAIXA |
| A9 | Badge de notificação no hero é dot decorativo **sempre presente**, cores hardcoded `#E0A33E`/`#0C4430` | `HomePage.tsx:509` | BAIXA |
| A10 | FAB do BottomNav com gradiente hardcoded fora dos tokens | `BottomNav.tsx:75` | BAIXA |
| A11 | Sheet de lançamento: Categoria/Conta sem valor visível nem affordance; sem conta criada o usuário não sabe por que não salva | `14-sheet-nova.png` | MÉDIA |
| A12 | Stale SW em dev deixa página sem hidratar sem sinal ao usuário (chunks 404) | network log 2026-09-06 | INFO (dev) |

### 2.2 Dívida técnica de front

| # | Achado | Onde |
|---|--------|------|
| T1 | `HomePage.tsx` ~960 linhas: `incomeDeltaPct`/`expenseDeltaPct` são o mesmo cálculo duplicado; lógica de macro-categorias duplicada (donut e insights); gradientes inline repetidos | `features/home/HomePage.tsx` |
| T2 | Dois sistemas de ícones convivendo (Icon.tsx custom com 17 glifos + lucide em 23 arquivos) — v1 decidiu lucide;Icon.tsx ainda é usado por BottomNav/Mais | `components/ui/Icon.tsx` |
| T3 | `formatBRL` redefinido localmente em múltiplas features | HomePage + outros (confirmar na F3) |
| T4 | Proxy `/api/backend` hardcoded para produção — sem override de dev (patch local aplicado em 2026-09-06: `PWA_BACKEND_PROXY_ORIGIN`) e precisa de teste | `app/api/backend/[...path]/route.ts` |

### 2.3 Lacunas de produto mobile (adicionar)

| # | Oportunidade | Benchmark |
|---|--------------|-----------|
| P1 | **Swipe horizontal** entre Resumo ↔ Registros ↔ A pagar + transição de página | padrão iOS/Android, pedido explícito do usuário |
| P2 | **Pull-to-refresh** nas telas de lista | Mobills/Nubank |
| P3 | **Ocultar saldo** (olho) no hero — privacidade em público | Nubank/Copilot |
| P4 | Animação de número (NumberTicker previsto na v1 §4.8, não implementado) | Copilot |
| P5 | Active state do BottomNav com indicador animado (pill/glow), haptics leves (`navigator.vibrate`) | Copilot |
| P6 | **Evolução do patrimônio** (gráfico de linha) no Patrimônio | Monarch |
| P7 | Card "Adoção das notificações" em Relatórios é métrica ops — mover para área admin | IA correta |

---

## 3. Identidade: nome e logo (propostas a debater)

Restrições: curto (≤7 letras), pronunciável em pt-BR, brandable, evoca
dinheiro/organização/sincronização; domínio .com.br desejável. Observação:
`synkroo.com.br` **já é nosso** (api.synkroo.com.br) — adotá-lo como marca do
produto custa zero em infraestrutura.

| Opção | Narrativa | Logo conceito |
|-------|-----------|---------------|
| **Synkroo** (recomendada) | "Suas finanças em sincronia" — sync entre pessoas/workspaces + raiz ( foundations). Domínio já nosso; unifica API+PWA | Nó/raiz estilizado formando "S" com dois fluxos que se encontram; esmeralda→verde-água em gradiente, fundo titânio |
| **Cofro** | de "cofre" — guardar com segurança | Cofre minimalista em círculo com fenda em "C"; esmeralda |
| **Finvia** | fin + via — "o caminho das suas finanças" | Trilha que sobe como gráfico formando "F" |
| **Poupi** | de poupar, tom leve/friendly | Cofrinho geométrico com folha |

**Regra de escopo do rename:** branding de superfície apenas (manifest,
metadata, telas, logo, tema `theme_color`, PWA name/short_name, login,
offline shell). **Não** renomear pacotes pnpm, rotas, variáveis, domínios,
ids de workspace. `applicationName` técnico pode permanecer.

Logo entregável: `logo.svg` (marca + wordmark), `icon.svg` → PNGs
`icon-192.png`, `icon-512.png` (any+maskable), `apple-icon.png` 180,
favicon; script `scripts/generate-icons.mjs` (sharp) para derivar os PNGs.

---

## 4. Fases de implementação (proposta)

Gates por fase: `pnpm typecheck`, `pnpm test:pwa`, `pnpm lint`, checklist
visual mobile (390×844) + desktop (1280) em light/dark.

- **F0 — Identidade** (após escolha do nome): logo.svg, PNGs via script,
  manifest.ts, layout.tsx metadata/themeColor, tela de login, offline shell,
  empty states genéricos. _Esfregaço: 1 coder._
- **F1 — Navegação & gestos**: swipe horizontal entre as 3 telas raiz
  (Resumo/Registros/A pagar) com transição de 240–280ms
  (`--easing-standard`), edge-swipe back para subpáginas, respeitando
  sheets abertas e `prefers-reduced-motion`; indicador animado no
  BottomNav; haptics opcionais. Hand-rolled (sem framer-motion), decisão
  v1 §2. _Esfregaço: 1 coder — é o item mais delicado; isolar em
  `lib/ui/swipe-nav.tsx` + teste._
- **F2 — Correções A1–A12**: esconder TED FAB sob overlays (ou durante chat),
  safe-area-top no PageHeader/hero, WorkspaceSwitcher label claro
  ("Sincronizado/Offline — sincronia do workspace" separado do estado de rede),
  EmptyState com CTA em Registros/Contas/Home, ícones únicos no Mais,
  zoom acessível (máx 5 com font 16px em inputs), micro-copy e badges via
  tokens. _Paralelizável em 2 coders por listas de arquivos disjuntas._
- **F3 — Refactor HomePage** (T1–T3): extrair `useMonthDeltas`,
  `useCategoryBreakdown`, `lib/format/brl.ts`; HomePage < 300 linhas; zero
  mudança visual (testes existentes + snapshot de estrutura).
- **F4 — Mobile polish**: pull-to-refresh, ocultar saldo, NumberTicker,
  press-states e transições de sheet; P6 net-worth chart se couber no ciclo
  (senão v3).

## 5. Critérios de aceite

1. Swipe funcional entre as 3 telas raiz em mobile, sem quebrar navegação
   por toque/back do navegador; desktop intacto (≥860px sem gestos).
2. Nenhum overlay sobrepõe o TED FAB; safe-area respeitada em notched.
3. Identidade nova aplicada em manifest/metadata/login/icons/offline-shell.
4. T1: HomePage reduzida, lógica extraída com testes unitários novos.
5. Suíte `pnpm test:pwa` 100% verde; `pnpm typecheck` e `pnpm lint` limpos.
6. Regras contábeis intocadas (centavos, idempotência, multitenancy).
