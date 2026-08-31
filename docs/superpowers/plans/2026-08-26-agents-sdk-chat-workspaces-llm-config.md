# Agents SDK, TED Chat, Workspaces and Global LLM Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Use `test-driven-development`, `adversarial-challenger` and `appsec-elite-auditor` where called out. Do not commit or deploy without the approval required by `AGENTS.md`.

**Goal:** Entregar o TED como chat global da PWA sobre o Cloudflare Agents SDK, com uma conversa compartilhada por workspace, seletor de workspace sempre acessível e configuração global de OpenCode Zen/Go, OpenAI API e um candidato OpenAI Codex por assinatura administrada exclusivamente por administradores da plataforma.

**Architecture:** Uma nova classe `FinanceChatAgent extends AIChatAgent` recebe uma instância de Durable Object por workspace e substitui o protocolo REST/SSE artesanal por `useAgent` + `useAgentChat`. `apps/api` continua sendo a única autoridade de identidade, membership, configuração global e mutações financeiras. A API persiste somente metadados não secretos de provider/modelo/transporte; chaves OpenCode e OpenAI API são secrets do Worker referenciados por aliases fixos. Providers por API são chamados diretamente pelo Worker. O candidato `openai-codex-subscription` usa um adaptador estreito para um broker privado na VPS, sem expor OpenCode/Codex nem seu cache de autenticação; ele permanece desabilitado até passar pelos gates de protocolo, tools, termos, segurança e operação. A API emite tokens curtos, scoped por ator/workspace, para conexão e para cada turno; o Agent emite o token delegado usado pelas tools HTTP e a API revalida membership antes de executar qualquer tool.

**Tech Stack:** Fastify 5, PostgreSQL 16, Better-Auth, Cloudflare Workers, Durable Objects, `agents`, `@cloudflare/ai-chat`, Vercel AI SDK, OpenCode Zen/Go, OpenAI API, Codex CLI/SDK em runner privado candidato, Next.js 16, React 19, Vitest, Cloudflare Vitest pool e Playwright.

**Primary spec:** `docs/superpowers/specs/2026-07-27-pwa-centralizado-workspaces-design.md`.

**Related decisions:** `docs/adr/003-workspace-server-side.md`, `docs/adr/005-generated-agent-tools.md`.

---

## 1. Estado inicial confirmado

- `apps/agent/src/index.ts` exporta um `WorkspaceAgent` manual, não uma classe do Agents SDK.
- `WorkspaceAgent.processTurn()` usa eco de entrada como processador default; o health check atual não prova inferência LLM real.
- `apps/agent/package.json` não possui `agents`, `@cloudflare/ai-chat`, `ai` ou adapters AI SDK.
- O DO legado possui tabelas próprias chamadas `messages`, `turn_queue`, `turn_events` e outras. Migrar a mesma classe in-place cria risco de colisão com tabelas internas do SDK.
- `apps/pwa/src/features/profile/AgentTranscript.tsx` usa polling/REST/SSE artesanal e não está montado no shell global.
- `WorkspaceProvider` e `WorkspaceSheet` existem, mas `RootProviders` não monta o provider.
- `apps/pwa/wrangler.jsonc` não declara `NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL`.
- O script `scripts/generate-agent-tools.mjs` ainda gera por default em `.pi/extensions/financial-tools`, caminho legado removido do workspace canônico.
- `docs/ARCHITECTURE-CURRENT.md` e `docs/architecture/runtime-facts.json` chamam o runtime atual de Agents SDK, mas o código instalado ainda não sustenta essa afirmação.
- Não existe broker LLM privado no runtime canônico, e a topologia versionada da VPS confirma apenas `pi-stack` em Docker; portas, proxy e serviços precisam de descoberta remota antes de qualquer desenho operacional definitivo.
- OpenAI API e ChatGPT/Codex por assinatura são produtos, credenciais, cobrança e contratos de transporte distintos; não podem compartilhar alias, health status ou fallback implícito.

## 2. Decisões fechadas

### 2.1 Experiência do usuário

- O TED aparece como widget flutuante em todas as telas autenticadas.
- No iPhone, abrir o widget ocupa a tela inteira, respeitando safe areas, teclado virtual e botão de fechar.
- Em viewport maior, o mesmo componente abre como painel lateral/modal, sem manter uma segunda implementação de chat.
- O workspace ativo aparece em um seletor no header das telas canônicas e no hero da home.
- Trocar workspace fecha sockets do Agent, limpa dados sensíveis locais e remonta estado antes de conectar ao novo DO.

### 2.2 Configuração de LLM

- Somente administradores globais definidos pela policy existente de `ADMIN_EMAILS` podem cadastrar providers/modelos e trocar o modelo ativo.
- A configuração é global, não por workspace. Workspaces e owners comuns não escolhem modelo.
- Providers diretos iniciais: `opencode-zen`, `opencode-go` e `openai-api`.
- Provider candidato: `openai-codex-subscription`, com `transport=private-broker` e `authMode=chatgpt-browser`. Ele nasce cadastrado, desabilitado e inelegível para ativação até concluir a Task 5A e a paridade real da Task 6.
- `openai-api` usa OpenAI Platform API key e cobrança da API; `openai-codex-subscription` usa entitlement ChatGPT/Codex e cache autenticado pelo cliente oficial. A UI e a documentação não os apresentam como credenciais ou cobranças intercambiáveis.
- Não haverá roteamento híbrido fixo com Workers AI nesta entrega.
- Um único par provider/modelo fica ativo por vez; a troca entra em vigor na próxima intenção nova sem deploy.
- Endpoints de provider e do broker são constantes server-side. A UI nunca aceita `baseUrl`, impedindo SSRF.
- Cada modelo declara protocolo `responses`, `messages`, `chat-completions` ou `google-generative-ai`; o adapter é escolhido por esse campo, não pelo nome do modelo.
- Cada provider declara também `transport=direct|private-broker` e `authMode=api-key|chatgpt-browser`; combinações incompatíveis falham no schema e nunca são inferidas pelo nome.
- IDs retornados pelo catálogo que ainda não tenham protocolo e policy classificados ficam indisponíveis. Sincronizar catálogo nunca habilita um modelo automaticamente.
- Policy de dados é classificada por provider, endpoint, conta/projeto e feature, não apenas por model ID. Modelos ou features com treinamento permitido ficam bloqueados; retenção precisa de classificação explícita e aviso no painel.
- Provider, modelo, protocol, policy e limites são fixados no início de uma intenção e reutilizados por approvals, tools, continuations e recovery da mesma intenção. Uma alteração admin afeta somente a próxima intenção nova.
- Um `securityEpoch` global não é fixado por intenção: revogação emergencial é verificada antes de cada inferência, tool, continuation e recovery, aborta streams ativos e invalida snapshots anteriores.

### 2.3 Secrets

- O painel não recebe nem persiste chaves brutas.
- `OPENCODE_ZEN_API_KEY`, `OPENCODE_GO_API_KEY` e `OPENAI_API_KEY` são provisionados com Wrangler/Cloudflare Secrets por uma operação administrativa auditável.
- A API persiste somente os aliases allowlisted `OPENCODE_ZEN_API_KEY`, `OPENCODE_GO_API_KEY` ou `OPENAI_API_KEY` para providers diretos.
- `AGENT_RUNTIME_ORIGIN` é configuração fixa da API, e `AGENT_RUNTIME_ADMIN_TOKEN` é secret compartilhado apenas entre API e Worker para catálogo/probe; a API nunca recebe as API keys dos providers.
- Credenciais ChatGPT/Codex nunca entram em Cloudflare, PWA, PostgreSQL, logs ou artefatos. O cache do cliente oficial permanece com permissão `0600` em volume persistente dedicado do broker privado e é tratado como senha.
- O Worker autentica no adaptador estreito do broker com uma credencial de serviço própria e rotacionável; ela não é a credencial OpenAI e não concede acesso ao shell, filesystem ou APIs nativas de OpenCode/Codex.
- O transporte aprovado usa `CODEX_BROKER_ORIGIN` fixo, Cloudflare Access com `CODEX_BROKER_ACCESS_CLIENT_ID`/`CODEX_BROKER_ACCESS_CLIENT_SECRET` e envelope HMAC por request com `CODEX_BROKER_REQUEST_SIGNING_KEY`. Access autentica o workload; timestamp, nonce e body hash impedem replay/tampering.
- Login/reseed ChatGPT ocorre somente por operação manual auditada no host confiável, via browser/device flow do cliente oficial. O painel mostra estado sanitizado e nunca inicia OAuth nem transporta access/refresh token.
- A aplicação não recebe token Cloudflare com permissão para editar Workers/secrets.
- O painel oferece `Testar conexão`, que retorna somente status sanitizado, modelo, latência e código de erro.

