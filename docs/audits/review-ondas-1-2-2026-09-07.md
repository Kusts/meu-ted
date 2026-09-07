# Auditoria estática — Ondas 1–2

**Data:** 2026-09-07  
**Escopo:** `05f0a05..4c25807` na branch `main`  
**Dispatch Orca:** tarefa `task_3f241fc63a7c`, dispatch `ctx_049e1c35198e`, run `run_5bbc09039da4`  
**Veredito:** **REPROVADO para aceite imediato**

## 1. Escopo, método e limitações

Foram revisados somente os 10 commits do intervalo informado (`adeb5aa` até `4c25807`), totalizando 105 arquivos e aproximadamente `+6215/-950` linhas. `git diff --check` passou. As alterações locais em `.gitignore`, `apps/pwa/src/components/PageHeader.tsx` e `apps/pwa/src/components/__tests__/PageHeader.test.tsx` foram excluídas e não foram atribuídas ao intervalo.

A revisão foi estática, baseada no diff, código, contratos, SQL, referências e testes existentes. **Não houve validação runtime, staging, browser real, Durable Object SQLite real, provider upstream, streaming E2E ou fluxo financeiro E2E**; testes unitários de helpers/configuração não são tratados como prova dessas integrações.

Não foram atribuídos ao intervalo problemas preexistentes de bridge, `API_ORIGIN`, cache geral de token, CI, `pnpm-workspace.yaml` ou `apps/agent/src/tools/api-client.ts`. Os aliases allowlisted, segredos mantidos em `process.env`, respostas mascaradas, fixtures `sk-*` de teste e o broker Codex protegido foram considerados na análise.

## 2. Resumo executivo

A entrega contém partes corretas: migrações V045/V046 aditivas, contrato básico de árvore de categorias, validação XOR de origem no endpoint, membership server-side, renomeação/CI, marca e acessibilidade básica. Porém, há falhas críticas ou altas em anti-replay não consumido, fallback permissivo de workspace, policy/approval de mutações, exclusão em cascata sem reversão de saldo, caminho de compra à vista no cartão, relay/failover de LLM, rollout/canary/security epoch e concorrência de statements/defaults.

As falhas abaixo impedem o aceite porque podem permitir replay/isolamento incorreto, mutação sem aprovação efetiva ou corrupção de dados financeiros. A recomendação é corrigir os itens CRITICAL/HIGH, adicionar testes de integração com PostgreSQL/DO e repetir a revisão antes de qualquer ativação de produção.

## 3. Achados priorizados

### CRITICAL

#### C-01 — Anti-replay implementado, mas não consumido no Worker

- **Critério relacionado:** 7; segurança transversal.
- **Localização:** `apps/agent/src/auth/connection-token.ts:106-147` (`consumeAgentToken`); nenhuma chamada produtiva encontrada em `apps/agent/src`.
- **Impacto:** a tabela/endpoint de consumo e o `jti_hash` não são usados no caminho produtivo. Um token de conexão válido pode ser reapresentado durante sua janela de validade, tornando o anti-replay declarado apenas uma API auxiliar e não um controle efetivo.
- **Sugestão:** consumir o `jti` exatamente uma vez após validar assinatura, membership e workspace e antes de aceitar conexão/turno/tool; tratar HTTP 409 como replay; cobrir o caminho real com PostgreSQL/DO e concorrência.

#### C-02 — Resolução de alias de workspace falha aberto

- **Critério relacionado:** 7.
- **Localização:** `apps/agent/src/auth/workspace-alias.ts:6-25`, especialmente `:22-25`.
- **Impacto:** falha de rede, resposta inválida ou ausência de canonical ID retorna o `workspaceId` recebido. Em vez de negar o contexto, o Worker pode continuar com um identificador não canônico, fragilizando isolamento, associação de histórico e mutações.
- **Sugestão:** falhar fechado com erro 503/401 quando a resolução não confirmar o canonical; não aceitar o alias original como fallback; testar timeout, resposta sem ID e erro do endpoint.

