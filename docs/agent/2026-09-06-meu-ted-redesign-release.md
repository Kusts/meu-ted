# Release 2026-09-06 — Redesign v2 "Meu Ted" (PWA + Cloudflare)

## Adendo — Ondas 4-5 (debate AGY + feedback do usuário, mesmo dia)

Após o primeiro deploy, debate com o AGY (auditoria do código implementado)
e feedback direto do usuário geraram mais 6 commits, revisados (1 P2
corrigido: saída da sheet suprimida pela animação de entrada) e redeploy:

- `953c974` CTA "Conversar com o TED" no Insights vazio (canal público
  `pwa:open-ted`).
- `096b374` + `4531e0d` BottomSheet: animação de saída 200ms em todos os
  caminhos (drag/botão/overlay/Escape), reduced-motion instantâneo, sem
  supressão pela animação de entrada.
- `76c4833` BottomNav maior: ícones 24px, labels 11px (feedback "muito
  pequenos").
- `4f1ca16` Swipe-back: em subpáginas do "Mais", arrastar para a direita =
  `router.back()` (feedback "swipe não alcança os itens do Mais").
- Backlog v3 registrado no plano: unificar scroll no `window` (~50px de
  viewport no iOS).

Suíte final: **144 arquivos / 1364 testes 100% verdes**.

## Resultado

Deploy do redesign mobile v2 concluído na Cloudflare.

- **Produção:** https://<PWA_HOST>
- **Versão Worker:** `c4258b78-0113-4b45-b28d-a42c260b5859`
- **Git:** push `5c4ed5a..9a0c3a4` (main), release doc `9a0c3a4`
- **Smoke:** `/manifest.webmanifest` serve `{"name":"Meu Ted", ...}`; `/` → HTTP 200
- **API (VPS):** intocada nesta release (mudanças 100% no PWA)

## Escopo entregue (Orca Run `run_9b08c9baf165`)

1. **Identidade "Meu Ted"** (slogan "Tudo em dia.", agente TED como pessoa da
   marca): logo balão+faísca em esmeralda, ícones gerados via sharp
   (any+maskable+apple+favicon), manifest/metadata/login/SidebarRail/offline-shell.
2. **Navegação mobile:** swipe entre Resumo/Registros/A pagar
   (`lib/ui/swipe-nav.tsx`, reduced-motion e scrollers respeitados),
   indicador ativo animado no BottomNav, haptics util.
3. **Correções da auditoria:** TED FAB sob overlays (overlay-a11y),
   safe-area top (PageHeader+hero), label "Offline"→"Sem conexão", empty
   states com CTA (Home/Registros), ícones únicos no "Mais", zoom acessível
   (A5), inputs 16px (anti auto-zoom iOS), dot de notificação condicional com
   tokens, FAB via tokens, "Setembro de 2026", resíduos de marca zerados.
4. **Polimento:** pull-to-refresh nas 3 telas raiz (spec AGY: cápsula,
   damping 0.45, threshold 64px, haptic, âncora 52px), ocultar saldo
   (incluindo mini-stats, blur pills, `useSyncExternalStore` SSR-safe),
   NumberTicker 500/320ms, drag-to-dismiss nas sheets, `Icon.tsx` aposentado
   (100% lucide).
5. **Refactor:** HomePage 997 → 215 linhas (9 seções + 5 hooks +
   `lib/format/brl.ts` compartilhado).

## Qualidade

- Suíte final: **143 arquivos / 1338 testes 100% verdes**; typecheck nos 4
  workspaces; lint 0 errors (13 warnings preexistentes).
- Ciclo de review: Onda 1 REPROVADA → fixes → APROVADA; Ondas 2–3 APROVADAS
  COM RESSALVAS → 2 MEDIUM corrigidos (hidratação + haptics).
- Regras contábeis/centavos/idempotência: intocadas (verificado em review).

## Equipe

Planner: Claude Code · Coders: OpenCode ×2 · Reviewer: Pi Dev ·
Design consultoria: AGY (spec em
`C:/Users/walis/.gemini/antigravity-cli/brain/1ed1b9d4-50ff-44c3-ba64-314c6312e347/spec-design-mobile-polish.md`).

## Notas operacionais

- Deploy local Windows: `pnpm --filter pwa run deploy` (o `deploy` sem `run`
  cai no builtin do pnpm). Se `EPERM` ao limpar `.open-next`: parar o
  `workerd` residual (preview antigo) e repetir.
- Dev local contra API local: `PWA_BACKEND_PROXY_ORIGIN=http://127.0.0.1:3001`
  no dev do PWA (default segue produção); signup local exige
  `DISABLE_SIGN_UP=false` na API.
- Suíte do PWA neste host roda com `--pool=forks` (pool threads não sobe).

## Follow-ups (não bloqueantes)

- Insights vazio sem CTA (decisão: não há fluxo que crie insights).
- Demais inputs 13px da sheet (categoria/parcelas) para 16px.
- Card "Adoção das notificações" em Relatórios → mover para área admin.
- Gráfico de evolução do patrimônio (net worth trend) — v3.
- Comentário stale em AppShell.tsx sobre Icon legado.