### 2.4 Migração e rollback

- Criar `FinanceChatAgent` e binding `FINANCE_CHAT_AGENT` em uma nova migration de Durable Object.
- Manter `WorkspaceAgent` e binding `AGENT` durante migração, canário e soak.
- Importar histórico de forma idempotente para o novo DO antes de habilitar o chat de um workspace.
- Manter um kill switch dinâmico com estados `disabled`, `canary` e `all`; `canary` exige allowlist explícita de workspace.
- Não apagar a classe, binding ou dados legados nesta entrega.
- Rollback desabilita a UI nova e restaura os artefatos Worker/PWA anteriores; os DOs antigos continuam intactos.

## 3. Critérios de aceitação

- [ ] Um usuário autenticado vê e troca apenas workspaces dos quais é membro.
- [ ] Após a troca, nenhum cache, socket, mensagem ou chamada permanece ligado ao workspace anterior.
- [ ] O TED transmite resposta real do provider configurado; não há eco default nem resposta fake.
- [ ] Duas pessoas do mesmo workspace veem a conversa compartilhada e a autoria correta; outro workspace não vê nada.
- [ ] Revogação de membership impede nova conexão, novo turno e execução de tool.
- [ ] Toda mutação financeira usa a API autoritativa, token delegado e `Idempotency-Key` quando exigido.
- [ ] `pending_operations` continua persistido no PostgreSQL e funciona fora do chat.
- [ ] Somente admin global lista/altera configuração de LLM ou executa probe.
- [ ] `openai-api` transmite resposta e tool calls pela OpenAI API sem expor `OPENAI_API_KEY`, e sua cobrança/status não é confundida com ChatGPT.
- [ ] `openai-codex-subscription` não pode ser habilitado antes de comprovar uso permitido, streaming, cancelamento, isolamento, function tools, refresh/reseed e fail-closed no broker privado.
- [ ] Mensagens históricas, mensagens de outro ator e tool outputs são dados não confiáveis; nenhuma mutação pode decorrer deles sem vínculo com a última mensagem do ator atual e approval fresco quando exigido.
- [ ] Revogação emergencial interrompe novas chamadas, continuations, recoveries e tools de intenções já iniciadas.
- [ ] Alterar provider/modelo ativo não exige build nem deploy e afeta a próxima intenção nova, sem trocar o modelo de uma continuação/recovery em andamento.
- [ ] Nenhuma resposta da API/PWA/log contém API key, service token ou token delegado.
- [ ] O widget funciona em desktop e em iPhone 390x844, incluindo teclado, reconexão, stop, retry e approval.
- [ ] Histórico legado é importado uma vez, preserva autoria/ordem e pode ser auditado.
- [ ] Gates `docs:lint`, `typecheck`, `test` e `governance:check` passam sem reduzir cobertura ou desabilitar regras.

## 4. Fora de escopo

- Mover `apps/api` ou PostgreSQL para Cloudflare.
- Provider/modelo por workspace ou BYOK de owner/membro.
- Providers arbitrários, endpoints informados pelo usuário ou fallback silencioso entre providers.
- Tratar ChatGPT Plus/Pro como substituto contratual automático da OpenAI API ou copiar cookies/tokens de browser para o Worker.
- Expor `opencode serve`, Codex app-server, shell, filesystem, sessões nativas ou endpoints administrativos do broker à internet/PWA.
- Workers AI como roteador híbrido.
- Reescrever regras financeiras dentro do Worker.
- Apagar o DO legado no mesmo rollout.
- Reintroduzir WhatsApp, `apps/whatsapp-bridge` ou `.pi/extensions` como runtime de produção.

---

## Task 1: Congelar contratos e criar a baseline RED

**Files:**
- Modify: `apps/agent/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/agent/tests/sdk-runtime-contract.test.ts`
- Create: `apps/agent/tests/sdk-auth-attribution-spike.test.ts`
- Create: `apps/agent/vitest.auth-spike.config.ts`
- Create: `apps/pwa/src/components/__tests__/TedChatLauncher.test.tsx`
- Modify: `apps/pwa/src/lib/auth/workspace-context.test.tsx`
- Create: `apps/api/tests/routes/admin-agent-llm-config.test.ts`
- Create: `scripts/openai-codex-subscription-spike.mjs`
- Create: `docs/superpowers/research/2026-08-26-openai-codex-subscription-broker-spike.md`
- Verify: `apps/api/openapi/agent-tools.openapi.json`
- Verify: `docs/architecture/runtime-facts.json`

- [ ] **Step 1: Registrar a baseline sem corrigir comportamento.** Executar os testes atuais focados de Agent, auth/workspace e transcript. Guardar contagens e falhas preexistentes; não usar o worktree sujo como justificativa para apagar arquivos alheios.
- [ ] **Step 2: RED do runtime.** Exigir por teste estrutural que exista `FinanceChatAgent extends AIChatAgent`, que o Worker use roteamento do SDK e que não exista processador default de eco no caminho novo.
- [ ] **Step 3: Spike RED-capable de autenticação/autoria do SDK.** Após capturar o RED, adicionar somente os pacotes core `agents`, `@cloudflare/ai-chat`, `ai` e o pool Workers necessários ao spike. Provar em runtime Workers que a subclasse consegue: autenticar o raw frame antes da persistência, associar ator a partir do estado server-side da conexão, rejeitar frames de clear/sync não autorizados e receber credencial por metadata/header efêmero sem gravá-la em mensagens, fiber `lastBody`, recovery stash ou SQLite. Se qualquer propriedade falhar, parar antes da Task 2 e escolher um BFF same-origin ou adapter de protocolo explicitamente revisado; nunca enviar o token no body persistido como atalho.
- [ ] **Step 4: RED da PWA.** Exigir `WorkspaceProvider` na árvore autenticada, launcher global TED e comportamento fullscreen em viewport móvel.
- [ ] **Step 5: RED da administração.** Exigir 401 sem sessão, 403 para usuário comum, Origin/CSRF válido em mutações e resposta sanitizada para admin global.
- [ ] **Step 6: RED de isolamento.** Cobrir token de outro workspace, token expirado, membership revogada, frame WebSocket forjado e tentativa de escolher workspace/modelo via payload não assinado.
- [ ] **Step 7: Spike RED-capable da assinatura OpenAI.** Em máquina privada e sem dados financeiros reais, autenticar o cliente oficial por browser/device flow e provar: chamada headless repetível, refresh do cache pelo próprio cliente, modelo explícito, streaming incremental, cancelamento, ausência de shell/filesystem/network tools, entrada de system instructions, function tools compatíveis com AI SDK, usage observável e erro sanitizável. Colocar um canary secreto ao lado do cache e provar que prompt, tool, stdout/stderr, erro e artifact não o leem nem retornam. Comparar Codex SDK/`codex exec` com OpenCode SDK/servidor somente em loopback; não usar o WebSocket remoto experimental do Codex app-server como transporte de produção. Registrar versão, payloads sanitizados, limitações e decisão no research doc.
- [ ] **Step 8: Gate da assinatura.** Exigir evidência escrita da OpenAI ou contrato empresarial que permita o uso multiusuário pretendido; aprovação interna do owner, probe verde ou sucesso técnico não substituem essa evidência. Se function tools, isolamento, autorização de uso ou operação segura não forem comprovados, manter `openai-codex-subscription` hard-coded como `experimental_blocked`, encerrar sua trilha e continuar a entrega com `openai-api` e OpenCode Zen/Go. Nunca simular paridade por parsing livre de texto.

