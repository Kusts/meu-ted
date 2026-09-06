# Auditoria — LLM Manager PWA (frontend)

**Escopo:** `apps/pwa/src/features/profile/AgentLlmSettingsSheet.tsx`, `apps/pwa/src/lib/api/admin-agent-llm-config.ts`, `apps/pwa/src/lib/llm-presets.ts`, `apps/pwa/src/features/profile/__tests__/AgentLlmSettingsSheet*.test.tsx`, `apps/pwa/src/lib/api/admin-agent-llm-config.test.ts` + comparação contrato `apps/api/src/routes/admin-agent-llm-config.ts` (leitura).  
**Data:** 2026-09-05 — **Autor:** Coder A (Orca `task_221198200f47`)  
**Modo:** somente leitura — nenhuma alteração de código do app.

---

## 1) Resumo arquitetural — como o gerenciador funciona hoje

Fluxo cliente → servidor:

```
BottomSheet (UI) → apiFetch (client.ts, Bearer session + x-device-token)
  → GET /admin/agent/llm-config → { providers, models, runtime }
  → POST /providers/:id/toggle, /models/:id/toggle, /providers, /models, /activate, /fallback, DELETE /providers/:id, /models/:id
    ↕ guard (Better-Auth + adminEmails + CSRF trustedOrigins) → LlmConfigStore (Postgres ou InMemory) → tabelas agent_llm_providers / agent_llm_models / agent_llm_runtime_config (singleton 'active', version + securityEpoch, optimistic concurrency via expectedVersion)
```

**Sheet (`AgentLlmSettingsSheet.tsx:27-698`):** componente client com 13 `useState` locais + `loadConfig` via `useCallback`. Ao abrir (`open=true`), `useEffect` agenda `loadConfig` num `setTimeout(0)`; `loadConfig` busca `fetchAdminLlmConfig()` e hidrata `providers/models/runtime` e 4 seletores (`selectedProviderId`, `selectedProviderModelId`, `activeModelChoice`, `fallbackModelChoice`). CRUD exposto: criar provedor custom (`handleCreateProvider`), criar via presets (`handleCreatePreset` — itera `LLM_PROVIDER_PRESETS`), criar modelo (`handleCreateModel`), toggle habilitado, exclusão com `window.confirm`, ativação global (`activateModel` com `expectedVersion: runtime.version, rolloutMode:"all"`) e fallback (`setFallbackModel`). Renderiza 5 seções: Runtime Ativo, Gerenciar Provedores (select + grid presets + form custom), Modelos do Provedor, Governança Ativa (Modelo Atual / Fallback), listas Provedores/Modelos com badges `Ativo`/`Habilitado` e ações `Ativar Global`.

**Client API (`admin-agent-llm-config.ts:1-166`):** tipa `Protocol/PrivacyClass/RolloutMode/ProviderEligibility`, `LlmProvider/LlmModel/LlmRuntime/AdminLlmConfigResponse` e expõe 9 funções `fetchAdminLlmConfig/toggleProvider/toggleModel/activateModel/createProvider/updateProvider/deleteProvider/createModel/deleteModel/setFallbackModel/syncCatalog` — todas thin wrappers sobre `apiFetch` com `encodeURIComponent` e `JSON.stringify`.

**Presets (`llm-presets.ts:1-145`):** constante `LLM_PROVIDER_PRESETS` (9 entradas: openai/anthropic/deepseek/qwen/glm/minimax/opencode-zen/opencode-go/openai-codex-subscription) cada uma com `id/kind/transport/authMode/secretAlias/description/autoModels[]`. Helpers `getLlmPreset`/`getLlmPresetBySecretAlias`.

**Contrato servidor (`admin-agent-llm-config.ts:30-397`):** Fastify `registerAdminAgentLlmConfigRoutes` com `guard` (CSRF + bloqueio de `baseUrl/apiKey` no body + `getBetterAuthSessionContext` + `isUserAdmin`). Rotas: `GET /llm-config`, `POST /sync-catalog`, `POST /providers/:id/toggle`, `POST /models/:id/toggle`, `POST /models`, `POST /activate` (valida `canActivate`, exige `expectedVersion`), `POST /rollout`, `POST /security-epoch`, `POST /providers`, `PATCH /providers/:id`, `DELETE /providers/:id`, `DELETE /models/:id`, `POST /fallback` (409 em conflito de versão), `POST /test-connection` (stub).

