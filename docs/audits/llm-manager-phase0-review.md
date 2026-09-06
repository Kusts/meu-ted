# Revisão da Fase 0 — LLM Manager

**Commits revisados:** `018a4fc` e `b1ac344`  
**Range:** `git diff 783d560..b1ac344`  
**Escopo:** requisitos operacionais da Fase 0, testes RED→GREEN, política HTTP 409, gates técnicos, escopo da mudança e riscos residuais.  
**Restrição:** nenhuma correção de produção foi implementada durante esta revisão.

## Veredito executivo

**APROVADO COM AJUSTES — não pronto para produção.** Os commits cobrem os principais fluxos de UI e adicionam testes direcionados, mas ainda não fecham as garantias no caminho PostgreSQL/Agent: configuração desabilitada pode continuar utilizável, invariantes de delete/toggle não têm prova persistente/atômica e o contrato de runtime permanece divergente entre API, PWA e Agent.

## 1. Vereditos por requisito

| # | Requisito da Fase 0 | Veredito | Evidência e ressalva |
|---|---|---|---|
| R1 | `updateRuntime` só deve usar compatibilidade para `42703`, com savepoint | **PASS no caminho testado** | Teste Postgres mockado cobre repropagação de erro não-`42703` e `ROLLBACK TO SAVEPOINT` antes do fallback `42703`. Falta integração contra PostgreSQL real. |
| R2 | Desativar provider/modelo ativo ou fallback deve impedir uso do runtime | **PARCIAL — bloqueia liberação** | Testes in-memory/rota cobrem `409`, mas a revalidação precisa existir atomically no store persistente. A rota interna ainda ignora `enabled`, e o Agent recompõe IDs do runtime; risco **CRITICAL**. |
| R3 | Excluir provider/modelo ativo ou fallback sem deixar referência dangling | **PARCIAL — bloqueia liberação** | Há proteção/testes para ativo no store in-memory e rota. Falta teste explícito de delete de modelo fallback e proteção persistente para `runtime.model_id`/`fallback_model_id`, que não possuem FK suficiente. |
| R4 | Activate deve rejeitar par provider/modelo cruzado | **PASS no contrato de rota** | Teste Fastify retorna `422` com `agent.activation_blocked` e razão de pertencimento; falta fixture equivalente no caminho PostgreSQL. |
| R5 | Fallback deve rejeitar par provider/modelo cruzado | **PASS no contrato de rota** | Teste Fastify cobre o par cruzado e retorna `422`; manter a validação junto da atualização versionada do runtime. |
| R6 | PATCH de provider deve preservar campos combinados e política de conflito | **PARCIAL** | O teste cobre `enabled + eligibility`; não há assert direto para `secretAlias` nem para `reason` em todos os caminhos de conflito. |
| R7 | Preset parcialmente falho deve informar erro sem falso sucesso | **PASS PWA** | O teste força falha no segundo modelo, exibe `Preset parcial` e não exibe sucesso com quatro modelos. |
| R8 | Criação custom não deve aceitar ID arbitrário como `kind` | **PASS comportamental; dívida de tipo** | ID desconhecido é rejeitado sem chamada de rede por uma allowlist única; permanece `as never`, que deve ser substituído por tipo/contrato compartilhado. |
| R9 | Delete/troca de provider deve resetar seleções dependentes | **PASS PWA** | Testes cobrem delete com fallback e troca de provider; falta assert independente para `activeModelChoice`. |
| R10 | `loadConfig` deve ser estável e não refazer GET por seleção | **PASS PWA** | Callback usa refs e dependências vazias; teste confirma um único fetch após troca de provider. |

## 2. TDD e cobertura

Os testes seguem a intenção RED→GREEN, mas a cobertura verde não equivale à prova do caminho de produção:

- `apps/api/tests/agent/llm-config-phase0-red.test.ts`: **8/8** testes. Cobre savepoint, erros `42703`/não-`42703`, toggle ativo/fallback, item não referenciado e delete ativo. Não cobre delete de modelo fallback; o teste de par neste arquivo é placeholder.
- `apps/api/tests/routes/admin-agent-llm-config-phase0.test.ts`: **9/9** testes. Cobre activate/fallback cruzados, toggles, deletes, PATCH combinado e snapshot interno com provider disabled. O teste disabled aceita `runtime.providerId` presente e não executa o consumidor Agent, portanto não prova fail-closed.
- `apps/pwa/src/features/profile/__tests__/AgentLlmSettingsSheet.phase0.red.test.tsx`: **5/5** testes. Cobre preset parcial, kind desconhecido sem rede, reset de seleção e ausência de refetch; não verifica isoladamente o reset de `activeModelChoice`.

