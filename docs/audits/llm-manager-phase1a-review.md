# Revisão da Fase 1a — LLM Manager

**Commits revisados:** `5a97930` e `192f462`  
**Base/diff efetivo:** `git diff 5a97930^..192f462` (27 arquivos; `git diff 5a97930..192f462` isoladamente contém somente `192f462`, 8 arquivos).  
**Escopo:** contratos LLM compartilhados, DTOs e mappers da API, validação de rotas, snapshot interno fail-closed, consumo pelo Agent, integração da PWA, stores e regressões.  
**Restrição:** nenhuma correção de produção, migration, deploy ou operação destrutiva foi executada nesta revisão.

## Veredito executivo

**APROVADO COM AJUSTES — não pronto para produção.** Os commits corrigem o drift principal de nomes (`active*`), centralizam tipos/enums e removem os casts defensivos proibidos da PWA, com testes direcionados verdes. A liberação continua bloqueada por incompatibilidade entre o contrato de 12 kinds e a migration/registry efetivos, validação incompleta de mutações de runtime e ausência de prova persistente/atômica; além disso, `pnpm test` falha no gate de bundle da PWA.

## 1. Vereditos por requisito da Fase 1a

| # | Requisito auditado | Veredito | Evidência e ressalva |
|---|---|---|---|
| R1 | API publica um DTO explícito, com mapper único, e não expõe `RuntimeConfig` cru | **PASS na implementação; cobertura parcial** | `apps/api/src/agent/runtime-mapper.ts` concentra `toAdminRuntimeDto`/`toInternalRuntimeDto`, usa `activeProviderId`, `activeModelId`, `activeProtocol`, `activeRolloutMode` e remove os nomes legados. Os sete retornos administrativos com `runtime` passam pelo mapper; o snapshot interno também o usa. Faltam asserts dedicados para todos os retornos de rollout, epoch e toggles. |
| R2 | Pacote compartilhado é privado, isomórfico, sem dependência de servidor/ciclo e com subpath sem Zod para consumidores | **PASS, com ressalva de gate** | `packages/llm-contracts` é `private`, `types.ts` não importa servidor e `schemas.ts` depende somente de Zod; `apps/pwa`/Agent usam `@pi-finance/llm-contracts/types`, enquanto a API usa o entrypoint com schemas. `pnpm --filter @pi-finance/llm-contracts typecheck` passou. O gate raiz não inclui esse package como workspace isolado, embora os consumidores o compilem. |
| R3 | Enums, aliases, schemas e limites são validados na origem da API | **PARCIAL — ajuste necessário** | `POST /providers`, `POST /models` e `POST /sync-catalog` usam schemas compartilhados; alias incompatível com kind é rejeitado e sync limita a 100 itens. Porém `rolloutModeSchema` não é usado, e activate/rollout/fallback/PATCH não têm schema Zod completo; `rolloutMode`, `expectedVersion`, allowlist e tipos de patch podem chegar ao store sem validação de runtime. Além disso, o contrato aceita 12 kinds/aliases, mas `V034__agent_llm_configuration.sql` permite somente quatro kinds e aliases de três providers. |
| R4 | Snapshot interno falha fechado para provider/modelo ativo ou fallback disabled/inexistente/cruzado | **PASS no projection path; não provado para produção** | `apps/api/src/routes/internal-agent-llm-config.ts` exige existência, `enabled` e pertencimento do modelo ao provider; retorna slots `null`, zera IDs no DTO e expõe `activeDisabled`/`fallbackDisabled`. Os stores in-memory e Postgres têm guards correspondentes para toggle/delete. Há teste de ativo disabled e fallback válido, mas não há teste explícito de fallback disabled/inexistente nem PostgreSQL real/concorrência. |
| R5 | Agent consome somente o contrato explícito e mantém coerência do snapshot/migração | **PARCIAL** | `apps/agent/src/llm/runtime-config-client.ts` lê somente `runtime.active*`, ignora `providerId`/`modelId` legados e falha quando falta `runtime`; os três testes de contrato passam. A fronteira ainda usa cast de JSON para `Partial<InternalLlmSnapshot>` e defaults permissivos, sem parse Zod; `activeProtocol` arbitrário pode atravessar a tipagem. O `INSERT` de `intention_snapshots` em `apps/agent/src/finance-chat-agent.ts` omite `fallback_provider_id`/`fallback_model_id`, portanto fallback não persiste após a primeira leitura. |
| R6 | PWA usa os tipos compartilhados, presets tipados e não reintroduz casts `as never`/`as unknown` | **PASS direcionado; dívida de tipos residual** | `apps/pwa/src/lib/api/admin-agent-llm-config.ts` usa `AdminRuntimeDto`, `llm-presets.ts` usa enums compartilhados, `AgentLlmSettingsSheet.tsx` usa `isProviderKind`/`isProtocol`, e `next.config.ts` transpila o package. Não foram encontrados `as never`/`as unknown` nos arquivos PWA alterados. O tipo de provider ainda deixa `kind`, `transport`, `authMode` e `secretAlias` como strings genéricas; o fixture de contrato usa `as any`. |
| R7 | Stores, dependências e regressões permanecem coerentes e gates sustentam a entrega | **PARCIAL — bloqueia liberação** | Stores in-memory/Postgres têm a mesma intenção de invariantes e o diff não cria ciclo ou publicação externa. Suítes direcionadas passaram, API completa passou, typecheck/lint/docs/governance passaram. `pnpm test` falhou na PWA no teste de bundle budget (`494,75 KB` versus limite `294,74 KB`); não há teste Postgres real, teste atômico de concorrência ou E2E Agent↔API. |