Estado global: não há store/Zustand/React-Query; toda mutação faz `await loadConfig()` para re-hidratar. Erros são `setError((e as Error).message)`; sucesso vai para `actionSuccess`. Sem invalidação fina, sem cache, sem abort.

---

## 2) Bugs — severidade, file:line, evidência, cenário de falha

### CRITICAL

| # | Severidade | Local | Evidência | Cenário de falha |
|---|-----------|-------|-----------|------------------|
| B-C1 | CRITICAL | `AgentLlmSettingsSheet.tsx:196-212` | `try { await toggleProvider(preset.id,true);}catch{}` e loop `for (const m of preset.autoModels){ try{await createModel(...) }catch{} try{await toggleModel(modelId,true)}catch{}}` | Usuário clica em preset “OpenAI”. `createProvider` ok, mas 1 dos 3 `createModel` falha (409/422 rede). Erros são silenciados; o preset aparece como “cadastrado com 3 modelos” (`setActionSuccess` linha 215) quando só 2 existem. Próximo `activateModel` em modelo faltante falha com `provider and model are required` sem explicar que a criação foi parcial. Diagnóstico impossível no UI. |
| B-C2 | CRITICAL | `admin-agent-llm-config.ts:31-43` ↔ `admin-agent-llm-config.ts (API):98-104` + `AgentLlmSettingsSheet.tsx:287-304,631-633` | Client `LlmRuntime` tipa `activeProviderId/activeModelId/activeProtocol/activeRolloutPercentage/id` enquanto servidor retorna `RuntimeConfig` `{providerId, modelId, rolloutMode, ...}` ( `store.getRuntime().providerId` ). Sheet acessa `runtime?.activeProviderId` e `runtime?.activeModelId` — chaves que o servidor nunca envia. | Em produção `GET /llm-config` retorna `providerId:"openai-api"`; UI lê `activeProviderId` → `undefined` → card “Runtime Ativo” exibe `— Nenhum` (linha 293/297) e badge `Ativo` nunca acende (condição linha 631 falha no primeiro operando). Usuário ativa modelo com sucesso (200), recarrega e continua vendo “Nenhum” — parece que ativação falhou. Testes mascaram o drift porque mockam shape do cliente (ex.: `AgentLlmSettingsSheet.active.test.tsx:29` usa `activeModelId:"opencode-zen:gpt-4.1"`). |

### HIGH

