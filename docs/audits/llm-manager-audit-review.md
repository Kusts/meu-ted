# Revisão independente — Auditorias do LLM Manager

**Data:** 2026-09-05  
**Escopo revisado:** `docs/audits/llm-manager-audit-pwa.md` e `docs/audits/llm-manager-audit-api-agent.md`, confrontados com o código-fonte atual.  
**Validação complementar:** commits `018a4fc` e `b1ac344` (`git diff 783d560..b1ac344`), confrontados com os requisitos operacionais da Fase 0.  
**Método:** revisão estática pontual dos achados C/H, calibração seletiva de M/L, leitura dos testes RED→GREEN, execução das suítes direcionadas e validação do plano consolidado. Nenhuma correção de produção foi implementada nesta revisão.

## Veredito

**APROVADO COM AJUSTES.** A execução deve começar somente após incorporar os ajustes de ordenação e invariantes descritos em [Plano recomendado](#plano-recomendado). Em especial, não expandir o schema para os 12 kinds antes de o Agent suportar cada kind/alias, e não tratar a revalidação de toggles como simples aviso: ela precisa impedir o uso do runtime desabilitado.

## 1. Verificação pontual — PWA

| Achado | Veredito | Evidência independente |
|---|---|---|
| B-C1 | **CONFIRMED — severidade ajustada para HIGH** | `handleCreatePreset` contém três `catch {}` e informa sucesso com o total planejado mesmo quando criar/toggle de modelo falha (`AgentLlmSettingsSheet.tsx:173-220`). Isso cria configuração parcial com sucesso falso, mas não corrupção ou exposição que justifique CRITICAL. |
| B-C2 | **CONFIRMED — severidade ajustada para HIGH** | A PWA exige `activeProviderId/activeModelId`, mas GET admin retorna `RuntimeConfig` com `providerId/modelId`, sem mapper (`admin-agent-llm-config.ts:31-52`; rota API `:97-105`; domínio `llm-config.ts:83-95`). O runtime fica visualmente vazio, porém o impacto é de governança/UI, não de integridade. |
| B-H1 | **CONFIRMED — severidade ajustada para MEDIUM** | Seleções recriam `loadConfig` e causam GET desnecessário (`AgentLlmSettingsSheet.tsx:44-80`), mas as guardas só redefinem provider vazio/inválido; não há o loop de 2–3 GETs para seleção válida alegado no relatório. |
| B-H2 | **CONFIRMED — severidade ajustada para MEDIUM** | O formulário envia `kind: id as never`, enquanto o domínio exige `ALLOWED_KINDS` (`AgentLlmSettingsSheet.tsx:151-170`; `llm-config.ts:10-35,101-114`). A criação custom falha explicitamente para IDs livres; não compromete configuração existente. |
| B-H3 | **CONFIRMED — severidade ajustada para MEDIUM** | A UI permite qualquer alias da lista para qualquer ID e `validateProvider` só valida a allowlist global, não o par kind↔alias (`AgentLlmSettingsSheet.tsx:377-420`; `llm-config.ts:101-114`). É configuração inválida detectável em uso, sem vazamento do valor do segredo. |
| B-H4 | **CONFIRMED — severidade ajustada para MEDIUM** | Delete limpa somente `selectedProviderId`; `selectedProviderModelId` não é limpo (`AgentLlmSettingsSheet.tsx:248-267`). Esse ID alimenta apenas o select de modelo, enquanto criação usa provider e escolhas ativo/fallback são recarregadas; o impacto é visual/estado local. |
| B-H5 | **CONFIRMED — severidade ajustada para MEDIUM** | O select normal armazena `m.id` composto e resolve corretamente; o segundo ramo por `m.modelId` pode escolher o primeiro duplicado somente ao receber valor legado/raw (`AgentLlmSettingsSheet.tsx:122-130,512-532`). É condicionado ao drift B-C2. |
| B-H6 | **CONFIRMED — severidade ajustada para MEDIUM** | Uma escolha de fallback que não encontra modelo vira `null/null`, e a rota interpreta esse par como remoção (`AgentLlmSettingsSheet.tsx:132-145`; API `:345-381`). A perda requer exclusão concorrente sem mudança de versão e atinge o caminho de contingência. |

## 2. Verificação pontual — API e Agent

| Achado | Veredito | Evidência independente |
|---|---|---|
| B-C1 | **CONFIRMED — severidade ajustada para HIGH** | `deleteModel` permite runtime/fallback apontarem para modelo removido, pois ambos os campos não têm FK; `deleteProvider` é direto, mas `runtime.provider_id` e `fallback_provider_id` têm FKs e bloqueiam provider ativo (`llm-config-postgres.ts:394-396,449-451`; `src/read-models/sql/V034...:17-39`; V041). O cenário de provider pendente foi superestimado. |
| B-C2 | **CONFIRMED — CRITICAL mantido** | Toggle só atualiza provider/modelo, sem validar ou versionar runtime (`admin route:137-162`; store `:294-320,398-420`). A rota interna busca por ID e omite/ignora `enabled`, permitindo que o Agent continue usando provider desabilitado (`internal-agent-llm-config.ts:29-89`). |
| B-H1 | **CONFIRMED — HIGH mantido** | O domínio aceita 12 `ALLOWED_KINDS`, a rota persiste esses valores, mas V034 aceita só quatro em `CHECK kind` (`llm-config.ts:1-35`; rota `:269-300`; V034 `:3-16`). Um provider válido para o domínio falha no banco. |
| B-H2 | **CONFIRMED — severidade ajustada para MEDIUM** | POST sem `kind` e com `name` fora do mapa curto cai em `openai-api` (`admin route:269-300`). Porém preset e criação custom da PWA enviam `kind`, logo a afirmação de afetar seis dos nove presets é refutada. |
| B-H3 | **REFUTED como HIGH de CSRF; hardening LOW** | O guard aceita mutação sem `Origin` (`admin route:40-94`), mas o cenário citado exige XSS ou credencial roubada: XSS envia origem válida e uso de token roubado por `curl` não é CSRF. Não exigir Origin indiscriminadamente pode quebrar clientes Bearer; separar política cookie/Bearer é o hardening adequado. |
| B-H4 | **severidade ajustada para LOW** | O store devolve nome de `secretAlias`, não valor de segredo (`llm-config-postgres.ts:55-73`); GET admin exige admin e a rota interna precisa do alias para resolver o segredo (`internal route:16-89`). Falta log explícito de leitura no módulo, mas isso é auditabilidade, não vazamento. |
| B-H5 | **CONFIRMED — severidade ajustada para MEDIUM** | PATCH retorna logo após `setProviderEnabled`, descartando eligibility/secretAlias do mesmo payload (`admin route:303-328`). É silencioso, porém `updateProvider` não é consumido pela PWA atual. |
| B-H6 | **CONFIRMED — HIGH mantido** | API usa `providerId/modelId`, PWA usa `active*` e Agent mascara ambos com ramificações/defaults (`llm-config.ts:83-95`; PWA client `:31-52`; `runtime-config-client.ts:1-76`). O mapper único na API é a correção de contrato apropriada. |
| B-H7 | **severidade ajustada para LOW** | `sync-catalog` não limita itens nem restringe `retention`, mas `retention` é string por contrato e `upsertModel` é parametrizado (`admin route:107-135`; `llm-config.ts:117-130`; store `:422-445`). Lista vazia é no-op válido; sobra hardening de payload, não SQLi. |
| B-H8 | **CONFIRMED — severidade ajustada para MEDIUM** | O catch de `updateRuntime` tenta query legada para qualquer erro (`llm-config-postgres.ts:205-291`). Como isso ocorre após `BEGIN`, PostgreSQL deixa a transação abortada; o retry não funciona sem savepoint, portanto não “perde fallback com sucesso”, mas mascara a causa original e falha. |

## 3. Calibração de MEDIUM/LOW

- **PWA B-M3:** `clearTimeout` no cleanup refuta o cenário de timer disparar depois de fechar. Continua MEDIUM apenas porque fetch já iniciado não pode ser abortado e pode devolver estado obsoleto; implemente com o hook, não como bloqueio P0.
- **API B-M3 (relay):** o relatório inverte a ordem: `clearTimeout(timer)` ocorre *antes* de `res.json()` (`internal-agent-llm-relay.ts:53-100`). O risco real é timeout não cobrir consumo do corpo e timer não ser limpo se `fetch` falhar antes de responder; manter MEDIUM com `finally` e timeout de resposta inteira.
- **API/Agent B-M5 e B-M6:** confirmados. Registry/factory suportam somente `opencode-zen`, `opencode-go` e `openai-api`, contra 12 kinds e 10 aliases na API (`provider-registry.ts:1-44`; `model-factory.ts:21-25,52-62`). Hoje é risco latente porque V034 bloqueia vários kinds; depois de expandir V042, torna-se risco HIGH de regressão se Agent não for entregue antes/junto.

## 4. Coerência cruzada

### Consistências

1. **Drift de runtime:** PWA B-C2 e API B-H6 descrevem o mesmo defeito raiz. A API deve publicar DTOs explícitos; PWA e Agent não devem adivinhar nomes alternativos.
2. **Cadeia kind/alias/provider:** PWA B-H2/B-H3, API B-H1/B-H2 e Agent B-M5/B-M6 são partes de um único contrato quebrado entre formulário, domínio, SQL e Worker.
3. **Estados pós-mutação:** PWA B-H4/B-H6 e API B-C1/B-C2 apontam ausência de invariantes após delete/toggle, não apenas problemas de apresentação.

### Contradições e referências a corrigir

1. A auditoria API classifica `secretAlias` como HIGH, enquanto a PWA corretamente o trata como metadado administrativo; a revisão o reduz a LOW.
2. O cenário PWA B-H4 de excluir provider ativo ignora a FK de `runtime.provider_id`; a exclusão falha hoje. A seleção órfã ainda existe ao excluir provider não ativo.
3. A auditoria API cita `apps/api/read-models/sql/...`; o caminho real é `apps/api/src/read-models/sql/...`.
4. API B-M3 afirma que o timer é limpo após `res.json()`, mas o código o limpa antes.

## 5. Plano recomendado

O plano do Planner tem a direção certa, mas a ordem abaixo é necessária para não introduzir regressões.

### Fase 0 — testes RED e invariantes de runtime

1. **Antes de cada correção, criar o teste RED correspondente.** A suite ampla pode permanecer em P3, mas deixar todos os testes de regressão para P3 viola o TDD exigido pelo projeto.
2. **Toggle/desativação (B-C2):** definir política transacional: rejeitar desativação de item ativo (`409/422 runtime_in_use`) ou limpar/reapontar runtime atomically e incrementar versão. A rota interna também deve recusar provider/modelo não `enabled` como defesa em profundidade; aviso/status não é suficiente.
3. **Delete e pares:** proteger modelo ativo e fallback antes de delete, em transação. Adicionar a validação de domínio `model.providerId === provider.id` em activate e fallback; ambas as rotas hoje aceitam o modelo encontrado por ID sem garantir o par. Isso também corrige o cenário API B-M9.
4. **`updateRuntime`:** preferir remover a compatibilidade de coluna quando todas as migrações são pré-requisito. Se ela for mantida, filtrar `42703` **e** usar `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` antes da query legada; só filtrar o erro não torna o retry possível.
5. Aplicar correções PWA localizadas: preset parcial, ID/kind, seleção órfã e dependências de `loadConfig`. Mover `AbortController` para a extração do hook (Fase 2); mover CSRF para política específica de cookie/Bearer, não para P0 universal.

### Fase 1 — release de schema e contrato, com ordem de deploy

1. **Agent primeiro (ou mesma release atômica):** endpoints, aliases, `PROVIDER_SECRET_MAP`, testes de factory/probe e segredos provisionados para cada kind que V042 permitirá. Alternativamente, não expandir a allowlist/schema além dos kinds efetivamente suportados.
2. **V042 segura:** fazer preflight/backfill de referências órfãs antes de constraints; alinhar `kind`, `eligibility` **e `chk_secret_alias`**, não apenas os dois primeiros. Adicionar proteção também para `runtime.model_id` ativo e preservar o pareamento provider/modelo, além de `fallback_model_id`.
3. **Mapper e tipos neutros:** publicar DTO admin e snapshot interno explícitos no lado API; compartilhar somente tipos/esquemas isomórficos por pacote neutro, nunca importar módulo server-side da API dentro da PWA. Remover os fallbacks defensivos após a janela de compatibilidade.
4. Introduzir Zod incrementalmente para POST providers/models/sync, com mapa kind↔alias e limite de payload.

### Fases 2 e 3

- **Fase 2:** `useAdminLlmConfig`, `isMutating`, AbortController, `ConfirmDialog`, split do store e `formatApiError` permanecem proporcionais e não exigem React Query/Zustand/OpenAPI/ORM/gateway.
- **Fase 3:** completar matriz de testes e observabilidade. Incluir timeout do relay com limpeza em `finally` e cobertura de corpo lento, além de `AbortSignal.timeout` do runtime client; manter timing-safe compare e probe por protocolo.

### Testes e rollout obrigatórios

- Contrato admin e interno com fixtures reais de `RuntimeConfig`/snapshot; PWA deve mostrar runtime ativo.
- Toggle de provider/model ativo: rota interna não pode devolver configuração utilizável após a política escolhida.
- Delete de modelo ativo/fallback e par provider-modelo cruzado: rejeição/limpeza atômica, sem dangling.
- Migration V042 em base com dados legados, referências nulas/órfãs e rollback operacional documentado.
- Matriz por kind habilitado: endpoint, alias permitido, segredo ausente, factory, probe e activation.
- PATCH combinado, preset parcial, fallback concorrente, `updateRuntime` com erro não-42703 e relay com falha antes/depois dos headers.

**Rollout:** deployar suporte Agent compatível antes de liberar novos kinds; executar preflight e migration aditiva/validada; publicar API/mappers; por fim PWA. Não ativar novo provider sem secret provisionado. Migrations de constraint exigem plano de reversão operacional (dados/backfill e rollback de aplicação), não rollback cego do schema.

## 6. Matriz dos dez requisitos operacionais da Fase 0

A validação abaixo agrupa os requisitos sem transformar testes verdes de doubles em prova de produção. **PASS** significa que o comportamento observado atende ao requisito no caminho testado; **PARTIAL** significa que há cobertura ou paridade de persistência insuficiente; **FAIL** significa que o risco permanece no caminho efetivo do Agent/API.

| Requisito | Veredito | Evidência e limite |
|---|---|---|
| R1. `updateRuntime` só tenta compatibilidade em `42703`, com savepoint | **PASS no caminho testado** | O teste Postgres mockado cobre erro não-`42703` sem retry e `42703` com `ROLLBACK TO SAVEPOINT`; a transação real ainda requer teste de integração com PostgreSQL. |
| R2. Desativar provider/modelo ativo ou fallback deve impedir uso do runtime | **FAIL para liberação** | A suíte in-memory cobre 409, mas a política precisa ser revalidada atomically no store persistente; a rota interna ainda ignora `enabled` e o Agent reconstrói IDs de runtime. Este é o B-C2 CRITICAL. |
| R3. Excluir provider/modelo ativo ou fallback sem dangling | **PARTIAL** | Há testes para ativo e proteções in-memory; falta teste explícito de delete de modelo fallback e a persistência não pode depender apenas de FKs ausentes em `runtime.model_id`/`fallback_model_id`. |
| R4. Activate deve rejeitar par provider/modelo cruzado | **PASS no contrato de rota** | Teste Fastify retorna 422 `agent.activation_blocked` com razão de pertencimento; falta fixture equivalente contra a implementação persistente. |
| R5. Fallback deve rejeitar par provider/modelo cruzado | **PASS no contrato de rota** | Teste Fastify retorna 422 para o par cruzado; manter a validação junto da atualização versionada do runtime. |
| R6. PATCH de provider deve preservar campos combinados e política de 409 | **PARTIAL** | O teste cobre `enabled + eligibility`; falta assert direto para `secretAlias` e para `reason` no delete/PATCH em todos os caminhos. |
| R7. Preset parcial deve sinalizar erro e não falso sucesso | **PASS PWA** | Teste com falha na criação do segundo modelo mostra `Preset parcial` e não mostra sucesso de quatro modelos. |
| R8. Criação custom não deve aceitar ID arbitrário como kind | **PASS comportamental; dívida de tipo** | ID desconhecido é bloqueado sem rede por uma única allowlist; permanece `as never`, que deve ser removido com tipo/contrato compartilhado. |
| R9. Delete/troca de provider deve resetar seleções dependentes | **PASS PWA** | Testes cobrem delete com fallback e troca para provider diferente; falta assert explícito independente para `activeModelChoice`. |
| R10. `loadConfig` deve ser estável e não refazer GET por seleção | **PASS PWA** | Callback usa refs e dependências vazias; teste confirma um único fetch após troca de provider. |

## 7. Política 409 e coerência dos erros

Os cinco endpoints de mutação avaliados — toggle de provider, toggle de modelo, PATCH de provider e deletes de provider/modelo — mapeiam conflitos de runtime para HTTP `409` com `code: agent.runtime_in_use`. As razões observadas são `active_provider`, `fallback_provider`, `active_model` e `fallback_model`; há fallback textual `runtime_in_use` quando a exceção não informa razão.

A política é coerente no código e nos testes direcionados, mas a cobertura de contrato não é completa: o teste de delete-provider verifica o `code`, não a `reason`, e os testes de rota usam o store in-memory. Antes da liberação, repetir a matriz contra PostgreSQL e afirmar `code`, `reason`, ausência de mutação e incremento/versionamento do runtime em concorrência.

## 8. TDD, escopo e resultados de execução

### TDD e lacunas de cobertura

- `apps/api/tests/agent/llm-config-phase0-red.test.ts`: **8/8** testes aprovados. Cobre savepoint, erros `42703`/não-`42703`, toggle ativo/fallback, caminho não referenciado e delete ativo. Não cobre explicitamente delete de modelo fallback; o teste de pair nesse arquivo é placeholder.
- `apps/api/tests/routes/admin-agent-llm-config-phase0.test.ts`: **9/9** testes aprovados. Cobre activate/fallback cruzados, toggles ativo/fallback, deletes, PATCH combinado e snapshot interno disabled. O teste disabled aceita `runtime.providerId` presente e não exercita o cliente Agent, portanto não prova fail-closed.
- `apps/pwa/src/features/profile/__tests__/AgentLlmSettingsSheet.phase0.red.test.tsx`: **5/5** testes aprovados. Cobre preset parcial, kind desconhecido sem rede, resets e ausência de refetch; não afirma isoladamente a seleção ativa.

Os nomes `RED→GREEN` documentam a intenção TDD e os testes estão verdes contra o estado atual, mas a maior parte dos invariantes API usa doubles in-memory. Isso reduz a força da evidência para o store PostgreSQL, migrações, concorrência e integração real com o Agent.

### Comandos executados

| Comando | Resultado | Observação |
|---|---|---|
| `pnpm --dir apps/api exec vitest run tests/agent/llm-config-phase0-red.test.ts` | **PASS — 8/8** | Warning não bloqueante de opção `esbuild` depreciada no plugin Vitest. |
| `pnpm --dir apps/api exec vitest run tests/routes/admin-agent-llm-config-phase0.test.ts` | **PASS — 9/9** | Warning não bloqueante de opção `esbuild` depreciada no plugin Vitest. |
| `pnpm --dir apps/pwa exec vitest run src/features/profile/__tests__/AgentLlmSettingsSheet.phase0.red.test.tsx` | **PASS — 5/5** | Sem falhas ou warnings relevantes. |
| `pnpm typecheck` | **PASS** | API, PWA, Agent e Codex Broker sem erros; apenas `DEP0190` do runner com `shell: true`. |
| `pnpm lint` | **PASS — 0 erros** | 8 warnings fora do LLM Manager, em helpers E2E, Accounts, Cards e TED. |
| `pnpm docs:lint` | **PASS — 8 documentos, 0 issues** | Relatório documental consistente. |
| `pnpm governance:check` | **PASS** | Nenhuma alteração D01–D19 detectada. |
| `pnpm test` completo | **NÃO EXECUTADO nesta revisão** | As conclusões de teste são das três suítes direcionadas; não tratar como aprovação da suíte completa. |

### Escopo do range

A revisão do range fixo encontrou 10 arquivos de implementação/teste concentrados em API e PWA, sem migration nova, sem alteração em `apps/agent` e sem evidência de itens de Fase 2 como `AbortController`, `ConfirmDialog`, novo hook ou store dividido. O único arquivo alterado nesta sessão é este relatório; não houve correção de código, migration, deploy ou operação destrutiva.

## 9. Riscos residuais e condição de liberação

1. **CRITICAL:** provider/modelo desabilitado ainda pode ser reconstruído pelo Agent a partir dos IDs do runtime; o snapshot interno precisa ser inutilizável ou a ativação precisa ser bloqueada no caminho persistente.
2. **HIGH:** API/PWA/Agent usam DTOs e nomes de campos diferentes; defaults defensivos mascaram drift e podem ativar configuração errada.
3. **HIGH:** V042 pode tornar configuráveis kinds que `provider-registry`/`model-factory` não executam; suporte do Agent deve preceder ou acompanhar a migration.
4. **HIGH:** ausência de FK/invariante para modelos runtime permite dangling em delete; validar ativo e fallback na mesma transação.
5. **MEDIUM:** presets podem terminar parcialmente; a PWA já sinaliza o erro, mas falta estratégia de compensação/reconciliação.
6. **MEDIUM:** retry legado de `updateRuntime` só é seguro com savepoint; qualquer fallback sem rollback local deixa a transação abortada.
7. **MEDIUM:** testes direcionados verdes usam in-memory/mocks e não substituem PostgreSQL, migration V042, concorrência, corpo lento do relay ou E2E do Agent.
8. **LOW/MEDIUM:** `as never`, alias sem vínculo ao kind e asserts incompletos mantêm dívida de contrato e podem reabrir o problema em novos presets.

A condição mínima para liberar a execução é: testes RED adicionais para os gaps acima; store PostgreSQL coberto; snapshot interno fail-closed; contrato DTO único; suporte Agent/kinds alinhado; preflight/migration validada; e execução da suíte `pnpm test` completa. Até lá, o veredito permanece **APROVADO COM AJUSTES**, não “pronto para produção”.

## Conclusão

Os dois relatórios encontraram riscos reais e convergem nos defeitos de contrato e invariantes. As suítes direcionadas, typecheck, lint, docs lint e governance check estão verdes, mas não eliminam as lacunas de persistência e integração registradas. A execução é recomendada após os ajustes acima: a prioridade máxima é impedir que toggle/delete deixem runtime utilizável de forma indevida e impedir que V042 torne configuráveis providers que o Agent não consegue executar.
