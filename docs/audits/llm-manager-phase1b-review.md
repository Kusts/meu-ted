# Revisão da Fase 1b — LLM Manager

**Data:** 2026-09-06  
**Commits revisados:** `b61ba47`, `5f68806`, `e3efdb6`, `9351769`, `b764ee2` e `91c6397`  
**Base/diff efetivo:** `192f462..HEAD` (`HEAD=91c6397`; 21 arquivos, 1.589 adições e 303 remoções).  
**Escopo:** kinds executáveis e registry/factory/probe, migration V042, validação Zod de mutações, snapshots Durable Object, cliente Agent, guards PostgreSQL, testes e prontidão de release.  
**Restrição:** revisão somente leitura. Nenhum código de produção, migration, deploy ou operação destrutiva foi alterado.

## Veredito executivo

**APROVADO COM AJUSTES — não pronto para produção.** A Fase 1b melhora o contrato nominal, implementa adapters para os onze kinds diretos, adiciona schemas Zod, persiste fallback no snapshot e troca os guards Postgres por predicados condicionais. Porém, o estado efetivo ainda não satisfaz integralmente a especificação: V042 usa `NO ACTION` onde o requisito pede `ON DELETE SET NULL`, mantém alias global, deixa o codex configurável/ativável por rotas administrativas, não cobre toda a coerência de pares no preflight, e os guards podem ser contornados pelos próprios upserts. As integrações PostgreSQL foram puladas por ausência de ambiente marcado e `pnpm test` continua falhando no bundle budget da PWA.

**Não há autorização de deploy ou produção neste veredito.**

## 1. Requisitos F1–F7

A matriz abaixo explicita os requisitos auditados nesta revisão para não confundir teste direcionado com prontidão operacional.

| Requisito | Veredito | Evidência e limite |
|---|---|---|
| **F1 — Onze kinds diretos devem ser executáveis ponta a ponta; `openai-codex-subscription` permanece não liberado.** | **PARCIAL — ajuste alto** | `PROVIDER_KINDS` tem 12 valores; `FIXED_ENDPOINTS`, `PROVIDER_SECRET_MAP`, factory e probe cobrem os 11 kinds diretos. O codex é marcado `REGISTRY_UNSUPPORTED_KINDS`, mas V042 o mantém aceito, o POST de provider usa `eligibility='approved'` por padrão e PATCH pode promovê-lo; `canActivate`/rota interna não consultam a lista unsupported. Assim, o Agent pode receber um codex “utilizável” e falhar somente na factory, que não possui endpoint/alias. A matriz verde usa IDs artificiais slash-free; modelos OpenRouter reais frequentemente usam `owner/model`, rejeitados por `validateModelId`. |
| **F2 — V042 deve alinhar CHECKs/aliases, limpar órfãos de forma idempotente e criar FKs de runtime com `ON DELETE SET NULL`.** | **FAIL** | `V042__llm_kind_alignment.sql` declara expressamente `NO ACTION` para `model_id` e `fallback_model_id` e os testes esperam `23503` no DELETE bruto; isso contradiz o contrato `SET NULL`. O `chk_llm_secret_alias` aceita qualquer alias global para qualquer kind não-codex, em vez de aplicar `KIND_SECRET_ALIASES`. O preflight limpa existência ausente, mas trata fallback por coluna e não corrige par existente com provider/modelo cruzados; pode persistir estado parcial/sem ownership. |
| **F3 — Toda mutação administrativa de runtime deve validar entrada com schemas Zod compartilhados.** | **PARCIAL** | `activate`, `rollout`, `fallback`, PATCH de provider, create/sync de provider/model e security epoch usam `safeParse`, incluindo versão, limites e paridade fallback. Os dois endpoints de toggle ainda usam apenas `typeof enabled`; o POST de test-connection ignora o body em vez de validá-lo. A normalização prévia do POST de provider também converte `id` para string antes do Zod e aplica fallback de kind, o que reduz a força da validação de tipo original. |
| **F4 — Snapshot de intenção deve persistir fallback e atualizar tabelas Durable Object legadas.** | **PASS direcionado — cobertura parcial** | `finance-chat-agent.ts` cria as colunas, usa `ensureIntentionSnapshotColumns` para tabelas antigas e inclui ambos os IDs no INSERT; linhas antigas são normalizadas para `null`. Os cinco testes novos verificam query/row mockados, mas não executam um Durable Object SQLite real nem uma corrida de inicialização em produção. O catch amplo de ALTER/INSERT continua podendo mascarar erro diferente de corrida/duplicata. |
| **F5 — Toggle/delete e ativação concorrente devem manter runtime íntegro atomicamente no PostgreSQL.** | **FAIL para liberação** | `setProviderEnabled`, `setModelEnabled`, `deleteProvider` e `deleteModel` agora têm predicado `NOT EXISTS` no statement principal, uma melhoria real. Mas `updateRuntime` trava somente a linha de runtime; toggle/delete não a travam nem incrementam sua versão, permitindo uma corrida em que a ativação escolhe um provider/modelo enquanto outro request o desabilita. Além disso, `upsertProvider` e `upsertModel` atualizam `enabled` sem guard: POST de provider/model e `sync-catalog` podem desabilitar item ativo fora dos endpoints protegidos. As integrações de concorrência PostgreSQL existem, mas foram puladas. |
| **F6 — Cliente Agent deve validar snapshot explicitamente e falhar fechado.** | **PARCIAL** | `runtime-config-client.ts` usa `internalSnapshotSchema.safeParse`, rejeita JSON/HTTP malformado e lê somente os campos `active*`/fallback do contrato. O schema não impõe invariantes cruzadas: aceita `activeDisabled=true` com IDs não nulos, slots ausentes/incompatíveis e números fora dos limites; o cliente descarta os flags e slots. A API atualmente zera IDs no projection path, mas a fronteira Agent não se protege contra produtor válido porém semanticamente incoerente. |
| **F7 — Evidência de testes e gates deve sustentar a entrega.** | **FAIL de release** | Direcionados e typechecks passam, mas as sete integrações PostgreSQL foram puladas sem `DATABASE_URL_TEST_*` + `DB_TEST_MARKER`; não há prova real de migration/FK/concorrência. `pnpm test` falha no bundle budget da PWA. Não existe E2E real API → Agent nesta fase. |