| # | Severidade | Local | Evidência | Cenário de falha |
|---|-----------|-------|-----------|------------------|
| B-H1 | HIGH | `AgentLlmSettingsSheet.tsx:44-72` + `74-80` | `const loadConfig = useCallback(..., [selectedProviderId, selectedProviderModelId])` e `useEffect(()=>{ if(!open) return; const timer=setTimeout(()=>void loadConfig(),0); return()=>clearTimeout(timer); },[open, loadConfig])` com `loadConfig` setando `setSelectedProviderId(...)` linhas 52-55 | Ciclo de reload: usuário troca `selectedProviderId` no select → `loadConfig` recriada → `useEffect` dispara → `loadConfig` lê API e eventualmente chama `setSelectedProviderId` novamente (linha 55) → novo `loadConfig` → loop. Na prática 1 troca gera 2–3 `GET /llm-config` em sequência, flicker de loading e condição de corrida onde resposta antiga sobrescreve seleção recente. |
| B-H2 | HIGH | `AgentLlmSettingsSheet.tsx:151-168` | `kind: id as never` (linha 162) em `handleCreateProvider` | Usuário digita “my-provider” e clica Cadastrar. Cliente envia `{id:"my-provider", kind:"my-provider", secretAlias:"OPENCODE_ZEN_API_KEY"}`. Servidor `validateProvider` rejeita (`invalid kind`) porque `ALLOWED_KINDS` não contém `my-provider` → 400. UI genérica “invalid kind” sem dizer que `my-provider` não é kind válido. Fluxo custom está quebrado para qualquer id fora de `ALLOWED_KINDS` — o campo deveria ser `kind` ou id=kind. |
| B-H3 | HIGH | `AgentLlmSettingsSheet.tsx:158-164` + `384-414` | `createProvider` envia `secretAlias: newProviderSecretAlias` com default `"OPENCODE_ZEN_API_KEY"` mas select de alias é independente do `id` escolhido | Usuário cria provedor `anthropic` e esquece de trocar alias (permanece `OPENCODE_ZEN_API_KEY`). Servidor aceita porque alias está em `ALLOWED_SECRET_ALIASES`, mas runtime tentará resolver `OPENCODE_ZEN_API_KEY` para Anthropic → falha silenciosa em `runtimeStatus`. Nenhuma validação cruzada `id ↔ secretAlias`. |
| B-H4 | HIGH | `AgentLlmSettingsSheet.tsx:248-259` + `261-271` | `handleDeleteProvider` faz `if(selectedProviderId===providerId) setSelectedProviderId("")` mas não limpa `selectedProviderModelId/activeModelChoice/fallbackModelChoice` e chama `await loadConfig()` que recalcula apenas se `selectedProviderId` vazio | Deleta provedor ativo “opencode-zen”. `selectedProviderId` vira `""`, mas `selectedProviderModelId` permanece `"opencode-zen:gpt-4o"` órfão. Lista `providerModels` (linha 273) fica vazia, select mostra “Nenhum modelo” mas `handleCreateModel` ainda exige `selectedProviderId` → cria modelo falha “Selecione um provedor”. `fallbackModelChoice` pode permanecer apontando para modelo deletado → próximo `handleSetFallback` resolve `fallbackModel` como null e envia `providerId:null` — correto por acaso, mas sem feedback. |
| B-H5 | HIGH | `AgentLlmSettingsSheet.tsx:122-130` | `const model = models.find(m=>m.id===activeModelChoice \|\| m.modelId===activeModelChoice)` usado em `handleSetActiveViaSelector` | `activeModelChoice` é sempre `m.id` (select linha 521 `value={m.id}`), então segundo ramo `m.modelId` nunca casa em DB normal, mas é necessário por causa do legado `runtime.activeModelId === "gpt-4o"` (teste linha 83). Se dois provedores têm mesmo `modelId` (`gpt-4o`), o `find` retorna o primeiro da lista (ordem `listModels` ordena por provider), ativando provedor errado. Cenário: `openai:gpt-4o` e `opencode-zen:gpt-4o` cadastrados → usuário seleciona `openai:gpt-4o` no dropdown, `find` pega `opencode-zen:gpt-4o` (primeiro) → ativa provedor diferente do exibido. |
| B-H6 | HIGH | `AgentLlmSettingsSheet.tsx:132-149` | `const fallbackModel = fallbackModelChoice ? models.find(...) : null; const providerId = fallbackModel? fallbackModel.providerId : null;` | Se usuário seleciona “Nenhum (sem fallback)” (`fallbackModelChoice=""`), `providerId/modelId` viram `null` — correto. Mas se `fallbackModelChoice` aponta para modelo deletado entre `loadConfig` e clique (concorrência), `find` retorna undefined → envia `null/null` e remove fallback silenciosamente em vez de erro “modelo não encontrado”. Perda de config sem confirmação. |

### MEDIUM

