# Auditoria final — LLM Manager Fase 3

**Data:** 2026-09-06
**Modo:** revisão somente leitura; não foram aplicadas correções, migrations, deploys ou alterações em banco produtivo.
**Ponto fixo:** `7aca5b4..HEAD`.
**Escopo:** os 12 commits de endurecimento da Fase 3 (`601e3a8`, `6ba23b1`, `bcce9df`, `be726b1`, `0693205`, `75ba60d`, `82a931d`, `7458cea`, `1748b74`, `be573bc`, `d300bf8`, `91eeb8d`) e `50cba2d` apenas como contexto de teste PWA. A saída de `git log 7aca5b4..HEAD` contém 13 commits no total.

## 1. Veredito final da refatoração completa

# NÃO PRONTA PARA PRODUÇÃO

Os gates e testes solicitados passaram no estado auditado, inclusive a integração PostgreSQL real descartável com **19/19 testes e 0 skips** e o novo E2E API→Agent isolado com **3/3 testes**. Isso demonstra que os caminhos cobertos foram endurecidos, mas não transforma lacunas de especificação em aprovação: `validateModel` não aplica a matriz de compatibilidade, snapshots persistidos não passam por `safeParse`, e o guard CSRF deixa passar cookie-session sem `Origin`.

A correção row-id/model-name funciona no caminho novo com slot validado e o relay tem fail-closed, filtro de provider/kind, limpeza em `finally` e cobertura de corpo lento. Permanecem riscos de release em timeout total do relay, backfill apenas estrutural de linhas legadas, ausência de SQLite Durable Object real e cobertura E2E sem toggle de API; ver a lista priorizada na seção 5.

**Não há autorização de deploy neste relatório.**

## 2. Matriz de critérios