#### C-03 — Capabilities e approvals não formam um gate fail-closed de mutação

- **Critério relacionado:** 1, 7; integridade financeira.
- **Localização:** `apps/agent/src/index.ts:29-31,542-545`; `apps/agent/src/tools/api-tool-helpers.ts:1-2`; `apps/agent/src/generated/http-tools.ts:3772-3775`; `apps/agent/src/safety/tool-approvals.ts:8-18`; `apps/api/src/routes/transactions-write.ts:120-127`.
- **Impacto:** `financial.write` é capability padrão e os wrappers gerados retornam `null` de policy. `transactions-write` não cria pending approval; vários endpoints só aplicam approval quando `approvalPolicy` e `pendingStore` estão presentes. `deactivate_category` também não está no mapa de approvals obrigatórios. Assim, aprovação fresca não é garantida pelo executor.
- **Sugestão:** default do Worker deve ser read-only; toda mutação deve passar por policy/approval obrigatório e fail-closed, inclusive quando store/policy estiver ausente; registrar intenção, approval, actor, workspace e idempotency key no mesmo fluxo; incluir todas as tools destrutivas e mutações financeiras.

#### C-04 — Cascade de categoria soft-deleta transações sem reverter saldo

- **Critério relacionado:** 6; integridade financeira.
- **Localização:** `apps/api/src/writes/postgres.ts:353-405`, especialmente `:398-404`; comparação com `:613-644`.
- **Impacto:** o modo `cascade` executa `UPDATE transactions SET deleted_at = NOW()` diretamente. O fluxo normal `softDeleteTransaction` primeiro reverte saldo de despesa, receita ou transferência, mas a cascata não faz essa compensação; saldos podem permanecer incorretos embora os lançamentos desapareçam das leituras.
- **Sugestão:** reutilizar uma rotina balance-aware dentro da mesma transação para cada lançamento, ou proibir cascade até existir compensação de saldo, auditoria e undo consistentes.

### HIGH

#### H-01 — Compra à vista originada em cartão perde o caminho de fatura

- **Critério relacionado:** 5.
- **Localização:** `apps/pwa/src/components/NewTransactionSheet.tsx:415-430`; `apps/pwa/src/components/AppShell.tsx:210-233`; `apps/api/src/routes/transactions-write.ts:101-112`; `apps/api/src/writes/postgres.ts:419-449`.
- **Impacto:** a UI escolhe cartão, mas envia somente `accountId: originId`; no AppShell, a compra 1x segue `addTransaction`/`createExpense`, não `/cards/purchases`. A API normaliza `cardId` para `accountId`, sem criar statement/card purchase. O gasto pode não aparecer na fatura nem respeitar sua semântica de limite/fechamento. A mesma superfície permite receita com cartão, que também cai em `createIncome` genérico.
- **Sugestão:** preservar o tipo de origem até o executor; compra no cartão deve chamar o CardStore mesmo em 1x; rejeitar receita/transferência com cartão; manter a validação 422 no boundary e testar conta, cartão, ambos, nenhum e compra 1x.

#### H-02 — Relay buffered não tem paridade de providers, nomes upstream ou classificação de retry

- **Critério relacionado:** 2 e 3.
- **Localização:** `apps/api/src/routes/internal-agent-llm-relay.ts:6-8`; `apps/agent/src/finance-chat-agent.ts:791-870`; `apps/agent/src/llm/failover.ts:19-45,69-82`.
- **Impacto:** o relay aceita apenas `opencode-zen`/`opencode-go`, embora o catálogo inclua `openai-api`. O caminho buffered envia `snapshot.model_id`/`fallback_model_id`, que são IDs de configuração, enquanto o caminho direct resolve nome upstream. O buffered tenta fallback para qualquer resposta não-OK, não usa `isRetryableLlmError`, engole falhas do fallback e pode retornar o erro primário sem explicar a segunda falha. Falhas assíncronas depois da criação de stream também não são necessariamente capturadas pelo `try` externo.
- **Sugestão:** unificar direct, buffered, legado e streaming em um executor de attempts que resolva o par provider/protocol/model concreto, aplique a mesma classificação timeout/429/5xx/401/403, limite tentativas a uma primária + uma distinta e produza erro composto sanitizado; adicionar paridade real de OpenAI antes de habilitá-lo.