| # | Severidade | Local | Evidência | Cenário de falha |
|---|-----------|-------|-----------|------------------|
| B-M1 | MEDIUM | `AgentLlmSettingsSheet.tsx:82-120,132-271` | Nenhum handler desabilita botão nem guarda `loading` por ação; somente `loadConfig` tem `setLoading` | Duplo clique em “Ativar Global” dispara duas `activateModel` com mesmo `expectedVersion` (ex.: v3). Primeira sucede (v3→v4), segunda recebe 409 `agent.version_conflict` mas `setError` mostra “Conflito de versão de configuração” sem orientar “recarregue”. Usuário tenta novamente sem `loadConfig` intermediário → repete 409. |
| B-M2 | MEDIUM | `AgentLlmSettingsSheet.tsx:67-69,89,100,118,147` | `setError((e as Error).message)` em todos os catches | `apiFetch` lança `ApiError(status,code,message)` ( `client.ts:168-172` ) com `code` (`agent.activation_blocked`, `agent.version_conflict`, `agent.invalid_enabled` etc.) e `reason`. Sheet descarta `code/status/reason` e mostra só `message` (“provider is not approved for activation”). Em 422 de `canActivate`, usuário não vê `reason` detalhado; em 409 não vê que precisa recarregar. Perda de contexto para suporte. |
| B-M3 | MEDIUM | `AgentLlmSettingsSheet.tsx:74-80` | `setTimeout(0)` sem abort do `fetchAdminLlmConfig` | Abre sheet, fecha em <100ms → timer ainda dispara `loadConfig` → `setProviders/setModels` em componente com `open=false` (ainda montado) ou desmontado → React warning “update on unmounted component” se rota desmontar. Sem `AbortController`, fetch antigo pode resolver depois de fetch novo e sobrescrever estado. |
| B-M4 | MEDIUM | `AgentLlmSettingsSheet.tsx:62-65` | `if(filtered.length>0 && !selectedProviderModelId){ setSelectedProviderModelId(filtered[0].id) }` | Troca de provedor no select não atualiza `selectedProviderModelId`. Fica apontando para modelo do provedor anterior → select “Modelo do provedor” exibe valor que não pertence à lista filtrada (React mostra warning de value not in options) e `handleCreateModel` pode usar `selectedProviderId` novo mas UI exibe modelo órfão. |
| B-M5 | MEDIUM | `AgentLlmSettingsSheet.tsx:414-428,487-500` | Botão oculto `className="hidden"` com `aria-label="Novo Provedor"/"Novo Modelo"/"Adicionar Modelo"` duplicando `handleCreateProvider/handleCreateModel` | Leitores de tela e testes encontram 2 botões com mesmo handler mas só um visível. `crud.red.test.tsx:67` passa por `getByRole("Cadastrar Provedor")` (visível) mas a existência do hidden cria falso-positivo de cobertura; realinhamento visual quebra testes que buscam por label oculto. Acoplamento teste↔DOM frágil. |
| B-M6 | MEDIUM | `admin-agent-llm-config.ts:1-49` vs `llm-presets.ts:1-6` vs `admin-agent-llm-config.ts (API):1-8` | `PrivacyClass` cliente: `"training_prohibited"\|"zero_retention_required"\|"enterprise_standard"`; presets/API: `"training_prohibited"\|"training_allowed"` | Drift de contrato: preset com `privacyClass:"training_prohibited"` funciona, mas se backend aceitar `"training_allowed"` (linha 8 api) e cliente enviar `"training_allowed"` será rejeitado pelo type check do cliente (não compila sem `as never`). Sheet força `"training_prohibited"` (linha 238) mascarando drift até que novo preset precise de outra classe. |
| B-M7 | MEDIUM | `AgentLlmSettingsSheet.tsx:273` | `const providerModels = models.filter(m=>m.providerId===selectedProviderId)` recomputado a cada render sem memo | Com 50+ modelos, filtro O(n) por render + listas duplicadas (select + cards) — não é bug funcional, mas causa render extra quando `selectedProviderId` vazio (filtra tudo a cada digitação em inputs). |
| B-M8 | MEDIUM | `admin-agent-llm-config.ts:102-111` | `updateProvider` existe no client mas nunca usado no Sheet | Dead code: cliente expõe `PATCH /providers/:id` para `secretAlias/eligibility/enabled`, mas Sheet só usa toggle/delete/create. Atualização de alias elegível exige recriar provedor → UX incompleta e rotação de alias não testada. |

### LOW

| # | Severidade | Local | Evidência | Cenário de falha |
|---|-----------|-------|-----------|------------------|
| B-L1 | LOW | `AgentLlmSettingsSheet.tsx:44-72` | Cast `runtime as unknown as {fallbackModelId?:...}` linhas 59,300-303 | Fragilidade tipada: se servidor renomear campo, cast silencia erro de compilação. Já há mismatch real (`providerId` vs `activeProviderId`). |
| B-L2 | LOW | `admin-agent-llm-config.ts:152-166` | `syncCatalog` não usado no Sheet, sem UI | Capacidade ociosa; catálogo só via curl. |
| B-L3 | LOW | `AgentLlmSettingsSheet.tsx:76-78` | `void loadConfig()` sem await nem catch no `useEffect` (erro só dentro de `loadConfig`) | Erro de `loadConfig` após unmount não é observado; promise rejeitada fora do try do effect não gera warning, mas dificulta debug de abort. |
| B-L4 | LOW | `AgentLlmSettingsSheet.tsx:583-584` | Exibição de `secretAlias` em `<code>` por provedor | Alias não é segredo, mas enumera superfície de ataque (quais vault keys existem). Não é vazamento de valor, mas informação útil para enumeração. |
| B-L5 | LOW | `AgentLlmSettingsSheet.tsx:354-374` | Preset button `disabled={exists}` só verifica `id` | Se provedor existe mas foi criado com `eligibility:"experimental_blocked"`, botão fica desabilitado mesmo que preset pudesse recriar/atualizar para `approved`. |

