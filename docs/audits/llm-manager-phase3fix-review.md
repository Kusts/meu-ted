# Re-verificação focal — LLM Manager Fase 3-fix

**Data:** 2026-09-06
**Modo:** revisão somente leitura; nenhum código, migration, deploy ou banco produtivo foi alterado.
**Escopo exato:** `91eeb8d..HEAD`, oito commits (`dcb9afc`, `256ba45`, `277dcb6`, `1f75f51`, `276fd48`, `a418ba4`, `531f826`, `40875d6`).
**Base:** `docs/audits/llm-manager-phase3-review.md`, especialmente os FAILs das seções 2 e 4.

## 1. Veredito final

# PRONTA COM RESSALVAS NOMEADAS

Os seis fechamentos solicitados foram implementados e os testes/gates exigidos passaram. R1, R2, R6 e R7 foram reproduzidos com evidência positiva; D4 tem os quatro ramos explícitos e R4 tem deadline compartilhado com teste combinado.

As ressalvas não são FAILs dos critérios fechados, mas devem permanecer no aceite: o relay pode responder `502 agent.inference_error` se uma implementação/mock de `fetch` ignorar `AbortSignal` e resolver um body depois do deadline, e os testes Bearer de D4 usam token não autenticado (provam que não retornam `csrf_rejected`, mas não um sucesso administrativo com Bearer válido). Não foi exercitado SQLite real do Durable Object; os testes de snapshot usam o seam SQL controlado do Agent.

Este veredito não executa nem autoriza deploy.

## 2. Matriz de fechamento

| Item | Veredito | Evidência | Risco residual |
|---|---|---|---|
| **R1-rev — validateModel kind-aware, upsert referenciado e PG** | **PASS** | `validateModel` agora exige `providerKind` e usa `isProtocolCompatibleWithKind` em `apps/api/src/agent/llm-config.ts:106-128`; as rotas resolvem o provider antes em `admin-agent-llm-config.ts:219-237` e `342-357`. Memory e Postgres revalidam troca entre kinds executáveis, incluindo active/fallback; PG test dedicado está em `postgres-llm-fix.test.ts:407-460`. | A API agora rejeita chamadas internas sem kind com erro de validação, conforme contrato. Não foi encontrado bypass nos call sites compilados. |
| **R2-rev — snapshot local, refetch, backfill e row-id opaco** | **PASS COM LIMITAÇÃO** | `finance-chat-agent.ts:75-153` define `resolveBareModelName`, schema local e dois `UPDATE` de backfill; `:194-223` faz `safeParse` e refetch em caso de corrupção/opacidade; `:292-318` impede execução sem nome bare. `intention-snapshot-fallback.test.ts` passou 12/12 com corrupção→refetch, opaco→refetch/fail-closed, UPDATE e row fresco. | O SQLite Durable Object real não foi iniciado; o seam SQL é um mock controlado. O schema valida forma/tipos e nome executável, mas não reconstitui sozinho toda a semântica de ownership/estado do store; a projeção remota continua sendo a fonte autorizada. |
| **D4-rev — quatro ramos CSRF** | **PASS COM LIMITAÇÃO** | `admin-agent-llm-config.ts:104-163` faz sessão/admin antes de CSRF e rejeita cookie sem Origin/Referer, mantendo Bearer fora da checagem. O teste `admin-agent-llm-config.test.ts` passou o caso explícito `Bearer/cookie × origin presente/ausente`: cookie sem atestação e cookie hostil retornam `403 auth.csrf_rejected`; Bearer hostil/sem origin não retornam `csrf_rejected`. | Os dois casos Bearer usam token de serviço sem sessão válida e retornam `401 auth.session_required`; isso prova ausência de bloqueio CSRF, não uma operação 2xx com Bearer autenticado. |
| **R4-rev — deadline absoluto headers+corpo** | **PASS COM LIMITAÇÃO** | `internal-agent-llm-relay.ts:145-213` cria um único deadline, calcula apenas o saldo após headers e limpa o timer em `finally`. O teste combinado `internal-agent-llm-relay.test.ts:212-242` passou com headers ~180 ms + body ~180 ms e budget 240 ms, retornando 504 em menos de 360 ms. | Reprodução adicional com mock de `fetch` que ignora abort, resolve headers após o budget e devolve body vazio resultou em `502 agent.inference_error`, não 504. Fetch real deve honrar abort; para garantia independente do upstream/mock, ainda seria necessário checar deadline expirado antes de aceitar body tardio. |
| **R6-rev — E2E toggle + releitura interna** | **PASS** | `llm-api-to-agent.e2e.test.ts:217-289` cria rota admin, tenta toggle OFF do provider ativo (409 `agent.runtime_in_use`), relê `/internal/agent/llm-config`, confirma o par ativo, recria o estado legado desativado, relê novamente pela rota e por `fetchRuntimeConfig`, e só então prova que o Agent não alcança upstream. E2E isolado passou 3/3. | O E2E usa store em memória, Fastify in-process e stub de sessão; não é uma prova contra Better-Auth/Postgres/SQLite DO reais. |
| **R7-rev — allowlist por `(providerId, modelId)`** | **PASS** | `createRelayModelResolver` em `internal-agent-llm-relay.ts:54-85` grava entradas DB como `providerId:modelId`; o handler compara o par em `:133-139`. O teste `internal-agent-llm-relay.test.ts:244-281` habilita o mesmo model ID nos providers Zen/Go, desabilita Go, confirma Zen 200, Go 403 `agent.model_not_allowlisted` e apenas uma chamada upstream. | Entries explícitas de env/default continuam bare por desenho e podem autorizar o nome em ambos os providers; isso é precedência documentada, não cruzamento de pares DB. |