**Evidence:** os testes novos falham pelas ausências esperadas, não por erro de setup.

## Task 2: Criar configuração global não secreta na API

**Files:**
- Create: `apps/api/src/read-models/sql/V034__agent_llm_configuration.sql`
- Modify: `apps/api/src/read-models/sql/migrate.ts`
- Create: `apps/api/src/agent/llm-config.ts`
- Create: `apps/api/src/agent/llm-config-postgres.ts`
- Create: `apps/api/src/routes/admin-agent-llm-config.ts`
- Create: `apps/api/src/routes/internal-agent-llm-config.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/routes/route-inventory.ts`
- Modify: `apps/api/src/routes/route-handlers.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/server/index.ts`
- Create: `docs/adr/009-global-agent-llm-configuration.md`
- Test: `apps/api/tests/agent/llm-config.test.ts`
- Test: `apps/api/tests/integration/postgres-agent-llm-config.test.ts`
- Test: `apps/api/tests/routes/admin-agent-llm-config.test.ts`

- [ ] **Step 1: Registrar ADR antes do schema.** Documentar que configuração de runtime LLM é uma policy de plataforma global, não uma mutação financeira/tenant; por isso não recebe `workspace_id`. Preservar ADR-003 para identidade server-side e atualizar ADR-005 na Task 6 antes de mudar o destino gerado.
- [ ] **Step 2: RED do schema.** Exigir providers globais com kind allowlisted, `transport` e `authMode` compatíveis, modelos únicos por provider, protocolo enum, classificação de privacidade, enabled, `eligibility=experimental_blocked|approved`, `runtimeStatus=not_configured|ready|reauth_required|unavailable`, configuração singleton ativa, `rolloutMode`, `securityEpoch` e allowlist canário. Não incluir coluna de secret bruto.
- [ ] **Step 3: Implementar migration aditiva.** Criar tabelas `agent_llm_providers`, `agent_llm_models` e `agent_llm_runtime_config`, FKs, timestamps, `updated_by`, versão monotônica e constraints que impedem provider/modelo incompatíveis. Seed idempotente registra `openai-api` como `direct/api-key/OPENAI_API_KEY/approved` com `runtimeStatus=not_configured` e `openai-codex-subscription` como `private-broker/chatgpt-browser/experimental_blocked`; transições inválidas falham no banco/store. Incluir V034 em `LEGACY_SAFE_PREFIXES`, pois produção usa `DB_SCHEMA=legacy`, e testar o manifest legacy.
- [ ] **Step 4: Compor stores no bootstrap real.** Instanciar os stores Postgres nos ramos legacy/canonical de `apps/api/src/server/index.ts`, disponibilizar fallback in-memory apenas para testes/dev e injetar `workspaceAccess`, config store, `adminEmails` e secrets nos routes. Teste de boot deve provar que produção não cai silenciosamente no store in-memory.
- [ ] **Step 5: Implementar policy global.** Reutilizar `getBetterAuthSessionContext()` e `isUserAdmin(email, adminEmails)`. Estender o inventário de rotas para representar `admin` e `internal`, mantendo coverage explícita.
- [ ] **Step 6: Implementar endpoints admin.** Suportar listar catálogo, solicitar ao Worker a sincronização de IDs dos endpoints fixos de Zen, Go e OpenAI API, classificar protocolo/privacy, habilitar/desabilitar, ativar um par e controlar kill switch/canário. O catálogo da assinatura vem somente do probe sanitizado do broker após o gate. A API/store rejeita ativação quando `eligibility !== approved`, independentemente da UI. Rejeitar `baseUrl`, `apiKey`, aliases desconhecidos, transport/auth incompatíveis, modelos sem classificação e modelos `training_allowed`.
- [ ] **Step 7: Implementar leitura interna.** `GET /internal/agent/llm-config` exige `AGENT_CONFIG_TOKEN`, retorna apenas provider, model, protocol, transport, authMode, secret/service alias, limites, rollout, eligibility e version. Comparação de token deve ser timing-safe.
- [ ] **Step 8: Concorrência.** Atualização ativa usa transação/lock ou compare-and-swap de `version`; duas alterações concorrentes não deixam dois defaults nem perdem update sem 409.
- [ ] **Step 9: Adversarial.** Cobrir SSRF por URL injetada/redirect, alias arbitrário, prototype pollution, Origin/CSRF inválido, modelo removido do catálogo, provider desabilitado, transição de eligibility forjada, usuário admin com casing diferente e token interno vazado em logs.

**Focused verification:**
```bash
pnpm --dir apps/api exec vitest run tests/agent/llm-config.test.ts tests/routes/admin-agent-llm-config.test.ts tests/integration/postgres-agent-llm-config.test.ts
```

## Task 3: Emitir e validar autenticação curta do Agent

**Files:**
- Create: `apps/api/src/auth/agent-connection-token.ts`
- Create: `apps/api/src/auth/agent-connection-token-replay.ts`
- Create: `apps/api/src/auth/agent-connection-token-replay-postgres.ts`
- Create: `apps/api/src/read-models/sql/V035__agent_connection_token_replay.sql`
- Modify: `apps/api/src/read-models/sql/migrate.ts`
- Create: `apps/api/src/routes/agent-auth.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/routes/route-inventory.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/server/index.ts`
- Create: `apps/agent/src/auth/connection-token.ts`
- Test: `apps/api/tests/auth/agent-connection-token.test.ts`
- Test: `apps/api/tests/routes/agent-auth.test.ts`
- Test: `apps/agent/tests/connection-token.test.ts`
- Modify: `apps/agent/tests/agent-auth.test.ts`

- [ ] **Step 1: RED do token.** Definir claims `iss=pi-finance-api`, `aud=pi-finance-agent`, `sub`, `workspace`, `role`, `capabilities`, `jti`, `iat`, `exp` e TTL máximo de 120 segundos.
- [ ] **Step 2: Implementar emissão.** `POST /auth/agent-token` exige sessão Better-Auth e `x-workspace-id`; a API resolve membership server-side e ignora ator/role enviados no body.
- [ ] **Step 3: Implementar anti-replay de conexão e turno.** V035 cria store de `jti_hash/exp/consumed_at`, entra em `LEGACY_SAFE_PREFIXES` e é composto no bootstrap. No handshake, após validar assinatura, o Worker chama endpoint interno autenticado por `AGENT_AUTH_SERVICE_TOKEN` para consumir o JTI atomicamente; segundo handshake com o mesmo token falha, inclusive no mesmo workspace. Cada turno usa JTI one-shot vinculado a `connectionId`, ator, workspace, `intentionId` e hash da mensagem; retry legítimo recupera a mesma intenção/resultado em vez de cobrar ou persistir novamente. Não armazenar token/JTI bruto.
- [ ] **Step 4: Implementar verificação Worker.** Validar assinatura, issuer, audience, TTL, clock skew, workspace igual ao nome da instância e role allowlisted. Nunca persistir o token no DO/transcript.
- [ ] **Step 5: Autenticar conexão e turno sem persistir credencial.** Preferir BFF same-origin/cookie `HttpOnly` ou mecanismo oficial que autentique antes da persistência sem token em query. Se o SDK exigir query token one-shot, a Task 1 precisa provar consumo único, TTL mínimo e ausência da query em logs/traces de edge, Access, proxy e Worker; sem essa prova, parar e implementar o BFF. Cada envio obtém token recém-emitido e o transporta somente pelo mecanismo efêmero provado na Task 1 (`prepareSendMessagesRequest` metadata/header), nunca em `body`; o raw frame é validado e seu JTI consumido antes de chamar o handler do SDK. Teste SQLite/fiber prova ausência byte a byte.
- [ ] **Step 6: Vincular autoria server-side.** Sobrescrever metadata de autoria a partir do connection state verificado, ignorar metadata do browser e manter ledger `request/message -> actor` antes da persistência. Rejeitar frames `clearHistory`, transcript sync e `setMessages` para membros; operações de privacidade passam por métodos server-side autorizados.
- [ ] **Step 7: Reforçar API tools.** Quando a API recebe o token delegado do Agent, re-resolver a membership atual de `(sub, workspace)` com o `workspaceAccess` injetado pelo bootstrap antes de montar `authenticatedContext`; membership revogada falha antes do handler.
- [ ] **Step 8: Adversarial.** Cobrir replay cross-workspace, segundo handshake no mesmo workspace/JTI, token URL em log sanitizado, token em `lastBody`/SQLite, Origin inválido, sessão encerrada, role/metadata forjadas, frame clear/sync manual, conexão mantida após revoke e token delegado válido com membership removida.