#### H-03 — `rolloutMode`, canary e `securityEpoch` são serializados, não aplicados

- **Critério relacionado:** 2 e 3.
- **Localização:** `apps/api/src/agent/runtime-mapper.ts:9-20`; `apps/agent/src/llm/runtime-config-client.ts:80-89`; `apps/agent/src/finance-chat-agent.ts:368-385`; `apps/api/src/agent/llm-config-memory.ts:278-310`.
- **Impacto:** o DTO converte qualquer modo diferente de `all` em `activeRolloutPercentage: 0`, mas o executor não seleciona canário por allowlist/percentual nem bloqueia explicitamente `disabled`. O `security_epoch` é persistido no snapshot, porém não é comparado à autoridade durante o turno nem usado para abortar streams já em andamento. A configuração pode aparentar canário/disabled/revogação sem efeito operacional.
- **Sugestão:** aplicar rollout no executor com seleção determinística e fail-closed; `disabled` deve impedir novas inferências; consultar/verificar epoch por turno e cancelar stream quando houver divergência; testar all/canary/disabled, allowlist vazia e incremento durante uma requisição.

#### H-04 — Statements de cartão podem duplicar sob concorrência

- **Critério relacionado:** 3 e 4; integridade financeira.
- **Localização:** `apps/api/src/cards/postgres.ts:259-275,351-365`; `apps/api/src/read-models/sql/V004__cards.sql:15-28`.
- **Impacto:** o código faz `SELECT` e, se vazio, `INSERT` de statement. Sem constraint única efetiva por `(household_id, account_id, cycle_year_month)` e sem upsert, duas compras concorrentes podem criar duas faturas para o mesmo ciclo e repartir/duplicar totais.
- **Sugestão:** criar constraint única aditiva e usar `INSERT ... ON CONFLICT ... DO UPDATE/NOTHING` seguido de SELECT; testar duas transações concorrentes e recálculo idempotente.

#### H-05 — Cache de token de conexão do Agent não é limpo no logout

- **Critério relacionado:** 7.
- **Localização:** `apps/pwa/src/lib/api/agent-auth.ts:8-12,22-50`; `apps/pwa/src/lib/session.ts:16-17,39-93`.
- **Impacto:** existe `clearAgentConnectionTokenCache`, mas a análise de referências encontrou apenas a definição e teste. A limpeza de sessão remove token/snapshot/perfil/memória, mas não invalida esse bearer em memória; após logout/troca de usuário ou workspace, o cliente pode reutilizar token anterior até expirar.
- **Sugestão:** chamar `clearAgentConnectionTokenCache()` no fluxo central de logout, 401 e troca de workspace; cobrir logout seguido de login de outro usuário e troca rápida de workspace.

#### H-06 — Listagem remota de modelos no API não bloqueia redirect

- **Critério relacionado:** 1 e 3.
- **Localização:** `apps/api/src/agent/llm-credentials.ts:204-212`; contraste com `apps/agent/src/llm/remote-models.ts:41-49` e `model-factory.ts:23-35`.
- **Impacto:** o caminho do API usa `fetchImpl` diretamente e não configura `redirect: 'error'` nem rejeita explicitamente 3xx. Um upstream mal configurado pode criar uma superfície de encaminhamento do header `Authorization` com bearer para outro destino, contrariando o requisito de não vazamento.
- **Sugestão:** usar o mesmo safe fetch/guard de redirect do Agent, manter URLs exclusivamente do catálogo allowlisted e testar redirect cross-origin com header de credencial.