## 3. Reproduções solicitadas

### 3.1 R1-rev — comando da seção 4.1

Comando original, sem segundo argumento:

```text
pnpm --filter pi-finance-api exec tsx -e 'import { validateModel } from "./src/agent/llm-config.ts"; console.log(JSON.stringify({ result: validateModel({ providerId: "anthropic", modelId: "claude-x", protocol: "chat-completions", privacyClass: "training_prohibited" }) }));'
```

Resultado atual:

```json
{"result":"provider kind is required"}
```

Com o kind resolvido, a incompatibilidade é explícita:

```json
{"result":"model protocol chat-completions is not compatible with provider kind anthropic"}
```

Isso fecha o gap anterior: `anthropic + chat-completions` não valida.

### 3.2 R1-rev — upsert de provider referenciado

Após ativar `openai-api:gpt-4o`, a tentativa de trocar o provider referenciado de kind `openai-api` para `anthropic` retornou:

```json
{
  "accepted": false,
  "statusCode": 409,
  "code": "agent.runtime_in_use",
  "reason": "active_provider",
  "message": "provider kind change to anthropic is not compatible with the referenced active model protocol chat-completions"
}
```

O mesmo cenário existe em memória e em PostgreSQL; o teste PG dedicado passou após `40875d6` incluir `model_id`/`fallback_model_id` no SELECT sob lock. A integração também confirma que uma troca compatível para kind `openai` continua permitida.

### 3.3 R2-rev — snapshot persistido

A execução da suíte `tests/intention-snapshot-fallback.test.ts` passou **12/12**. Os casos novos verificam:

- linha com `version`/`model_id`/`protocol` corrompidos: `safeParse` falha, linha é descartada, `fetchRuntimeConfig` é chamado e snapshot remoto é persistido;
- `model_id` opaco sem `model_name`: refetch; com falha remota, retorno `null` e nenhum upstream;
- `ensureIntentionSnapshotColumns`: dois `UPDATE` idempotentes preenchem `model_name` e `fallback_model_name` somente para IDs `provider_id:model` deriváveis;
- row fresco com `model_name`: retorna sem refetch;
- `resolveBareModelName`: nunca transforma `custom-row-id`, `other:x` ou `gpt-4o` sem nome persistido no bare model.

### 3.4 D4-rev — quatro ramos

`admin-agent-llm-config.test.ts` passou o teste único dos quatro ramos:

1. Bearer sem Origin/Referer: não cai em `auth.csrf_rejected`;
2. cookie sem Origin/Referer: `403 auth.csrf_rejected`;
3. cookie com Origin hostil: `403 auth.csrf_rejected`;
4. Bearer com Origin hostil: não cai em `auth.csrf_rejected`.

A ordem sessão → admin → CSRF preserva os `401`/`403` do inventário de autenticação e impede que request não autenticado seja usado como prova de bypass.

### 3.5 R4-rev — deadline

O teste combinado passou:

```text
slow headers + slow body share ONE absolute budget ... PASS
```

A reprodução adversarial adicional, fora do conjunto de testes, foi:

```json
{"statusCode":502,"body":{"code":"agent.inference_error","message":"No output generated by provider."}}
```

O mock deliberadamente ignorava `AbortSignal`, resolvia headers após o budget e retornava `output: []`. Isso é risco residual de defesa em profundidade, não falha do caminho Fetch cooperativo coberto pelo commit.

### 3.6 R6-rev — E2E

O teste isolado confirmou a sequência rota admin → releitura interna → cliente runtime → Agent. Resultado: **1 arquivo / 3 testes PASS**. O cenário de upstream 500 imprime stack sintético do AI SDK, mas não expõe token/chave no resultado da asserção.