**Focused verification:**
```bash
pnpm --dir apps/api exec vitest run tests/auth/agent-connection-token.test.ts tests/routes/agent-auth.test.ts tests/auth/delegated-token.test.ts
pnpm --dir apps/agent exec vitest run tests/connection-token.test.ts tests/agent-auth.test.ts
```

## Task 4: Adicionar o SDK em um novo Durable Object

**Files:**
- Modify: `apps/agent/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/agent/src/finance-chat-agent.ts`
- Create: `apps/agent/src/worker.ts`
- Modify: `apps/agent/src/index.ts`
- Modify: `apps/agent/wrangler.jsonc`
- Modify: `apps/agent/worker-configuration.generated.d.ts` via `wrangler types`
- Modify: `apps/agent/worker-configuration.d.ts`
- Modify: `apps/agent/vitest.config.ts`
- Create: `apps/agent/vitest.workers.config.ts`
- Modify: `package.json`
- Modify: `scripts/run-workspace-gate.mjs`
- Create: `apps/agent/tests/finance-chat-agent.integration.test.ts`
- Modify: `apps/agent/tests/sdk-runtime-contract.test.ts`

- [ ] **Step 1: Completar dependências oficiais.** Preservar os pacotes core validados na Task 1 e adicionar `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible` e `@ai-sdk/google`. Consolidar a configuração do pool Workers sem remover a suíte Node existente. Não adicionar Workers AI.
- [ ] **Step 2: Criar `FinanceChatAgent`.** Estender `AIChatAgent`, usar `messageConcurrency="queue"`, encaminhar `abortSignal`, limitar mensagens persistidas e manter sanitização customizada antes da persistência.
- [ ] **Step 3: Criar binding aditivo.** Manter `AGENT/WorkspaceAgent`; adicionar `FINANCE_CHAT_AGENT/FinanceChatAgent` e migration `v2` com `new_sqlite_classes`. Nunca editar a migration `v1`.
- [ ] **Step 4: Atualizar tipos de ambiente.** Executar `pnpm --dir apps/agent exec wrangler types --config=wrangler.jsonc --include-runtime=false worker-configuration.generated.d.ts` após alterar bindings/vars, manter o arquivo gerado versionado e adicionar `--check` ao gate. Como Wrangler não inclui secrets, declarar manualmente em `worker-configuration.d.ts` somente os nomes/tipos de `AGENT_CONNECTION_TOKEN_SECRET`, `AGENT_AUTH_SERVICE_TOKEN`, `AGENT_CONFIG_TOKEN`, `AGENT_RUNTIME_ADMIN_TOKEN`, `AGENT_DELEGATION_SECRET`, `OPENCODE_ZEN_API_KEY`, `OPENCODE_GO_API_KEY`, `OPENAI_API_KEY` e, se o gate da Task 5A passar, `CODEX_BROKER_ACCESS_CLIENT_ID`, `CODEX_BROKER_ACCESS_CLIENT_SECRET` e `CODEX_BROKER_REQUEST_SIGNING_KEY`; `CODEX_BROKER_ORIGIN` é var não secreta gerada. Nunca registrar valores nem editar o arquivo gerado à mão.
- [ ] **Step 5: Usar o roteador oficial.** Encaminhar `/agents/finance-chat-agent/{workspaceId}` pelo SDK após autenticação; preservar `/health/agent` e rotas legadas durante o rollout.
- [ ] **Step 6: Teste em runtime Workers.** Provar handshake WebSocket, persistência SQLite, streaming, cancelamento e retomada após reconnect com o pool Workers/Miniflare, não apenas mocks Node.
- [ ] **Step 7: Fail closed.** Sem token, configuração ou secret, retornar erro estável e sanitizado. Proibir eco, fallback mock e fallback silencioso para outro provider.
- [ ] **Step 8: Corrigir gates root.** Remover o package legado inexistente da lista default de `run-workspace-gate.mjs`, incluir `pi-finance-agent` e ajustar os aliases root para provar que `pnpm typecheck`/`pnpm test` realmente executam Agent, API e PWA.

**Focused verification:**
```bash
pnpm --filter pi-finance-agent test
pnpm --filter pi-finance-agent typecheck
```

## Task 5: Implementar registry Zen/Go/OpenAI API e inferência real

**Files:**
- Create: `apps/agent/src/llm/provider-registry.ts`
- Create: `apps/agent/src/llm/runtime-config-client.ts`
- Create: `apps/agent/src/llm/model-factory.ts`
- Create: `apps/agent/src/llm/provider-probe.ts`
- Create: `apps/agent/src/safety/usage-policy.ts`
- Modify: `apps/agent/src/finance-chat-agent.ts`
- Test: `apps/agent/tests/provider-registry.test.ts`
- Test: `apps/agent/tests/runtime-config-client.test.ts`
- Test: `apps/agent/tests/provider-probe.test.ts`
- Test: `apps/agent/tests/usage-policy.test.ts`
- Modify: `apps/api/src/routes/admin-agent-llm-config.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/agent/src/worker.ts`
- Test: `apps/agent/tests/openai-model-factory.test.ts`

- [ ] **Step 1: RED por protocolo.** Exigir base URLs fixas para Zen/Go/OpenAI API e adapters distintos para `responses`, `messages`, `chat-completions` e `google-generative-ai`. Para OpenAI, usar origin exata, `redirect: "error"` e model ID por igualdade contra catálogo allowlisted; testar IDs com `/`, `%2f`, `?` e `@`. Model ID nunca decide sozinho qual SDK usar; IDs sem adapter classificado não podem ser habilitados.
- [ ] **Step 2: Resolver secrets por alias allowlisted.** Mapear somente `OPENCODE_ZEN_API_KEY`, `OPENCODE_GO_API_KEY` e `OPENAI_API_KEY` para bindings do Worker. Nunca usar acesso dinâmico irrestrito a `env`; `OPENAI_API_KEY` jamais autentica o provider de assinatura.
- [ ] **Step 3: Fixar configuração por intenção.** Ler a configuração ativa antes da primeira inferência, validar version/provider/model/protocol/rollout e persistir um snapshot não secreto keyed pelo `intentionId`. Approvals, tools, continuations e recovery reutilizam esse snapshot; uma troca admin vale somente para uma intenção nova.
- [ ] **Step 4: Aplicar custo antes da primeira inferência.** Reservar limite agregado do workspace e limite por ator antes da chamada; contabilizar usage real no finish e consultar o mesmo budget em recovery. Nenhum caminho com LLM real existe antes desse guard.
- [ ] **Step 5: Implementar `onChatMessage`.** Converter mensagens, aplicar system prompt financeiro, chamar `streamText`, encaminhar abort signal e retornar `toUIMessageStreamResponse()`.
- [ ] **Step 6: Implementar catálogo/probe sanitizado no Worker.** Expor somente rotas internas fixas de catálogo e probe no Worker, autenticadas por `AGENT_RUNTIME_ADMIN_TOKEN`. A API usa `AGENT_RUNTIME_ORIGIN` fixo e nunca recebe `OPENAI_API_KEY`. O Worker valida o secret e faz requisição mínima; retornar somente `{ready, provider, model, transport, authMode, latencyMs, code}`. Testar chamada API→Worker, comparação timing-safe e ausência da key em ambos os lados.
- [ ] **Step 7: Guardar policy de dados OpenAI.** Usar API key de projeto dedicada, restrita e com spend/rate limit. Fixar `providerOptions.openai.store=false`, foreground-only e function tools locais allowlisted; proibir nesta entrega Conversations, `previousResponseId`, background, web/file search, uploads, code interpreter/shell e MCP remoto. Classificar separadamente abuse-monitoring logs; não enviar texto financeiro no probe.
- [ ] **Step 8: Adversarial.** Cobrir payload HTTP real de Responses/Chat Completions, `store:false`, function-call streaming, protocolo incorreto, 401/402/429/5xx, redirect, timeout, stream interrompido, troca de config durante a intenção, resposta enorme, tentativa de exfiltrar a key e ausência de fallback entre `openai-api`/assinatura. Provar que credencial do broker não autentica OpenAI API e vice-versa.