#### H-07 — Token delegado não é vinculado a dispositivo e histórico confia em headers

- **Critério relacionado:** 7.
- **Localização:** `apps/agent/src/delegated-token.ts:11-22,42-45`; `apps/agent/src/finance-chat-agent.ts:1044-1056`.
- **Impacto:** `DelegatedTurnClaims` contém actor/workspace/capabilities/request, mas não `deviceId`. O endpoint `/rpc/history` aceita `x-agent-actor` e `x-agent-workspace` como entradas da requisição e faz filtragem defensiva por esses valores; isso não substitui autenticação/claims verificadas e deixa uma fronteira frágil para atribuição de histórico e replay entre dispositivos.
- **Sugestão:** incluir device/session binding no claim e validar assinatura, actor, workspace e device em cada RPC; derivar identidade do contexto autenticado, não de headers livres; adicionar testes de spoof cross-workspace/device.

#### H-08 — Alias de provider OpenAI diverge entre PWA, seed e contratos

- **Critério relacionado:** 1 e 3.
- **Localização:** `apps/pwa/src/lib/llm-presets.ts:29-43`; `packages/llm-contracts/src/types.ts:7-21,50-57`; `apps/api/src/agent/llm-config-memory.ts:58-67`; `apps/agent/src/llm/provider-registry.ts:11-14`.
- **Impacto:** a PWA cria preset `openai`, enquanto seed/catálogo usam `openai-api`; ambos compartilham `OPENAI_API_KEY`, mas podem divergir em kind, protocolo, catálogo e transporte. A configuração pode ser salva como um provider e resolvida por outro, produzindo seleção/failover inconsistente.
- **Sugestão:** escolher um ID canônico (`openai-api`), manter alias explícito somente em uma camada de compatibilidade e normalizar antes de persistir/ativar; cobrir round-trip PWA → API → Agent.

### MEDIUM

#### M-01 — Fallback igual ao primário é aceito e referências de modelo são permissivas demais

- **Critério relacionado:** 3.
- **Localização:** `apps/api/src/agent/llm-config.ts:154-163`; `apps/api/src/agent/llm-config-memory.ts:291-301`; `packages/llm-contracts/src/schemas.ts:29-31,90-96`.
- **Impacto:** `validateRuntimePair` valida cada par, mas não rejeita provider/model iguais entre ativo e fallback. `modelRefSchema` aceita qualquer string até 185 caracteres, enquanto `modelIdSchema` impõe contrato mais restrito; IDs compostos/opaques podem chegar ao snapshot e falhar somente na execução.
- **Sugestão:** validar a invariante de pares distintos e usar um único resolver/schema para IDs persistidos e nomes upstream antes de gravar a configuração.

#### M-02 — Defaults de categorias usam check-then-insert

- **Critério relacionado:** 4 e 6.
- **Localização:** `apps/api/src/writes/postgres.ts:150-204,218-225`.
- **Impacto:** aplicação concorrente de defaults ou criação simultânea da primeira conta pode duplicar macros/subcategorias; não há constraint/upsert correspondente ao matching case-insensitive usado no SELECT.
- **Sugestão:** constraint única por household/kind/parent/nome normalizado ou índice funcional, seguida de `ON CONFLICT`; manter contadores idempotentes sob concorrência.

#### M-03 — FK de subcategoria não garante household, parent ou kind

- **Critério relacionado:** 6.
- **Localização:** `apps/api/src/read-models/sql/V045__category_tree_defaults.sql:26-40`; validações de uso em `apps/api/src/writes/postgres.ts:424-428,555-560`.
- **Impacto:** `subcategory_id REFERENCES categories(id)` garante apenas existência do ID. A relação com o mesmo household, o parent informado e o kind da macro depende do caminho de aplicação; uma escrita direta, rota futura ou bug de update pode criar árvore incoerente.
- **Sugestão:** adicionar constraints/índices compostos ou validação transacional centralizada que imponha household + parent + kind, e cobrir update/move/cross-household.