---

## 3) Falhas de arquitetura

**A1 — Estado todo no componente, sem separação de responsabilidade (`AgentLlmSettingsSheet.tsx:27-43`)**  
13 `useState` + `loadConfig` + 10 handlers no mesmo `function` de 698 linhas. Violação de coesão: estado de servidor (providers/models/runtime), estado de seleção (4 ids), estado de formulário (3 inputs), estado de UI (loading/error/success) convivem sem hook custom nem presenter. Consequência: `loadConfig` depende de `selectedProviderId/selectedProviderModelId` (linha 72) apenas para decidir defaults, criando acoplamento que força reload ao trocar seleção (B-H1). Nomes como `newProviderId`, `newModelIdInput`, `activeModelChoice` revelam intenção local, mas `providerModels` filtrado inline esconde regra de filtragem.

**A2 — Contrato duplicado e divergente em 3 lugares**  
- `apps/pwa/src/lib/api/admin-agent-llm-config.ts:3-43` (`Protocol/PrivacyClass/LlmRuntime`)  
- `apps/pwa/src/lib/llm-presets.ts:1-6` (`LlmPresetModel`)  
- `apps/api/src/agent/llm-config.ts:1-55` (`ProviderKind/Transport/AuthMode/Protocol/PrivacyClass/RuntimeConfig`)  
Sem single source: `PrivacyClass` tem 3 variantes vs 2, `Runtime` tem `activeProviderId` vs `providerId`, `LlmProvider` cliente tem `name/baseUrl` que servidor nunca persiste. Casting `as never` (linhas 162,189-192,204) silencia o type-checker em vez de alinhar contratos. Qualquer migração de DB (fallback adicionado com `try/catch` em `llm-config-postgres.ts:137-202`) exige cast no cliente (`as unknown as {fallbackModelId}`).

**A3 — Interface esconde pouco, acopla muito**  
Sheet importa `apiFetch` indiretamente via 9 funções finas (`fetchAdminLlmConfig/toggleProvider/...`) mas conhece detalhes de protocolo (`protocol` select linha 472-485), `privacyClass` hardcoded (linha 238), e chaves de concorrência (`expectedVersion: runtime.version` linhas 112,141). A UI decide `rolloutMode:"all"` (linha 113) fixo — detalhe de rollout vazado para componente de CRUD. Deveria haver camada `useLlmConfig()` que encapsula versionamento, mapeamento `RuntimeConfig→LlmRuntime` e regras `canActivate`.

**A4 — Handling de erro perde contexto**  
`client.ts:82-91` define `ApiError(status,code,message)` rico, mas Sheet faz `setError((e as Error).message)` (7 ocorrências). Código de erro (`agent.version_conflict`, `agent.activation_blocked`) e `reason` do servidor (linha 218 api) são descartados; não há distinção 400 vs 409 vs 422 para orientar retry/recarregamento. `toggleProvider`/`toggleModel` não surface `404 provider not found` de forma distinta.

**A5 — Concorrência otimista incompleta**  
- `activateModel` e `setFallbackModel` enviam `expectedVersion` e tratam 409 (api `llm-config-postgres.ts:216-221` com `SELECT ... FOR UPDATE`), porém Sheet não faz retry nem invalida `runtime.version` após 409 — fica com version stale até próximo `loadConfig` manual.  
- `toggleProvider/toggleModel/deleteProvider/deleteModel` não usam `expectedVersion`; dois admins concorrentes podem habilitar/desabilitar mesmo provedor sem detecção de conflito — última escrita vence sem aviso.  
- `loadConfig` sem abort/eTag: fetch A (lento) pode sobrescrever fetch B (rápido) — stale write.

**A6 — Responsabilidade de validação no lugar errado**  
Validação de `kind/transport/authMode/secretAlias` vive só no servidor (`validateProvider` linha 101 api) mas UI permite criar provedor com `id` arbitrário (B-H2) e `secretAlias` desconectado do `id` (B-H3). Presets já codificam combinação válida, mas formulário custom não reaproveita `validateProvider` nem `ALLOWED_SECRET_ALIASES`.

**A7 — Dependência de `window.confirm`/`window` global**  
`handleActivate:105-106`, `handleDeleteProvider:249`, `handleDeleteModel:262` chamam `window.confirm` diretamente, acoplando lógica de mutação a API de browser e tornando testes dependentes de `vi.spyOn(window,"confirm")`. Dificulta extrair lógica para hook testável e impede confirmação custom acessível.