**Evidence:** teste com fake provider prova payload, streaming e ausência de secrets; smoke real fica para staging após provisionamento autorizado.

## Task 5A: Integrar o candidato Codex por assinatura atrás de broker privado

**Gate de entrada:** executar a infraestrutura somente se a Task 1 comprovar paridade técnica e existir evidência escrita da OpenAI/contrato empresarial permitindo o uso multiusuário pretendido. `eligibility` continua `experimental_blocked` até a Task 6 provar paridade com as tools financeiras reais. Falha no gate não bloqueia `openai-api`, Zen ou Go.

**Files:**
- Create: `apps/codex-broker/package.json`
- Create: `apps/codex-broker/tsconfig.json`
- Create: `apps/codex-broker/src/server.ts`
- Create: `apps/codex-broker/src/runtime-adapter.ts`
- Create: `apps/codex-broker/src/auth-status.ts`
- Create: `apps/codex-broker/src/replay-store.ts`
- Create: `apps/codex-broker/tests/server.test.ts`
- Create: `apps/codex-broker/tests/runtime-adapter.integration.test.ts`
- Create: `apps/codex-broker/Dockerfile`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `scripts/run-workspace-gate.mjs`
- Modify: `scripts/run-final-validation.mjs`
- Modify: `scripts/security-containers.mjs`
- Modify: `scripts/root-scripts.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/agent/src/llm/provider-registry.ts`
- Modify: `apps/agent/src/llm/model-factory.ts`
- Create: `apps/agent/src/llm/private-broker-client.ts`
- Test: `apps/agent/tests/private-broker-client.test.ts`
- Modify: `apps/agent/wrangler.jsonc`
- Modify: `apps/agent/worker-configuration.d.ts`
- Modify: `apps/agent/.dev.vars.example`
- Create: `docs/ops/openai-codex-subscription-broker.md`
- Coordinate in sibling infra repository: `../vps-hostinger/` after remote topology discovery; never copy its `.env` or credential values into this repository.

- [ ] **Step 1: Fixar o contrato estreito.** Expor somente health sanitizado, catálogo permitido e inferência/stream/cancel necessários ao `FinanceChatAgent`; proibir proxy genérico, configuração, auth mutation, sessions/files/project/shell/command/MCP e qualquer endpoint nativo OpenCode/Codex. Definir schema versionado, limites de body/output, timeout, request id e códigos de erro allowlisted.
- [ ] **Step 2: Isolar o runtime.** Após descoberta remota, registrar manifestos concretos no repositório de infraestrutura. Rodar rootless como usuário sem login, com rootfs read-only, `no-new-privileges`, capabilities removidas, sem checkout/SSH/Docker socket, limites de processo/memória, tmpfs restrito e egress allowlisted. O único volume gravável persistente contém o cache de auth com owner exclusivo e modo `0600`; o canary da Task 1 continua ilegível ao caminho model-driven.
- [ ] **Step 3: Autenticar e impedir replay.** Manter listener nativo em loopback/rede privada e publicar somente o adaptador estreito por TLS + Cloudflare Access. O Worker usa `CODEX_BROKER_ORIGIN`, `CODEX_BROKER_ACCESS_CLIENT_ID` e `CODEX_BROKER_ACCESS_CLIENT_SECRET`, mais `CODEX_BROKER_REQUEST_SIGNING_KEY` para envelope HMAC `{kid,aud,timestamp,nonce,requestId,bodySha256}` com validade máxima de 30 segundos. O broker consome nonce atomicamente, vincula cancelamento ao request original e rejeita body alterado, replay, Origin de browser e acesso público. Não reutilizar credencial ChatGPT/Codex no transporte.
- [ ] **Step 4: Implementar adapter fixado contra confused deputy.** Usar apenas o cliente e a versão aprovados no research doc, com modelo allowlisted e ferramentas locais desabilitadas. O broker deriva localmente model, system policy e toolset por `policyVersion/toolsetVersion` allowlisted; do Worker aceita somente mensagens, IDs pseudônimos e parâmetros limitados. Traduzir stream, usage, cancelamento e function calls validadas; rejeitar prompt/schema/model/runtime flags arbitrários mesmo em request autenticado e aplicar quotas próprias.
- [ ] **Step 5: Serializar o cache de autenticação.** Uma única instância usa lease/flock cross-process; não compartilhar a mesma cópia entre máquinas/jobs concorrentes nem sobrepor rolling deploy. O cliente oficial faz refresh e persiste por escrita atômica `fsync+rename`, reaplica `0600` e recupera arquivo truncado sem expor conteúdo. `401` terminal marca `reauth_required` e falha fechado, sem cair para `openai-api` ou outro provider.
- [ ] **Step 6: Operação humana segura.** Runbook cobre login inicial por browser/device flow, reseed, `login status`, revogação/logout, backup apenas se criptografado, rotação da credencial de transporte e health sem conteúdo. Nunca imprimir, copiar para ticket ou incluir `auth.json` em imagem, Git, log ou artifact.
- [ ] **Step 7: Integrar no registry sem aprovar.** Resolver `transport=private-broker` por client dedicado, preservando snapshot por intenção, budget, approvals, tools e idempotência iguais aos providers diretos. Manter `eligibility=experimental_blocked` até o teste de paridade real da Task 6; UI e API/store impedem ativação.
- [ ] **Step 8: Adversarial e supply chain.** Cobrir tentativa de acessar endpoints nativos, path/tool injection, prompt pedindo shell/cache/canary, cache ausente/permissão frouxa, token de transporte vazado, replay/tampering, broker lento/offline, stream truncado, dois processos em refresh, crash durante escrita, 401/reseed, model drift e fallback automático. Logs, traces, stdout/stderr, core dumps e artifacts usam allowlist estrutural sem headers/body/upstream response e são escaneados com canary secrets.
- [ ] **Step 9: Integrar gates.** Incluir broker em workspace, aliases root, CI e validação final; exigir lint/typecheck/test/build, imagem rootless e scan Trivy sem HIGH/CRITICAL. Gate falha, em vez de pular, quando Docker/scan obrigatório não está disponível na CI que produz candidate.

**Focused verification:**
```bash
pnpm --filter pi-finance-codex-broker test
pnpm --filter pi-finance-codex-broker typecheck
pnpm --dir apps/agent exec vitest run tests/private-broker-client.test.ts tests/provider-registry.test.ts
```

## Task 6: Portar as tools geradas para o Agent canônico

