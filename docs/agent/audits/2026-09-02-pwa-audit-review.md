# Revisão Consolidada da Auditoria da PWA — 2026-09-02

**Papel:** Reviewer (dispatch `ctx_ff0af99e4b5a`, task `task_881af547f765`)  
**Documentos Base Analisados:**
- `docs/agent/audits/2026-09-02-pwa-runtime-audit.md`
- `docs/agent/audits/2026-09-02-pwa-static-product-frontend-audit.md`

---

## 1. Verificações Estáticas e de Runtime Realizadas

| Verificação | Comando / Caminho | Resultado | Observações |
|---|---|---|---|
| **TypeScript Typecheck** | `pnpm --filter pwa typecheck` | ✅ **0 erros** | Sem quebras de tipagem no PWA. |
| **ESLint Check** | `pnpm --filter pwa lint` | ❌ **1 erro, 3 warnings** | Erro em `app/convite/page.tsx:46` (`react-hooks/set-state-in-effect`); warnings em `agent-client.test.ts`, `workspaces.test.ts` e `middleware.ts`. |
| **Runtime Smoke** | `node scripts/start-pwa-standalone.mjs` | ✅ **22/22 rotas 200** | Proxy conecta diretamente à VPS Hostinger (`api.synkroo.com.br`). |

---

## 2. Validação e Calibração dos Achados P0 e P1

Cada achado reportado nas auditorias anteriores foi checado diretamente contra as linhas e arquivos do código-fonte:

### Achados P0

| ID | Descrição Original | Status da Revisão | Justificativa e Evidência no Código |
|---|---|---|---|
| **P0-1** | Falta de `Idempotency-Key` em mutações e ausência de disabled durante salvamento (risco de duplicidade) | **CONFIRMADO (P0)** | `lib/api/endpoints.ts:91-95, 329-333, 372-375` não passam `idempotencyKey` para `apiFetch`. `components/NewTransactionSheet.tsx:1144` e outros sheets não desabilitam botões durante `handleSave`/`doSave`. |
| **P0-2** | Aplicação renderiza em modo mock sem autenticação fora do host de produção | **CONFIRMADO (P0)** | `components/RootProviders.tsx:50` desliga `<AuthGate>` quando `isApiConfigured()` é falso (`lib/api/client.ts:36-45`), expondo dados fictícios sem login se o env não for injetado. |
| **P0-3** | Safe-area inerte no iOS PWA standalone por ausência de `viewportFit: "cover"` | **CONFIRMADO (P0)** | `app/layout.tsx:43-48` exporta `Viewport` sem `viewportFit: "cover"`. No Webkit/iOS standalone, `env(safe-area-inset-*)` resolve para 0px, quebrando espaçamentos e sobrepondo botões fixos (`BottomNav.tsx:36`, `TedChatLauncher.tsx:16`). |

---

### Achados P1

| ID | Descrição Original | Status da Revisão | Justificativa e Evidência no Código |
|---|---|---|---|
| **P1-1** | Troca de workspace exibe dados em memória do workspace anterior | **CONFIRMADO (P1)** | `lib/auth/workspace-context.tsx:260-274` troca o ID ativo, mas `AppStateProvider` não possui `key={activeWorkspaceId}` em `components/RootProviders.tsx:41-45` e o bootstrap está bloqueado por `loadedRef.current` (`app-state-context.tsx:418`). Dados só atualizam com reload. |
| **P1-2** | Modais sem gerenciamento de foco (focus trap, Escape, restore) | **CONFIRMADO (P1)** | `components/ConfirmActionDialog.tsx:40-50` e `components/ui/BottomSheet.tsx:51-88` não capturam foco nem tratam Escape no diálogo de confirmação. |
| **P1-3** | Conflito de z-index: `ConfirmActionDialog` renderiza sob o `BottomSheet` | **CONFIRMADO (P1)** | `components/ConfirmActionDialog.tsx:40` usa `z-30`, enquanto `components/ui/BottomSheet.tsx:52,61` usa `z-40` (overlay) e `z-50` (painel). O diálogo de descarte fica escondido atrás da sheet. |
| **P1-4** | BottomNav usa botão com `router.push` em vez de `<Link>` | **REBAIXADO (P2)** | O comportamento tátil no mobile funciona, embora perca prefetch nativo e semântica de link HTML. Não é impeditivo para release imediata. |
| **P1-5** | `router.back` inexistente e botão "Voltar" do perfil empilha histórico | **REBAIXADO (P3)** | O `BackButton` em `ProfilePage.tsx:231,319,470` fecha sub-sheets via estado (`requestClose`/`onClose`), não empilha rotas. Falta de `router.back` global é apenas melhoria secundária. |
| **P1-6** | Offline shell nunca atualiza no cliente após deploy | **CONFIRMADO (P1)** | `sw.ts:78-80` usa `{ url: OFFLINE_HTML, revision: null }`. Sem hash na URL nem chave de revisão, Serwist/Workbox nunca invalida o cache do shell. |
| **P1-7** | Proxies (`/api/backend` e `/api/agent`) sem timeout e com erro 500 opaco | **CONFIRMADO (P1)** | `app/api/backend/[...path]/route.ts:58-63` não usa `AbortSignal.timeout` nem `try/catch`. Quedas na VPS causam falhas sem corpo estruturado JSON. |
| **P1-8** | Re-render do AppStateProvider e fetches duplicados no bootstrap | **CONFIRMADO (P1)** | `app-state-context.tsx:1500-1551` instancia objeto inline sem memoização. `sync-engine.ts:51-52` busca `profile` e `quickInsights` e `app-state-context.tsx:443-450` repete imediatamente os mesmos fetches. |
| **P1-9** | Erro de ESLint em `convite/page.tsx` quebrando o gate de CI | **CONFIRMADO (P1)** | Confirmado na execução de `pnpm --filter pwa lint`: erro de `set-state-in-effect` em `app/convite/page.tsx:46` + 3 warnings. |

