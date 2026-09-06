# Re-verificação dos fixes da Fase 1b — LLM Manager

**Data:** 2026-09-06  
**Escopo:** `91c6397..HEAD`  
**Commits:** `3bfe447`, `34df9fe`, `3da52f8`, `62b98b7`, `a7ec9dc`, `df96256`, `1f347b7`, `9702d8d` e `e4f2a44`  
**Restrição:** revisão somente leitura. Não foram alterados código de produção, migrations, deploy ou banco de produção.

## Veredito executivo

**APROVADO COM AJUSTES — não pronto para produção.** Os nove commits corrigem os bypasses de `enabled`, bloqueiam o codex nas rotas e na projeção, alinham aliases por kind, tornam o preflight par-a-par, serializam os guards com a linha de runtime, endurecem toggles/probe/IDs e fazem o cliente consumir flags fail-closed. Os testes unitários, os gates e o `pnpm test` estão verdes.

A liberação continua bloqueada por quatro limites materiais:

1. a V042 mantém `NO ACTION` nas quatro FKs de runtime, enquanto o requisito original auditado exige `ON DELETE SET NULL`;
2. todos os 16 testes PostgreSQL desta revisão foram pulados por ausência de `DB_TEST_MARKER` e de ambiente marcado, portanto não há prova efetiva de migration, FK ou concorrência;
3. o teste de race implementado cobre 6 rodadas do provider e 1 rodada do model, não a prova 10/10 solicitada, e não cobre de modo equivalente fallback/delete;
4. o bundle passa porque o baseline foi elevado para o tamanho atual; a alegada variação de `+0,29 KB` não tem artefato rastreável nesta árvore e os prefixos excluídos não são confirmados pelo manifest real.

**Não há autorização de deploy ou de alteração em produção.**

## Matriz de re-verificação

| Item | Veredito | Evidência | Limite / risco residual |
|---|---|---|---|
| **F1 — 11 kinds diretos executáveis; codex não liberado** | **PASS direcionado / PARCIAL operacional** | `FIXED_ENDPOINTS`, `PROVIDER_SECRET_MAP`, factory e probe cobrem os 11 kinds diretos. `isKindExecutable` é compartilhado. POST/PATCH/activate bloqueiam `openai-codex-subscription`; a projeção interna zera o par unsupported. | A matriz só cria SDKs e usa fetch mockado; não prova chamadas reais ou compatibilidade de todo par kind/protocol. O DB ainda permite codex `approved/enabled` por bypass direto, embora `updateRuntime` e a projeção falhem fechado. |
| **F2 — aliases e CHECKs por kind** | **PASS estático / SKIP efetivo PostgreSQL** | V042 enumera os 11 pares válidos e o alias nulo do codex. Há teste de alias incompatível e teste que insere todos os pares válidos. | Os testes PostgreSQL não executaram. A cobertura efetiva de combinações inválidas no banco é representativa, não uma matriz completa. |
| **F2 — preflight por par e idempotência** | **PASS estático / PARCIAL** | V042 limpa provider e model juntos para active e fallback, exigindo existência e `model.provider_id` correto. Os testes de legado cobrem órfão, par cruzado e segunda execução sem mutação. | Os dois testes de migration/preflight foram SKIP; a execução sobre uma base legada real ainda não está comprovada. |
| **F2 — política das FKs de runtime** | **FAIL contra o requisito original** | `V042__llm_kind_alignment.sql:6-18,118-128` declara/redeclara `NO ACTION` para `model_id`, `fallback_model_id` e `fallback_provider_id`; `provider_id` já era `NO ACTION` em V034. | A justificativa do commit é coerente internamente, mas não substitui a política auditada de `ON DELETE SET NULL`. O teste D1 foi ajustado para esperar `23503`, isto é, prova a política implementada, não a política requerida. |
| **F3 — validação das mutações** | **PASS direcionado / PARCIAL** | activation, rollout, fallback, provider/model, sync, security epoch e test-connection usam schemas compartilhados. Toggles usam `toggleEnabledSchema` estrito; test-connection agora valida corpo e é explicitamente stub. | `createProviderSchema`, `createModelSchema` e `syncCatalogSchema` não são estritos; POST de provider normaliza/coage `id` antes do Zod. Test-connection não prova conectividade: sempre retorna `not_configured`. |
| **F4 — snapshot de intenção e fallback** | **PASS direcionado / cobertura parcial** | `ensureIntentionSnapshotColumns` adiciona colunas ausentes; INSERT persiste os dois IDs; linhas legadas são normalizadas para `null`. A suíte do Agent passou 5/5 neste arquivo. | Os testes usam um mock de `sql.exec`; não executam SQLite Durable Object real nem corrida de inicialização. Os `catch` amplos ainda podem mascarar erro de schema/permissão e retornar snapshot não persistido. |
| **F5 — upsert não desabilita referência ativa** | **PASS para o caso corrigido** | `upsertProvider` e `upsertModel` preservam `enabled` em conflito; novos registros continuam desabilitados. A suíte in-memory e a rota de sync cobrem active/fallback. | O upsert ainda altera metadados de item referenciado sem lock/revalidação: provider pode ser demovido para `candidate` e model ativo pode ter `privacyClass`/`protocol` alterados. A projeção não revalida todos esses semânticos. |
| **F5 — toggle/delete versus activation** | **PARCIAL — não liberável sem prova PG** | `updateRuntime`, toggles e deletes tomam `agent_llm_runtime_config ... FOR UPDATE` dentro de transação; `updateRuntime` revalida ambos os pares depois do lock. Os testes de SQL mockado verificam ordem e os in-memory verificam conflitos. | Os testes reais foram SKIP. `postgres-llm-atomic-guards.test.ts` cobre 6 rodadas do race de provider e uma do model; não é a prova 10/10 solicitada e não oferece a mesma profundidade para fallback/delete. |
| **F6 — cliente Agent e flags do snapshot** | **PASS para flags / PARCIAL semântico** | `internalSnapshotSchema.superRefine` rejeita IDs não nulos quando `activeDisabled`/`fallbackDisabled` é true. `fetchRuntimeConfig` faz `safeParse` e aplica as flags novamente antes de retornar IDs. | O schema ainda aceita incoerência entre slots, IDs e ownership quando a flag é false, além de limites numéricos e alguns pares incompletos. Não houve E2E API → Agent. |
| **F7 — gates e evidência** | **PASS de execução / FAIL de release** | `pnpm test`, typecheck, lint, docs lint, governance, Agent e suítes direcionadas passaram. | 16 integrações PostgreSQL foram SKIP; o root `pnpm test` não executa Agent, package compartilhado nem integrações; não há prova de provider real, SQLite DO real ou E2E API → Agent. |

