# Project Agent Notes

- PWA ativa: `apps/pwa/` deste repositório, hospedada na Cloudflare.
- `../pi-finance-web` está depreciado: nunca usá-lo para auditoria, deploy ou como origem de produção.
- Backend de produção roda na Hostinger VPS, não no setup local Windows pm2/cloudflared.
- Before assuming the live origin, inspect `../vps-hostinger/` for VPS access, deploy, restart, and service topology.
- Local `pm2` / `cloudflared` processes podem existir para experimentos ou fluxos antigos, mas não são fonte de verdade de produção sem confirmação explícita.
- Documentos canônicos de arquitetura residem em `docs/` (`PRODUCT.md`, `ARCHITECTURE-CURRENT.md`, `ARCHITECTURE-TARGET.md`, `ROADMAP.md`, `docs/adr/`).
- Todas as mutações financeiras passam pela API autoritativa (`apps/api`) com controle estrito de workspace.

## Transparência de Passos e Saída no Terminal (CLI Verbosity)
- **Comunicação Ativa**: Sempre explique brevemente o que você vai fazer antes de invocar ferramentas de execução de comandos (`run_command`), leitura ou edição de arquivos (`view_file`, `replace_file_content`).
- **Resumo de Resultados**: Após a execução de uma ferramenta ou comando, comente o resultado obtido, erros encontrados ou o impacto da alteração antes de partir para a próxima etapa.
- **Detalhamento**: Não execute sequências longas de ferramentas em silêncio; mantenha o usuário informado sobre o progresso em tempo real no terminal.

## Stack & Workspaces
- **Monorepo**: Gerenciado via `pnpm` (`pnpm-workspace.yaml`), `Node.js >= 20.0.0`, `pnpm >= 9.0.0`.
- **`apps/api` (Backend Autoritativo)**:
  - Framework: Fastify 5, TypeScript, Kysely, PostgreSQL (`pg`), Zod, Better-Auth (`better-auth`).
  - Runtime: Node.js hospedado na Hostinger VPS (`pi-stack`).
  - Responsabilidade: Única fonte da verdade para dados financeiros, autenticação, autorização por workspace, integridade referencial e auditoria.
- **`apps/pwa` (Cliente Canônico Web/Mobile)**:
  - Framework: Next.js 16, React 19, Tailwind CSS v4, Serwist (Service Worker PWA).
  - Runtime / Hosting: Cloudflare Pages / Workers via OpenNext (`@opennextjs/cloudflare`).
  - Responsabilidade: Interface canônica do usuário com autenticação por email/senha (Better-Auth) e comunicação direta via HTTP com a API autoritativa.
- **`apps/agent` (Assistente Financeiro AI TED)**:
  - Framework: Cloudflare Agents SDK, Durable Objects com persistência SQLite.
  - Runtime: Cloudflare Workers.
  - Responsabilidade: Motor do assistente conversacional TED, operando via tokens delegados e executando ferramentas geradas contra a API.
- **`apps/whatsapp-bridge` (Removido em P3 `f640e84`):**
  - Removido em 2026-08-25 `f640e84` (123 files `apps/whatsapp-bridge` + 3065 files `.pi/extensions/financial-tools`), `pnpm-workspace` limpo, `g6-48h-gate` COMPLETED bypass 2026-08-26, `check-legacy-runtime-references` 0 active. Evolution Go permanece como infra compartilhada (não pertence ao pi-financeiro).

## Topologia de Produção
1. **Borda (Cloudflare)**:
   - `apps/pwa` roda na infraestrutura Cloudflare (Pages / OpenNext) servindo a interface web/mobile.
   - `apps/agent` roda como Cloudflare Worker / Durable Object para orquestração conversacional do assistente.
2. **Backend e Persistência (Hostinger VPS)**:
   - `apps/api` executa em container/processo na VPS Hostinger, expondo endpoints REST autoritativos sob HTTPS (`https://api.synkroo.com.br`).
   - PostgreSQL 16 roda localmente na VPS, isolado e acessível exclusivamente pela API interna.