Antes de liberar, adicionar testes RED para PostgreSQL real, delete fallback, concorrência de toggle/delete, snapshot consumido pelo Agent e todos os campos/reasons do PATCH/409.

## 3. Política HTTP 409

Os cinco endpoints avaliados — toggle de provider, toggle de modelo, PATCH de provider e deletes de provider/modelo — usam HTTP `409` para conflito de runtime com `code: agent.runtime_in_use`. As razões previstas são `active_provider`, `fallback_provider`, `active_model` e `fallback_model`, com fallback textual `runtime_in_use` quando a exceção não informa uma razão.

A implementação e os testes direcionados são coerentes, porém o contrato ainda não está completamente provado: o teste de delete-provider não afirma `reason`, os testes de rota usam store in-memory e não verificam em todos os casos ausência de mutação/versionamento. A política de liberação deve exigir resposta `409`, `code`, `reason`, estado inalterado e comportamento atômico sob concorrência.

## 4. Resultados dos comandos executados

| Comando | Resultado |
|---|---|
| `pnpm --dir apps/api exec vitest run tests/agent/llm-config-phase0-red.test.ts` | **PASS — 8/8**; warning não bloqueante de depreciação da opção `esbuild` do Vitest. |
| `pnpm --dir apps/api exec vitest run tests/routes/admin-agent-llm-config-phase0.test.ts` | **PASS — 9/9**; warning não bloqueante de depreciação da opção `esbuild` do Vitest. |
| `pnpm --dir apps/pwa exec vitest run src/features/profile/__tests__/AgentLlmSettingsSheet.phase0.red.test.tsx` | **PASS — 5/5**. |
| `pnpm typecheck` | **PASS** em API, PWA, Agent e Codex Broker; apenas warning `DEP0190` do runner com `shell: true`. |
| `pnpm lint` | **PASS — 0 erros**; 8 warnings fora do LLM Manager, em helpers E2E, Accounts, Cards e TED. |
| `pnpm docs:lint` | **PASS — 8 documentos, 0 issues**. |
| `pnpm governance:check` | **PASS**; nenhuma alteração D01–D19 detectada. |
| `pnpm test` completo | **NÃO EXECUTADO** nesta revisão; os resultados de teste acima são apenas das três suítes direcionadas. |

## 5. Escopo e ausência de scope creep

O range contém 10 arquivos concentrados em API e PWA. Não foram encontrados migration nova, alteração em `apps/agent` ou trabalho de Fase 2 como `AbortController`, `ConfirmDialog`, hook/store novo ou gateway/ORM; esta revisão também não executou deploy, migration ou operação destrutiva.

## 6. Riscos residuais

1. **CRITICAL — configuração disabled:** o snapshot interno pode manter IDs de provider/modelo desabilitados, e o Agent os recompõe como configuração utilizável.
2. **HIGH — invariantes persistentes:** toggles/deletes precisam ser validados na transação PostgreSQL; modelos ativos/fallback podem ficar dangling sem proteção adequada.
3. **HIGH — drift de contrato:** API usa `providerId/modelId`, enquanto PWA espera `activeProviderId/activeModelId`; defaults defensivos ocultam o erro.
4. **HIGH — schema antes do Agent:** V042 não pode liberar 12 kinds enquanto registry/factory do Agent suportarem somente três.
5. **MEDIUM — evidência de teste:** doubles in-memory e mocks não substituem PostgreSQL, migration, concorrência ou E2E com o Agent.
6. **MEDIUM — preset/fallback:** falhas parciais e exclusões concorrentes ainda exigem reconciliação explícita.
7. **LOW/MEDIUM — dívida de tipos:** `as never`, alias sem vínculo ao kind e asserts incompletos podem reabrir regressões.

## 7. Plano de liberação

1. Criar os testes RED faltantes antes de alterar implementação.
2. Fechar toggle/delete com política atômica e fail-closed no snapshot interno.
3. Alinhar DTOs e nomes entre API, PWA e Agent antes de remover fallbacks.
4. Entregar suporte Agent/kinds antes ou atomicamente com V042, incluindo preflight/backfill e rollback operacional.
5. Executar PostgreSQL/migration/concorrência/E2E e a suíte completa `pnpm test` antes de declarar produção.

**Conclusão:** os commits avançam corretamente a UX e os contratos básicos, mas a entrega só deve seguir após os ajustes CRITICAL/HIGH acima. O resultado final desta revisão é **APROVADO COM AJUSTES**, sem autorização implícita para deploy.