**Files:**
- Modify: `scripts/generate-agent-tools.mjs`
- Create: `apps/agent/src/generated/http-tools.ts` via generator
- Create: `apps/agent/src/tools/api-client.ts`
- Create: `apps/agent/src/tools/tool-policy.ts`
- Create: `apps/agent/src/tools/intention-ledger.ts`
- Modify: `apps/agent/src/finance-chat-agent.ts`
- Modify: `scripts/check-tool-capability-inventory.mjs`
- Modify: `scripts/check-write-policy.mjs`
- Modify: `docs/architecture/write-mutator-policy.md`
- Test: `scripts/generate-agent-tools.test.mjs`
- Test: `apps/agent/tests/generated-tools.test.ts`
- Test: `apps/agent/tests/intention-ledger.test.ts`
- Test: `apps/api/tests/contract/agent-tools-authoritative-all.test.ts`

- [ ] **Step 1: Atualizar ADR-005 antes da implementação.** Registrar que o OpenAPI continua autoritativo, mas o output canônico passa a `apps/agent/src/generated/http-tools.ts`; `.pi` permanece apenas como referência histórica Git.
- [ ] **Step 2: RED do destino.** O checker deve falhar enquanto o output canônico estiver em `.pi/extensions`; exigir output em `apps/agent/src/generated/http-tools.ts` e paridade com o OpenAPI.
- [ ] **Step 3: Adaptar o generator ao AI SDK.** Gerar tools com schemas derivados do OpenAPI, método/path, classificação read/write, idempotência e metadata de approval. Não editar o output à mão.
- [ ] **Step 4: Capturar contexto confiável.** `onChatMessage` cria o token delegado a partir dos claims verificados do turno e fecha esse token no executor das tools; parâmetros do LLM não podem substituir workspace/actor/role.
- [ ] **Step 5: Preservar idempotência em recovery.** Criar um `intentionId` server-side uma única vez por submissão e persistir, antes de qualquer side effect, um ledger `(workspace, intentionId, toolCallId) -> idempotencyKey/outcome`. Não usar `options.requestId` diretamente: request IDs podem mudar entre continuation/recovery. Approval, retry e recovery recuperam a mesma key e nunca reexecutam outcome terminal.
- [ ] **Step 6: Preservar autoridade da API.** Tools chamam exclusivamente `API_ORIGIN`; nenhum SQL/Hyperdrive no Agent e nenhuma regra financeira duplicada.
- [ ] **Step 7: Atualizar gates.** Capability inventory e write policy passam a apontar para o output canônico sem reintroduzir `.pi` no workspace.
- [ ] **Step 8: Adversarial.** Cobrir path injection, schema inválido, tool não allowlisted, write sem key, retry após timeout ambíguo, workspace forjado e token delegado em erro/transcript.
- [ ] **Step 9: Fechar paridade da assinatura.** Se Task 5A existir, provar broker→function call→`apps/agent/src/generated/http-tools.ts` com uma leitura e uma mutação sujeita a approval/idempotência, sem tool local. Somente evidência técnica verde mais autorização escrita permite transição server-side para `eligibility=approved`; caso contrário permanece `experimental_blocked`.

**Focused verification:**
```bash
node scripts/generate-agent-tools.mjs --check
pnpm capabilities:check
pnpm write-policy:check
pnpm --dir apps/agent exec vitest run tests/generated-tools.test.ts
```

## Task 7: Integrar approvals, orçamento, rate limit e privacidade

**Files:**
- Modify: `apps/agent/src/safety/usage-policy.ts`
- Create: `apps/agent/src/safety/tool-approvals.ts`
- Create: `apps/agent/src/privacy/history.ts`
- Modify: `apps/agent/src/finance-chat-agent.ts`
- Modify: `apps/agent/tests/usage-policy.test.ts`
- Test: `apps/agent/tests/tool-approvals.test.ts`
- Modify: `apps/agent/tests/agent-privacy.test.ts`
- Modify: `apps/agent/tests/agent-privacy-sqlite.test.ts`

- [ ] **Step 1: Completar RED de custo iniciado na Task 5.** Exigir limite de entrada, output, requisições por janela, orçamento diário agregado por workspace e sub-limite por ator. Contabilizar usage real do provider quando disponível; estimativa serve apenas como reserva pessimista.
- [ ] **Step 2: Completar limites duráveis.** Persistir uso/rate limit em tabelas próprias do novo DO. O budget principal é agregado por workspace; o ator recebe um guard adicional, não um orçamento independente que multiplica o total. Recovery consulta a mesma reserva antes de continuar.
- [ ] **Step 3: Mapear approval sem duplicar estado.** `needsApproval` apresenta confirmação no chat, mas o estado autoritativo continua em `pending_operations`. Aprovar/rejeitar chama os endpoints existentes; `clearHistory` nunca apaga pending operation.
- [ ] **Step 4: Vincular mutação à intenção atual.** Histórico compartilhado, mensagens de outro ator e tool outputs são dados não confiáveis e nunca autorizam side effect. Toda mutação precisa derivar deterministicamente da última mensagem do ator atual e de approval fresco quando exigido. Testar membro plantando comando antes de owner pedir resumo e descrição financeira contendo prompt injection; ambos produzem zero tool calls mutativas.
- [ ] **Step 5: Preservar controles de histórico server-side.** Autoria vem somente do ledger/connection state da Task 3. Export/delete por membro afeta somente registros permitidos e owner access-log preserva auditoria. Configurar `syncMessagesToServer=false`, rejeitar frames de transcript replacement/clear no Agent e não expor `clearHistory()` global a membros, inclusive por chamada WebSocket manual.
- [ ] **Step 6: Sanitizar persistência.** Aplicar redaction aos textos, tool inputs/outputs e erros antes do SQLite/log. Secret, delegated token e connection token têm testes de ausência byte a byte.
- [ ] **Step 7: Adversarial.** Cobrir approval em duas abas, approve/reject concorrentes, tool recuperada após eviction, membro tentando apagar histórico alheio e orçamento consumido em retry/recovery.

## Task 8: Migrar histórico sem colisão e com rollback

**Files:**
- Create: `apps/agent/src/migration/legacy-history.ts`
- Create: `apps/agent/tests/legacy-history-migration.test.ts`
- Modify: `apps/agent/src/index.ts`
- Modify: `apps/agent/src/finance-chat-agent.ts`
- Modify: `apps/agent/src/worker.ts`
- Create: `docs/ops/agent-history-migration-runbook.md`

- [ ] **Step 1: RED do import.** Dado export legado com dois atores, exigir mesma ordem, role, conteúdo sanitizado e autoria no novo formato.
- [ ] **Step 2: Implementar export completo interno.** Adicionar ao `WorkspaceAgent` um método RPC não roteado publicamente que exporta todos os atores, mensagens, turnos e vínculos necessários do workspace. O endpoint atual `/history/export`, filtrado por ator, não serve para migração completa.
- [ ] **Step 3: Implementar import interno.** Ler o export administrativo do `WorkspaceAgent` do mesmo workspace por stub interno, transformar para `UIMessage` + ledger de autoria e persistir no `FinanceChatAgent`. Nenhum payload passa pelo browser.
- [ ] **Step 4: Tornar idempotente.** Marker/version/hash no novo DO impede duplicação. Import parcial retoma deterministicamente ou faz rollback transacional antes de tentar novamente.
- [ ] **Step 5: Não migrar trabalho em voo.** Workspace com turn `queued/running` fica bloqueado até estabilizar; não executar novamente side effects legados.
- [ ] **Step 6: Validar rollback.** O import não altera o DO antigo. Falha ou rollback da UI deixa export e rotas legadas disponíveis.
- [ ] **Step 7: Registrar prova.** Runbook contém dry-run, contagens antes/depois, hash sem conteúdo sensível, rollback e consent gate de produção.

## Task 9: Ativar workspace global no shell

