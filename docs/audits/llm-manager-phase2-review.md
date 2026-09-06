# Auditoria de revisão — LLM Manager Fase 2

**Data da verificação:** 2026-09-06  
**Modo:** somente leitura sobre código, testes e artefatos; nenhum código de produção, migration, deploy ou banco produtivo foi alterado.  
**Escopo principal:** os nove commits `d4dded0`, `a1c9c22`, `3ec9c09`, `5d968f2`, `a42478e`, `d4d503a`, `ac2013b`, `8ca285e` e `7aca5b4`.  
**Observação de histórico:** `HEAD` também contém `50cba2d` (`test(pwa): alinha expectativa legada à chamada com objeto de opções`), posterior ao conjunto principal; ele foi identificado e não foi confundido com os nove commits auditados. Os testes foram executados em `HEAD`, portanto incluem esse ajuste posterior.

## 1. Veredito executivo

**APROVADO COM AJUSTES — não pronto para produção.**

Os nove commits entregam a maior parte da estrutura proposta: o estado administrativo foi extraído para um hook, o carregamento possui cancelamento, a UI usa diálogo acessível, os contratos são compartilhados, o store PostgreSQL foi separado, há guards de metadados e locks de runtime, o relay passou a ter allowlist dinâmica, o probe não devolve a query com a chave Google, os snapshots exigem pares completos e existe um executor PostgreSQL descartável.

Todos os gates executados nesta revisão passaram, inclusive as quatro suítes PostgreSQL sem skip (`4 arquivos / 18 testes`) e as quatro famílias de corrida com dez rodadas. Isso comprova regressão funcional relevante, mas não fecha os riscos de release: o timeout do relay não limpa o timer em todos os caminhos nem limita corpo lento; o retry de conflito do hook não cobre fallback; os guards de upsert ainda não congelam toda a identidade/compatibilidade semântica de pares referenciados; snapshots lidos do SQLite persistido não passam pela mesma validação do snapshot remoto; e o bundle foi re-baselineado de `280,7 KB` para `495,04 KB` sem artefato before/after causal rastreável, além de manter fixtures/comentários com prefixes antigos.

**Não há autorização de deploy neste relatório.**

## 2. Matriz dos 11 critérios auditados

Os critérios abaixo são a matriz operacional usada para cobrir os 11 comportamentos solicitados, sem transformar um teste condicional em prova de release.