---

## 4) Segredos (`secretAlias`) — como são tratados/expostos

**O que é `secretAlias`:** não é o valor da API key, é o nome da variável/env no vault (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.). Vault real fica no servidor; cliente nunca recebe valores.

**Exposição na UI:**
- Lista de Provedores exibe `p.secretAlias` em `<code>` ( `AgentLlmSettingsSheet.tsx:583` ): ` <code>{p.secretAlias || "—"}</code>` — por provedor, sempre visível.
- Grid de Presets exibe `preset.secretAlias` (linha 371): `{preset.autoModels.length} modelos • {preset.secretAlias}`.
- Card “Novo provedor” tem `<select>` com 10 aliases hard-coded (linhas 401-410) — enumera superfície completa.

**Exposição no client (`admin-agent-llm-config.ts:84-93,104`):**
- `createProvider` envia `secretAlias` em JSON para `POST /providers`; `updateProvider` permite `PATCH {secretAlias}`.
- `LlmProvider.secretAlias: string|null` é retornado em `GET /llm-config` para todos os admins — por design, pois admin precisa auditar qual env está mapeado.
- `llm-presets.ts` hard-coda aliases por provedor — não é segredo, mas facilita enumeração.

**Tratamento no servidor (`admin-agent-llm-config.ts:62-69,288-290`):**
- Correto: guard bloqueia `baseUrl/apiKey/api_key/base_url` no body (linha 64) — impede injeção de URL ou chave raw.
- Correto: `validateProvider` exige `secretAlias ∈ ALLOWED_SECRET_ALIASES` exceto `openai-codex-subscription` que deve ser `null` ( `llm-config.ts:106-112`).
- Correto: `createProvider` normaliza alias via `aliasMap` quando ausente (api linha 284-287) e valida antes de `upsert`.
- `GET /llm-config` retorna `secret_alias` (postgres linha 57) — intencional para admins, protegido por `guard` + `isUserAdmin`. Não vaza valor.

**Riscos residuais:**
1. Enumeração: qualquer admin comprometido lista todos os aliases e infere quais provedores estão provisionados — aceitável para role admin, mas deveria ser auditado (log de acesso a `/admin/agent/llm-config` já existe via `updatedBy`, porém leitura não é logada).
2. Alias inválido custom (B-H3) pode criar provedor com alias válido porém incorreto para o `kind` (ex.: `anthropic` + `OPENCODE_ZEN_API_KEY`) — servidor aceita porque valida apenas pertinência a `ALLOWED_SECRET_ALIASES`, não mapeamento `kind→alias`. Runtime falhará em `runtimeStatus` sem feedback claro.
3. `secretAlias` aparece em logs de rede (payload JSON) — não é segredo, mas se logs forem exportados, expõe topologia de secrets.
4. `updateProvider` (cliente) permitiria trocar `secretAlias` de provedor ativo sem revalidação de `runtime.version` nem confirmação — troca atômica sem `expectedVersion`.

**Classificação:** não há vazamento de valor de secret; exposição de alias é por design para admins e protegida por auth. Falha é de validação cruzada e auditabilidade, não de confidencialidade.

---

## 5) Gaps de teste

**Cobertura existente:**
- `admin-agent-llm-config.test.ts:15-66` — 3 testes de client: fetch, toggle, activate — verificam URL/method/body, sem erro, sem 409, sem encode, sem fallback/delete/syncCatalog/updateProvider.
- `AgentLlmSettingsSheet.test.tsx:50-79` — 2 testes: render e toggle provider — mocka `fetchAdminLlmConfig` shape cliente (não servidor), não testa erro, loading, confirmação, concorrência, presets, fallback.
- `AgentLlmSettingsSheet.active.test.tsx:14-95` — 3 testes de badge Ativo — cobrem canônico vs legado `modelId`, mas sempre com `activeModelId` shape cliente.
- `AgentLlmSettingsSheet.crud.red.test.tsx:39-84` — 5 testes RED→GREEN para seletores + create provider/model — verificam chamada de `createProvider/createModel`, mas dependem de hidden buttons (linha 67/81) e não assertam `loadConfig` pós-mutação, mensagem de sucesso, nem preset.

**Gaps (ordenados por risco):**

