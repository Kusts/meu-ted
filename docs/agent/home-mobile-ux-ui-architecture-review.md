# Revisão arquitetural e UX/UI — Home mobile do PWA

**Escopo:** remoção do `WeeklyHeatmap` da Home, redesign dos cards de Indicadores, redesign do Fluxo de Caixa e riscos de regressão no PWA.

## Base de evidências

- Implementação da Home: `apps/pwa/src/features/home/components/AnalyticsZone.tsx`.
- Página/shell: `apps/pwa/src/features/home/HomePage.tsx` e `apps/pwa/src/components/AppShell.tsx`.
- Componentes compartilhados: `apps/pwa/src/components/charts/KpiCard.tsx`, `CashflowAreaChart.tsx` e `WeeklyHeatmap.tsx`.
- Dados: `apps/pwa/src/features/charts-data/useAnalytics.ts`, `apps/api/src/routes/analytics.ts` e `apps/api/src/analytics/compute.ts`.
- Direção visual canônica: `docs/design/design-plan-v2-mobile.md` e `docs/design/design-plan.md` (Emerald Titanium, dark-first, light de primeira classe, Lucide, Space Grotesk para números, zero dependências gráficas desnecessárias).
- Baseline focado — Home, gráficos e hook: `pnpm --filter pwa exec vitest run src/features/home/components/__tests__/AnalyticsZone.test.tsx src/components/charts/__tests__/charts.test.tsx src/features/charts-data/__tests__/useAnalytics.test.tsx --maxWorkers=1` → **3 arquivos, 32 testes aprovados, 4,92s**.
- Layout e swipe: `pnpm --filter pwa exec vitest run src/features/charts-data/__tests__/useBlockLayout.test.tsx src/lib/ui/__tests__/swipe-nav.test.tsx --maxWorkers=1` → **2 arquivos, 38 testes aprovados, 5,25s**.
- Compatibilidade de consumidores: `pnpm --filter pwa exec vitest run src/features/reports/components/__tests__/ReportsAnalyticsZone.test.tsx src/features/home/__tests__/HomePage.test.tsx --maxWorkers=1` → **2 arquivos, 67 testes aprovados, 6,60s**. O aviso `Not implemented: navigation to another Document` veio do jsdom e não reprovou testes.
- Typecheck: `pnpm --filter pwa typecheck` → **aprovado, sem saída de erro**.
- Lint: `pnpm --filter pwa lint` → **reprovado**, 6 erros e 21 avisos. Os erros estão em `DonutChart.tsx`, `analytics-filters.tsx`, `CategoriesPage.tsx`, `AgentLlmSettingsSheet.tsx`, `useAnalytics.ts:161` e `useBlockLayout.ts:54`; os dois últimos apontam para linhas não alteradas neste diff (`useBlockLayout` sequer está modificado), mas o gate do pacote permanece vermelho.
- Bundle budget: `pnpm --filter pwa exec vitest run src/__tests__/bundle-budget.test.ts --maxWorkers=1` → **15/16 testes aprovados**; o gate equivalente mediu **525,21 KB gzip**, acima do limite de **519,79 KB** (baseline 495,04 KB + 5%). A causalidade exata do aumento não foi isolada nesta revisão.
- A validação visual em navegador autenticado não foi executada; a sessão disponível indicou necessidade de autenticação para acesso live. As conclusões visuais abaixo são, portanto, inspeção de código/tokens e não prova de viewport real.

## Veredito executivo

| Área | Veredito | Motivo |
|---|---|---|
| Remover “Atividade semanal” da Home | **Atendido no código; cobertura de migração incompleta** | `AnalyticsZone` não importa/renderiza o heatmap, o default tem somente KPIs/fluxo e a Home usa `includeHeatmap: false`; o hook padrão e Reports preservam o recurso. Falta um teste específico de layout legado da Home. |
| Cards de Indicadores | **Direção aprovada com ajustes obrigatórios** | Ícones, quebra de valor, barras semânticas e nulos básicos foram adicionados; ainda há risco de overflow do label em flex, nulo de fixos sem mensagem adequada, ausência de semântica para >100%/saldo negativo e escopo de conta ignorado. |
| Fluxo de Caixa | **Implementação parcial; não aprovar integração ainda** | Eixos, legenda, domínio, tooltip e `data-no-swipe` existem, mas Home/Reports não passam `netLiquidBalanceCents`; logo o resumo continua podendo confundir fluxo acumulado com saldo disponível. Os alvos touch também não demonstram 44px. |
| Reports/regressão | **Testes verdes, gates globais vermelhos** | Reports/Home passaram e props novas são opcionais; lint e bundle budget continuam falhando, e há riscos de acessibilidade/interação sem cobertura suficiente. |

## 1. Remoção completa do `WeeklyHeatmap` da Home

### Evidência atual

`AnalyticsZone.tsx` agora:

- mantém `HOME_DEFAULT_ORDER` apenas com `home-kpis` e `home-cashflow`;
- remove `WeeklyHeatmap` do import e `Atividade semanal` dos títulos;
- chama `useAnalytics(filters, { includeHeatmap: false })`;
- retorna `null` para IDs legados, como `home-heatmap`.