3. **Fluxo de Autenticação & Workspace**:
   - Autenticação via Better-Auth (email e senha com convites administrativos).
   - Resolução de workspace e permissões feita integralmente server-side na API autoritativa (`ADR-003`, `ADR-004`).

## Orquestração Orca & Comunicação Inter-Agentes
- **Supervisor / Planner**: Muse Spark via OpenCode (terminal `term_6d06e683-02d5-4967-b140-0706f32e8c44`).
- **Coder Operacional**: Antigravity agy (terminal `term_bb42c5b8-2688-474e-9026-3e98cb6434b8`).
- **Run Ativa**: `run_46965e431ba5`.
- **Protocolo de Execução**:
  - Supervisor cria tarefas (`task-create`) e despacha para o terminal do Coder (`worker-start --terminal`).
  - Coder processa instruções, emite heartbeats periódicos e executa a tarefa com transparência.
  - **Comunicação Interativa**: NUNCA utilize prompts interativos locais síncronos desconectados (`AskUserQuestion`); utilize sempre `orca orchestration ask` ou escalação de bloqueios.
  - **Finalização**: Conclusão formalizada via envio de `worker_done` com `--outcome succeeded|failed`, lista de `--files-modified` e `--body` conciso de exatamente 3 frases.

## Regras de Engenharia & Qualidade
1. **TDD Rigoroso (RED -> GREEN)**:
   - Todo bugfix, refatoração ou funcionalidade deve obrigatoriamente iniciar com um teste automatizado falhando (RED) que capture o comportamento desejado antes de escrever o código de produção (GREEN).
2. **Isolamento Multitenant por Workspace / Household**:
   - Todo comando, rota e query SQL deve validar e aplicar estritamente o `workspace_id` e/ou `household_id`.
3. **Idempotência Obrigatória**:
   - Todas as operações de mutação financeira devem exigir e validar `Idempotency-Key` com tratamento de concorrência e idempotency records.
4. **Governança de Commits**:
   - O Coder operacional prepara as alterações e deixa o working tree pronto para revisão do Planner/Supervisor. Commits diretos devem ocorrer apenas após aprovação e validação.
5. **Gates de Verificação Contínua**:
   - Nenhum trabalho é dado como concluído sem a execução bem-sucedida de `pnpm docs:lint`, `pnpm typecheck`, `pnpm test` e `pnpm governance:check`.