#### M-04 — Instalações perdem notes/subcategory e o dual-write de cartão é best-effort

- **Critério relacionado:** 4, 5 e 6.
- **Localização:** `apps/pwa/src/components/AppShell.tsx:214-221`; `apps/api/src/routes/cards.ts:206-213`; `apps/api/src/cards/postgres.ts:284-291,373-379`.
- **Impacto:** o formulário coleta `notes` e `subcategoryId`, mas `createInstallments` encaminha somente `categoryId`. Além disso, falha no insert de `card_purchases` é silenciosamente ignorada depois de criar a transação; a fatura pode ficar sem o vínculo auditável esperado.
- **Sugestão:** ampliar contrato de parcelas com notes/subcategory quando suportado, preservar metadata em todas as parcelas e tornar o vínculo card purchase obrigatório ou registrar/reconciliar falha na mesma transação.

#### M-05 — Compra de cartão valida somente existência de categoria

- **Critério relacionado:** 6.
- **Localização:** `apps/api/src/cards/postgres.ts:227-235,325-331`.
- **Impacto:** a compra verifica apenas `id + household_id`; não exige categoria ativa, kind compatível ou relação macro/subcategoria. Categorias inativas ou relações inválidas podem chegar à fatura.
- **Sugestão:** reutilizar o resolvedor de categoria ativo/parent/kind usado nas transações normais e aplicar a mesma regra no CardStore.

#### M-06 — Runner grava checksum de migração, mas não detecta drift

- **Critério relacionado:** 4.
- **Localização:** `apps/api/src/read-models/sql/migrate.ts:71-85,87-105,108-129`.
- **Impacto:** o manifest calcula checksum e `_migrations` armazena o valor, mas `appliedVersions` lê somente `version`; uma migração já aplicada pode ser editada sem falha de startup. V045/V046 são aditivas e idempotentes no texto, mas o controle de integridade histórica fica incompleto.
- **Sugestão:** carregar versão, nome e checksum aplicados, comparar com o manifest e abortar com diagnóstico explícito em caso de drift; adicionar teste de alteração de SQL após aplicação.

#### M-07 — Hash da migração de histórico não inclui workspace

- **Critério relacionado:** 4 e 7.
- **Localização:** `apps/agent/src/migration/legacy-history.ts:51-59`; `LegacyMessage.metadata` inclui workspace em `:36-40`.
- **Impacto:** o hash usa ID, actor, role, data e conteúdo, mas não `workspaceId`. Exportações idênticas em workspaces distintos podem compartilhar hash e gerar decisão de “já migrado”/colisão dependendo do escopo da tabela de migração.
- **Sugestão:** incluir workspace/canonical household no material do hash e manter a chave de migração composta por workspace + actor + hash; testar o mesmo transcript em dois workspaces.

#### M-08 — `sync-catalog` pode aplicar lote parcialmente

- **Critério relacionado:** 3 e 4.
- **Localização:** `apps/api/src/routes/admin-agent-llm-config.ts:218-272`.
- **Impacto:** o loop faz upsert item a item e pode retornar 404 ao encontrar provider desconhecido depois de já ter persistido itens anteriores. O catálogo administrativo pode ficar parcialmente sincronizado, apesar da semântica de batch.
- **Sugestão:** validar todo o lote antes de qualquer escrita e executar upserts em transação; retornar relatório determinístico sem estado intermediário.

#### M-09 — Janela de revogação depende da validade curta, não de invalidação imediata

- **Critério relacionado:** 7.
- **Localização:** `apps/agent/src/auth/connection-token.ts:87-101`; emissão/consumo em `apps/api/src/routes/agent-auth.ts`.
- **Impacto:** o parser limita TTL a 120 segundos e o caminho revalida partes da autorização, mas a ausência de consumo efetivo e de epoch/device binding mantém uma janela residual de uso após revogação.
- **Sugestão:** combinar consumo atômico, epoch/session revocation e revalidação server-side no handshake e em cada turno; testar revoke durante conexão e durante stream.