## 2. Achados de especificação

### F1 — HIGH: codex continua liberável pela API apesar de documentado como unsupported

A intenção documentada em V042 é reter o valor legado sem liberá-lo. Na prática, `POST /admin/agent/llm-config/providers` atribui `approved` quando `eligibility` não é enviada; PATCH aceita promover o provider; `canActivate` só verifica aprovação, enabled, modelo e protocolo. A projeção interna verifica existência/enabled/ownership, mas não `REGISTRY_UNSUPPORTED_KINDS`. A factory então não encontra endpoint nem alias para `openai-codex-subscription`.

**Impacto:** um administrador pode criar ou aprovar configuração que passa API/DB e quebra no Agent, contrariando o bloqueio explícito do kind.  
**Ação mínima:** rejeitar codex em criação/patch/activate/projection ou impor estado experimental bloqueado no banco e na rota; cobrir tentativa de promoção e ativação.

### F2 — CRITICAL: semântica de FK de V042 contradiz o contrato

`V042__llm_kind_alignment.sql:6-10,79-83` e `postgres-llm-v042-alignment.test.ts` estabelecem `NO ACTION`, bloqueando DELETE bruto com `23503`. O requisito desta fase pede `ON DELETE SET NULL` para referências de modelo do runtime. O comentário justifica outra política, mas comentário/teste não substituem o requisito aprovado.

**Impacto:** exclusões administrativas ou de manutenção não têm a semântica declarada; o resultado diverge entre a política de schema e a política de API.  
**Ação mínima:** decidir uma política única, ajustar migration/teste/preflight conjuntamente e preservar o `active_pair` com trigger/limpeza atômica se `SET NULL` exigir nulidade dos dois campos.

### F2 — HIGH: CHECK de alias não está alinhado por kind

O SQL aceita a união de dez aliases para todo kind não-codex. A API aplica `KIND_SECRET_ALIASES`, mas escrita direta, seed ou bypass de rota pode gravar `anthropic + OPENAI_API_KEY`, por exemplo. O registry deriva uma chave por kind, portanto o valor salvo e o segredo efetivamente consumido podem divergir.

**Ação mínima:** aplicar CHECKs por kind (ou constraint/tabela de mapeamento equivalente) e testar cada combinação válida e inválida contra PostgreSQL.