| # | Critério | Veredito | Evidência reproduzível | Limitação / risco |
|---|---|---|---|---|
| 1 | **R1 — relay timeout integral:** `finally`, rejeição de rede, timeout de headers e corpo lento | **PASS COM RESSALVA** | `apps/api/src/routes/internal-agent-llm-relay.ts:134-203` cria timer de headers, disputa `res.json()` com timer de corpo, aborta e limpa ambos em `finally`; `apps/api/tests/routes/internal-agent-llm-relay.test.ts` tem os casos “clears its timer”, “hung upstream headers” e “slow upstream body”. | O timer do corpo começa novamente depois de `fetch()` resolver; portanto `requestTimeoutMs` pode permitir quase dois budgets em uma resposta com headers lentos + corpo lento, apesar do comentário “Full upstream budget”. O teste de corpo usa `json()` pendente, mas não mede o budget combinado real. |
| 2 | **R2 — compatibilidade e identidade:** `KIND_PROTOCOL_COMPAT` única em `validateModel`/upsert, ownership imutável nos dois stores e testes por kind/PG | **FAIL** | A matriz existe em `packages/llm-contracts/src/types.ts:98-118`; `canActivate` aplica-a em `apps/api/src/agent/llm-config.ts:122-138`; upserts referenciados aplicam-na em `llm-config-memory.ts:317-355` e `llm-config-postgres.ts:486-557`; PG passou o caso Anthropic + protocolo incompatível e identidade. | `validateModel` em `llm-config.ts:106-120` não chama `isProtocolCompatibleWithKind` e nem recebe o kind do provider. Reprodução: `validateModel({providerId:'anthropic', modelId:'claude-x', protocol:'chat-completions', privacyClass:'training_prohibited'})` retornou `null`. Além disso, um upsert de provider referenciado pode trocar `openai-api` por kind executável `anthropic` deixando o model ativo `chat-completions`; reprodução em memória retornou `{kind:"anthropic", activeModel:"chat-completions"}`. A matriz de testes por kind cobre `canActivate`, não `validateModel`/upsert de cada kind. |
| 3 | **R3 — snapshot persistido e projeção:** `safeParse` na leitura local, descarte de linha corrompida, busca remota, projeção com `canActivate` e DO SQLite real/documentado | **FAIL** | Projeção interna em `apps/api/src/routes/internal-agent-llm-config.ts:52-98` usa `canActivate`, ownership e flags fail-closed; testes de mismatch/unapproved passam. `internalSnapshotSchema.safeParse` é usado pelo cliente remoto em `apps/agent/src/llm/runtime-config-client.ts:56-71`. | `FinanceChatAgent.resolveIntentionSnapshot()` em `apps/agent/src/finance-chat-agent.ts:142-160` retorna a primeira linha SQL normalizada imediatamente; não chama `safeParse`, não verifica par/IDs/protocolo e não descarta para buscar remoto. `intention-snapshot-fallback.test.ts` testa justamente que uma linha armazenada evita `fetch`, mas não há caso de linha corrompida que force descarte. Não há teste de SQLite Durable Object real; a limitação é documentada aqui, mas não compensa a ausência da validação obrigatória. |
| 4 | **R4 — bundle budget:** budget/fixtures nos prefixes atuais e histórico preservado | **PASS** | `apps/pwa/budget.json` usa `89973f52-`/`510-` e preserva `280,7 KB` como referência de 2026-07-15; `measure-bundle.mjs` e fixtures usam os mesmos prefixes atuais; `bundle-budget.test.ts` fixa a fronteira e a referência histórica. Medição direta: `49` chunks, inicial `136,05 KB`, total `619,13 KB`, framework `124,09 KB`, equivalente `495,04 KB`; manifest verificou os dois prefixes. | A alegação histórica `494,75 → 495,04 KB` (+`0,29 KB`) está em texto/teste de import invariant, não em artefato before/after binário versionado. Isso limita a prova causal do crescimento, mas o requisito de alinhamento e preservação histórica está atendido. |
| 5 | **D3 — relay fail-closed e allowlist:** `503 agent.relay_allowlist_unavailable`, filtro de model/provider enabled e kind executável | **PASS COM RESSALVA** | `internal-agent-llm-relay.ts:49-79` aplica env → DB com model enabled + provider existente/enabled/kind executável → default; `:115-127` converte falha do store em 503 sem fallback silencioso. Testes cobrem DB on/off, env override, TTL, store failure e provider disabled; a suíte passou com 9 testes. | A allowlist é um `Set` só de `modelId`; se dois providers tiverem o mesmo nome, o request pode não preservar a associação com o provider informado no relay. A política deve decidir se isso é permitido. Também não há fallback quando um store configurado falha — comportamento coerente com fail-closed, mas precisa ser mantido como decisão operacional explícita. |
| 6 | **D4 — CSRF:** Bearer sem Origin não bloqueia, cookie-session sem Origin bloqueia, Origin não confiável bloqueia e política documentada | **FAIL** | O guard documenta a exceção Bearer em `apps/api/src/routes/admin-agent-llm-config.ts:104-109`; teste com Bearer + Origin hostil retorna `401` em vez de `403`; teste com cookie + Origin hostil retorna `403 auth.csrf_rejected`. | O código em `:110-122` só rejeita quando `origin` existe: `if (!hasBearer && origin && typeof origin === 'string')`. Cookie-session sem Origin pula a checagem e segue para autenticação/operação, em vez de retornar 403. Não existe teste para esse caso; ausência de teste não foi tratada como prova de passagem. |
| 7 | **R6 — PWA:** retry de fallback em 409 e exclusões desabilitadas durante mutação | **PASS** | `useAdminLlmConfig.ts:229-256` recarrega e repete `setFallback` uma vez em `agent.version_conflict`; `AgentLlmSettingsSheet.tsx:446-520` desabilita deletes com `isMutating`. `useAdminLlmConfig.test.tsx` cobre retry de fallback e `AgentLlmSettingsSheet.r6.test.tsx` cobre provider/model delete disabled. | A política continua sendo um retry único e o hook não é mutex contra chamadas programáticas concorrentes; a UI está protegida. |
| 8 | **Timing-safe e runtime config timeout:** comparação sem vazamento de tamanho e `AbortSignal`/timeout no cliente Agent | **PASS COM RESSALVA** | `apps/api/src/auth/safe-compare.ts:1-12` calcula SHA-256 dos dois tokens e chama `timingSafeEqual` em digests fixos; `safe-compare.test.ts` cobre tokens iguais, diferentes e tamanhos distintos. `runtime-config-client.ts:19-48` usa `AbortSignal.timeout` configurável e converte `TimeoutError` em `RuntimeSnapshotError`; teste de fetch pendente passa. | Não há benchmark/ teste de timing, e não há caso específico de corpo HTTP lento após headers no runtime-config-client. A comparação evita o early-return por tamanho para entradas não vazias, mas o custo de hashing continua proporcional ao tamanho de entrada; o contrato de tamanho máximo do header não está explícito. |
| 9 | **E2E API→Agent:** ativação → config interna → snapshot → factory → toggle → fail-closed; row-id/model_name e legado | **PASS COM LIMITAÇÃO** | `apps/agent/tests/llm-api-to-agent.e2e.test.ts` isolado passou `1 arquivo / 3 testes`: happy path confirma upstream `https://api.openai.com/v1/responses` e model bare `gpt-4o`; HTTP 500 não devolve segredo; par desativado não alcança upstream. `RuntimeSnapshot` recebe `activeModelName` do slot validado; `FinanceChatAgent` usa o bare name em `:250-260`. | O E2E não chama endpoint de toggle após ativação: `seedActivePair` habilita diretamente pelo store antes de ativar, e o caso fail-closed semeia provider desabilitado diretamente. Não há SQLite DO real, linha persistida corrompida ou migração de valores legados. `ensureIntentionSnapshotColumns()` só adiciona colunas via `PRAGMA`/`ALTER TABLE`; linhas antigas ficam com `model_name = null` e usam derivação convencional `providerId:` em runtime, sem backfill DML. Row IDs opacos podem, portanto, ser enviados como bare model id quando não há nome persistido. |
| 10 | **Auditoria de leitura admin:** evento estruturado sem segredos | **PASS** | `admin-agent-llm-config.ts:61-76,160-184` define evento com action, actor, version, securityEpoch e contagens; `routes/index.ts:517-528` usa `app.log.info` como sink de produção. Testes cobrem ator correto, ausência de chaves `secret/token/apiKey/alias` e sink que falha sem quebrar o GET. | O evento contém e-mail do ator, que é metadado operacional/PII e não segredo de provider; retenção e correlação de logs não foram auditadas nesta tarefa. |

