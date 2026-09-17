# Project Agent Notes

- PWA ativa: `apps/pwa/` deste repositÃ³rio, hospedada na Cloudflare.
- `../pi-finance-web` estÃ¡ depreciado: nunca usÃ¡-lo para auditoria, deploy ou como origem de produÃ§Ã£o.
- Backend de produÃ§Ã£o roda na Hostinger VPS, nÃ£o no setup local Windows pm2/cloudflared.
- Before assuming the live origin, inspect `../vps-hostinger/` for VPS access, deploy, restart, and service topology.
- Local `pm2` / `cloudflared` processes podem existir para experimentos ou fluxos antigos, mas nÃ£o sÃ£o fonte de verdade de produÃ§Ã£o sem confirmaÃ§Ã£o explÃ­cita.
- Documentos canÃ´nicos de arquitetura residem em `docs/` (`PRODUCT.md`, `ARCHITECTURE-CURRENT.md`, `ARCHITECTURE-TARGET.md`, `ROADMAP.md`, `docs/adr/`).
- Todas as mutaÃ§Ãµes financeiras passam pela API autoritativa (`apps/api`) com controle estrito de workspace.

## TransparÃªncia de Passos e SaÃ­da no Terminal (CLI Verbosity)
- **ComunicaÃ§Ã£o Ativa**: Sempre explique brevemente o que vocÃª vai fazer antes de invocar ferramentas de execuÃ§Ã£o de comandos (`run_command`), leitura ou ediÃ§Ã£o de arquivos (`view_file`, `replace_file_content`).
- **Resumo de Resultados**: ApÃ³s a execuÃ§Ã£o de uma ferramenta ou comando, comente o resultado obtido, erros encontrados ou o impacto da alteraÃ§Ã£o antes de partir para a prÃ³xima etapa.
- **Detalhamento**: NÃ£o execute sequÃªncias longas de ferramentas em silÃªncio; mantenha o usuÃ¡rio informado sobre o progresso em tempo real no terminal.

## Stack & Workspaces
- **Monorepo**: Gerenciado via `pnpm` (`pnpm-workspace.yaml`), `Node.js >= 20.0.0`, `pnpm >= 9.0.0`.
- **`apps/api` (Backend Autoritativo)**:
  - Framework: Fastify 5, TypeScript, Kysely, PostgreSQL (`pg`), Zod, Better-Auth (`better-auth`).
  - Runtime: Node.js hospedado na Hostinger VPS (`pi-stack`).
  - Responsabilidade: Ãšnica fonte da verdade para dados financeiros, autenticaÃ§Ã£o, autorizaÃ§Ã£o por workspace, integridade referencial e auditoria.
- **`apps/pwa` (Cliente CanÃ´nico Web/Mobile)**:
  - Framework: Next.js 16, React 19, Tailwind CSS v4, Serwist (Service Worker PWA).
  - Runtime / Hosting: Cloudflare Pages / Workers via OpenNext (`@opennextjs/cloudflare`).
  - Responsabilidade: Interface canÃ´nica do usuÃ¡rio com autenticaÃ§Ã£o por email/senha (Better-Auth) e comunicaÃ§Ã£o direta via HTTP com a API autoritativa.
- **`apps/agent` (Assistente Financeiro AI TED)**:
  - Framework: Cloudflare Agents SDK, Durable Objects com persistÃªncia SQLite.
  - Runtime: Cloudflare Workers.
  - Responsabilidade: Motor do assistente conversacional TED, operando via tokens delegados e executando ferramentas geradas contra a API.
- **`apps/whatsapp-bridge` (Removido em P3 `f640e84`):**
  - Removido em 2026-08-25 `f640e84` (123 files `apps/whatsapp-bridge` + 3065 files `.pi/extensions/financial-tools`), `pnpm-workspace` limpo, `g6-48h-gate` COMPLETED bypass 2026-08-26, `check-legacy-runtime-references` 0 active. Evolution Go permanece como infra compartilhada (nÃ£o pertence ao pi-financeiro).

## Topologia de ProduÃ§Ã£o
1. **Borda (Cloudflare)**:
   - `apps/pwa` roda na infraestrutura Cloudflare (Pages / OpenNext) servindo a interface web/mobile.
   - `apps/agent` roda como Cloudflare Worker / Durable Object para orquestraÃ§Ã£o conversacional do assistente.
2. **Backend e PersistÃªncia (Hostinger VPS)**:
   - `apps/api` executa em container/processo na VPS Hostinger, expondo endpoints REST autoritativos sob HTTPS (`https://api.synkroo.com.br`).
   - PostgreSQL 16 roda localmente na VPS, isolado e acessÃ­vel exclusivamente pela API interna.