---

## 3. Backlog Consolidado de Execução (Máx 12 Itens)

Backlog priorizado por risco financeiro, segurança, integridade de dados e conformidade técnica:

| # | Prioridade | Item / Problema | Impacto | Evidência Principal | Próxima Ação Recomendada |
|---|---|---|---|---|---|
| **1** | **P0** | **Idempotency-Key & Anti-Double-Submit** | Alto (Risco financeiro de duplicação) | `lib/api/endpoints.ts:91`, `NewTransactionSheet.tsx:1144` | Gerar UUID em `commands.ts`, repassar ao `apiFetch` e desabilitar botões durante mutações (`saving` state). |
| **2** | **P0** | **Fail-Closed no Modo Mock / Auth** | Alto (Vazamento/exibição de dados mock) | `components/RootProviders.tsx:50`, `lib/api/client.ts:36` | Exigir env de API em produção ou exibir banner persistente de demonstração quando desconectado. |
| **3** | **P0** | **Viewport-Fit & Safe-Area no iOS PWA** | Alto (Quebra de layout no iOS standalone) | `app/layout.tsx:43-48`, `BottomNav.tsx:36` | Adicionar `viewportFit: "cover"` em `app/layout.tsx` e padding safe-area nos elementos fixos (`TedChatLauncher`). |
| **4** | **P1** | **Isolamento de Estado por Workspace** | Alto (Exibição de dados cross-workspace) | `lib/auth/workspace-context.tsx:260`, `app-state-context.tsx:418` | Inserir `key={activeWorkspaceId}` no `AppStateProvider` em `RootProviders.tsx` para forçar remontagem limpa. |
| **5** | **P1** | **Escala de Z-Index para Confirmações** | Médio-Alto (Diálogo escondido sob a sheet) | `ConfirmActionDialog.tsx:40` (`z-30`) vs `BottomSheet.tsx:61` (`z-50`) | Elevar `ConfirmActionDialog` para `z-60` e padronizar camadas de diálogo. |
| **6** | **P1** | **Acessibilidade e Foco em Diálogos** | Médio (Navegação por teclado e a11y) | `ConfirmActionDialog.tsx`, `BottomSheet.tsx` | Implementar hook compartilhado para focus trap, fechamento via Escape e restauração de foco. |
| **7** | **P1** | **Invalidação e Revisão do Offline Shell** | Médio-Alto (Clientes presos em versão antiga) | `sw.ts:78-80` (`revision: null`) | Injetar hash de build ou versão na propriedade `revision` do precache do Serwist. |
| **8** | **P1** | **Resiliência e Timeout nos Proxies** | Médio-Alto (Travamento e 500 sem log) | `app/api/backend/[...path]/route.ts:58` | Adicionar `AbortSignal.timeout(10_000)` e captura de erro retornando JSON 502/504 padronizado. |
| **9** | **P1** | **Otimização de Boot e Memoização do AppState** | Médio (Lentidão e tráfego redundante) | `app-state-context.tsx:443, 1500`, `sync-engine.ts:51` | Remover fetches duplicados no bootstrap e separar/memoizar contextos de dados e mutações. |
| **10** | **P1** | **Correção de ESLint no Convite e Warnings** | Médio (Bloqueio de gate de CI/CD) | `app/convite/page.tsx:46` | Corrigir `setState` síncrono no `useEffect` de validação de convite e remover variáveis não utilizadas. |
| **11** | **P2** | **Correção de Tipo (`kind`) e Cor de Contas** | Médio (Dados contábeis corrompidos) | `features/accounts/AccountsPage.tsx:70` | Mapear checking/savings/investment para os tipos suportados pela API e persistir a cor bancária. |
| **12** | **P2** | **Centralização de 401 no Cliente HTTP** | Médio (Telas travadas com sessão expirada) | `features/cards/CardsPage.tsx:594, 606` | Disparar evento de logout/expiração global a partir de qualquer resposta 401 no `apiFetch`. |

---

## 4. Bloqueios e Limitações Observadas

1. **Ferramenta de Browser vs Host Local:** O runner de browser bloqueia requisições a `127.0.0.1`, limitando a auditoria de runtime a testes HTTP e inspeção de código estático (erros do DevTools console não são capturados de forma automatizada).
2. **Ambiente de Testes:** A suíte Playwright/E2E necessita de credenciais ou ambiente integrado para testar fluxos pós-login em profundidade.