O teste de Home confirma ausência do bloco e ausência do request `/analytics/daily-heatmap`. Reports continua chamando `useAnalytics(filters)` com o default `includeHeatmap: true`, renderizando `WeeklyHeatmap`; o componente, seu export, o endpoint e os testes próprios devem permanecer.

### Persistência de layout

`clampLayout` constrói `known` a partir do default e elimina IDs desconhecidos de `order` e `hidden`; portanto um `home-heatmap` persistido não deve reaparecer depois da hidratação. A lógica genérica de `clampLayout` cobre IDs desconhecidos, mas ainda falta um teste de integração específico da Home que grave `home-heatmap`, remonte e verifique também o JSON reescrito no `localStorage`.

### Request removido

A opção do hook omite somente `fetchDailyHeatmap` e reduz a Home de seis para cinco requests, sem alterar o contrato de Reports ou da API. Isso reduz custo e evita que uma falha do heatmap derrube a zona da Home. O teste `useAnalytics` comprova cinco requests no modo sem heatmap e seis no modo padrão.

### Status dos critérios

1. `AnalyticsZone.tsx` não contém `WeeklyHeatmap`, `home-heatmap` ou “Atividade semanal”: **atendido**.
2. Home chama cinco endpoints e Reports continua com seis: **atendido por testes focados**.
3. Layout legado é clampado e salvo sem `home-heatmap`: **implementado genericamente, falta fixture de integração da Home**.
4. `WeeklyHeatmap` e Reports continuam verdes: **atendido pelos 67 testes de Home/Reports**.

## 2. Cards de Indicadores

### O que foi corrigido

`KpiCard` removeu `truncate` de label, valor, delta e hint; passou a aceitar ícone contextual, `role="progressbar"` e props opcionais, preservando a assinatura antiga usada por Reports. A Home usa `WalletCards`, `CreditCard`, `PiggyBank` e `Scale`, com `aria-hidden` no ícone. Valores continuam no formato e tokens existentes.

### Gaps residuais obrigatórios

- **Label em flex:** o texto do label está dentro de um `span` flex ao lado do ícone, mas não tem `min-w-0`/`break-words`. Em uma coluna de 320px, o tamanho mínimo automático de um item flex pode impedir a quebra e causar overflow apesar de não haver a classe `truncate`. Adicionar `min-w-0` ao item textual e testar uma viewport real.
- **Fixo sem renda:** quando `fixedPctOfIncome === null`, o hint atual mostra somente `discricionário R$ ...`; deve explicar que não há renda positiva para calcular a proporção, como já ocorre no card de poupança.
- **Sobreutilização:** `progressClamped` limita a largura e `aria-valuenow` a 100, mas a barra permanece esmeralda e o percentual real só aparece no texto. Para >100%, exibir explicitamente o percentual real com estado `danger` e manter coerência entre texto e ARIA.
- **Saldo negativo:** a classe do valor é sempre `text-text-primary`; não há diferenciação semântica para saldo negativo.
- **Escopo:** a Home não usa `fixedVsDiscretionary.scope` nem `subscriptionsCents`, podendo sugerir que fixos incluem assinaturas household-wide quando o filtro é uma conta. Reports já tem a explicação correspondente.
- **Nomenclatura:** “Faturas abertas no mês” não corresponde necessariamente ao cálculo atual de `openStatements`, que retorna faturas abertas sem esse filtro temporal. “Faturas em aberto” é menos ambíguo.

### Testes mínimos ainda faltantes

- label longo com `min-w-0` em 320px/390px;
- utilização de fatura e fixos em >100%, incluindo cor/estado de alerta e percentual real;
- fixos sem renda com mensagem explícita;
- saldo zero/negativo;
- escopo `account` com assinaturas;
- `aria-label` contendo comprometido/limite quando esses dados forem apresentados.

## 3. Fluxo de Caixa

### Semântica do dado

`buildCashflowSeries` começa em zero e acumula `incomeCents - expenseCents` por dia. O último `valueCents` é **fluxo líquido acumulado no período**, não saldo atual. O saldo disponível líquido é `kpis.netLiquidBalanceCents`, calculado separadamente pela API.

O componente agora aceita `availableBalanceCents`, `deltaCents`, `summaryLabel`, eixos X/Y, legenda, linha zero, tooltip e seleção por touch/teclado. O teste unitário prova que o override externo funciona. Porém os dois call sites atuais (`AnalyticsZone.tsx` e `ReportsAnalyticsZone.tsx`) passam apenas `current`, `previous` e `formatValue`; nenhum passa `bundle.kpis?.netLiquidBalanceCents`. Assim, na integração real o resumo segue usando `lastCurrent` e o título padrão “Saldo acumulado”. **Este é o principal blocker semântico:** Home deve passar o saldo autoritativo e rotular o resumo como “Saldo disponível” (ou separar claramente o resumo de fluxo); Reports precisa manter a semântica equivalente ou optar explicitamente pelo fallback acumulado.

