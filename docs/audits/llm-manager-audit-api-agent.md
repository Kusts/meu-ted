# Auditoria — LLM Manager API + Agent (backend)

**Escopo (somente leitura):** `apps/api/src/agent/llm-config.ts`, `llm-config-postgres.ts` (717 linhas), `routes/admin-agent-llm-config.ts`, `routes/internal-agent-llm-config.ts`, `routes/internal-agent-llm-relay.ts`, `read-models/sql/V034__agent_llm_configuration.sql`, `V041__llm_fallback.sql`, `apps/agent/src/llm/{model-factory.ts,provider-registry.ts,runtime-config-client.ts,provider-probe.ts,private-broker-client.ts}` + testes `apps/api/tests/{agent/llm-config.test.ts,routes/admin-agent-llm-config.test.ts,integration/postgres-agent-llm-config.test.ts}` e `apps/agent/tests/{runtime-config-client,openai-model-factory,provider-registry,provider-probe,private-broker-client}.test.ts` + comparação `apps/pwa/src/lib/api/admin-agent-llm-config.ts`.
**Data:** 2026-09-05 — **Autor:** Coder B (Orca `task_475bf11f5d97`) | **Critérios:** code-craftsman (responsabilidade coesa, contratos explícitos, erros preservam contexto)
**Modo:** auditoria é leitura; único artefato criado é este relatório.

---

## 1) Resumo arquitetural — fluxo config PWA → admin route → postgres → internal route → agent runtime

```
PWA (AgentLlmSettingsSheet)
  │ apiFetch Bearer Better-Auth + X-Workspace-Id
  ▼
POST/GET /admin/agent/llm-config/*  (admin-agent-llm-config.ts:40-95 guard)
  │ isUserAdmin + CSRF trustedOrigins + bloqueio baseUrl/apiKey
  │ canActivate / validateProvider / validateModel  (llm-config.ts)
  ▼
LlmConfigStore  (llm-config-postgres.ts:54-717)
  │ Postgres: agent_llm_providers / agent_llm_models / agent_llm_runtime_config(singleton='active')
  │ SQL parametrizado, transação SELECT … FOR UPDATE em updateRuntime, version + securityEpoch
  │ fallback_provider_id ON DELETE SET NULL (V041), fallback_model_id TEXT sem FK
  ▼
GET /internal/agent/llm-config  (internal-agent-llm-config.ts:16-92)
  │ x-agent-config-token timingSafeEqual → retorna {provider,model,fallbackProvider,fallbackModel,runtime} sanitizado
  ▼
Agent Worker (Cloudflare)  runtime-config-client.ts:13-77 fetch → RuntimeSnapshot{activeProviderId,activeModelId,fallback…}
  │ resolveSecret(ALLOWLISTED_SECRETS) + FIXED_ENDPOINTS (provider-registry.ts)
  │ model-factory.ts:createLanguageModel / provider-probe.ts / private-broker-client.ts
  ▼
Tool execution → quando necessário, bridge via POST /internal/agent/llm-relay (internal-agent-llm-relay.ts)
    x-agent-runtime-admin-token + ALLOWED_MODELS allowlist + 60s AbortController
```

**Propriedades globais:** config é global (não workspace-scoped). Segredos nunca persistidos — apenas `secretAlias` (ex.: `OPENCODE_ZEN_API_KEY`) armazenado; valor fica no env do Worker/API. `version` implementa optimistic concurrency (CAS) e `securityEpoch` revogação emergencial (`bumpSecurityEpoch`). Fallback adicionado em V041. Agent desacopla segredos via `resolveSecret` allowlist; `createSafeFetch` bloqueia redirect (SSRF).

---

## 2) Bugs — severidade, file:line, evidência, cenário de falha concreto

> Legenda de pontos obrigatórios: **[AUTH] [SECRET] [CONC] [VALID] [SQL] [STATE] [TYPES] [ERR/TO]**

### CRITICAL