## 2. Achados e riscos residuais

### F1 — CRITICAL/HIGH: contrato de kinds não é executável de ponta a ponta

O package compartilhado declara 12 `ProviderKind` e aliases por kind em `packages/llm-contracts/src/types.ts`. Entretanto:

- `apps/api/src/read-models/sql/V034__agent_llm_configuration.sql` restringe `agent_llm_providers.kind` a `opencode-zen`, `opencode-go`, `openai-api` e `openai-codex-subscription`;
- o mesmo migration aceita aliases somente dos três providers de API atualmente suportados;
- `apps/agent/src/llm/provider-registry.ts` tem endpoints, secrets e resolução somente para esses três kinds;
- a PWA possui presets para `openai`, `anthropic`, `deepseek`, `qwen`, `glm` e `minimax`.

Assim, a rota pode aceitar um payload conforme Zod e o store in-memory pode aparentar sucesso, enquanto o caminho PostgreSQL rejeita a gravação por `CHECK`; se o valor chegar ao Agent, o registry/model factory não consegue resolvê-lo. O contrato, migration e registry precisam ser alinhados atomicamente antes de habilitar esses providers.

### F2 — HIGH: validação de entrada é incompleta nas mutações de runtime

A validação compartilhada é aplicada somente a provider/model/sync-catalog. Em `admin-agent-llm-config.ts`, activate, rollout e fallback recebem objetos tipados apenas em TypeScript; PATCH mescla o body diretamente e mantém casts `as never` na API. Não há schema efetivo para:

- `rolloutMode` inválido;
- `expectedVersion` não inteiro/negativo;
- `canaryAllowlist` com tipo, tamanho ou conteúdo inválido;
- paridade e formato de IDs em todos os caminhos;
- `enabled`, `eligibility` e `secretAlias` do PATCH.

No Postgres isso pode virar erro 500 de constraint/type; no in-memory pode introduzir estado que o banco nunca aceitaria. O schema compartilhado precisa cobrir cada mutação ou a rota deve rejeitar explicitamente antes do store.

### F3 — HIGH: fallback do snapshot de intenção não é persistido

`resolveIntentionSnapshot` monta `fallback_provider_id` e `fallback_model_id` no objeto, mas o `INSERT` usa somente `intention_id, version, provider_id, model_id, protocol, rollout_percentage, security_epoch, created_at`. A primeira chamada retorna o fallback em memória; uma chamada posterior que lê a linha SQLite não o recupera e perde a tentativa de fallback. A criação `CREATE TABLE IF NOT EXISTS` também não atualiza tabelas Durable Object já existentes. Esse caminho precisa de teste e migração/backfill compatíveis antes de considerar fallback confiável.

### F4 — HIGH/MEDIUM: guards de store não são atômicos

Os stores Postgres consultam o runtime e depois executam o toggle/delete em queries separadas. Sob concorrência, outro request pode ativar/trocar o runtime entre o `SELECT` e a mutação, permitindo violar a intenção do guard; a versão otimista de `updateRuntime` não cobre toggle/delete. Os testes atuais usam in-memory/doubles e não provam lock, rollback ou estado inalterado contra corrida.

### F5 — MEDIUM: cliente Agent não valida o DTO em runtime

O cliente faz cast de `res.json()` para `Partial<InternalLlmSnapshot>` e normaliza apenas alguns tipos, aceitando qualquer string como `activeProtocol` e usando defaults para campos ausentes. O comportamento active*-only está correto e fail-closed para IDs ausentes, mas um snapshot malformado não é rejeitado de forma geral. Um schema de snapshot compartilhado (ou validação equivalente) deve separar compatibilidade transitória de aceitação de configuração.

### F6 — MEDIUM: evidência de integração é menor que a cobertura declarada

A suíte nova cobre mapper (5), contrato de rotas (10), cliente Agent (3) e fixture PWA (1), mas não cobre todas as respostas de runtime, fallback disabled/inexistente, item removido entre leitura e consumo, PostgreSQL real, migration existente em Durable Object, concorrência ou fluxo E2E. O teste PWA usa `as any`, reduzindo a prova do tipo compartilhado no próprio guard.