### LOW

#### L-01 — Prévia de parcela arredonda valor sem expor a distribuição do centavo residual

- **Critério relacionado:** 5.
- **Localização:** `apps/pwa/src/components/NewTransactionSheet.tsx:300-303,773-776`.
- **Impacto:** a prévia usa `Math.round(total/installments)`, enquanto o backend distribui o remainder na última parcela. O total persistido pode estar correto, mas a prévia pode diferir em um centavo da primeira/última parcela.
- **Sugestão:** reutilizar a mesma função de distribuição do contrato ou informar explicitamente que o último valor absorverá o residual; adicionar teste visual/contratual para valores não divisíveis.

#### L-02 — Status de membro ativo e convite pendente são contratos separados

- **Critério relacionado:** 7.
- **Localização:** `apps/api/src/auth/workspaces-store.ts:17-21`; `apps/api/src/auth/workspaces-postgres.ts:132-147`; `apps/pwa/src/features/workspaces/WorkspaceManagerPage.tsx:38-48,155-157`.
- **Impacto:** a listagem de membros retorna somente `status: 'active'` e convites pendentes vivem em outra coleção. Isso atende ao caso de aceitos, mas consumidores que esperem uma lista única com ativo/pendente podem interpretar o contrato incompletamente.
- **Sugestão:** documentar explicitamente a separação ou expor um DTO unificado se o produto exigir uma lista de ciclo de vida única.

## 4. Matriz dos 10 critérios de aceite

| # | Critério | Veredito estático | Evidência e conclusão |
|---:|---|---|---|
| 1 | Nenhuma key/secret em código, log ou fixture; provider-registry mascarado | **PARCIAL** | Não foi encontrado segredo de produção nem retorno/log de valor; aliases e Codex sem secret alias estão corretos (`apps/agent/src/llm/provider-registry.ts:11-30`, `packages/llm-contracts/src/types.ts:50-57`). Porém, o caminho API de modelos remotos não bloqueia redirect (H-06), portanto não há prova estática de não vazamento em toda a superfície. Fixtures `sk-*` foram tratados como valores de teste, não como segredos reais. |
| 2 | Failover na mesma requisição, erro claro, sem loop infinito e métrica sem segredos | **REPROVADO** | O direct tem `executeWithFallback` e classificação retryable (`apps/agent/src/llm/failover.ts:19-82`), mas buffered usa lógica diferente, relay não cobre OpenAI, envia IDs opacos e engole falhas do fallback (H-02). Streaming também não demonstra captura de falhas após a criação do stream. |
| 3 | Modelos dinâmicos com TTL; ativo/fallback persistido e único | **PARCIAL** | TTL de 60s existe (`apps/agent/src/llm/remote-models.ts:5-36`, `apps/api/src/agent/llm-credentials.ts:177-193`) e há runtime singleton/versionado. Não há rejeição de fallback igual ao primário, a validação de referências é divergente (M-01), aliases OpenAI divergem (H-08) e rollout/canary não é aplicado (H-03). |
| 4 | V044/V045/V046 aditivas, idempotentes e sem perda; migrate íntegro | **PARCIAL** | V045/V046 usam `ADD COLUMN IF NOT EXISTS` e preservam linhas (`V045__category_tree_defaults.sql:1-40`, `V046__transaction_notes.sql:1-11`). O runner grava checksum, mas não compara checksum de migrações já aplicadas (M-06); statements/defaults têm races (H-04/M-02). Não foi atribuído ao intervalo o problema histórico de `V009`. |
| 5 | Origem conta XOR cartão na UI/API (422); parcelas só cartão | **REPROVADO** | API rejeita ambos/nenhum com 422 (`apps/api/src/routes/transactions-write.ts:15-46,101-112`) e endpoint de parcelas valida cartão no store. Porém, a UI perde a natureza de cartão no payload e compra 1x segue transação comum (H-01); receita em cartão também não é bloqueada. Metadata de parcelas sofre perda (M-04). |
| 6 | Árvore de categorias, exclusão, defaults e `subcategoryId` compatíveis | **REPROVADO** | GET tree e defaults estão presentes (`apps/api/src/routes/categories.ts:64-84`), e move/cascade existem. A cascata bypassa reversão de saldo (C-04), FK não garante household/parent/kind (M-03) e CardStore valida categoria de forma incompleta (M-05). |
| 7 | Membros aceitos com papel/status, refresh e membership server-side | **PARCIAL** | Membership server-side e lista de membros ativos estão implementados (`apps/api/src/auth/workspaces-postgres.ts:17-36,132-147`); a PWA mantém membros e convites separados (`WorkspaceManagerPage.tsx:38-48`). Anti-replay não é consumido (C-01), alias falha aberto (C-02), logout não limpa bearer (H-05) e token/histórico não têm binding robusto (H-07/M-09). |
| 8 | Rename sem filtros/CI quebrados e sem path absoluto novo | **APROVADO ESTATICAMENTE** | No intervalo, filtros do CI permanecem coerentes com `meu-ted-api`; não foi encontrado novo path absoluto. A conclusão é apenas de leitura do diff, sem executar o CI completo nesta auditoria. |
| 9 | Marca, manifest/metadata, ícones e ausência de “Pi Financeiro” em produção | **APROVADO ESTATICAMENTE** | `apps/pwa/src/app/manifest.ts:13-68` e `apps/pwa/src/app/layout.tsx:23-40` usam Meu Ted; os assets/ícones e strings user-facing foram conferidos. As ocorrências residuais de “Pi Financeiro” ficaram em expectativa de teste (`apps/pwa/src/app/convite/__tests__/ConvitePage.test.tsx:145-149`), não em produção. |
| 10 | Sem regressão de acessibilidade básica | **APROVADO ESTATICAMENTE** | Formulário, categorias e workspaces têm labels, `aria-label`, `aria-expanded`, `aria-pressed`, roles e alertas (`NewTransactionSheet.tsx:520-547,643-696,739-797`; `CategoriesPage.tsx:34-69,301-303,542-570`; `WorkspaceManagerPage.tsx:433-450,507-515`). Não houve validação por leitor de tela/device real. |