**B-C1 [STATE][TYPES][SQL] — Runtime pode apontar para provider/model deletado ou desabilitado sem validação nem FK que impeça.**  
*Files:* `llm-config-postgres.ts:394-396` `deleteProvider`, `449-451` `deleteModel`, `V034:29-39`, `V041:3-4`  
*Evidência:*
```sql
-- V034:29-31
provider_id TEXT REFERENCES agent_llm_providers(id),  -- sem ON DELETE
model_id TEXT,  -- sem FK
-- V041:3-4
fallback_provider_id TEXT REFERENCES … ON DELETE SET NULL,
fallback_model_id TEXT; -- sem FK, sem SET NULL
```
```ts
// llm-config-postgres.ts:394
async deleteProvider(id){ await pool.query(`DELETE FROM agent_llm_providers WHERE id=$1`,[id]); }
// sem checar runtime.providerId === id
```
*Cenário:* Admin ativa `openai-api:gpt-4o` (version 2). Outro admin `DELETE /providers/openai-api` — `agent_llm_models` CASCADE apaga modelos, mas `agent_llm_runtime_config.provider_id` fica dangling (FK sem SET NULL → Postgres lança 23503 `foreign_key_violation` não mapeada → 500 interno) **ou** se FK não estiver aplicada (coluna sem constraint em runtime legado), internal route `runtime.providerId='openai-api'` com `providers.find(p=>p.id==='openai-api')===undefined` retorna `{provider:null, model:null}` mas `runtime` ainda contém ids obsoletos → Agent recebe snapshot com `activeProviderId='openai-api'` inexistente → `provider-registry.ts:42 throw unknown provider` em cada turno.

**B-C2 [CONC][STATE] — Toggle/desabilitar não invalida runtime ativo; `canActivate` não é revalidado após `setProviderEnabled(false)` / `setModelEnabled(false)`.**  
*Files:* `admin-agent-llm-config.ts:138-164` toggle routes, `llm-config-postgres.ts:294-320` sem verificação, `llm-config.ts:133-144` `canActivate` só usado em activate/fallback.  
*Evidência:*
```ts
// admin-agent-llm-config.ts:147
const provider = await deps.store.setProviderEnabled(id, enabled); // sem checar runtime
```
*Cenário:* Runtime ativo `openai-api:gpt-4o`. Admin desabilita provider (`POST …/providers/openai-api/toggle {enabled:false}`) → sucesso 200. Sistema permanece com runtime apontando para provider desabilitado (`enabled=false`). Próximas chamadas do agent via `createLanguageModel` ainda resolvem secret e endpoint (não checa `enabled`), mas `internal-agent-llm-config.ts:35` retorna provider com `eligibility` porém sem `enabled` — agent não sabe que está desabilitado. Nenhuma rota bloqueia inferência nem sonega fallback. Falha silenciosa de governança.

### HIGH

**B-H1 [TYPES][VALID][SQL] — Drift de contrato DB vs domínio: `ALLOWED_KINDS` tem 12 valores, V034 CHECK só 4; idem Eligibility `candidate` e novos providers (anthropic/deepseek…).**  
*Files:* `llm-config.ts:10-23` vs `V034:5,11`  
*Evidência:*
```ts
// llm-config.ts:10
'anthropic','deepseek','qwen','glm','minimax','google','openrouter' // 7 extras
-- V034:5
CHECK (kind IN ('opencode-zen','opencode-go','openai-api','openai-codex-subscription'))
-- V034:11
CHECK (eligibility IN ('experimental_blocked','approved')) // sem 'candidate'
```
*Cenário:* PWA cria preset `anthropic` (`kind='anthropic'`) via `POST /providers` — `validateProvider` passa (ALLOWED_KINDS inclui), mas `INSERT …` viola `chk_kind` → Postgres `23514` não capturado → handler retorna 500 sem `code: agent.invalid_provider`. Mesmo para `candidate` (usado em PWA `ProviderEligibility`). Admin vê 500 genérico.

**B-H2 [VALID][TYPES] — `POST /providers` infere `kind/transport/authMode/secretAlias` via heurística curta que erra para 6 dos 9 presets.**  
*Files:* `admin-agent-llm-config.ts:278-290`  
*Evidência:*
```ts
if (!kind && body.name) {
  const map: Record<string,string> = {'opencode-zen':…,'openai-codex-subscription':…};
  kind = map[id] ?? map[body.name] ?? 'openai-api'; // default enganoso
}
if (secretAlias===undefined){
  const aliasMap = {'opencode-zen':'OPENCODE_ZEN_API_KEY', … 'openai-api':'OPENAI_API_KEY'};
  secretAlias = aliasMap[kind] ?? null;
}
```
*Cenário:* `POST /providers {id:'anthropic', name:'Claude'}` sem `kind` → `kind='openai-api'`, `secretAlias='OPENAI_API_KEY'` → valida, persiste provider `anthropic` com kind errado; depois agent tenta `FIXED_ENDPOINTS['openai-api']` (endpoint OpenAI) com `OPENAI_API_KEY` para Anthropic → probe falha. Bug silencioso de mapeamento.