| # | Critério | Veredito | Evidência e limitação |
|---|---|---|---|
| 1 | `useAdminLlmConfig` concentra estado servidor, seleção, ações e `providerModels`, mantendo a Sheet como presenter | **PASS** | `apps/pwa/src/features/profile/useAdminLlmConfig.ts` e `AgentLlmSettingsSheet.tsx`; typecheck e suíte PWA passaram. |
| 2 | Carregamento cancelável e controle de mutação (`AbortController`, `isMutating`, retry de conflito) | **PASS COM LIMITAÇÃO** | Loads superseded/unmount abortam; UI desabilita Ativar, Fallback e cadastros; há retry único de `activate` em `agent.version_conflict`. O `setFallback` não faz o retry equivalente, e ações de exclusão não ficam desabilitadas durante mutação. |
| 3 | Confirmação destrutiva acessível, sem `window.confirm` | **PASS** | `ConfirmActionDialog` usa `role=dialog`, `aria-modal`, Escape, overlay, foco inicial e restauração de foco; testes da Sheet cobrem cancelamento sem exclusão. Não há focus trap completo, apenas foco/restauração. |
| 4 | Mensagens administrativas preservam semântica de `code/status/reason` | **PASS** | `formatApiError` mapeia conflitos/autorização, preserva razões 422 e inclui código em falhas desconhecidas; testes unitários e suíte PWA passaram. |
| 5 | Split do store PostgreSQL/memória/mapper com contrato compartilhado e sem dependência de framework | **PASS** | `llm-config-store.ts`, `llm-config-memory.ts`, `llm-config-postgres.ts` e mapper separado; `pnpm typecheck`, lint e testes API passaram. |
| 6 | Upsert de provider/model preserva `enabled` e impede alterações perigosas em item ativo/fallback | **PASS COM LIMITAÇÃO** | Guards e testes de memória cobrem eligibility, kind não executável, protocol/privacy e preservação de `enabled`; integração PostgreSQL cobriu ativação sob lock. Ainda é possível alterar identidade/associação de modelo ou trocar kind executável sem uma validação completa da compatibilidade kind↔protocol; a prova de todos esses casos no PostgreSQL não existe. |
| 7 | Contratos de kind, aliases, IDs de modelo e bloqueio do Codex permanecem alinhados | **PASS** | `PROVIDER_KINDS`, `KIND_SECRET_ALIASES`, `REGISTRY_UNSUPPORTED_KINDS`, `validateModelId` e registry usam fonte compartilhada; testes do Agent e V042 PostgreSQL passaram. A compatibilidade semântica de cada kind com cada protocol ainda é uma lacuna (ver R2). |
| 8 | Preflight, pares provider/model, toggles, deletes e concorrência mantêm invariantes | **PASS** | V042 preflight e idempotência foram exercitados; locks `FOR UPDATE` precedem guard/write; quatro famílias PostgreSQL executaram dez rodadas cada, sem referência final a item desabilitado. A prova cobre os cenários implementados, não todas as mutações de metadados. |
| 9 | Relay dinâmico e probe: env vence, DB habilitado com cache de 60s, fallback embutido e ausência de vazamento da chave | **PASS COM LIMITAÇÃO** | Quatro testes do relay cobrem DB on/off, env override, fallback embutido e expiração do TTL; probe Google remove query de detalhes de erro. O relay não usa allowlist embutida quando um store configurado falha, aceita a lista DB sem verificar provider habilitado/executável e o timeout não cobre corpo lento nem limpa o timer em `catch`. |
| 10 | Snapshot remoto/persistido exige pares coerentes e fallback por intenção | **PASS COM LIMITAÇÃO** | `internalSnapshotSchema` rejeita pares incompletos; cliente usa `safeParse` e flags fail-closed; colunas fallback são criadas/backfilled. Os testes usam mock de `sql.exec`, não SQLite Durable Object real, e uma linha já persistida é lida sem revalidação completa contra o schema. |
| 11 | Evidência de release: bundle budget, manifest fail-closed, executor PostgreSQL e gates | **PASS COM LIMITAÇÃO** | Executor PostgreSQL passou sem skip e limpa o container; bundle mediu `495,04 KB` equivalente e manifest atual verificou prefixes `89973f52-`/`510-`. O baseline subiu de `280,7 KB` para `495,04 KB`, não há artefato causal before/after versionado e fixtures/comentários ainda testam/documentam `624-`/`3896037c-`. |

## 3. Achados por área

### 3.1 PWA e interação administrativa

**Confirmado:**

- `useAdminLlmConfig` possui estado de providers, models, runtime, loading, erro, sucesso, seleção e mutação.
- `load()` cancela a requisição anterior e cancela a requisição ativa no unmount; respostas antigas não sobrescrevem o estado atual.
- `activate()` usa `expectedVersion` e faz uma única recarga/repetição em `409 agent.version_conflict`.
- A Sheet desabilita as ações principais durante mutação e não usa `window.confirm`.
- O formatter mantém razão de governança 422 e código de falhas não reconhecidas.

**Residual:**

- `setFallback()` captura o conflito como erro, mas não recarrega e repete como `activate()`.
- Os botões de excluir provider/model não recebem `disabled={isMutating}`; a proteção está no diálogo e no store, não na camada de interação.
- O hook não é um mutex: chamadas programáticas concorrentes ainda podem ser iniciadas fora da UI, que apenas reduz o duplo clique visual.

### 3.2 Contrato e persistência