### 3.7 R7-rev — par da allowlist

O teste específico confirmou:

- `(opencode-zen, shared-model)` habilitado → `200` e uma chamada upstream;
- `(opencode-go, shared-model)` desabilitado/fora da allowlist → `403 agent.model_not_allowlisted`;
- o mesmo `modelId` em provider distinto não é herdado.

## 4. Gates e comandos

| Comando | Resultado | Observação |
|---|---|---|
| `pnpm typecheck` | **PASS** | API, PWA, Agent e codex-broker; warning de depreciação Node sobre `shell`. |
| `pnpm lint` | **PASS** | 0 erros, 8 warnings ESLint já existentes no PWA. |
| `pnpm governance:check` | **PASS** | Nenhuma alteração D01–D19. |
| `pnpm test` | **PASS** | API: 147 arquivos/1.152 testes; PWA: 133/1.233; total: 2.385 testes. Integrações PG são excluídas pelo root. |
| `pnpm --filter pi-finance-agent test` | **PASS** | 33 arquivos/160 testes; warnings de sourcemap de dependências. |
| `pnpm --filter pi-finance-agent exec vitest run tests/llm-api-to-agent.e2e.test.ts` | **PASS** | 1 arquivo/3 testes. |
| `pnpm --filter @pi-finance/llm-contracts typecheck` | **PASS** | Contratos compartilhados compilam isoladamente. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-llm-postgres-integration.ps1` | **PASS** | 4 arquivos/20 testes, **0 skips**; inclui provider kind switch R1-rev. Container descartável removido. |
| `docker ps -a --filter "name=llm-it-pg-"` | **PASS** | Nenhum container residual após o harness. |
| `git diff --check 91eeb8d..HEAD` | **PASS** | Sem erros de whitespace no escopo. |
| `git status --short` | **PASS DE ESCOPO** | Somente `?? docs/audits/`; nenhuma mudança de código ou produção. |

### 4.1 Contagem PostgreSQL

A integração executou:

- `postgres-llm-atomic-guards.test.ts`: 5 testes;
- `postgres-llm-fix.test.ts`: 9 testes, incluindo R1-rev;
- `postgres-agent-llm-config.test.ts`: 2 testes;
- `postgres-llm-v042-alignment.test.ts`: 4 testes.

**Total: 20/20 PASS, 0 SKIP.** O teste legado condicionado executou sob as variáveis do harness; não houve skip convertido em evidência positiva.

## 5. Riscos residuais e condições operacionais

### R1 — Deadline com upstream que ignora abort

A implementação cria o deadline absoluto e o Fetch de produção deve obedecer ao `AbortSignal`. Ainda assim, o handler não verifica explicitamente `Date.now() >= deadline` antes de aceitar um body resolvido depois do prazo; uma implementação/mock não cooperativa pode gerar 502 de inferência em vez de 504 de timeout.

**Aceite recomendado:** manter como risco baixo/médio documentado, ou adicionar uma checagem explícita de deadline e teste de header tardio + body imediato antes de considerar o timeout totalmente independente da cooperação do upstream.

### R2 — Bearer autenticado não exercitado em sucesso

Os quatro ramos CSRF estão testados e Bearer não cai no código CSRF. Os testes Bearer usam token inválido e param no `401`, portanto não comprovam uma mutation 2xx com sessão Better-Auth via Bearer válido.

**Aceite recomendado:** manter como limitação de cobertura; adicionar caso com Bearer plugin/session válido se o contrato de produção exigir Bearer administrativo, sem remover a ordem sessão→CSRF.

### R3 — SQLite Durable Object real

O Agent suite usa mocks/seams SQL para tornar corrupção, backfill e fail-closed determinísticos. A integração confirma o contrato do código, mas não cria um Durable Object SQLite real em runtime Cloudflare.

**Aceite recomendado:** realizar smoke em ambiente compatível antes de uma migração de tabela real; não tratar a suíte mock como prova de engine SQLite completa.

### R4 — Env/default continuam bare

A allowlist DB agora preserva ownership por par. Entradas `RELAY_ALLOWED_MODELS` e defaults continuam nomes bare por desenho e, quando configuradas, têm precedência sobre DB.

**Aceite recomendado:** manter documentado que env é override administrativo global; se o requisito futuro exigir ownership também para env, versionar pares no formato `provider:model`.

## 6. Artefatos e integridade

- Relatório criado: `docs/audits/llm-manager-phase3fix-review.md`.
- Não foram alterados código, migrations, deploys ou bancos produtivos.
- O range auditado contém exatamente os oito commits solicitados.
- O diretório `docs/audits/` permanece não rastreado no working tree conforme o estado anterior; `git diff --check` do range passou.