**B-H3 [AUTH][VALID] — CSRF check bypass quando `Origin` ausente; SSRF guard só em `admin`, não em `internal/relay`.**  
*Files:* `admin-agent-llm-config.ts:49-70`  
*Evidência:*
```ts
if (['POST'…].includes(req.method)){
  const origin = req.headers['origin'] || headers.get('origin');
  if (origin && typeof origin==='string'){
    if (!trustedOrigins.has(normalizedOrigin)) return 403;
  }
  // se origin ausente → não bloqueia
}
```
*Cenário:* Atacante com sessão roubada (XSS) faz `fetch('/admin/agent/llm-config/activate',{method:'POST', body:…})` sem `Origin` (curl/background) → guard pula CSRF. Não é self-contained (precisa sessão), mas viola defesa em profundidade. `internal-agent-llm-relay.ts` sequer verifica Origin — correto por ser internal, porém sem rate-limit.

**B-H4 [SECRET] — `internal-agent-llm-config.ts` retorna `secretAlias` ao agent; correto, mas admin `GET /admin/agent/llm-config` também expõe todos `secret_alias` + `eligibility/runtime_status` sem mascarar nem auditar leitura.**  
*Files:* `admin-agent-llm-config.ts:98-105`, `internal-agent-llm-config.ts:42-49`, `llm-config-postgres.ts:56-73`  
*Evidência:* `SELECT secret_alias …` retornado direto; nenhum campo omitido.  
*Cenário:* Vazamento não é de valor, mas enumeração. Qualquer admin (ou token internal vazado) lista todos aliases válidos — útil para recon. Não há log de leitura (`updatedBy` só em escrita). Se `ALLOWLISTED_SECRETS` crescer, superfície aumenta.

**B-H5 [CONC] — `PATCH /providers/:id` com `{enabled, eligibility, secretAlias}` early-return em `enabled` ignora demais campos; race entre dois patches perde update.**  
*Files:* `admin-agent-llm-config.ts:303-328`  
*Evidência:*
```ts
if (typeof patch.enabled==='boolean'){
  const updated = await deps.store.setProviderEnabled(id, patch.enabled);
  return reply.send({provider: updated}); // eligibility/secretAlias descartados
}
```
*Cenário:* `PATCH {enabled:true, eligibility:'approved'}` com provider `experimental_blocked` → só habilita, permanece bloqueado; admin acha que aprovou. Requer segundo request.

**B-H6 [TYPES] — Inconsistência de schema Runtime entre PWA, API e Agent causa silent null.**  
*Files:* `apps/pwa/src/lib/api/admin-agent-llm-config.ts:31-43` (`activeProviderId/activeModelId/activeProtocol`) vs `llm-config-postgres.ts:137-169` (`providerId/modelId/rolloutMode`) vs `runtime-config-client.ts:1-11` (`activeProviderId|providerId` com fallback).  
*Evidência:* Agent tenta `runtime.activeProviderId` senão `runtime.providerId` (linha 40-44). PWA antigo espera `active*`.  
*Cenário:* API retorna `providerId/modelId`, PWA sem mapper mostra `Runtime Ativo — Nenhum` mesmo após activate 200. Agent tolera via `??`, mas PWA não — bug já reportado `docs/audits/llm-manager-audit-pwa.md` confirmado aqui na origem (API não normaliza).

**B-H7 [VALID][STATE] — `sync-catalog` aceita 0 ou N items sem limite, sem auth de provider, sem `retention` validação; `retention` string livre pode injetar dados arbitrarios.**  
*Files:* `admin-agent-llm-config.ts:107-135`  
*Evidência:* `type retention?: string` sem enum/check; loop `validateModel` só checa protocol/privacyClass, não retention.  
*Cenário:* `POST /sync-catalog {items:[{providerId:'openai-api', modelId:'gpt-4o', retention:'"; DROP TABLE…'}]}` → `retention` persiste como texto livre; não é SQLi (parametrizado), mas polui dado e pode ser refletido no agent.

