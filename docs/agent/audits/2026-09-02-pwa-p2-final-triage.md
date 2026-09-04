# Triagem Read-only — P2 Finais da Auditoria PWA — 2026-09-02

**Executor:** Coder 1 (dispatch `ctx_35539a66283c`, task `task_db51e5fd097d`)
**Escopo:** somente leitura + este relatório. Nenhuma edição de código/config/dados.
**Base:** `docs/agent/audits/2026-09-02-pwa-p1p2-triage-matrix.md` re-verificada contra o worktree atual (grep/leitura direta em cada evidência).

## 1. Reclassificação

| ID | Achado | Reclassificação | Evidência atual | Teste RED indicado |
|---|---|---|---|---|
| P2-5 | Páginas sem banners padrão | **CONFIRMADO (parcial)** — SubscriptionsPage já tem `WriteErrorBanner`+`StaleBanner` (resolvido na metade); `WalletPage.tsx` segue sem nenhum (grep 0 hits) | `features/wallet/WalletPage.tsx` (sem imports de banners) | `WalletPage.test`: renderizar com `writeError`/`sync.snapshot` e afirmar banners visíveis |
| P2-7 | Labels sem `htmlFor`/`id` | **CONFIRMADO** | `components/NewTransactionSheet.tsx:422,530,935` (3 `<label>` sem associação); `components/TransactionEditSheet.tsx` (mesmo padrão) | `NewTransactionSheet.test`: `getByLabelText("Descrição"/"Valor")` retorna o input associado |
| P2-8 | Contraste `--text-muted` ≈ 3.4:1 | **CONFIRMADO** | `app/globals.css:93` (`#828E85` light, ≈3.4:1 sobre `--background`); `:157` (dark `#667269`) | Novo `src/app/__tests__/contrast.test.ts`: parsear `globals.css` e afirmar ratio ≥ 4.5:1 dos tokens de texto |
| P2-11 | Cobertura por lista estática congelada | **CONFIRMADO** | `vitest.config.ts:10` (`CHANGED_PRODUCTION`), `:89` (`include: CHANGED_PRODUCTION`) | `vitest-config.test`: importar a config e afirmar que `coverage.include` resolve globs de `src/**` (menos config/test) |
| P2-12 | `onPay` sem statement fecha sheet em silêncio | **CONFIRMADO** | `features/cards/CardsPage.tsx:857-859` (`if (selectedStatementId) return payStatement(...)` — sem else) | `CardsPage.test`: abrir PayStatementSheet sem statement, pagar → mensagem de erro visível, sheet aberta |
| P2-13 | Dark default hardcoded | **CONFIRMADO** | `lib/theme/theme-script.ts:6` (`: 'dark'`), `theme-provider.tsx:29` (`defaultTheme = "dark"`) | `theme-provider.test`: sem stored theme + `prefers-color-scheme: light` → `resolvedTheme === "light"` |
| P2-14 | Div clicável sem teclado | **CONFIRMADO** | `features/goals/GoalsPage.tsx:385,528` (`div.cursor-pointer onClick`, sem role/tabIndex/onKeyDown); `features/cards/CardsPage.tsx` (cards análogos) | `GoalsPage.test`: card de meta focável (`role="button"`/tabIndex) e Enter/Space abre detalhe |

**Follow-up externo:** nenhum — os 7 itens são 100% client-side (CSS/config/componentes); nenhum depende de mudança em `apps/api`.

## 2. Ondas (máx. 2, sem colisão entre ondas)

**Onda 1 — Design tokens, tema e tooling** (arquivos: `app/globals.css`, `lib/theme/theme-script.ts`, `lib/theme/theme-provider.tsx`, `vitest.config.ts`):
P2-8 (ajustar `--text-muted` light/dark para ≥4.5:1), P2-13 (default `"system"` no script inline e no provider, juntos), P2-11 (trocar `CHANGED_PRODUCTION` por globs `src/**`).

**Onda 2 — Componentes e features** (arquivos: `features/wallet/WalletPage.tsx`, `components/NewTransactionSheet.tsx`, `components/TransactionEditSheet.tsx`, `features/cards/CardsPage.tsx`, `features/goals/GoalsPage.tsx` + testes):
P2-5 (banners no WalletPage), P2-7 (associação label/input), P2-12 (validação/erro no onPay), P2-14 (cards acessíveis por teclado). P2-12 e P2-14 colidem em `CardsPage.tsx` → mesmo dono dentro da onda.

## 3. Riscos

- **P2-8**: token compartilhado — mudança afeta todos os textos muted do app; revisar dark e light juntos (os dois valores têm alvos diferentes) e validar telas-chave visualmente.
- **P2-13**: altera o tema de usuários sem preferência salva (dark→system); o script inline e o provider devem mudar no mesmo commit para evitar flash/estado divergente; tema "system" já é suportado pelo provider (`types.ts:1`).
- **P2-11**: expandir a cobertura pode expor falhas latentes em arquivos fora da lista congelada e deixar o gate vermelho — rodar coverage antes do merge e tratar lacunas como parte da onda.
- **P2-14**: converter `div`→`<button>`/`role="button"` pode afetar layout (cursor-pointer + estilos de hover); testes de snapshot/DOM existentes em GoalsPage podem precisar de ajuste.
- **P2-7**: adicionar `id`s pode colidir com testes que localizam campos por placeholder — preferir os componentes `ui/Input` (já fazem certo).
- **P2-12**: exibir erro exige estado local no CardsPage sem tocar diálogos comuns (fora do escopo das ondas anteriores).
- Geral: Onda 1 e Onda 2 são paralelizáveis sem conflito de arquivos; nenhuma depende de merge pendente.