## Providers, probe e IDs

- `provider-kind-matrix.test.ts`, `provider-registry.test.ts` e `provider-probe.test.ts` passaram. Os 11 endpoints e aliases são derivados/coerentes com o contrato compartilhado.
- `validateModelId` agora aceita IDs `owner/model` do OpenRouter e continua rejeitando query, encoding, whitespace, segmentos vazios e `..`. A mesma forma é aceita pelo schema de model.
- O timer do probe é limpo em `finally`, inclusive em erro de rede; isso corrige o achado S3 original.
- Permanece um risco: o probe Google envia a chave na query string (`.../models?key=...`), o que exige garantia explícita de não registro em logs/traces. A matriz continua nominal: SDKs são construídos e upstream é mockado.

## Integração PostgreSQL condicional

Comando executado:

```text
pnpm --filter pi-finance-api exec vitest run \
  tests/integration/postgres-llm-fix.test.ts \
  tests/integration/postgres-llm-atomic-guards.test.ts \
  tests/integration/postgres-llm-v042-alignment.test.ts \
  tests/integration/postgres-agent-llm-config.test.ts
```

Resultado observado:

```text
DATABASE_URL_TEST: unset
DATABASE_URL_TEST_FIX: unset
DATABASE_URL_TEST_FIX_LEGACY: unset
DB_TEST_MARKER: unset
Test Files: 4 skipped
Tests: 16 skipped
```

Os `itIfDatabase` dependem de URL marcada e de `DB_TEST_MARKER`; sem ambos, nenhum cenário acessa PostgreSQL. Portanto, nesta revisão não foi validado:

- aplicação V042 sobre base legada e checksum/manifest efetivos;
- CHECK de alias e ownership em PostgreSQL;
- ação efetiva das quatro FKs;
- concorrência entre activation, toggle e delete;
- atomicidade/rollback do store real.

## Bundle budget e D2

O `pnpm test` completo passou após o re-baseline:

- API: **144 arquivos / 1.051 testes**;
- PWA: **130 arquivos / 1.210 testes**;
- total: **2.261 testes passados**.