**B-H8 [SQL][CONC] — `updateRuntime` tem fallback `try/catch` que engole qualquer erro e re-tenta sem colunas fallback, mascarando falhas reais.**  
*Files:* `llm-config-postgres.ts:223-271`  
*Evidência:*
```ts
try { res=await client.query(`UPDATE …fallback…`); r=res.rows[0]; } catch {
  res=await client.query(`UPDATE …sem fallback…`); // catch vazio
}
```
*Cenário:* Erro de constraint `chk_transport_auth` ou deadlock vira retry silencioso sem `fallback_provider_id`, perdendo dados de fallback; erro original perdido, debug difícil.

### MEDIUM

**B-M1 [AUTH] — `internal-agent-llm-config.ts:5-10` `safeCompare` usa `timingSafeEqual` mas retorna `false` imediato em `length !==`, vazando tamanho do token.**  
*Evidência:* `if (bufA.length!==bufB.length) return false;` antes de `timingSafeEqual`.  
*Cenário:* Atacante mede tempo/erro para inferir tamanho do `configToken` (side-channel). Mesmo em `internal-agent-llm-relay.ts:22` com loop de comparação.

**B-M2 [ERR/TO] — `internal-agent-llm-relay.ts:49,56-71` sem validação de tamanho de `prompt` após `trim` vs antes; `model` allowlist contém 7 hard-coded, mas `provider` só `opencode-zen|go` → novos modelos bloqueados até deploy.**  
*Evidência:* `relayBody` zod max 16000/8000, mas sem contagem de tokens; `ALLOWED_MODELS` fixo.  
*Cenário:* Modelo novo `kimi-k2-free` precisa code change; canal fica 403 até release.

**B-M3 [ERR/TO] — Relay timeout 60s com `setTimeout` sem `unref` e `clearTimeout` só após `await res.json()`, pode vazar timer em caso de `res.json()` lento.**  
*Files:* `internal-agent-llm-relay.ts:56-71`  
*Evidência:* `const timer=setTimeout(()=>controller.abort(),60000); … body=await res.json().catch(()=>null); clearTimeout(timer);`  
*Cenário:* Provider responde headers rápido mas `json()` demora >60s → abort não dispara pois `fetch` já resolveu; endpoint fica pendurado além do timeout.

**B-M4 [VALID] — Nenhuma rota admin usa `zod`; validação manual esquece limites (ex.: `id` sem max length, `modelId` sem trim, `canaryAllowlist` sem validação de tipo/uniq).**  
*Files:* `admin-agent-llm-config.ts:138-145` (`enabled` check), `268-290` (`id` só `.trim()`), `232-247` `canaryAllowlist?: string[]` sem checar `Array.isArray` nem elementos vazios.  
*Cenário:* `POST /rollout {canaryAllowlist:[1,2,3]}` (números) → `updateRuntime` tenta `COALESCE($4, canary_allowlist)` com int[] → Postgres erro `42601`.

**B-M5 [TYPES][STATE] — `provider-registry.ts:1-5` `FIXED_ENDPOINTS` só 3 provedores, mas `ALLOWED_KINDS` tem 12; agent quebra para `anthropic/deepseek/...` mesmo com runtime ativo válido.**  
*Evidência:* `model-factory.ts:52 if(!baseUrl) throw unknown provider`  
*Cenário:* Admin ativa `anthropic/claude-3-5-sonnet` (permitido e aprovado) → agent `fetchRuntimeConfig` retorna `activeProviderId='anthropic'` → `createLanguageModel('anthropic',…)` lança `unknown provider` → todo chat falha com 500.

**B-M6 [SECRET] — `model-factory.ts:21` `PROVIDER_SECRET_MAP` só 3 aliases; `provider-registry.ts:11` `ALLOWLISTED_SECRETS` só 3, divergindo de `ALLOWLISTED_SECRET_ALIASES` (10) da API.**  
*Cenário:* Provider `deepseek` com `DEEPSEEK_API_KEY` ativo → agent `resolveSecret('DEEPSEEK_API_KEY')` lança `invalid secret alias` antes de usar endpoint compatível OpenAI — mesmo endpoint `FIXED_ENDPOINTS` ausente, duplo bloqueio.