3. **Fluxo de AutenticaÃ§Ã£o & Workspace**:
   - AutenticaÃ§Ã£o via Better-Auth (email e senha com convites administrativos).
   - ResoluÃ§Ã£o de workspace e permissÃµes feita integralmente server-side na API autoritativa (`ADR-003`, `ADR-004`).

## OrquestraÃ§Ã£o Orca & ComunicaÃ§Ã£o Inter-Agentes
- **Supervisor / Planner**: Muse Spark via OpenCode (terminal `term_6d06e683-02d5-4967-b140-0706f32e8c44`).
- **Coder Operacional**: Antigravity agy (terminal `term_bb42c5b8-2688-474e-9026-3e98cb6434b8`).
- **Run Ativa**: `run_46965e431ba5`.
- **Protocolo de ExecuÃ§Ã£o**:
  - Supervisor cria tarefas (`task-create`) e despacha para o terminal do Coder (`worker-start --terminal`).
  - Coder processa instruÃ§Ãµes, emite heartbeats periÃ³dicos e executa a tarefa com transparÃªncia.
  - **ComunicaÃ§Ã£o Interativa**: NUNCA utilize prompts interativos locais sÃ­ncronos desconectados (`AskUserQuestion`); utilize sempre `orca orchestration ask` ou escalaÃ§Ã£o de bloqueios.
  - **FinalizaÃ§Ã£o**: ConclusÃ£o formalizada via envio de `worker_done` com `--outcome succeeded|failed`, lista de `--files-modified` e `--body` conciso de exatamente 3 frases.

## Regras de Engenharia & Qualidade
1. **TDD Rigoroso (RED -> GREEN)**:
   - Todo bugfix, refatoraÃ§Ã£o ou funcionalidade deve obrigatoriamente iniciar com um teste automatizado falhando (RED) que capture o comportamento desejado antes de escrever o cÃ³digo de produÃ§Ã£o (GREEN).
2. **Isolamento Multitenant por Workspace / Household**:
   - Todo comando, rota e query SQL deve validar e aplicar estritamente o `workspace_id` e/ou `household_id`.
3. **IdempotÃªncia ObrigatÃ³ria**:
   - Todas as operaÃ§Ãµes de mutaÃ§Ã£o financeira devem exigir e validar `Idempotency-Key` com tratamento de concorrÃªncia e idempotency records.
4. **GovernanÃ§a de Commits**:
   - O Coder operacional prepara as alteraÃ§Ãµes e deixa o working tree pronto para revisÃ£o do Planner/Supervisor. Commits diretos devem ocorrer apenas apÃ³s aprovaÃ§Ã£o e validaÃ§Ã£o.
5. **Gates de VerificaÃ§Ã£o ContÃ­nua**:
   - Nenhum trabalho Ã© dado como concluÃ­do sem a execuÃ§Ã£o bem-sucedida de `pnpm docs:lint`, `pnpm typecheck`, `pnpm test` e `pnpm governance:check`.