A medição reproduzível, no cwd correto (`cd apps/pwa && node scripts/measure-bundle.mjs`), foi:

```text
chunks:                49
initial gzip KB:       136.05
total (all) gzip KB:   619.13
framework 624/3896 KB: 124.09
app/ lazy gzip KB:     100.66
equivalent-set gzip KB: 495.04
```

`apps/pwa/budget.json` também usa `495.04 KB`, com limite de `519.792 KB`; assim, o gate atual passa. Porém:

- o baseline anterior era `280.7 KB` e foi substituído pelo tamanho atual;
- a nota afirma builds limpos `494.75 -> 495.04` e delta de `+0.29 KB`, mas não há relatório, hashes ou artefatos before/after versionados que permitam reproduzir essa atribuição;
- `.next/build-manifest.json#rootMainFiles` existe, mas não contém `624-` nem `3896037c-`; o medidor emite warning e continua. O comentário diz que deveria falhar, enquanto a implementação apenas adverte;
- os testes fixture provam a metodologia e os limites, não a composição do build histórico de `280.7 KB`.

Conclusão D2: **gate atual PASS; evidência de não-regressão causal PARCIAL**.

## Comandos executados

| Comando | Resultado |
|---|---|
| `git status --short` / `git log --no-merges 91c6397..HEAD` / `git diff --stat` / `git diff --check` | **PASS**; 9 commits, 26 arquivos, árvore com apenas `docs/audits/` não versionado antes do relatório. |
| `pnpm typecheck` | **PASS** em API, PWA, Agent e codex-broker; warning `DEP0190` do runner. |
| `pnpm lint` | **PASS**, 0 erros e 8 warnings preexistentes. |
| `pnpm docs:lint` | **PASS**, 8 documentos, 0 issues. |
| `pnpm governance:check` | **PASS**, nenhuma alteração D01–D19 detectada. |
| Suítes API LLM/rotas direcionadas | **PASS**, 10 arquivos / 108 testes. |
| Suítes Agent registry/probe/client/snapshot direcionadas | **PASS**, 5 arquivos / 31 testes. |
| `pnpm --filter @pi-finance/llm-contracts exec tsc --noEmit` | **PASS**. |
| PWA settings/bundle direcionados | **PASS**, 2 arquivos / 14 testes; warning sobre baseline histórico não reproduzido. |
| `pnpm --filter pi-finance-agent test` | **PASS**, 32 arquivos / 144 testes; warnings de sourcemap/esbuild. |
| `pnpm test` | **PASS**, API 144/1.051 e PWA 130/1.210; warnings não bloqueantes. |
| Quatro arquivos de integração PostgreSQL | **SKIP**, 4 arquivos / 16 testes por ambiente não marcado. |
| `cd apps/pwa && node scripts/measure-bundle.mjs` | **PASS operacional**, medição 495,04 KB; warning de prefixes ausentes no manifest. |

## Riscos residuais e ações antes da liberação

1. Decidir e alinhar a política FK: implementar `SET NULL` conforme o requisito, com nulidade conjunta/garantia de `active_pair`, ou alterar formalmente o requisito para `NO ACTION` e atualizar todos os documentos/testes.
2. Provisionar PostgreSQL descartável com URL específica e `DB_TEST_MARKER`; executar os 16 cenários e adicionar a prova 10/10 para activation↔toggle, active/fallback e delete.
3. Impedir ou serializar alterações de metadados de provider/model enquanto o item é active/fallback; revalidar eligibility, kind, protocol, privacidade e ownership antes do commit.
4. Completar invariantes semânticas do snapshot (flags, slots, IDs, pares, limites) e executar teste SQLite Durable Object real; restringir os `catch` de migração/persistência.
5. Corrigir a verificação dos prefixes do bundle para falhar fechado ou apontar para o manifest correto, e guardar evidência before/after do delta do LLM antes de aceitar novo re-baseline.
6. Cobrir compatibilidade kind↔protocol e o tratamento seguro da chave Google em logs/traces.

## Conclusão

Os fixes são substanciais e os caminhos nominais estão verdes, mas a combinação de política FK divergente, ausência total de prova PostgreSQL, cobertura de race abaixo do solicitado e re-baseline sem evidência causal impede afirmar prontidão produtiva. O veredito permanece **APROVADO COM AJUSTES — não pronto para produção**.