## 5. Veredito e condições para novo aceite

**Veredito: REPROVADO.** Os itens C-01 a C-04 e H-01 a H-08 impedem considerar as ondas prontas para aceite ou ativação, principalmente por risco de replay/isolamento, mutações sem approval efetivo e divergência financeira de cartão/categoria.

Antes de nova aprovação:

1. fechar o gate de anti-replay, alias e device/session binding com testes de integração reais;
2. tornar capabilities/approval e `deactivate_category` fail-closed para todas as mutações;
3. corrigir o caminho de cartão 1x/parcelado, cascade balance-aware, metadata e concorrência de statements/defaults;
4. unificar executor de failover/transportes e aplicar rollout, canary e security epoch no runtime;
5. adicionar constraint/upsert e detecção de drift de migrações;
6. repetir suites API/Agent/PWA e executar smoke staging por provider, workspace, logout, replay, cartão 1x, parcelas, cascata e concorrência.

Nenhuma dessas correções foi implementada nesta auditoria.

## 6. Proveniência Orca

O review foi executado no dispatch existente `ctx_049e1c35198e`, tarefa `task_3f241fc63a7c`, run `run_5bbc09039da4`; não foi criado dispatch paralelo. O runtime desta sessão não disponibilizou a capacidade oficial `dcap_...` exigida para `worker_done`; tentativas sem essa capacidade foram rejeitadas, e o supervisor instruiu entregar o relatório diretamente no terminal/arquivo em vez de reenviar o lifecycle. Portanto, este documento é a conclusão técnica do review, mas não reivindica um `worker_done` aceito pelo runtime.