### F2 — HIGH: preflight não normaliza o par semântico

As duas primeiras atualizações limpam active provider/model juntos quando há referência inexistente. Para fallback, provider e modelo são limpos em updates independentes; o script não detecta modelo/provider existentes porém cruzados e não garante `model.provider_id = fallback_provider_id`. A rota interna falha fechado, mas a base pode continuar com estado parcial ou cruzado.

**Ação mínima:** backfill por par, incluindo ownership, com execução idempotente e teste de segunda execução sem nova mutação.

### F5 — CRITICAL: upsert contorna o guard de item ativo

`upsertProvider` usa `ON CONFLICT ... enabled = EXCLUDED.enabled`; `upsertModel` faz o mesmo. As rotas POST usam `enabled ?? false`, e `sync-catalog` sempre chama `upsertModel(... enabled: false)`. Portanto, re-sincronizar ou registrar um item já apontado pelo runtime pode desabilitá-lo sem `409`, sem lock do runtime e sem incremento de versão.

**Impacto:** o invariant central “runtime nunca aponta para item desabilitado” pode ser violado por uma mutação legítima que não é toggle.  
**Ação mínima:** preservar `enabled` em upsert ou aplicar a mesma condição/lock transacional a todos os caminhos; adicionar RED para upsert/sync de active e fallback.

### F5 — HIGH: predicado condicional não fecha corrida com updateRuntime

O UPDATE condicional protege a decisão observada no statement, mas `updateRuntime` trava a linha de runtime em outra transação e toggles não atualizam `version`. Uma ativação pode ler versão válida, um toggle pode observar que o item ainda não é referenciado e desabilitá-lo, e a ativação posterior pode commitar o item desabilitado. Delete concorrente pode ainda devolver erro FK bruto ao update, em vez de conflito de versão/runtime mapeado.

**Ação mínima:** serializar runtime e mutações de item na mesma ordem, ou fazer a ativação revalidar enabled/ownership no UPDATE sob lock; testar destino de ativação, não somente o item que já era ativo.

## 3. Achados de padrões/qualidade

### S1 — HIGH: evidência PostgreSQL não é executável no ambiente da revisão

Os arquivos `apps/api/tests/integration/postgres-llm-atomic-guards.test.ts` e `postgres-llm-v042-alignment.test.ts` usam `it.skip` quando não existem `DATABASE_URL_TEST_*` e `DB_TEST_MARKER`. Isso é uma salvaguarda correta contra banco não isolado, mas deixa sem evidência os comportamentos mais consequenciais da Fase 1b.

### S2 — MEDIUM: schema estrutural não equivale a validação semântica do snapshot

`internalSnapshotSchema` valida tipos/enums, mas não valida coerência dos flags, slots e pares. O cliente retorna os IDs e ignora `activeDisabled`/`fallbackDisabled`. A defesa está concentrada na API e não é redundante na fronteira que decide execução.

### S3 — MEDIUM: probe deixa timer vivo em erro de rede

`provider-probe.ts` limpa o timeout após resposta, mas não em `catch`. Falha de rede deixa o timer até expirar; em carga de probes isso acumula timers desnecessários. O probe Google também coloca a chave na query string, exigindo garantia de que URL não seja registrada em logs/traces.

### S4 — MEDIUM: cobertura da matriz é nominal para alguns providers

`provider-kind-matrix.test.ts` confirma construção de objetos SDK e respostas mockadas, não uma chamada real por protocolo. Não há teste de protocolo incompatível kind/modelo, de factory com secret provisionado por ambiente, nem de modelo OpenRouter com identificador real contendo `/`.

### S5 — LOW: warnings de toolchain permanecem

Vitest emite warning da opção `esbuild`; o Agent emite sourcemaps ausentes de dependências e o typecheck raiz emite `DEP0190` por `shell: true`. Não causaram falha, mas devem ser tratados separadamente para não esconder regressões.

## 4. TDD e cobertura observada

Os testes novos são nomeados como RED→GREEN e documentam os contratos pretendidos. A execução observada foi:

- API direcionada: **17/17 testes passados** em guards in-memory e schemas; **7 pulados** nos dois arquivos PostgreSQL.
- Agent direcionado: **21/21 testes passados** em matriz de kinds, snapshot fallback e cliente de runtime.
- `@pi-finance/llm-contracts`: `tsc --noEmit` passou.
- A cobertura não prova execução de migration em base legada, constraints efetivas, DELETE/SET NULL, corrida concorrente, inicialização SQLite Durable Object real ou E2E API→Agent.

Antes de qualquer liberação, adicionar testes RED para:

1. promoção/criação/ativação de codex unsupported;
2. cada alias incompatível por kind no banco;
3. órfão e par cruzado de fallback no preflight;
4. semântica efetiva de `ON DELETE SET NULL` e active pair;
5. upsert/sync de provider/model ativo e fallback;
6. corrida em que o destino da ativação é desabilitado/deletado;
7. snapshot semanticamente inválido apesar de schema estrutural válido;
8. tabela SQLite DO legada executada, não somente SQL mockado.

## 5. Comandos e resultados

| Comando | Resultado |
|---|---|
| `git diff --check 192f462..HEAD` | **PASS**, sem saída. |
| `pnpm --dir apps/api exec vitest run tests/agent/llm-config-atomic-guards.test.ts tests/integration/postgres-llm-atomic-guards.test.ts tests/integration/postgres-llm-v042-alignment.test.ts tests/routes/admin-agent-llm-config-zod.test.ts` | **PASS parcial**: 2 arquivos/17 testes passados; 2 arquivos/7 testes pulados por falta de ambiente PostgreSQL marcado. |
| `pnpm --dir apps/agent exec vitest run tests/provider-kind-matrix.test.ts tests/intention-snapshot-fallback.test.ts tests/runtime-config-client-contract.test.ts tests/runtime-config-client.test.ts` | **PASS — 4 arquivos, 21/21 testes**; warnings de sourcemap/esbuild não bloqueantes. |
| `pnpm --filter @pi-finance/llm-contracts typecheck` | **PASS — `tsc --noEmit`**. |
| `pnpm typecheck` | **PASS** em API, PWA, Agent e Codex Broker; warning `DEP0190`. |
| `pnpm lint` | **PASS — 0 erros, 8 warnings** fora do escopo LLM Manager. |
| `pnpm docs:lint` | **PASS — 8 documentos, 0 issues**. |
| `pnpm governance:check` | **PASS**; nenhuma alteração D01–D19. |
| `pnpm test` | **FAIL**: API 141 arquivos/1.031 testes passados; PWA 129 arquivos passados, 1 falhado, 1.209/1.210 testes; bundle `equivalent-set` **495,04 KB**, limite **294,735 KB**. O script raiz exclui integrações, Agent e package compartilhado. |

## 6. Estado do checkout e escopo

O diff auditado contém somente alterações dos seis commits da Fase 1b. Durante esta revisão não houve edição de fonte, migration, deploy, reset, limpeza destrutiva ou mudança de banco. O working tree já continha relatórios anteriores em `docs/audits/`; o único artefato produzido por esta revisão é `docs/audits/llm-manager-phase1b-review.md`.

## 7. Plano mínimo de liberação

1. Fechar a decisão de schema: `SET NULL` versus bloqueio, atualizar V042 e testes para a política aprovada.
2. Impedir codex de ser criado/promovido/ativado como kind executável; alinhar API, DB, projection e Agent.
3. Substituir allowlist global por vínculo kind↔alias e validar protocolo compatível por provider.
4. Reescrever preflight/backfill por par, com ownership e idempotência demonstrada.
5. Proteger upsert/sync e corrida activation↔toggle/delete com transação/lock/versionamento coerentes.
6. Completar invariantes semanticamente fail-closed no schema/cliente Agent e testar SQLite real.
7. Provisionar banco de teste descartável, executar as sete integrações PostgreSQL e um E2E API→Agent.
8. Reproduzir e corrigir o bundle budget com baseline rastreável; somente então repetir `pnpm test`, typecheck, lint, docs lint e governance.

## Conclusão

A Fase 1b é uma evolução significativa e os testes unitários direcionados estão verdes, mas há divergências explícitas entre o requisito e V042, uma rota efetiva para liberar codex, bypass de invariantes via upsert e ausência de prova PostgreSQL. O resultado final permanece **APROVADO COM AJUSTES — não pronto para produção**.