### F7 — MEDIUM: gate de bundle falha no teste completo

`pnpm test` executou API com **139 arquivos / 1.014 testes aprovados**, mas a PWA terminou com **129 arquivos / 1.209 aprovados e 1 falha**. A falha é `src/__tests__/bundle-budget.test.ts`: `equivalent-set` medido em **494,75 KB**, acima do limite **294,735 KB** (baseline 280,7 KB + 5%). O teste emitiu também o warning de compatibilidade do manifest. A causa da diferença precisa ser isolada com build reproducível/baseline antes de liberar; não foi atribuído causalmente aos commits sem essa comparação.

## 3. TDD e cobertura observada

Os testes novos estão nomeados como RED→GREEN e os comportamentos centrais foram convertidos em regressões:

- `apps/api/tests/agent/runtime-mapper.test.ts`: **5/5**;
- `apps/api/tests/routes/admin-agent-llm-config-contract.test.ts`: **10/10**;
- `apps/api/tests/agent/llm-config.test.ts`: **29/29**;
- `apps/api/tests/routes/admin-agent-llm-config.test.ts`: **15/15**;
- `apps/agent/tests/runtime-config-client-contract.test.ts`: **3/3**;
- `apps/pwa/src/features/profile/__tests__/AgentLlmSettingsSheet.contract.test.tsx`: **1/1**.

Isso prova o contrato nominal e alguns casos fail-closed, não a integração persistente. Antes de produção, adicionar testes RED para schemas de rollout/fallback/PATCH, fallback inválido/disabled, Postgres real, corrida toggle/delete/update, snapshot SQLite com fallback e consumo real pelo Agent.

## 4. Resultados dos comandos

| Comando | Resultado |
|---|---|
| `pnpm --dir apps/api exec vitest run tests/agent/runtime-mapper.test.ts tests/agent/llm-config.test.ts tests/routes/admin-agent-llm-config-contract.test.ts tests/routes/admin-agent-llm-config.test.ts` | **PASS — 4 arquivos, 59/59 testes**. Warning não bloqueante de depreciação da opção `esbuild` do Vitest. |
| `pnpm --dir apps/agent exec vitest run tests/runtime-config-client-contract.test.ts` | **PASS — 1 arquivo, 3/3 testes**. |
| `pnpm --dir apps/pwa exec vitest run src/features/profile/__tests__/AgentLlmSettingsSheet.contract.test.tsx` | **PASS — 1 arquivo, 1/1 teste**. |
| `pnpm --filter @pi-finance/llm-contracts typecheck` | **PASS — `tsc --noEmit`**. |
| `pnpm typecheck` | **PASS** em API, PWA, Agent e Codex Broker; warning `DEP0190` do runner com `shell: true`. O script raiz não inclui o package compartilhado como workspace independente. |
| `pnpm lint` | **PASS — 0 erros, 8 warnings preexistentes/não relacionados** em helpers E2E, Accounts, Cards e TED. |
| `pnpm docs:lint` | **PASS** antes e depois deste relatório: 8 documentos, 0 issues. |
| `pnpm governance:check` | **PASS**; nenhuma alteração D01–D19 detectada. |
| `pnpm test` | **FAIL**: API **139/139 arquivos, 1.014/1.014 testes**; PWA **129/130 arquivos, 1.209/1.210 testes**, falha única no bundle budget descrita em F7. O script raiz não executa Agent nem `@pi-finance/llm-contracts`. |
| `git diff --check 5a97930^..192f462` | **PASS**; sem saída. |

## 5. Escopo e estado do working tree

O range efetivo contém 27 arquivos entre API, Agent, PWA, package compartilhado, workspace e testes. Não foram alterados produção, migration ou deploy durante a revisão. A working tree contém somente os relatórios em `docs/audits/`; o arquivo acidental `NUL` criado durante a inspeção foi removido.

## 6. Plano mínimo antes de produção

1. Alinhar `PROVIDER_KINDS`, aliases, migration PostgreSQL, presets e registry/factory do Agent; não liberar kinds que só funcionam em memória.
2. Criar schemas compartilhados para todas as mutações de runtime e remover casts de patch na API.
3. Corrigir e migrar a persistência de fallback nos snapshots Durable Object.
4. Tornar toggle/delete atomicamente condicionais ao runtime, com testes PostgreSQL reais e concorrência.
5. Validar o snapshot Agent na fronteira e testar item inexistente/disabled em active e fallback.
6. Reproduzir e resolver o bundle budget com build limpo e baseline rastreável.
7. Reexecutar `pnpm test`, typecheck, lint, docs/governance e um E2E API → Agent antes de qualquer deploy.

**Conclusão:** a Fase 1a melhora substancialmente o contrato e elimina o drift nominal entre API, PWA e Agent, mas ainda é uma entrega de integração incompleta. O veredito é **APROVADO COM AJUSTES**, sem autorização implícita para produção ou deploy.