**Confirmado:**

- O contrato isomórfico não importa código de servidor.
- Aliases por kind e o conjunto de kinds não executáveis são derivados de uma fonte comum.
- `openai-codex-subscription` continua configurável como candidato bloqueado, mas não executável pelo registry/rotas/projeção.
- `updateRuntime`, toggles e deletes adquirem o lock da linha singleton antes de decidir e escrever.
- O savepoint no caminho legado de `updateRuntime` permite tratar `42703` sem deixar a transação inutilizável.

**Residual de maior consequência:**

- A revalidação de metadata de provider bloqueia demotion de eligibility e kind não executável, mas não impede toda troca entre kinds executáveis em provider referenciado. Um provider `anthropic` com model `chat-completions`, por exemplo, não é rejeitado apenas por incompatibilidade semântica.
- O guard de model congela `protocol`/`privacyClass`, porém não apresenta uma política equivalente explícita para `providerId`/`modelId` quando o registro referenciado é upsertado com outra identidade. A memória pode substituir a associação; o caminho PostgreSQL pode gerar conflito não mapeado. Sync captura alguns erros e os ignora, mas isso não substitui uma regra de imutabilidade testada.
- A validação da rota e a revalidação do store estão presentes, mas a combinação completa `kind ↔ protocol ↔ model` ainda não é uma regra única do domínio.

### 3.3 Relay e probe

A precedência implementada é clara:

1. `RELAY_ALLOWED_MODELS` CSV;
2. models `enabled` do store, em cache por 60 segundos;
3. allowlist embutida de modelos OpenCode gratuitos quando não há store.

O teste de quatro cenários passou. Entretanto, há duas limitações operacionais:

- `resolveAllowedModels()` propaga exceção de `listModels()`; quando o store existe e a consulta falha, não cai para a allowlist embutida. Se “fallback” significar disponibilidade mesmo com DB indisponível, o requisito não está fechado.
- O `AbortController` do relay é limpo somente após `fetch()` resolver. Rejeição de rede deixa o timer até expirar, e `res.json()` não está coberto pelo mesmo timeout. Corpo upstream lento pode permanecer pendente depois do limite nominal de 60 segundos.

No probe Google, a chave é necessária na URL de saída para a API upstream, mas `detail` usa `redactProbeUrl()` e não devolve query, `key=` ou o valor secreto. Isso protege o resultado de erro; não constitui prova de que nenhum proxy/upstream ou log externo jamais verá a URL de transporte.

### 3.4 Snapshots

A fronteira remota está mais forte: o cliente valida o payload inteiro com `internalSnapshotSchema`, rejeita pares pela metade e aplica as flags `activeDisabled`/`fallbackDisabled` novamente antes de devolver IDs ao executor.

A persistência local ainda tem uma assimetria: `resolveIntentionSnapshot()` retorna uma linha existente de `intention_snapshots` antes de buscar e validar o snapshot remoto. A normalização adiciona `null` aos campos fallback ausentes, mas não valida protocolo, IDs, par, provider executável ou valores numéricos da linha já salva. Os testes de fallback verificam chamadas e SQL por mock; não exercitam schema legado e concorrência no SQLite real do Durable Object.

### 3.5 Bundle e reprodutibilidade

A execução atual produziu:

- `49` chunks;
- inicial: `136,05 KB` gzip;
- total físico: `619,13 KB` gzip;
- chunks classificados como framework: `124,09 KB` gzip;
- `app/` lazy: `100,66 KB` gzip;
- conjunto equivalente: `495,04 KB` gzip.

O manifest atual comprovou `89973f52-` e `510-` em `rootMainFiles`, e o gate unilateral contra `budget.json` passou. Porém:

