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
- **`apps/whatsapp-bridge` (Bridge em Descomissionamento)**:
  - Framework: Node.js, Fastify, Evolution API.
  - Runtime: Hostinger VPS.
  - Responsabilidade: Canal transitório de mensagens em fase de desligamento planejado (P3).

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

## Working Tree e Estado Local Sujo
- **Atenção ao Working Tree**: A branch de trabalho (`fase-0-preparo`) contém arquivos modificados e migrações pendentes em andamento (ex: `V032__legacy_card_purchases_household_id.sql`, `V033__card_purchase_cancellation.sql`, novos testes e handlers de cartões).
- **Proibição de Operações Destrutivas**: É estritamente proibido rodar comandos destrutivos (`git reset --hard`, `git clean -fd`, `git checkout -- .`) sem análise prévia de diff e autorização explícita, preservando o trabalho em progresso e artefatos de goals.

## Idioma & Convenções
- **Comunicação e Documentação**: Português do Brasil (pt-BR) para respostas, documentações canônicas (`docs/*.md`) e relatórios de progresso.
- **Código e Commits**: Código-fonte TypeScript/SQL, nomes de variáveis, funções, tipos, comentários de código e mensagens de commit em Inglês técnico.