**B-M7 [CONC] — `bumpSecurityEpoch` não usa `FOR UPDATE` nem `expectedVersion`; concorrente com `updateRuntime` pode perder incremento.**  
*Files:* `llm-config-postgres.ts:453-476` (`UPDATE … security_epoch+1` sem SELECT FOR UPDATE) vs `updateRuntime` com lock.  
*Cenário:* Dois admins: A `bumpSecurityEpoch` e B `activate` concorrentes; ambos leem version 5; A incrementa para 6, B também parte de 5 e incrementa para 6 (perde um bump). `securityEpoch` pode não refletir ambos eventos.

**B-M8 [SQL] — `getRuntime()` catch genérico trata qualquer `SELECT` erro como “colunas fallback ausentes”, escondendo falhas de conexão.**  
*Files:* `llm-config-postgres.ts:170` `catch { SELECT sem fallback }`  
*Evidência:* `try { SELECT com fallback } catch { fallback=null }`  
*Cenário:* Pool esgotado → primeiro SELECT lança `ECONNREFUSED`, cai no catch, segundo SELECT também falha → exceção não tratada vira 500 com stack, mas log não distingue migração pendente de outage.

**B-M9 [ERR] — `admin-agent-llm-config.ts:344-381` fallback `POST /fallback` resolve `found` por `m.id===modelId || (providerId && modelId)` mas depois persiste `fallbackModelId=found?found.id:modelId` sem validar se `found.providerId===providerId`.**  
*Cenário:* `POST /fallback {providerId:'openai-api', modelId:'opencode-zen:zen-mini'}` onde `m.id='opencode-zen:zen-mini'` existe mas `providerId` diverge → `canActivate` procura `model` via mesma lógica e pode achar modelo de outro provider, passando `canActivate`, mas persiste `fallbackProviderId='openai-api'` com `fallbackModelId='opencode-zen:zen-mini'` inconsistente (par não existe).

### LOW

**B-L1 [SQL] — `upsertProvider` `COALESCE($7,false)` com `null` preserva `enabled` antigo em conflito, mas `INSERT` usa `COALESCE($7,false)` então primeiro insert sem `enabled` vira `false` correto; comportamento implícito pouco claro.**  
*Files:* `llm-config-postgres.ts:350-376`

**B-L2 [ERR] — `internal-agent-llm-relay.ts:22-27` `safeCompare` reimplementa timing-safe com loop `charCodeAt |` mas `a.length!==b.length` early return — mesma fuga de B-M1.**  

**B-L3 [TYPES] — `runtime-config-client.ts:71-73` `activeRolloutPercentage:100` hardcoded quando `runtime.activeRolloutPercentage` ausente (API nunca envia esse campo). Valor fictício.**  

**B-L4 [VALID] — `provider-probe.ts:101` sempre probe `/models` (OpenAI spec) mas Anthropic não tem esse endpoint → probe sempre `http_404` para anthropic, mesmo com key válida.**  

**B-L5 [SECRET] — `private-broker-client.ts:89` usa `redirect:'error'` que lança TypeError em redirect, mas Worker runtime `model-factory.ts:33` comentário diz “Workers does not implement redirect:error” — inconsistência de compatibilidade.**  

---

## 3) Falhas de arquitetura

**A1 — `llm-config-postgres.ts` 717 linhas — SRP violado (responsabilidade coesa).**  
Um arquivo acumula: interface `LlmConfigStore`, implementação Postgres (`createPostgresLlmConfigStore`), implementação InMemory (`createInMemoryLlmConfigStore` 237 linhas), mapeamento `row → domain`, migração implícita (fallback try/catch), e semântica de concorrência. Efeitos: difícil testar concorrência sem subir Postgres, difícil trocar store, import do InMemory puxa `pg` types mesmo em Worker. `createPostgresLlmConfigStore` expõe `Pool` cru, sem DataSource abstraction. Code-craftsman: nomes como `r: Record<string,unknown>` escondem contrato; erro `catch {}` viola “erros preservam contexto”.

**A2 — Duplicação de validação entre rotas e domínio, sem schema central.**  
- `llm-config.ts:101-131` `validateProvider/validateModel/canActivate` (domínio)  
- `admin-agent-llm-config.ts:108-135` reimplementa `validateModel` inline em `sync-catalog` com defaults (`protocol??'chat-completions'`)  
- `internal-agent-llm-relay.ts:4-9` zod `relayBody` isolado  
- `provider-registry.ts:24-37` `validateModelId` regex distinta de `validateModel`  
Resulta em 4 fontes de verdade para `modelId` (domínio, registry, relay, postgres CHECK). Alterar `ALLOWED_PROTOCOLS` exige 3 arquivos. Falta `z.object` compartilhado.