**Files:**
- Modify: `apps/pwa/src/components/RootProviders.tsx`
- Create: `apps/pwa/src/components/WorkspaceSwitcher.tsx`
- Modify: `apps/pwa/src/components/PageHeader.tsx`
- Modify: `apps/pwa/src/features/home/HomePage.tsx`
- Modify: `apps/pwa/src/features/profile/WorkspaceSheet.tsx`
- Modify: `apps/pwa/src/lib/auth/workspace-context.tsx`
- Modify: `apps/pwa/src/lib/auth/workspace-context.test.tsx`
- Create: `apps/pwa/src/components/__tests__/WorkspaceSwitcher.test.tsx`

- [ ] **Step 1: RED da composição.** Exigir `AuthGate > WorkspaceProvider > AppStateProvider`, para que workspace seja conhecido antes de carregar estado financeiro.
- [ ] **Step 2: Montar provider e remount.** Preservar o key por workspace, fechamento de sockets e limpeza de snapshots/perfil antes de liberar o novo estado.
- [ ] **Step 3: Criar switcher compacto.** Integrar em `PageHeader` e no hero customizado de `HomePage`; action buttons existentes continuam acessíveis sem colisão.
- [ ] **Step 4: Reusar `WorkspaceSheet`.** O chip abre seleção/membros; não duplicar CRUD em outro componente.
- [ ] **Step 5: Estados de UX.** Loading, nenhum workspace, acesso revogado, erro offline e nomes longos não causam flash de dados antigos nem overflow em 320px.
- [ ] **Step 6: Adversarial.** Troca durante request, troca durante stream TED, membership revogada, workspace removido em outra aba e navegação com formulário dirty.

**Focused verification:**
```bash
pnpm --dir apps/pwa exec vitest run src/lib/auth/workspace-context.test.tsx src/components/__tests__/WorkspaceSwitcher.test.tsx
```

## Task 10: Substituir transcript por chat TED global

**Files:**
- Create: `apps/pwa/src/features/ted/TedChat.tsx`
- Create: `apps/pwa/src/features/ted/TedChatLauncher.tsx`
- Create: `apps/pwa/src/features/ted/TedMessage.tsx`
- Create: `apps/pwa/src/features/ted/TedApprovalCard.tsx`
- Create: `apps/pwa/src/lib/api/agent-auth.ts`
- Modify: `apps/pwa/src/components/AppShell.tsx`
- Modify: `apps/pwa/src/features/profile/ProfilePage.tsx`
- Modify: `apps/pwa/src/lib/api/agent-client.ts`
- Modify: `apps/pwa/package.json`
- Modify: `apps/pwa/wrangler.jsonc`
- Test: `apps/pwa/src/features/ted/__tests__/TedChat.test.tsx`
- Test: `apps/pwa/src/components/__tests__/TedChatLauncher.test.tsx`
- Modify: `apps/pwa/src/lib/api/agent-client.test.ts`

- [ ] **Step 1: RED do client SDK.** Exigir `useAgent({ agent: "FinanceChatAgent", name: workspaceId })` e `useAgentChat`, token async de conexão, token novo por turno em metadata/header efêmero, `syncMessagesToServer=false` e reconnect ao mudar workspace.
- [ ] **Step 2: Configurar lifecycle do token.** Definir `cacheTtl` menor que 120 segundos (90 segundos), incluir identidade autenticada/auth epoch e `workspaceId` em `queryDeps`, e obter token novo após disconnect. Testar logout/login com outro usuário, troca de workspace, expiração em conexão ociosa e duas abas.
- [ ] **Step 3: Instalar client SDK na PWA.** Adicionar `agents`, `@cloudflare/ai-chat`, `ai` e `@ai-sdk/react` ao workspace PWA, usando as mesmas versões compatíveis do Worker.
- [ ] **Step 4: Criar única superfície responsiva.** Launcher flutuante acima do bottom nav; chat fullscreen abaixo de 640px e painel em desktop. Respeitar `env(safe-area-inset-*)`, keyboard viewport e focus trap.
- [ ] **Step 5: Implementar estados reais.** Connecting, ready, submitted, streaming, recovering, error, rate limited e provider unavailable. Disponibilizar stop/retry e não duplicar mensagem otimista após reconnect.
- [ ] **Step 6: Renderizar autoria e tools.** Texto por parts, ator do workspace, tools em progresso/resultado e approval card acessível. Não renderizar HTML do modelo sem sanitização.
- [ ] **Step 7: Preservar privacidade.** Export/delete/access-log usam métodos server-side autorizados; membros não recebem botão de clear global.
- [ ] **Step 8: Remover UX legada.** Trocar `Chat com Pi (WhatsApp)` por TED; `AgentTranscript` deixa de ser superfície ativa e só é removido após paridade de testes.
- [ ] **Step 9: Configurar origem.** Adicionar `NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL` em ambientes locais/staging/produção, sem usar `../pi-finance-web`.
- [ ] **Step 10: Mobile/accessibility.** Testar 320px, 390x844 e desktop; tab order, Escape no desktop, close explícito no iOS, aria-live de stream sem anunciar cada token e contraste.

**Focused verification:**
```bash
pnpm --dir apps/pwa exec vitest run src/features/ted/__tests__/TedChat.test.tsx src/components/__tests__/TedChatLauncher.test.tsx src/lib/api/agent-client.test.ts
pnpm --filter pwa typecheck
```

## Task 11: Criar painel admin global de providers e modelos

**Files:**
- Create: `apps/pwa/src/lib/api/admin-agent-llm-config.ts`
- Create: `apps/pwa/src/features/profile/AgentLlmSettingsSheet.tsx`
- Modify: `apps/pwa/src/features/profile/ProfilePage.tsx`
- Test: `apps/pwa/src/lib/api/admin-agent-llm-config.test.ts`
- Test: `apps/pwa/src/features/profile/__tests__/AgentLlmSettingsSheet.test.tsx`

- [ ] **Step 1: RED de visibilidade.** Usuário comum não vê entrada de configuração. Resposta 403 não revela catálogo, provider ativo nem estado de credencial.
- [ ] **Step 2: Implementar painel.** Admin sincroniza catálogo Zen/Go/OpenAI API, classifica protocolo/privacy, habilita modelos compatíveis, escolhe o default global, controla `disabled|canary|all` e vê version/updatedAt/updatedBy. O provider de assinatura mostra catálogo somente após o gate e nunca se habilita por descoberta automática. IDs sem classificação continuam apenas como candidatos.
- [ ] **Step 3: Não aceitar credencial.** Para providers diretos, mostrar o alias esperado e status `provisionada/não provisionada` obtido por probe. Para assinatura, mostrar somente `not_configured|ready|reauth_required|blocked`, plano/workspace sanitizado quando disponível e link ao runbook operacional; sem campo de API key, login, cookie, access token ou refresh token.
- [ ] **Step 4: Confirmar troca global.** Antes de ativar modelo, mostrar impacto global e política de retenção; update concorrente recebe 409 e exige refresh.
- [ ] **Step 5: Testar conexão.** Probe não envia conversa real, não retorna corpo upstream e diferencia missing secret, auth, billing, rate limit, protocol mismatch e timeout.
- [ ] **Step 6: Adversarial.** DOM injection por model ID, usuário chamando API manualmente, resposta stale, provider removido enquanto sheet aberta e enum desconhecido.

## Task 12: E2E, staging, rollout e documentação

**Files:**
- Create: `apps/pwa/e2e/specs/ted-chat-workspaces.spec.ts`
- Create: `apps/pwa/e2e/specs/admin-agent-llm-config.spec.ts`
- Create: `docs/ops/agent-llm-secret-provisioning.md`
- Create: `docs/ops/agents-sdk-rollout.md`
- Modify: `docs/PRODUCT.md`
- Modify: `docs/ARCHITECTURE-CURRENT.md`
- Modify: `docs/ARCHITECTURE-TARGET.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/architecture/runtime-facts.json`
- Modify: `docs/adr/005-generated-agent-tools.md`
- Modify: `docs/adr/009-global-agent-llm-configuration.md`