## Working Tree e Estado Atual (2026-09-17 `v4.1-hardening` â€” V4.1 IMPLEMENTADA, aguardando merge/deploy)
- **Branch de execuÃ§Ã£o `v4.1-hardening` (base `main@dd10e2b` + 1 commit de readiness):** a V4.1 foi **IMPLEMENTADA POR COMPLETO** em 25 commits (`dd10e2b..HEAD`): Phase 0 (reconciliation CLI read-only legacy/canonical + baseline + inventÃ¡rio de mutaÃ§Ãµes + decisÃ£o D1â€“D11 documentada em `docs/reports/v4.1-decision-gates.md` â€” decisÃµes tomadas autonomamente sob autorizaÃ§Ã£o explÃ­cita do owner, com recomendaÃ§Ã£o tÃ©cnica registrada, marcadas para revisÃ£o retroativa), Phase 1 (device token requer membership/user/workspace ativos via `auth/device-access.ts`; `role:'owner'` fabricado removido; fallback demo-household fechado em produÃ§Ã£o; removeMember/leave revogam tokens + purgam push), Phase 2 (payable com `FOR UPDATE` + expense sempre + dÃ©bito de saldo; unpay exige `paidTransactionId`; placeholders dinÃ¢micos em cards/subscriptions â€” incluindo off-by-one canÃ´nico latente; statement locks + remaining; goals atÃ´micos; PATCH de transaÃ§Ã£o estrito 422; resolver central de categorias; billing-month helper), Phase 3 (claim de idempotÃªncia + efeito + receipt em UMA transaÃ§Ã£o para todas as mutaÃ§Ãµes keyed; hash V2 canÃ´nico com compat V1; PWA command-id na fronteira de intenÃ§Ã£o com retry mesmo-id), Phase 4 (D1: clamps removidos, saldo negativo proibido; delta engine reverse/apply; locks determinÃ­sticos; `template_id` resolvido; suite de paridade legacyÃ—canonical), Phase 5 (auth state machine; env estÃ¡tico; same-origin default; purges de offline snapshot por revogaÃ§Ã£o/switch/logout), Phase 6 (scans: 0 segredos em refs alcanÃ§Ã¡veis; 85 warnings de metadados; visibilidade continua BLOQUEADA), Phase 7 (bridge-context removido; pending-ops V1 sem wiring de produÃ§Ã£o â€” Agent ainda consome V1; price-alerts gateado OFF com UI degradando em 404; recurring card = template-only), Phase 8 (broker fail-closed + topology guard; SSRF guard no agent; advisory lock unificado; pool timeouts; ISO-date/money schemas; SQLSTATE mapping), Phase 9 (test:integration:all VERDE em DB fresco Ã—2; suite de concorrÃªncia 18 arquivos; XLT; skip-gate; VAL.14â€“18; artifact deploy PWA + manifest Agent; same-SHA stale check; release identity gitSha/buildId/builtAt nos 3 apps; action-pins gate; dependabot), Phase 10 (relatÃ³rios: authorization, financial-integrity, idempotency, canonical-parity, ci-validation, schema-parity, canonical-readiness = PRONTO PARA PLANEJAR CUTOVER/NÃƒO PARA EXECUTAR, final-report). RevisÃµes independentes: 3 rodadas (9+3 findings corrigidos + review final com 2 fixes). Gates locais verdes: api 1942/1942, pwa 1867/1867, agent 503, broker 25, llm-contracts 23, concorrÃªncia 115/115 (PG), XLT 21/21, integration:all 142 fresh-green, typecheck/docs:lint/governance/public-safety/skip-gate/action-pins PASS.
- **NÃƒO feito (gates humanos Â§3.4):** deploy de produÃ§Ã£o; merge para `main`; troca de visibilidade do repo; rotaÃ§Ã£o de credenciais; rewrite de histÃ³rico; Release B do bearer (threshold D11: 0 eventos `auth.request.legacy_bearer_used` por 14 dias pÃ³s-Release A); cutover Canonical (operaÃ§Ã£o separada pÃ³s release-bridge).
- **ProduÃ§Ã£o (inalterada; reconfirmada 2026-09-16):** API `v3-3305152`, `DB_SCHEMA=legacy`, Postgres 15.18, `_migrations` top = **V052**. O primeiro deploy a partir desta branch carrega V3â†’V4â†’V4.1 combinadas e exige o **release-bridge gate humano** (Â§3.3 do plano V4.1). Nota: V022 foi editada in-place (funÃ§Ã£o SQLâ†’plpgsql); drift < V044 = WARN (`migration.baseline_drift`) â€” re-backfill de checksum pendente como follow-up.
- **DÃ©bitos conhecidos (seÃ§Ã£o honesta):** billing do GitHub Actions aguarda aÃ§Ã£o do owner (workflows novos sÃ³ exercitÃ¡veis com CI remoto verde); 85 warnings de metadados bloqueiam apenas publicaÃ§Ã£o (sanitizaÃ§Ã£o = task dedicada prÃ©-visualizaÃ§Ã£o); objeto local `11b82e8` (.env.e2e.creds) requer stash drop + GC humanos; regeneraÃ§Ã£o de `apps/agent/src/generated/http-tools.ts` exige portar `extractRequestAuth`; migration do Agent V1â†’V2 pending-ops antes de remover rotas V1; bulk payables multilinha nÃ£o-transacional (idempotÃªncia por receipt); `statement_timeout` override para scripts de migration a decidir no release-bridge; suites integration locais precisam de DB fresco (poluiÃ§Ã£o cross-run no mesmo banco); SHA-pinning determinÃ­stico das actions pÃ³s-desbloqueio do CI; janela de compatibilidade localStorage TODO 2026-12-01 (ADR-011); `sharp@0.34.5` pinado; `.trivyignore` expira 2026-12-31.
- **ProibiÃ§Ã£o de OperaÃ§Ãµes Destrutivas**: `git reset --hard`, `git clean -fd`, `git checkout -- .` exigem diff prÃ©vio e autorizaÃ§Ã£o.

## Idioma & ConvenÃ§Ãµes
- **ComunicaÃ§Ã£o e DocumentaÃ§Ã£o**: PortuguÃªs do Brasil (pt-BR) para respostas, documentaÃ§Ãµes canÃ´nicas (`docs/*.md`) e relatÃ³rios de progresso.
- **CÃ³digo e Commits**: CÃ³digo-fonte TypeScript/SQL, nomes de variÃ¡veis, funÃ§Ãµes, tipos, comentÃ¡rios de cÃ³digo e mensagens de commit em InglÃªs tÃ©cnico.