**A3 — Acoplamento Agent ↔ API via `secretAlias` + `FIXED_ENDPOINTS` duplicados e divergentes.**  
API `ALLOWLISTED_SECRET_ALIASES` (10) vs Agent `ALLOWLISTED_SECRETS` (3) vs `PROVIDER_SECRET_MAP` (3) vs `FIXED_ENDPOINTS` (3). Adicionar provider exige editar 5 lugares (domínio, SQL, API guard, Agent registry, factory). Contrato `RuntimeConfig` vs `RuntimeSnapshot` vs `LlmRuntime` (PWA) com 3 shapes; `runtime-config-client.ts:40-59` faz normalização defensiva com 6 `typeof` checks + fallback — sintoma de contrato não explícito.

**A4 — Postgres como fonte de verdade sem invariantes de estado no banco.**  
Regras “runtime deve apontar para provider/model habilitado+approved” vivem só em `canActivate` (memória, no momento do activate). `setProviderEnabled(false)` / `deleteModel` não revalidam `runtime`. CHECKs do DB validam sintaxe mas não semântica (ex.: `model_id` pode ser qualquer texto, sem FK para `agent_llm_models.id`). Falta `TRIGGER` ou `CHECK` que garanta consistência. Ideal: invariante no store (`updateRuntime` Re-verifica) ou `DEFERRABLE` FK.

**A5 — Tratamento de erro inconsistente (código vs mensagem).**  
Algumas rotas retornam `{code, message}` (401/403), outras `{code, reason}` (422 activate) ou `{code, message, reason}` misturado fallback 422. Cliente PWA faz `setError((e as Error).message)` e descarta `code/reason`. `llm-config-postgres.ts` lança `Object.assign(new Error('version conflict'),{statusCode:409, code:'agent.version_conflict'})` — `statusCode` lido por Fastify error handler? Não há `setErrorHandler` dedicado; depende de `reply.code(…)` manual em rotas, mas `updateRuntime` 409 escapa como throw → Fastify responde 500 se não capturado (activate captura? Não, deixa throw → precisa errorHandler global, não verificado).

**A6 — Agent runtime sem cache nem debounce; cada mensagem pode `fetchRuntimeConfig`.**  
`runtime-config-client.ts` é função pura sem memo/cache; caller (não auditado, mas `apps/agent/src/...`) provavelmente chama por turno. Sem `If-None-Match/version`, sem TTL, sobrecarrega `GET /internal/agent/llm-config` (3 queries). Não há fallback local se API offline — agent falha fechado.

---

## 4) Gaps de teste

**Cobertura existente (bom):** `llm-config.test.ts` cobre `validateProvider/validateModel/canActivate` + InMemory store CAS; `admin-agent-llm-config.test.ts` cobre guard 401/403/CSRF/SSRF, sync-catalog, toggle, activate invariants, rollout+409, securityEpoch, internal token ok/401 e fallback roundtrip; `postgres-agent-llm-config.test.ts` integração com migrações; agent `provider-registry/ probe/ factory/ private-broker/ runtime-config-client` com happy path e alguns negativos.

**Gaps ordenados por risco:**