- [ ] **Step 1: E2E local determinístico.** Usar provider fake controlado para provar login, troca de workspace, conversa compartilhada, isolamento, stream/reconnect, approval e configuração admin sem gastar tokens.
- [ ] **Step 2: E2E móvel.** Playwright em viewport iPhone prova fullscreen, safe area, teclado, scroll para última mensagem, stop e retomada.
- [ ] **Step 3: AppSec.** Revisar JWTs em URL/logs, CORS/WebSocket origin, SSRF, IDOR, CSRF dos endpoints admin, secret leakage, prompt injection e tool authorization. Qualquer finding high/critical bloqueia deploy.
- [ ] **Step 4: Preparar staging.** Como o startup aplica migrations automaticamente, obter backup gate antes do primeiro restart/deploy da API com V034/V035. Configurar `AGENT_RUNTIME_ORIGIN` fixo e provisionar `AGENT_RUNTIME_ADMIN_TOKEN`, `AGENT_CONNECTION_TOKEN_SECRET`, `AGENT_AUTH_SERVICE_TOKEN`, `AGENT_CONFIG_TOKEN`, o par correspondente `AGENT_DELEGATION_SECRET`/`PI_DELEGATED_TOKEN_SECRET` e pelo menos um de `OPENCODE_ZEN_API_KEY`, `OPENCODE_GO_API_KEY` ou `OPENAI_API_KEY`; adicionar binding/migration `v2`; configurar origem Agent na PWA. Se Task 5A tiver autorização externa e paridade aprovadas, descobrir primeiro a topologia real da VPS, implantar broker isolado, concluir login/reseed por operação autorizada e provisionar `CODEX_BROKER_ORIGIN`, `CODEX_BROKER_ACCESS_CLIENT_ID`, `CODEX_BROKER_ACCESS_CLIENT_SECRET` e `CODEX_BROKER_REQUEST_SIGNING_KEY` somente no Worker.
- [ ] **Step 5: Smoke staging.** Para cada provider habilitável, admin probe verde, resposta real do modelo, tool read, mutation que produz pending operation, approval idempotente, dois usuários no mesmo workspace e cross-workspace negado. OpenAI API e assinatura recebem recibos separados de autenticação/cobrança; falha de um não aciona o outro.
- [ ] **Step 6: Dry-run de histórico.** Comparar contagens/hash, importar workspace canário e confirmar que o DO legado não mudou.
- [ ] **Step 7: Gate de produção.** Apresentar candidate SHA, migrations, secrets por nome sem valor, custo/política de dados, rollback e evidências. Deploy de produção exige autorização explícita do owner.
- [ ] **Step 8: Rollout.** API/config em `disabled` primeiro, novo Agent depois, PWA por último. Ativar `canary` somente para workspaces aprovados e só então `all`. Observar 24h com error rate, reconnect, provider 429/5xx, tool failures, budget e auth denials. `disabled` operacional interrompe novas intenções; incidente de segurança incrementa `securityEpoch`, aborta requests/streams e bloqueia também intenções já fixadas.
- [ ] **Step 9: Rollback exercitado.** Reverter PWA/Worker sem apagar DO novo ou antigo; manter V034 aditiva. Comprometimento exige incrementar `securityEpoch`, rotacionar/revogar a OpenAI API key e credenciais Access/HMAC afetadas, desligar broker/tunnel quando aplicável e executar logout/revogação Codex; desabilitar apenas a configuração não é suficiente.
- [ ] **Step 10: Corrigir documentação somente após prova.** Atualizar fatos canônicos para refletir SDK instalado, classe/binding ativos, número de migrations/rotas e topologia real. Não marcar como entregue antes do staging/prod correspondente.

**Final verification:**
```bash
pnpm docs:lint
pnpm typecheck
pnpm test
pnpm governance:check
pnpm capabilities:check
pnpm write-policy:check
pnpm --filter pi-finance-agent test
pnpm --filter pi-finance-agent typecheck
pnpm --dir apps/agent exec wrangler types --config=wrangler.jsonc --include-runtime=false --check worker-configuration.generated.d.ts
node --test scripts/generate-agent-tools.test.mjs
pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts e2e/specs/ted-chat-workspaces.spec.ts e2e/specs/admin-agent-llm-config.spec.ts
pnpm --filter pwa build:cloudflare
```

Se a Task 5A passar pelo gate de entrada, estes comandos tornam-se obrigatórios e não podem retornar `No projects matched` nem ser pulados na CI candidate:
```bash
pnpm --filter pi-finance-codex-broker test
pnpm --filter pi-finance-codex-broker typecheck
pnpm security:containers
```

## 5. Gates de parada

- Parar na Task 1 se o SDK não permitir autenticação/autoria por turno antes da persistência sem guardar credencial em body, fiber, transcript ou SQLite; resolver o contrato antes da API/UI.
- Parar se a importação seletiva de histórico não puder preservar autoria e direitos de export/delete; não expor `clearHistory` global como atalho.
- Parar se uma tool executar com workspace/actor derivados do LLM ou da PWA.
- Parar se o probe/config exigir API key no browser ou token Cloudflare com permissão ampla dentro da aplicação.
- Parar se o provider selecionado permitir treinamento com dados enviados.
- Parar a trilha `openai-codex-subscription` sem evidência escrita da OpenAI/contrato empresarial que permita o uso multiusuário, se exigir compartilhar conta/credencial, se não oferecer function tools equivalentes ou se depender do WebSocket remoto experimental do Codex app-server. Aprovação interna, probe verde ou flag de banco nunca substituem esse gate. Essa parada não bloqueia `openai-api`.
- Parar se qualquer desenho copiar cache OpenAI/OpenCode/Codex para Cloudflare/PWA/API/PostgreSQL, expuser servidor nativo do cliente ou misturar credencial de transporte com credencial upstream.
- Parar antes de migration/deploy/secret real em staging ou produção quando faltar autorização, backup ou rollback.

## 6. Evidência de conclusão

O executor deve entregar:

- diff limitado aos arquivos desta iniciativa, preservando mudanças alheias;
- outputs dos testes focados RED e GREEN;
- outputs de todos os gates finais;
- lista de secrets apenas por nome e ambiente, nunca valores;
- prova de authz/multitenancy e idempotência;
- screenshots ou traces desktop/iPhone do fluxo TED;
- recibo de migration e deploy, se autorizados;
- contagens/hash da migração de histórico;
- riscos residuais, custo observado e procedimento de rollback.

## 7. Fontes externas verificadas em 2026-08-26

- Cloudflare Chat Agents: <https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/>
- Cloudflare Client SDK: <https://developers.cloudflare.com/agents/communication-channels/chat/client-sdk/>
- Cloudflare cross-domain authentication: <https://developers.cloudflare.com/agents/runtime/operations/cross-domain-authentication/>
- OpenCode Zen endpoints/model catalog: <https://opencode.ai/docs/zen/>
- OpenCode Go endpoints/model catalog: <https://opencode.ai/docs/go/>
- OpenCode providers e OpenAI ChatGPT Plus/Pro browser auth: <https://opencode.ai/docs/providers/>
- OpenCode server e autenticação: <https://opencode.ai/docs/server/>
- OpenCode SDK: <https://opencode.ai/docs/sdk/>
- OpenAI Codex authentication e credential storage: <https://developers.openai.com/codex/auth/>
- OpenAI Codex account auth em automação privada: <https://developers.openai.com/codex/auth/ci-cd-auth.md>
- OpenAI Codex app-server, incluindo status experimental do WebSocket: <https://developers.openai.com/codex/app-server/>
- OpenAI Codex access tokens Business/Enterprise: <https://developers.openai.com/codex/enterprise/access-tokens.md>
- OpenAI Terms of Use: <https://openai.com/policies/terms-of-use/>
- OpenAI data controls: <https://developers.openai.com/api/docs/guides/your-data/>
- Cloudflare Access service tokens: <https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/>

Revalidar essas fontes durante a implementação; APIs, modelos, retenção e disponibilidade podem mudar.