## Working Tree e Estado Atual (2026-09-17 `v4.1-hardening` — V4.1 IMPLEMENTADA, aguardando merge/deploy)
- **Branch de execução `v4.1-hardening` (base `main@dd10e2b` + 1 commit de readiness):** a V4.1 foi **IMPLEMENTADA POR COMPLETO** em 26 commits (`dd10e2b..HEAD`): Phase 0 (reconciliation CLI read-only legacy/canonical + baseline + inventário de mutações + decisão D1–D11 documentada em `docs/reports/v4.1-decision-gates.md` — decisões tomadas autonomamente sob autorização explícita do owner, com recomendação técnica registrada, marcadas para revisão retroativa), Phase 1 (device token requer membership/user/workspace ativos via `auth/device-access.ts`; `role:'owner'` fabricado removido; fallback demo-household fechado em produção; removeMember/leave revogam tokens + purgam push), Phase 2 (payable com `FOR UPDATE` + expense sempre + débito de saldo; unpay exige `paidTransactionId`; placeholders dinâmicos em cards/subscriptions — incluindo off-by-one canônico latente; statement locks + remaining; goals atômicos; PATCH de transação estrito 422; resolver central de categorias; billing-month helper), Phase 3 (claim de idempotência + efeito + receipt em UMA transação para todas as mutações keyed; hash V2 canônico com compat V1; PWA command-id na fronteira de intenção com retry mesmo-id), Phase 4 (D1: clamps removidos, saldo negativo proibido; delta engine reverse/apply; locks determinísticos; `template_id` resolvido; suite de paridade legacy×canonical), Phase 5 (auth state machine; env estático; same-origin default; purges de offline snapshot por revogação/switch/logout), Phase 6 (scans: 0 segredos em refs alcançáveis; 85 warnings de metadados; visibilidade continua BLOQUEADA), Phase 7 (bridge-context removido; pending-ops V1 sem wiring de produção — Agent ainda consome V1; price-alerts gateado OFF com UI degradando em 404; recurring card = template-only), Phase 8 (broker fail-closed + topology guard; SSRF guard no agent; advisory lock unificado; pool timeouts; ISO-date/money schemas; SQLSTATE mapping), Phase 9 (test:integration:all VERDE em DB fresco ×2; suite de concorrência 18 arquivos; XLT; skip-gate; VAL.14–18; artifact deploy PWA + manifest Agent; same-SHA stale check; release identity gitSha/buildId/builtAt nos 3 apps; action-pins gate; dependabot), Phase 10 (relatórios: authorization, financial-integrity, idempotency, canonical-parity, ci-validation, schema-parity, canonical-readiness = PRONTO PARA PLANEJAR CUTOVER/NÃO PARA EXECUTAR, final-report). Revisões independentes: 3 rodadas (9+3 findings corrigidos + review final com 2 fixes). Gates locais verdes: api 1942/1942, pwa 1867/1867, agent 503, broker 25, llm-contracts 23, concorrência 115/115 (PG), XLT 21/21, integration:all 142 fresh-green, typecheck/docs:lint/governance/public-safety/skip-gate/action-pins PASS.
- **NÃO feito (gates humanos §3.4):** deploy de produção; merge para `main`; troca de visibilidade do repo; rotação de credenciais; rewrite de histórico; Release B do bearer (threshold D11: 0 eventos `auth.request.legacy_bearer_used` por 14 dias pós-Release A); cutover Canonical (operação separada pós release-bridge).
- **Produção (inalterada; reconfirmada 2026-09-16):** API `v3-3305152`, `DB_SCHEMA=legacy`, Postgres 15.18, `_migrations` top = **V052**. O primeiro deploy a partir desta branch carrega V3→V4→V4.1 combinadas e exige o **release-bridge gate humano** (§3.3 do plano V4.1). Nota: V022 foi editada in-place (função SQL→plpgsql); drift < V044 = WARN (`migration.baseline_drift`) — re-backfill de checksum pendente como follow-up.
- **Débitos conhecidos (seção honesta):** billing do GitHub Actions aguarda ação do owner (workflows novos só exercitáveis com CI remoto verde); 85 warnings de metadados bloqueiam apenas publicação (sanitização = task dedicada pré-visualização); objeto local `11b82e8` (.env.e2e.creds) requer stash drop + GC humanos; regeneração de `apps/agent/src/generated/http-tools.ts` exige portar `extractRequestAuth`; migration do Agent V1→V2 pending-ops antes de remover rotas V1; bulk payables multilinha não-transacional (idempotência por receipt); `statement_timeout` override para scripts de migration a decidir no release-bridge; suites integration locais precisam de DB fresco (poluição cross-run no mesmo banco); SHA-pinning determinístico das actions pós-desbloqueio do CI; janela de compatibilidade localStorage TODO 2026-12-01 (ADR-011); `sharp@0.34.5` pinado; `.trivyignore` expira 2026-12-31.
- **Proibição de Operações Destrutivas**: `git reset --hard`, `git clean -fd`, `git checkout -- .` exigem diff prévio e autorização.

## Idioma & Convenções
- **Comunicação e Documentação**: Português do Brasil (pt-BR) para respostas, documentações canônicas (`docs/*.md`) e relatórios de progresso.
- **Código e Commits**: Código-fonte TypeScript/SQL, nomes de variáveis, funções, tipos, comentários de código e mensagens de commit em Inglês técnico.