1. **Estados inválidos pós-mutação (STATE):** nenhum teste de `deleteProvider` quando runtime aponta para ele, nem `setProviderEnabled(false)` após activate; falta teste “runtime dangling → internal retorna null + version unchanged”. `admin-agent-llm-config.test.ts` não testa `DELETE /providers/:id` nem `DELETE /models/:id` com runtime ativo.
2. **Concorrência cruzada (CONC):** apenas `updateRuntime` CAS unitário; falta teste de `rollout` vs `activate` concorrente, e `bumpSecurityEpoch` vs `updateRuntime` (B-M7); falta teste Postgres real com `SELECT FOR UPDATE` paralelo.
3. **Validação ausente (VALID):** sem teste de `PATCH /providers/:id` com `enabled+eligibility` simultâneo (B-H5); sem teste de `id` longo (>120) ou `modelId` com `/ ? @`; sem teste de `sync-catalog` com `retention` arbitrário ou `items:[]`; sem teste de `POST /providers` com `kind` divergente (B-H2).
4. **Contrato tipos (TYPES):** nenhum teste de contrato PWA↔API↔Agent: `GET /admin/agent/llm-config` retornando `RuntimeConfig` sem `active*` vs `RuntimeSnapshot`; `runtime-config-client.test.ts` só testa caso `active*` (mock PWA-like), não o caso real API (`providerId/modelId`) nem fallback.
5. **Auth internal detalhado (AUTH):** `internal-agent-llm-config.test.ts` testa 401 mas não `Authorization: Bearer …` prefix handling (linha 19), nem timingSafeEqual com token quase-certo, nem token vazio.
6. **Relay timeout/erro (ERR/TO):** `private-broker-client.test.ts` não testa timeout/abort nem 429/401 mapping; `internal-agent-llm-relay.ts` sem teste de allowlist miss (403), nem `prompt.trim` vazio, nem `zenApiKey` ausente (503), nem `AbortError` 504.
7. **SQL migration (SQL):** `postgres-agent-llm-config.test.ts` roda migrações mas não testa V041 `ON DELETE SET NULL` vs model dangling; não testa `chk_secret_alias` violation para `anthropic` (B-H1) nem FK failure em delete provider ativo.
8. **Probe/factory para novos providers (TYPES):** `openai-model-factory.test.ts` só testa `openai-api`/`opencode-zen`; sem teste de `anthropic` lança “unknown provider” (B-M5) nem `resolveSecret` com alias não-allowlisted no agent.
9. **SecretAlias não-logado (SECRET):** nenhum teste de que resposta `GET /admin/...` não contém `apiKey`/`baseUrl` (garantido por guard, mas sem assertion explícita); nenhum teste de que `sync-catalog` ignora `baseUrl` extra (coberto em create-model, não em sync).
10. **InMemory vs Postgres parity (A1):** `createInMemoryLlmConfigStore` duplica lógica mas testes não rodam mesmos cenários em ambos (ex.: `fallbackModelId` resolvido via `providerId+modelId` só testado em internal, não no store unitário).

---

## 5) Recomendações de refatoração — priorizadas (menor intervenção primeiro, sem abstração especulativa)

**P0 — Correções de 1–10 linhas, sem nova abstração (fazer primeiro)**

1. **Endurecer `deleteProvider/deleteModel` com checagem de runtime** — `llm-config-postgres.ts:394,449` antes de `DELETE`, `SELECT provider_id,model_id FROM agent_llm_runtime_config` e, se apontar para id deletado, ou `return 422 runtime_in_use` ou `UPDATE runtime SET provider_id=NULL, model_id=NULL`. Evita B-C1. Custo: +6 linhas por método.
2. **Corrigir early-return do PATCH** — `admin-agent-llm-config.ts:311-313` remover branch isolado; sempre fazer `merged={...existing,...patch}` e `validateProvider(merged)` antes de `upsert`. Depois, se `patch.enabled` presente, aplicar via mesmo `upsert` (não via `setProviderEnabled` separado). +4 linhas.
3. **Especificar `code/reason` consistente** — todos 422 retornarem `{code:'agent.activation_blocked', reason: string}` (já faz) e 400 sempre `{code,message}`; cliente já espera `reason`. Não mudar cliente agora.
4. **Tighten CSRF** — `admin-agent-llm-config.ts:50` trocar `if (origin && …)` por `if (req.method!=='GET' && !origin) return 403` **ou** exigir `Origin` sempre, ou documentar “same-site, exige Origin” e adicionar header `Sec-Fetch-Site`. 1 linha.
5. **Corrigir `try/catch` de `updateRuntime`** — `llm-config-postgres.ts:223` capturar só `code==='42703' (undefined_column)` para retry sem fallback; rethrow outros. Preserva contexto (A3).
6. **Adicionar FK para `fallback_model_id`** — nova migration `V042`: `ADD CONSTRAINT fk_fallback_model FOREIGN KEY (fallback_model_id) REFERENCES agent_llm_models(id) ON DELETE SET NULL` (exige tipo compatível). Resolve dangling B-C1 fallback.

**P1 — Validação e tipos (1 arquivo, sem framework)**