## 3. Gates e comandos executados

| Comando | Resultado | Cobertura / observação |
|---|---|---|
| `pnpm typecheck` | **PASS** | API, PWA, Agent e codex-broker. Warning conhecido de depreciação do Node sobre `shell`. |
| `pnpm lint` | **PASS** | 0 erros, 8 warnings ESLint preexistentes no PWA. |
| `pnpm docs:lint` | **PASS** | Repetido após a escrita; 8 documentos, 0 issues. O script não inclui arquivos ainda não rastreados, como este relatório, até serem adicionados ao índice. |
| `pnpm governance:check` | **PASS** | Nenhuma alteração D01–D19. |
| `pnpm test` | **PASS** | API: 147 arquivos/1.107 testes; PWA: 133 arquivos/1.233 testes; total: 2.340 testes. O root exclui integrações e não inclui Agent. |
| `pnpm --filter pi-finance-agent test` | **PASS** | 33 arquivos/156 testes; warnings de sourcemap de dependências. |
| `pnpm --filter pi-finance-agent exec vitest run tests/llm-api-to-agent.e2e.test.ts` | **PASS** | 1 arquivo/3 testes. O cenário 500 imprime stack sintético `upstream boom` pelo AI SDK, sem chave e sem sucesso falso. |
| `pnpm --filter @pi-finance/llm-contracts typecheck` | **PASS** | Contratos compartilhados compilam isoladamente. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-llm-postgres-integration.ps1` | **PASS** | 4 arquivos/19 testes, todos executados e 0 skips; container `postgres:16-alpine`, porta aleatória, bancos isolados. |
| `docker ps -a --filter "name=llm-it-pg-" --format "{{.Names}}\t{{.Status}}"` | **PASS** | Sem saída após o harness; cleanup confirmado. |
| `cd apps/pwa && node scripts/measure-bundle.mjs` | **PASS** | Manifest atual evidenciou `89973f52-`/`510-`; equivalente `495,04 KB`. |
| `git diff --check` | **PASS** | Sem whitespace error no estado revisado. |
| `git status --short` | **PASS DE ESCOPO** | Somente `?? docs/audits/`; sem alteração de código, migration, deploy ou banco produtivo. |

### 3.1 Integração PostgreSQL

O executor usou um container descartável em `127.0.0.1:32773`, criou um banco por suíte e removeu o container ao final. A contagem observada foi:

- `postgres-llm-atomic-guards.test.ts`: 5 testes, incluindo quatro famílias de corrida em 10 rodadas;
- `postgres-llm-fix.test.ts`: 8 testes, incluindo aliases, preflight, idempotência, revalidação, compatibilidade/identidade R2 e FK `NO ACTION`;
- `postgres-llm-v042-alignment.test.ts`: 4 testes;
- `postgres-agent-llm-config.test.ts`: 2 testes.

**Resultado total: 19/19 PASS, 0 SKIP.** O teste legado condicionado também executou porque o executor forneceu `DATABASE_URL_TEST_FIX_LEGACY` e `DB_TEST_MARKER`; nenhum skip foi convertido em evidência positiva.

## 4. Evidência estrutural e adversarial

### 4.1 R2: reprodução do gap em `validateModel`

Comando somente leitura, sem arquivo temporário:

```text
pnpm --filter pi-finance-api exec tsx -e 'import { validateModel } from "./src/agent/llm-config.ts"; console.log(JSON.stringify({ result: validateModel({ providerId: "anthropic", modelId: "claude-x", protocol: "chat-completions", privacyClass: "training_prohibited" }) }));'
```

Resultado:

```json
{"result":null}
```

Para o critério da matriz, `anthropic + chat-completions` deveria ser rejeitado. A rota também chama `validateModel` antes do provider lookup/upsert (`admin-agent-llm-config.ts:301-328`), portanto o registro incompatível pode ser cadastrado; o bloqueio acontece mais tarde em ativação/projeção, não no validator exigido.

### 4.2 R2: provider referenciado troca de kind executável

Reprodução em memória após ativar `openai-api:gpt-4o`:

```json
{"kind":"anthropic","activeModel":"chat-completions"}
```

A operação foi aceita porque `upsertProvider` rejeita kind não executável, mas não revalida a compatibilidade do model referenciado quando a troca é entre dois kinds executáveis. O fail-closed da projeção reduz o dano em leitura, mas não atende à garantia de mutação semântica exigida.

### 4.3 R3: persistência local

O caminho atual é:

1. `SELECT * FROM intention_snapshots WHERE intention_id = ?`;
2. se houver linha, retorna `{ fallback_..., model_..., ...rows[0] }`;
3. somente sem linha chama `fetchRuntimeConfig` e `internalSnapshotSchema.safeParse` no cliente remoto.

A função `ensureIntentionSnapshotColumns` (`finance-chat-agent.ts:82-101`) adiciona colunas ausentes, mas não executa `UPDATE` para preencher `model_name`/`fallback_model_name`. Os testes comprovam alteração estrutural de tabela e derivação convencional no uso, não backfill de valores nem descarte de linha inválida.

### 4.4 D4: ausência de Origin

O comentário do guard documenta a exceção Bearer e os testes cobrem:

- cookie + Origin hostil → `403 auth.csrf_rejected`;
- Bearer + Origin hostil → `401 auth.session_required`, provando que não caiu no bloqueio CSRF.

Não há ramo para `!hasBearer && !origin`; a condição atual só entra quando `origin` existe. O caso solicitado “cookie-session sem Origin → 403” permanece não implementado e não testado.

## 5. Riscos residuais priorizados

### R1 — Crítico: invariantes de compatibilidade não estão centralizadas em `validateModel`

A criação/sincronização pode aceitar model incompatível e o provider referenciado pode trocar kind executável sem validar o par atual. Isso deixa stores e rotas dependentes de bloqueio posterior em `canActivate`, em vez de preservar a invariável no ponto de domínio solicitado.

**Condição de liberação:** fazer `validateModel` receber/consultar o kind do provider, usar `isProtocolCompatibleWithKind` como única regra e revalidar alterações de provider referenciado em ambos os stores; adicionar matriz por kind nos upserts e integração PG.

### R2 — Alto: snapshot persistido pode ignorar contrato remoto

Linha local corrompida, antiga ou sem par coerente é aceita antes do schema. A execução pode falhar tarde no factory, usar um ID legado incorreto ou não consultar a configuração atualizada.

**Condição de liberação:** aplicar `safeParse`/invariantes à linha persistida; em falha, descartar/renovar pelo endpoint remoto; persistir somente snapshot validado; testar SQLite Durable Object real ou manter uma limitação explícita aceita pelo owner.

### R3 — Alto: CSRF cookie-session sem Origin não está fail-closed

A política implementada só protege Origins presentes. Um navegador com cookie e mutation sem Origin não recebe o 403 específico do guard.

**Condição de liberação:** rejeitar cookie-session sem Origin (mantendo Bearer fora da checagem) e adicionar teste explícito com status/código esperados.

### R4 — Médio/alto: timeout nominal pode exceder o budget configurado

O relay tem cleanup e timeout de corpo, mas o budget é reiniciado ao começar `res.json()`. Headers lentos próximos do limite seguidos de body lento podem consumir dois intervalos.

**Condição de liberação:** medir um deadline absoluto compartilhado por headers e corpo, abortar pelo saldo restante e cobrir o cenário combinado.

### R5 — Médio: backfill de legado é apenas de esquema

`ALTER TABLE` cria colunas, mas não preenche linhas existentes. A derivação `providerId:` cobre o ID convencional, não um row ID opaco; não há prova de que o nome upstream correto possa ser recuperado para todo legado.

**Condição de liberação:** definir fonte de verdade para backfill dos nomes, migrar linhas recuperáveis e fail-closed explícito para IDs opacos sem nome; testar linha legada real.

### R6 — Médio: E2E não fecha toggle e persistência real

O E2E isolado é útil e reproduz o bug row-id/model-name, porém habilita por store direto antes da ativação e usa mock/in-memory. Não comprova o fluxo completo de toggle API→snapshot nem DO SQLite persistido.

**Condição de liberação:** incluir toggle de rota, nova leitura interna, snapshot persistido e fail-closed numa única prova, preferencialmente contra SQLite DO real e API/Agent em boundaries reproduzíveis.

### R7 — Baixo/médio: allowlist por nome perde ownership de provider

O Set do relay contém somente `modelId`. Decidir e testar se o mesmo nome em providers distintos pode ser usado por qualquer provider de relay; se não, preservar `(providerId, modelId)` ou filtrar o provider do request.

## 6. Decisão de release por eixo

- **Funcionalidade coberta:** PASS nos cenários de relay, PWA R6, timing-safe, aliases, locks/races e auditoria.
- **Segurança:** melhorias confirmadas, mas D4 falha no caso sem Origin e R2/R3 deixam invariantes/estado persistido incompletos.
- **Integração:** E2E in-process PASS, PostgreSQL PASS; SQLite DO real e toggle API→Agent não observados.
- **Bundle:** PASS contra budget atual e histórico documentado; causalidade do +`0,29 KB` permanece evidência textual/invariante, não artefato binário.
- **Gates:** todos PASS, sem skips na integração PostgreSQL; warnings de Node/esbuild/sourcemaps não são tratados como falhas funcionais.
- **Código/repositório:** nenhuma correção, migration, deploy ou mudança de produção foi feita; o único artefato desta revisão é este relatório.

## 7. Referências principais

- `apps/api/src/routes/internal-agent-llm-relay.ts`
- `apps/api/tests/routes/internal-agent-llm-relay.test.ts`
- `apps/api/src/agent/llm-config.ts`
- `apps/api/src/agent/llm-config-memory.ts`
- `apps/api/src/agent/llm-config-postgres.ts`
- `apps/api/src/routes/internal-agent-llm-config.ts`
- `apps/api/src/routes/admin-agent-llm-config.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/auth/safe-compare.ts`
- `apps/api/tests/auth/safe-compare.test.ts`
- `apps/api/tests/routes/admin-agent-llm-config.test.ts`
- `apps/api/tests/routes/admin-agent-llm-config-fix.test.ts`
- `apps/api/tests/integration/postgres-llm-fix.test.ts`
- `apps/agent/src/finance-chat-agent.ts`
- `apps/agent/src/llm/runtime-config-client.ts`
- `apps/agent/src/llm/model-factory.ts`
- `apps/agent/tests/intention-snapshot-fallback.test.ts`
- `apps/agent/tests/llm-api-to-agent.e2e.test.ts`
- `apps/agent/tests/runtime-config-client.test.ts`
- `apps/agent/tests/runtime-config-client-contract.test.ts`
- `packages/llm-contracts/src/types.ts`
- `packages/llm-contracts/src/schemas.ts`
- `apps/pwa/budget.json`
- `apps/pwa/scripts/measure-bundle.mjs`
- `apps/pwa/src/__tests__/bundle-budget.test.ts`
- `apps/pwa/src/features/profile/useAdminLlmConfig.ts`
- `apps/pwa/src/features/profile/AgentLlmSettingsSheet.tsx`
- `apps/pwa/src/features/profile/__tests__/useAdminLlmConfig.test.tsx`
- `apps/pwa/src/features/profile/__tests__/AgentLlmSettingsSheet.r6.test.tsx`
- `scripts/run-llm-postgres-integration.ps1`