A série não contém receitas e despesas separadas. O tooltip deve continuar descrevendo data/valor acumulado, sem prometer detalhes que a API não fornece.

### Gaps de acessibilidade e interação

- Os pontos focáveis são círculos SVG com `r={12}`. Em um SVG responsivo de 320 unidades, isso não garante alvo físico mínimo de 44px; em séries longas os pontos ainda ficam muito próximos. É necessário um hit area/controle equivalente de 44px sem sobreposição que torne a seleção ambígua.
- O `<svg role="img">` contém descendentes focáveis com `role="button"`. Isso pode gerar uma árvore ARIA inconsistente em leitores de tela; separar o SVG visual dos controles/estado acessível ou usar uma estrutura semântica equivalente.
- `focusPoint` usa `document.querySelector` global por `data-testid`; com dois gráficos montados, uma seta no segundo pode focar o ponto do primeiro. O foco deve ser escopado a um ref do próprio gráfico.
- Setas e foco funcionam nos testes; Enter/Espaço não têm comportamento explícito de ativação. Se os pontos permanecerem buttons, adicionar a equivalência de ativação ou documentar que foco/touch são a interação primária.
- `data-no-swipe` no `<figure>` e `touchAction: pan-y` são boas proteções, e os testes de swipe existentes permanecem verdes. Ainda falta um teste que emita o evento a partir de um ponto do chart e prove que `router.push`/`router.back` não ocorre.

### O que está adequado

Há `useId()` para evitar colisão do gradiente, eixo X com datas `DD/MM`, ticks monetários compactos, linha zero condicional, escala para série constante/zerada/ponto único, legenda textual e classes `motion-reduce`. Não foi adicionada biblioteca gráfica.

## 4. Mapa de regressão e evidências

| Arquivo/área | Estado observado | Próxima ação |
|---|---|---|
| `AnalyticsZone.test.tsx` | 6 testes verdes; ausência de heatmap/request e nulos básicos cobertos. | Adicionar fixture de `localStorage` legado e verificar wiring do saldo no chart. |
| `charts.test.tsx` | 24 testes verdes, incluindo eixos, legenda, tooltip, touch/teclado, domínio e KPI. | Cobrir hit area, >100%, Enter/Espaço e foco entre duas instâncias. |
| `useAnalytics.test.tsx` | 2 testes verdes; 5 requests sem heatmap e 6 no default. | Cobrir abort/reload e transição de opção se o contrato evoluir. |
| `useBlockLayout.test.tsx` | 4 testes verdes; clamp genérico validado. | Fixture real `home-heatmap` em `order`/`hidden` + persistência pós-hidratação. |
| `swipe-nav.test.tsx` | 34 testes verdes; guardas existentes preservadas. | Teste de evento iniciado dentro de `data-no-swipe` do cashflow. |
| Reports/Home | 67 testes verdes. | Manter heatmap e compatibilidade após corrigir o resumo do cashflow. |
| `pnpm --filter pwa typecheck` | Verde. | Nenhuma ação. |
| `pnpm --filter pwa lint` | Vermelho: 6 erros/21 avisos; erros fora das linhas alteradas deste diff. | Tratar/registrar baseline antes de usar lint como gate de integração. |
| `bundle-budget.test.ts` | Vermelho: 525,21 KB > 519,79 KB; 15/16 verdes. | Medir após build limpo e reduzir/justificar o aumento antes da integração. |
| QA visual autenticado | Não executado: autenticação indisponível. | Validar 320/390px, desktop, dark/light, foco, notch e touch em navegador autenticado. |

Há ainda artefatos não rastreados no working tree (`apps/api/e2e-local-api.log.err`, `apps/api/e2e-seed.tmp.ts`, `apps/pwa/e2e-fixture.log.err` e `test-results/`); eles não fazem parte deste parecer nem devem ser incluídos na integração sem revisão.

## Critérios de aceite sugeridos para a implementação

1. Home não renderiza nem busca `WeeklyHeatmap`; Reports continua renderizando e buscando o heatmap. **Atendido.**
2. Layouts antigos de Home são migrados sem bloco órfão ou reaparição no modo de edição. **Código atende via clamp; falta teste específico.**
3. Títulos/valores dos Indicadores são legíveis em 320px, 390px e desktop; barras e nulos possuem texto e ARIA equivalentes. **Parcial; gaps de flex, >100%, saldo e escopo.**
4. Cards mantêm tokens Emerald Titanium, fontes existentes, dark/light e contraste AA; Lucide sem nova dependência. **Inspeção de código favorável; QA visual/contraste não executado.**
5. Fluxo exibe saldo disponível vindo de KPIs, legenda, eixos e seleção; texto diferencia saldo de fluxo acumulado. **Parcial; prop existe, mas não está ligada nos call sites.**
6. Toque no gráfico não aciona swipe; teclado e leitor de tela têm alternativa equivalente. **Parcial; guard existe, mas hit area/árvore ARIA/foco entre instâncias precisam correção.**
7. Testes focados, Reports, typecheck/lint e gates são executados após a implementação. **Testes/Reports/typecheck verdes; lint e bundle budget vermelhos; QA autenticado pendente.**