1. **Contrato client↔server nunca testado:** nenhum teste faz `GET /admin/agent/llm-config` real nem valida mapeamento `RuntimeConfig.providerId→LlmRuntime.activeProviderId`. Drift B-C2 passa despercebido. Falta teste de contrato (pact) com fixture do Postgres.
2. **Concorrência `expectedVersion`:** sem teste de 409 em `activate/fallback` e de retry/recarregamento. `llm-config-postgres.ts:205-292` tem lógica FOR UPDATE mas PWA não testa o caminho.
3. **Erros e códigos:** sem teste para 400/401/403/404/409/422 — `ApiError` é descartado (B-M2). Nenhum teste de `window.confirm` cancelado, de `apiFetch` timeout ( `client.ts:182-186` ), nem de CSRF 403.
4. **Preset com falha parcial (B-C1):** sem teste de `handleCreatePreset` quando 1 `createModel` falha — success message incorreta não coberta.
5. **Validação de criação:** sem teste de `handleCreateProvider` com `id` inválido (B-H2) ou alias incompatível (B-H3); sem teste de campo vazio (“ID obrigatório”, “Model ID obrigatório”).
6. **Delete e seleção órfã (B-H4):** sem teste de deleteProvider quando `selectedProviderId` é o deletado — `selectedProviderModelId` permanece órfão.
7. **Troca de provedor sem reset de modelo (B-M4):** sem teste de `onChange` do select provedor mantendo `selectedProviderModelId` stale.
8. **Filtragem e badge:** `providerModels` (linha 273) e `isCurrentActive` (631-633) com `m.id` vs `m.modelId` têm 3 testes felizes, mas falta caso com `modelId` duplicado entre provedores (B-H5).
9. **Fallback:** `handleSetFallback` com `fallbackModelChoice` órfão ou `null/null` não testado; `fallbackModelId` render no card (linha 300-304) não coberto por `crud.red.test` embora fixture tenha fallback.
10. **Acessibilidade/loading:** nenhum teste de `loading` spinner, `error` banner, `actionSuccess` auto-clear, nem de `BottomSheet` fechado ( `open=false` não chama `loadConfig` ).
11. **Client API:** `syncCatalog`, `updateProvider`, `deleteProvider/deleteModel`, `setFallbackModel` sem teste unitário; `encodeURIComponent` para id com `/` ou `:` (ex.: `opencode-zen:gpt-4o`) não testado — `toggleModel` usa `encodeURIComponent(modelId)` mas `deleteModel` também, sem caso.

---

## 6) Recomendações de refatoração — priorizadas (menor intervenção primeiro, sem abstração especulativa)

**P0 — Correções de 1–3 linhas, sem nova abstração**

1. **Tratar preset como transação visível** (`AgentLlmSettingsSheet.tsx:173-220`): remover `catch{}` vazio; coletar falhas num array e só chamar `setActionSuccess` se `failures.length===0`, senão `setError("Preset parcial: "+failures.join(", "))`. Trocar `as never` por helper `assertPresetKind(kind)` que valida `ALLOWED_KINDS`.
2. **Corrigir dependência de `loadConfig`** (`:44-72`): extrair `selectedProviderId` da dep list; `loadConfig` deve receber `selectedProviderId` como argumento ou computar defaults via `useEffect` separado. `useCallback` com `[]` + `useRef` para id atual elimina loop B-H1.
3. **Abortar fetch ao fechar** (`:74-80`): guardar `AbortController` em ref, passar `signal` para `fetchAdminLlmConfig` (expor `options.signal` em `admin-agent-llm-config.ts`), abortar no cleanup do effect e em novo `loadConfig`. Evita stale write B-M3.
4. **Resetar estado dependente no delete** (`:248-259`): ao deletar provedor, limpar `selectedProviderModelId`, `activeModelChoice`/`fallbackModelChoice` se apontarem para modelos do provedor deletado (filtrar `models.filter(m=>m.providerId===providerId)` antes de limpar).
5. **Resetar modelo ao trocar provedor** (`:335-347` select): em `onChange` do provider, `setSelectedProviderModelId("")` e deixar `loadConfig` ou effect preencher com primeiro de `providerModels`.

**P1 — Correção de contrato (tipagem), ainda localizada**