7. **Unificar `ALLOWED_KINDS/SECRET_ALIASES` com V034** — gerar `CHECK` a partir da mesma const ou expandir V034 para incluir `anthropic,deepseek,…` e `candidate`. Migration `V042` corrige drift B-H1. Depois, `FIXED_ENDPOINTS` ganha entradas `anthropic: https://api.anthropic.com` etc., ou documenta que esses kinds usam `createOpenAICompatible` com baseURL genérica.
8. **Introduzir `zod` nas rotas admin (incremental)** — começar por `POST /providers` e `POST /models` com `z.object({id: z.string().trim().min(1).max(64).regex(/^[a-z0-9-]+$/) , kind: z.enum(ALLOWED_KINDS), …})`. Remove heurística B-H2; valida `secretAlias ∈ ALLOWED_SECRET_ALIASES`. Sem reescrever todas rotas.
9. **Extrair `Mapper` Runtime** — `apps/api/src/agent/runtime-mapper.ts` com `toAdminResponse(runtime:RuntimeConfig):LlmRuntime` e `toInternalSnapshot(...)`, usado por `admin` e `internal`. Elimina `runtime-config-client.ts` defensivo com 6 branches; contrato explícito.

**P2 — Separação de responsabilidade (mover, não inventar)**

10. **Split `llm-config-postgres.ts`** — `llm-config-store.ts` (interface), `llm-config-postgres.ts` (pg impl), `llm-config-memory.ts` (inMemory), `llm-config-mapper.ts`. Cada ~150 linhas. Inversão já existe (`LlmConfigStore`); só mover. Testa `bumpSecurityEpoch` com lock.
11. **Revalidar runtime em `setProviderEnabled/setModelEnabled`** — após toggle, se provider/model desativado e `runtime.providerId===id`, opcionalmente setar `runtime_status='unavailable'` ou retornar warning no response. Governança visível.
12. **Relay allowlist dinâmica** — `ALLOWED_MODELS` vir de env `RELAY_ALLOWED_MODELS=…` ou de `agent_llm_models` where enabled, com cache 60s. Evita deploy por modelo novo.

**P3 — Observabilidade e erros (não bloqueante)**

13. **Normalizar `ApiError` com `code`** — criar `LlmConfigError(status,code,message)` e `fastify.setErrorHandler` que mapeia `statusCode+code`; remover `Object.assign(Error…)` espalhado.
14. **Timeout/abort consistente** — `runtime-config-client.ts` adicionar `AbortSignal.timeout(5000)` e `private-broker-client.ts` usar `createSafeFetch` (manual redirect) em vez de `redirect:'error'` cru; padronizar `code: agent.timeout`.

**O que NÃO fazer agora:** CQRS/event-sourcing, gerador OpenAPI, ORM, ou “LLM gateway” abstrato — sobre-engenharia para 3 tabelas. Reavaliar só se `agent` ganhar multi-tenant por workspace.

---

## Apêndice — referências cruzadas por ponto obrigatório

- **Auth admin:** `admin-agent-llm-config.ts:40-95` (Better-Auth + isUserAdmin + CSRF), testes `admin-agent-llm-config.test.ts:95-156`
- **Auth internal/relay:** `internal-agent-llm-config.ts:16-27`, `internal-agent-llm-relay.ts:33-41`, registro `routes/index.ts:487-513` com defaults `dev-*`
- **Segredos:** `llm-config.ts:25-37` allowlist, `provider-registry.ts:16-21` throw em alias não-allowlisted, `model-factory.ts:57-64` missing_secret
- **Concorrência:** `llm-config-postgres.ts:208-216` FOR UPDATE CAS, `bumpSecurityEpoch:453` sem lock, `admin-agent-llm-config.ts:244-247` double-check
- **Validação:** `llm-config.ts:101-144` domínio, `internal-agent-llm-relay.ts:4-9` zod, `provider-registry.ts:24-37` modelId regex
- **SQL:** `llm-config-postgres.ts:56-84` todos `$1` parametrizados, `V034:41-48` CHECKs, `V041:3` FK
- **Estados inválidos:** `internal-agent-llm-config.ts:35-39` find sem enabled check, `admin-agent-llm-config.ts:331-343` delete sem validação
- **Tipos:** `apps/pwa/admin-agent-llm-config.ts:31-43` vs `apps/agent/runtime-config-client.ts:1-11`
- **Erro/timeout relay:** `internal-agent-llm-relay.ts:56-100` 60s Abort, `provider-probe.ts:103-152` 5s

> Critério code-craftsman atendido: cada recomendação preserva contrato explícito, mantém responsabilidade coesa (store vs mapper vs route) e erro com `code/reason` para cliente decidir.