- `budget.json` ainda descreve a exclusão histórica `624-*/3896037c-*`;
- comentários e fixtures de `apps/pwa/src/__tests__/bundle-budget.test.ts` continuam usando os prefixes antigos, enquanto o script e o teste de fake build usam os novos;
- o baseline equivalente foi refeito de `280,7 KB` para `495,04 KB` (+`214,34 KB`, aproximadamente +`76,4%`), e a nota afirma uma comparação limpa de `494,75 → 495,04 KB` sem artefato rastreável anexado;
- portanto, o gate prova que o estado atual está dentro do novo limite, mas não prova sozinho que o crescimento histórico não contém regressão introduzida pelo refactor.

## 4. Gates e evidências reproduzíveis

| Comando/ação | Resultado | Observação |
|---|---|---|
| `pnpm typecheck` | **PASS** | API, PWA, Agent e codex-broker; somente warning de depreciação do runner Node. |
| `pnpm lint` | **PASS** | 0 erros, 8 warnings de lint já presentes no workspace PWA. |
| `pnpm docs:lint` | **PASS** | 8 documentos, 0 issues. |
| `pnpm governance:check` | **PASS** | Nenhuma alteração D01–D19 detectada. |
| `pnpm test` | **PASS** | API: 146 arquivos/1.063 testes; PWA: 132/1.226; total raiz: 2.289 testes. O script raiz exclui integrações e não inclui Agent. |
| `pnpm --filter pi-finance-agent test` | **PASS** | 32 arquivos/149 testes; warnings de sourcemap de dependências. |
| `pnpm --filter @pi-finance/llm-contracts typecheck` | **PASS** | Pacote compartilhado sem script de testes próprio. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-llm-postgres-integration.ps1` | **PASS** | 4 arquivos/18 testes, todos executados, nenhum skip; Postgres 16 descartável em cinco bancos. |
| `docker ps -a --filter "name=llm-it-pg-"` | **PASS** | Nenhuma linha após a suíte; container removido pelo `finally`. |
| `cd apps/pwa && node scripts/measure-bundle.mjs` | **PASS COM LIMITAÇÃO** | Manifest verificado; equivalente `495,04 KB`; limitações do re-baseline e fixtures descritas acima. |
| `git diff --check` | **PASS** | Sem erro de whitespace. |
| `git status --short` | **PASS DE ESCOPO** | Antes deste relatório, somente `?? docs/audits/`; nenhuma mudança de código/migration/deploy. |

### 4.1 Integração PostgreSQL detalhada

O executor `scripts/run-llm-postgres-integration.ps1` criou um container `postgres:16-alpine`, usou uma porta aleatória, separou os bancos por suíte, exportou `DATABASE_URL_TEST_*` e `DB_TEST_MARKER`, executou:

- `postgres-llm-atomic-guards.test.ts`: 5 testes, incluindo as famílias de corrida em 10/10;
- `postgres-llm-fix.test.ts`: 7 testes, incluindo aliases, preflight, idempotência, revalidação e FK `NO ACTION`;
- `postgres-llm-v042-alignment.test.ts`: 4 testes;
- `postgres-agent-llm-config.test.ts`: 2 testes.

Resultado: **18/18 PASS, 0 SKIP**. A política de FK observada continua sendo `NO ACTION`; isso foi testado como comportamento atual, não como aprovação automática da política formal caso o requisito de produto exija `ON DELETE SET NULL`.

## 5. Riscos residuais priorizados

### R1 — Alto: timeout do relay não é integralmente bounded

`internal-agent-llm-relay.ts` limpa o timer apenas no caminho em que `fetch()` retorna e antes de consumir o JSON. Falha de rede deixa timer pendurado e corpo lento não é abortado. Isso afeta disponibilidade, concorrência de requests e previsibilidade de custo.

**Condição de liberação:** usar limpeza em `finally` e um limite que cubra também a leitura do corpo; testar rejeição de rede, timeout e resposta com body lento.

### R2 — Alto: upsert pode alterar semântica de par referenciado

A proteção cobre parte da metadata, mas não uma matriz completa de identidade, provider ownership e compatibilidade kind↔protocol. A memória e o PostgreSQL não têm exatamente a mesma falha/garantia para alteração de identidade de model em conflito.

**Condição de liberação:** tornar identidade/associação de item referenciado imutável ou rejeitá-la explicitamente em ambos os stores; adicionar testes de cada kind executável com protocol incompatível e integração PostgreSQL.

### R3 — Médio/alto: snapshot persistido não é revalidado na leitura

Uma linha local existente pode evitar a fronteira remota validada. A migração de colunas é tolerante, mas a tolerância também pode ocultar falha de alteração e retornar snapshot apenas em memória.

**Condição de liberação:** validar linhas locais com o mesmo contrato/invariantes antes de executar, testar SQLite Durable Object real e cobrir corrida de inicialização/alteração.

### R4 — Médio: bundle gate contra baseline amplo demais

O gate é unilateral e passa, mas a troca de baseline torna a comparação histórica não conclusiva. A documentação do budget e os fixtures estão desalinhados com os prefixes atuais.

**Condição de liberação:** atualizar toda a evidência para os prefixes atuais e anexar medições before/after reproduzíveis do refactor, mantendo o baseline antigo como referência histórica ou justificando formalmente a nova linha.

### R5 — Médio: fallback e allowlist em falha de dependência

O fallback embutido existe apenas sem store. Falha de consulta do store vira erro do relay; além disso, models DB habilitados são aceitos sem uma checagem explícita de provider habilitado/executável.

**Condição de liberação:** decidir formalmente se DB indisponível deve fail-closed ou usar fallback; se usar fallback, cobrir erro de `listModels`; se fail-closed, devolver código operacional explícito. Filtrar também o estado do provider se isso fizer parte da política.

### R6 — Baixo/médio: UX de conflito e mutação incompleta

A UI cobre o caminho principal, mas fallback não repete em conflito e exclusões não são desabilitadas durante mutação. O endpoint `test-connection` permanece stub `not_configured` da fase anterior, portanto não deve ser apresentado como prova de probe administrativo ao vivo.

## 6. Decisão de release

- **Código:** não aprovado para produção sem os itens R1–R4 resolvidos ou formalmente aceitos pelo responsável.
- **Testes:** aprovados no escopo executado; a ausência anterior de banco não se aplica a esta execução, pois o executor descartável passou sem skip.
- **Segurança:** melhorias confirmadas na allowlist, aliases, comparação de token e redaction; ainda falta fechar a superfície de timeout/erro e a compatibilidade semântica de pares.
- **Deploy/migration:** não executados.
- **Artefato criado:** somente `docs/audits/llm-manager-phase2-review.md` nesta etapa; nenhuma correção foi aplicada.

## 7. Referências principais

- `apps/pwa/src/features/profile/useAdminLlmConfig.ts`
- `apps/pwa/src/features/profile/AgentLlmSettingsSheet.tsx`
- `apps/pwa/src/components/ConfirmActionDialog.tsx`
- `apps/pwa/src/lib/api/format-api-error.ts`
- `apps/api/src/agent/llm-config-store.ts`
- `apps/api/src/agent/llm-config-memory.ts`
- `apps/api/src/agent/llm-config-postgres.ts`
- `apps/api/src/routes/internal-agent-llm-relay.ts`
- `apps/api/src/routes/internal-agent-llm-config.ts`
- `apps/agent/src/llm/provider-probe.ts`
- `apps/agent/src/llm/runtime-config-client.ts`
- `apps/agent/src/finance-chat-agent.ts`
- `packages/llm-contracts/src/types.ts`
- `packages/llm-contracts/src/schemas.ts`
- `apps/pwa/scripts/measure-bundle.mjs`
- `apps/pwa/src/__tests__/bundle-budget.test.ts`
- `apps/pwa/budget.json`
- `apps/pwa/bundle-report.json`
- `scripts/run-llm-postgres-integration.ps1`
- `scripts/run-llm-postgres-integration.sh`