6. **Unificar tipos `Runtime`**: criar `mappers/runtime.ts` com `toUiRuntime(api: RuntimeConfig): LlmRuntime` que mapeia `providerId→activeProviderId`, `modelId→activeModelId`, `rolloutMode→activeRolloutPercentage` etc., e remover casts `as unknown` linhas 59/300. Atualizar `admin-agent-llm-config.ts:31-43` para `type LlmRuntime = ReturnType<typeof toUiRuntime>` ou importar tipo da API (`apps/api/src/agent/llm-config.ts`) como source of truth. Testes passam a usar fixture da API.
7. **Unificar `PrivacyClass/Protocol/ProviderKind`**: exportar de `apps/api/src/agent/llm-config.ts` e reexportar na PWA (ou gerar via `zod` compartilhado) — eliminar `llm-presets.ts:4` `"training_allowed"` vs cliente `"zero_retention_required"`.
8. **Validar criação no cliente**: antes de `createProvider`, chamar `validateProvider` importado da API (ou duplicado validado) e mostrar erro de campo (“kind inválido: my-provider”) em vez de 400 genérico. Validar `secretAlias ↔ kind` (mapa `kind→allowedAliases`).
9. **Preservar contexto de erro**: trocar `setError((e as Error).message)` por `setError(formatApiError(e))` onde `formatApiError` extrai `ApiError.code/status/reason` (`client.ts:82-91`) e monta `"[agent.version_conflict] Conflito de versão — recarregue (v3 vs v4)"`.

**P2 — Extração coesa, sem framework novo**

10. **Hook `useAdminLlmConfig()`** (novo arquivo `features/profile/useAdminLlmConfig.ts`): encapsula `providers/models/runtime/loading/error/success`, `load`, `toggleProvider`, `activate` com `expectedVersion` + retry em 409 (1× com `await load()`), `createPreset` transacional, e expõe `providerModels` memoizado. Sheet vira presenter: recebe `state/actions` e só renderiza. Critério code-craftsman: responsabilidade coesa, interface esconde `expectedVersion/rolloutMode`.
11. **Desabilitar ações durante mutação**: `isMutating` boolean no hook desabilita botões `Ativar/Salvar Fallback/Cadastrar` e mostra spinner inline — elimina duplo clique B-M1.
12. **Substituir `window.confirm` por `ConfirmDialog`**: extrair `confirmActivate(provider,model)` como prop injetável — testável sem `vi.spyOn(window)`.

**P3 — Gaps de teste (TDD RED→GREEN, sem inflar suíte)**

13. Teste de contrato: fixture real da API (`GET /admin/agent/llm-config` com `providerId/modelId`) → `screen.getByText` deve encontrar runtime via mapper (falha atual B-C2 vira RED).
14. Teste 409: mock `activateModel` rejeita com `ApiError(409,"agent.version_conflict",...)`, assert `setError` contém “recarregue” e `fetchAdminLlmConfig` foi chamado 2× (retry).
15. Teste preset parcial: mock `createModel` rejeita na 2ª chamada, assert `setError` contém “parcial” e `setActionSuccess` não chamado.
16. Teste delete órfão e troca de provedor: asserts de `selectedProviderModelId` resetado.

**Não fazer (abstração especulativa):** React Query/SWR, Zustand, geração OpenAPI, ou design system novo — o volume atual (9 presets, <100 modelos) não justifica. Reavaliar só se `syncCatalog`/canary forem expostos na UI.

---

## Apêndice — referências cruzadas

- Tipos cliente: `apps/pwa/src/lib/api/admin-agent-llm-config.ts:3-49`
- Tipos/validacão servidor: `apps/api/src/agent/llm-config.ts:1-144`, `apps/api/src/routes/admin-agent-llm-config.ts:40-95,288-290`
- Store/validação concorrência: `apps/api/src/agent/llm-config-postgres.ts:205-292` (`FOR UPDATE` + `version` check)
- Guard CSRF/secret: `apps/api/src/routes/admin-agent-llm-config.ts:49-70`
- Testes: `apps/pwa/src/lib/api/admin-agent-llm-config.test.ts:1-66`, `apps/pwa/src/features/profile/__tests__/AgentLlmSettingsSheet*.test.tsx`

> Critérios code-craftsman aplicados: nomes revelam intenção (ex.: `handleCreatePreset` deveria ser `createProviderFromPreset`), responsabilidade coesa (estado servidor vs seleção vs formulário separados), interfaces escondem `expectedVersion/rolloutMode`, erros preservam `code/reason`, contratos explícitos via single source.
