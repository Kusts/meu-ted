# MEU TED — SPEC V4.1 Closure

## Release Hardening — Fechamento da V4.1 antes de Release B, Canonical Cutover ou nova rodada funcional

**Status:** Ready for implementation
**Tipo:** Closure / Hardening SPEC
**Projeto:** Meu TED
**Versão:** V4.1 (closure)
**Origem:** Consolidação dos itens de fechamento pós-V4.1 — cookie-only real, snapshot offline V3, atomicidade fail-closed, hardening de CI em repositório público, provenance de release, reconciliação read-only e higienização de documentação canônica
**Baseline inicial declarada:** `main@7292dd896c2d34905e3747f4fc2fa53705b3bd48`
**Repositório:** `Kusts/meu-ted`
**Visibilidade desejada/confirmada pelo owner:** Public

> O agente NÃO deve assumir que o SHA acima continua sendo o HEAD atual. A primeira etapa da execução (Fase 0.1 do plano) é registrar o SHA real utilizado como baseline e verificar divergências.

> **Registro de baseline verificado (2026-09-21, na documentação desta SPEC):** a branch de trabalho é `v4.1-hardening` (remoto `Kusts/meu-ted`). O SHA de baseline `7292dd8` existe no histórico; o HEAD atual é `e0d5601`, dois commits à frente (`1c097df` — hardening de undo-proposal/aprovação do Agent e migrations V055–V057; `e0d5601` — contrato de startup V054 legado). Nenhum dos dois implementa itens desta SPEC: na HEAD atual o fallback fail-open das keyed mutations segue presente em todos os dispatchers e o gate `apiUsable()` por presença de bearer segue ativo no PWA (ver Anexo A). A Fase 0.1 reconfirma o baseline no momento da execução.

**Objetivo:** fechar as últimas inconsistências arquiteturais e operacionais da V4.1 antes de Release B, Canonical Cutover ou nova rodada funcional.

---

# 1. Contexto

A V4.1 resolveu a maior parte dos riscos encontrados nas auditorias anteriores:

* API PostgreSQL como autoridade;
* Agent sem autoridade financeira própria;
* aprovação determinística para mutações do TED;
* idempotência com claims, leases e replay;
* unit of work compartilhando claim + efeito financeiro;
* device tokens endurecidos;
* revogação de membership;
* proxy same-origin;
* cookie-first auth;
* snapshot offline particionado e com expiração;
* service worker sem cache de HTML/RSC;
* migrations separadas do processo web;
* gates de write-policy;
* testes de concorrência;
* XLTs;
* Actions SHA-pinned;
* deploys fail-closed.

Esta SPEC não cria uma nova arquitetura.

Ela existe exclusivamente para **fechar a V4.1**.

---

# 2. Problemas que esta SPEC resolve

## F1 — Cookie-only incompleto

O PWA aceita uma sessão HttpOnly válida no `AuthGate`, porém o `AppStateProvider` ainda usa presença de device/session bearer em storage para decidir se pode iniciar o bootstrap.

Concretamente (`apps/pwa/src/lib/state/app-state-context.tsx:376-380`):

```ts
function apiUsable() {
  if (!isApiConfigured()) return false;
  if (getAuthToken() !== undefined) return true;
  return getSessionToken() !== undefined;
}
```

Com:

```text
NEXT_PUBLIC_LEGACY_BEARER_COMPAT=off
```

os storage tokens deixam de ser lidos/escritos (`apps/pwa/src/lib/auth/token-store.ts:35-98`) e `apiUsable()` fica permanentemente `false`: o usuário pode estar autenticado por cookie e, mesmo assim, o estado financeiro não inicia.

Agravante de observabilidade: `fetchSession()` hoje colapsa 401, 403 e erro de rede no mesmo resultado `{ user: null }` (`apps/pwa/src/lib/api/auth.ts:74-87`), e o caminho sem bearer do `AuthGate` transforma falha de rede em tela de login — a distinção exigida pela INV-05 não sobrevive ao boot.

O snapshot offline também mantém fingerprint derivado de token como parte da identidade (`V2Envelope.ownerFingerprint`, `apps/pwa/src/lib/state/snapshot-db.ts:58-73`, derivado de `effectiveOnlineToken()`).

Isso impede uma Release B realmente independente de bearer.

## F2 — Offline ainda depende indiretamente de credencial

O modo offline deve sobreviver a:

```text
cookie HttpOnly
+
browser sem acesso ao servidor
+
nenhum bearer em localStorage
```

sem transformar um erro de rede em logout.

A identidade offline deve derivar de identidade autenticada persistida como **não-autenticador**, e nunca de bearer/device secret.

Nota de estado atual: o envelope V2 já possui partição primária por `offlineSubjectId`, com o fingerprint de token como camada adicional de defesa (`snapshot-db.ts:4-6`). O problema não é a partição em si — é que a emissão, a validade e a leitura do snapshot continuam acopladas a `effectiveOnlineToken()` (`app-state-context.tsx:388-390, :705, :722`), que não existe no cenário cookie-only.

## F3 — Atomicidade possui fallback fail-open

Os keyed mutation dispatchers utilizam corretamente os métodos `*InTx` quando disponíveis.

Porém, atualmente:

```text
claimTx presente
+
*InTx inexistente
=
fallback para método normal
```

Isso pode quebrar a atomicidade claim + efeito + receipt após uma regressão futura.

Inventário verificado na HEAD atual (Anexo A): o padrão fail-open existe em **7 dispatchers + `applyReversal` (undo)**, cobrindo 24 operações keyed (incluindo 2 bulk de payables) + 3 branches de reversal do undo. Existe **um buraco real hoje**: `subscriptions/legacy-postgres.ts` não expõe `createSubscriptionInTx` — com `DB_SCHEMA=legacy` + `Idempotency-Key`, o claim pode commitar sem efeito na mesma transação. Os demais domínios só perdem atomicidade com store custom/mock, mas o contrato testado atualmente **cristaliza o fallback** (`apps/api/tests/writes/domain-keyed-dispatch.test.ts:61-73, 101-103, 152-154`).

A regra correta deve ser fail-closed.

## F4 — CI remoto não possui evidência recente válida

Os runs existentes para `7292dd8` são anteriores à publicação do repositório e falharam no cenário anterior de GitHub Actions.

Eles NÃO devem ser considerados prova de falha ou sucesso da implementação nova.

A conclusão desta SPEC requer **CI remoto novo após a publicação do repositório**.

## F5 — Publicação aumenta a superfície de segurança

O repositório agora é público.

Portanto:

* nenhuma credencial pode existir na árvore;
* nenhuma credencial real pode permanecer alcançável pelo histórico Git publicado (PUBLIC-HISTORY-01, §13.1);
* workflows executados em PRs não confiáveis não podem receber secrets;
* forks não podem disparar deploy;
* `pull_request_target` não deve executar código não confiável;
* production deploy deve continuar restrito a commits confiáveis de `main`;
* permissões do `GITHUB_TOKEN` devem seguir least privilege;
* `public-safety --strict` deve permanecer verde.

Estado atual verificado (Anexo A): não há nenhum `pull_request_target` nos 5 workflows; ações estão SHA-pinned; PRs de fork rodam sem acesso a `secrets.*`/`vars.*`; os deploys já validam `conclusion == success`, CI + PWA CI `success` no mesmo `head_sha` e rejeitam SHA stale. O delta remanescente desta SPEC é: checagem explícita de repositório de origem (`head_repository`) nos deploys e manutenção destas propriedades como invariantes.

## F6 — Provenance de release ainda não é uniforme

Estado atual verificado (Anexo A):

* **PWA** já possui boa propriedade: `build → test → artifact → deploy do mesmo artifact`, com smoke conferindo `gitSha` (`production-smoke.spec.ts:74-75`).
* **API** expõe `gitSha/buildId/builtAt` em `/health` (`apps/api/src/routes/index.ts:561-566`), mas o deploy é manual na VPS sem artifact imutável rastreável (sem push para registry no CI).
* **Agent** expõe `buildSha` em `/health` e valida manifest publicado pelo CI (SHA + runId), mas o manifest não inclui lockfile hash nem versão do Wrangler.
* **Não existe formato único de release manifest** para os 3 apps.

O sistema deve ser capaz de responder:

```text
qual commit?
qual build?
qual artifact/image?
qual versão está em produção?
```

sem depender de inferência humana.

## F7 — Reconciliação financeira histórica permanece aberta

A última auditoria registrou 63 findings históricos:

* 55 condicionalmente determinísticos;
* 8 ambíguos.

Localização confirmada: `docs/reports/v4.1-reconciliation-triage.md`; CLI read-only em `apps/api/src/scripts/reconciliation/` (invocada por `pnpm reconciliation` em `apps/api`).

Esta SPEC NÃO autoriza alteração automática desses dados.

Ela deve melhorar a evidência e a classificação, mas alterações nos dados financeiros reais permanecem sob autorização humana explícita.

## F8 — Documentação canônica contém fatos obsoletos

Estado verificado (Anexo A):

* `docs/architecture/runtime-facts.json` declara `lastVerified 2026-09-16`, `latestMigration V035` e 35 migrations — a árvore atual contém V001–V057 (o último deploy documentado/verificado, em 2026-09-18, estava em V054 — o estado atual de produção deve ser confirmado via `/health` ou mecanismo equivalente na execução). Obsoleto.
* `docs/ESTADO-E-PROXIMOS-PASSOS.md` congela estado de 2026-08-26 (`main@98cfc99`, pré-V4.1) sem marcação histórica. Obsoleto como estado atual.

O mecanismo de geração/check **já existe** (`scripts/generate-documentation-facts.mjs` + contract tests no job `docs` do CI + `pnpm docs:lint`); o problema é que os facts não foram regenerados e os documentos históricos não estão marcados como tais.

Documentação histórica não pode parecer documentação atual, principalmente porque agentes de IA consomem esses arquivos como contexto.

---

# 3. Invariantes obrigatórias

## INV-01 — Autoridade financeira

A API PostgreSQL continua sendo a única autoridade financeira.

```text
PWA → API
Agent → API
```

Nenhum cliente ou LLM torna-se source of truth.

## INV-02 — Sessão não depende de bearer legível por JavaScript

O estado autenticado deve vir de uma sessão confirmada pelo servidor.

A presença de:

```text
device token
session bearer
localStorage token
```

não pode ser pré-requisito para o bootstrap online.

## INV-03 — Identidade offline não é autenticador

A aplicação poderá persistir identificadores opacos necessários para particionamento offline.

Eles:

* não concedem acesso à API;
* não são bearer;
* não são device secret;
* não permitem autenticação;
* são removidos em logout/revogação.

## INV-04 — Snapshot deve ser user + workspace scoped

Dados offline de:

```text
user A / workspace X
```

não podem ser servidos para:

```text
user B / workspace X
```

nem para:

```text
user A / workspace Y
```

## INV-05 — 401/403 explícito nunca vira offline

```text
401/403 relevante
→ sessão inválida/revogada
→ purge
→ login
```

Erro de rede, timeout, DNS ou servidor inalcançável NÃO significa automaticamente logout.

Estado atual: a distinção existe nas camadas fundas (`auth-state-machine.ts:52-73`, `api/client.ts:277-307`, `sync-engine.ts:71-84`), mas o caminho sem bearer do `AuthGate` no boot ainda transforma falha de rede em login. Esta SPEC exige que a distinção sobreviva a todos os caminhos.

## INV-06 — Writes offline continuam proibidos

A V4.1 continua permitindo apenas leitura controlada do snapshot.

Nenhuma fila de writes offline será criada nesta SPEC.

## INV-07 — Claim transacional é obrigatório

Quando existir `claimTx`:

```text
claimTx + mutation
```

DEVE executar a mutação no mesmo transaction client.

Se isso não for possível:

```text
FAIL CLOSED
```

Nunca executar a mutação fora da transação silenciosamente.

## INV-08 — CI não pode mentir por ausência

Skipped, cancelled ou missing não equivalem a success.

Deploy somente é elegível quando todos os required gates do SHA estiverem explicitamente verdes.

## INV-09 — Código não confiável não acessa production secrets

PR de fork ou contribuição externa:

```text
pode testar
não pode deployar
não pode ler secrets de produção
```

## INV-10 — Produção precisa declarar sua identidade

API, PWA e Agent devem possuir forma verificável de retornar ou registrar:

* `gitSha`;
* `buildId`;
* build/release timestamp;
* quando aplicável, artifact/image digest.

---

# 4. Decisão AUTH-01 — Session-first real

Criar uma fonte explícita de estado de sessão consumível pelo restante do PWA.

Estado mínimo:

```ts
type SessionState =
  | { status: "authenticated"; userId: string }
  | { status: "unauthenticated" }
  | { status: "unreachable"; offlinePrincipalId?: string };
```

O formato exato pode mudar após análise do código.

A decisão arquitetural não pode mudar:

> `AppStateProvider` não decide se o usuário está autenticado verificando se existe um bearer.

`AuthGate`/session layer passa a ser a autoridade para esse estado.

Nota de estado atual: `SessionContext` hoje só expõe `expireSession` (`apps/pwa/src/lib/auth/session-context.tsx:5-17`); não existe estado de sessão consumível. O `AuthGate` mantém seu próprio `sessionUser` local.

---

# 5. Decisão AUTH-02 — Identidade offline

Persistir, após autenticação válida, um identificador offline não-autenticador.

Conceitualmente:

```text
offlinePrincipalId = authenticated user identity
offlineWorkspaceId = active workspace
```

A chave lógica do snapshot passa a equivaler a:

```text
version + principal + workspace
```

Pode-se armazenar uma derivação SHA-256 em vez dos valores brutos.

Não utilizar:

* session bearer;
* device token;
* cookie value;
* access token.

Nota de estado atual: a partição por `offlineSubjectId` já existe no V2 (`snapshot-db.ts:58-73`); o trabalho é desacoplar emissão/validade/leitura de `effectiveOnlineToken()` e alimentar a partição a partir da identidade autenticada confirmada por sessão.

---

# 6. Decisão AUTH-03 — Snapshot V3

Introduzir nova versão do envelope offline.

Exemplo conceitual:

```ts
interface OfflineSnapshotV3 {
  schema: 3;
  ownerKey: string;
  offlinePrincipalId: string;
  offlineWorkspaceId: string;
  lastOnlineAuthenticatedAt: string;
  domains: ...;
  syncedAt: ...;
}
```

A implementação pode evitar persistir IDs brutos se `ownerKey` for suficiente.

### Migração

Durante a janela de compatibilidade:

```text
V2 existente
+
sessão online validada
+
identidade user/workspace conhecida
→ migrar para V3
```

Não migrar V2 de forma especulativa.

Caso a propriedade não possa ser provada:

```text
invalidar V2
→ re-sync online
```

O snapshot é cache e não source of truth.

---

# 7. Decisão AUTH-04 — Routing de autenticação

Fluxo esperado:

```text
GET /auth/session
        │
        ├── 2xx authenticated
        │      → app online
        │
        ├── 401/403
        │      → purge + login
        │
        └── unreachable
               ↓
        snapshot V3 válido?
          ├── sim → offline read-only
          └── não → tela offline/login apropriada
```

Não transformar indisponibilidade de rede em autenticação inválida.

Nota de implementação: o endpoint/nome exato da sonda de sessão é decisão de implementação (Better-Auth já provê sessão por cookie); o requisito é que a sonda **preservesse** o sinal `401/403` vs `unreachable` — o `fetchSession()` atual (`api/auth.ts:74-87`) não preserva e precisa evoluir ou ser substituído.

---

# 8. Acceptance tests de autenticação

Devem existir provas automatizadas para:

### AUTH-T01

```text
LEGACY_BEARER_COMPAT=off
cookie válido
zero bearers localStorage
→ AuthGate unlocked
→ bootstrap financeiro executa
```

### AUTH-T02

```text
cookie válido
device token ausente
→ bootstrap executa
```

### AUTH-T03

```text
sessão anteriormente válida
zero bearer
API unreachable
snapshot V3 válido e dentro do TTL
→ offline read-only
```

### AUTH-T04

```text
API responde 401
snapshot válido
→ NÃO carregar snapshot
→ purge
→ login
```

### AUTH-T05

Membership revogada:

```text
403 workspace/membership
→ purge offline
→ login/seleção autorizada
```

### AUTH-T06

```text
user A + workspace X
logout
user B + workspace X
→ snapshot A não é legível por B
```

### AUTH-T07

```text
user A + workspace X
troca para workspace Y
→ snapshot X não aparece como Y
```

Nota de estado atual: a troca de workspace hoje apaga os snapshots V1/V2 mas **preserva** `offlineSubjectId` e o stamp `last-online-auth` (`workspace-context.tsx:298-313` chama `clearSensitiveSession` sem `clearToken`). O teste deve cobrir a limpeza/rebinding da identidade offline, não apenas o snapshot.

### AUTH-T08

Snapshot expirado:

```text
age > MAX_OFFLINE_AUTH_AGE
→ locked
```

---

# 9. Decisão TX-01 — Atomicidade fail-closed

Para todos os keyed mutation dispatchers:

```ts
if (claimTx) {
  if (!store.requiredMutationInTx) {
    throw AtomicMutationInvariantError;
  }

  return store.requiredMutationInTx(...);
}

return store.regularMutation(...);
```

Remover comportamento:

```text
claimTx presente
+
InTx inexistente
→ plain fallback
```

Superfície real inventariada (Anexo A): `writes/keyed-mutations.ts`, `payables/keyed-mutations.ts` (individual + bulk), `cards/keyed-mutations.ts`, `goals/keyed-mutations.ts`, `budgets/keyed-mutations.ts`, `subscriptions/keyed-mutations.ts` e `approvals/undo.ts:applyReversal`. O mecanismo V2 separado (`writes/pending-idempotency.ts`) já é fail-closed por construção e não precisa de mudança além de testes.

---

# 10. TX-02 — Cobertura

Aplicar a regra a todas as operações keyed inventariadas (24 operações keyed, incluindo 2 bulk de payables; contagem exata a reconfirmar dispatcher a dispatcher na execução), cobrindo:

* transactions (5 ops);
* payables (6 individuais + 2 bulk);
* cards (5);
* goals (3);
* budgets (2);
* subscriptions (1);
* undo (3 branches em `applyReversal`);
* demais mutações que usem o mesmo idempotency/UOW contract.

Atenção especial: `subscriptions/legacy-postgres.ts` é o único gap real hoje (sem `createSubscriptionInTx`) — ou o método é implementado, ou o fail-closed o cobre explicitamente. Cobertura deve incluir ambos os schemas (`canonical` e `legacy`).

---

# 11. TX-03 — Testes de atomicidade

Criar/ajustar testes que provem:

### TX-T01

```text
claimTx + InTx
→ InTx chamado
→ plain NÃO chamado
```

### TX-T02

```text
sem claimTx
→ plain permitido
```

### TX-T03

```text
claimTx + InTx ausente
→ invariant error
→ plain NÃO executado
```

### TX-T04

Crash depois do efeito e antes da completion:

```text
rollback completo
```

### TX-T05

N concorrentes com mesma idempotency key:

```text
1 efeito financeiro
N respostas convergentes/replay
```

### TX-T06

CI deve possuir cobertura Postgres real para os invariantes críticos.

Nota de estado atual: os testes unitários `tests/writes/domain-keyed-dispatch.test.ts:61-73, 101-103, 152-154` hoje **esperam o fallback plain** e devem ser invertidos. Provas Postgres reais existem (`keyed-mutations-postgres.test.ts`, `domain-keyed-mutations-postgres.test.ts`, lease/takeover, crash+replay) e devem ser estendidas ao caso `InTx ausente` e ao schema legacy.

---

# 12. Decisão CI-01 — Nova baseline pós-publicação

Os workflows antigos de 18/09 não contam como validação final.

A implementação deve gerar runs novos.

Required:

```text
CI = success
PWA CI = success
```

para o mesmo SHA candidato.

(Referência: `ci.yml` — job `gate` agrega 13 jobs; `pwa-ci.yml` roda em push para `main` sem path-filter justamente para garantir run por SHA.)

---

# 13. CI-02 — Segurança de repositório público

Antes de considerar CI saudável:

```text
pnpm public-safety --strict
```

deve passar.

Também verificar:

* nenhum `.env` real trackeado;
* nenhuma private key;
* nenhum token real;
* nenhum dump/back-up sensível;
* nenhum secret em workflow;
* GitHub Actions com permissões mínimas;
* PR de fork sem production secrets;
* nenhuma execução insegura de código de PR via `pull_request_target`.

Estado atual verificado (Anexo A): zero `pull_request_target`; actions SHA-pinned; `permissions: contents:read` nos workflows de CI/PR; CI roda `public-safety` em modo default (warnings tolerados) e o gate de publicação usa `--strict`. Delta desta SPEC: manter todas as propriedades como invariantes e **promover `public-safety --strict` a required check do CI** — o job roda com `--strict` e o gate agregador `gate` passa a depender dele; o modo default deixa de ser suficiente para o verde do CI.

Caso gitleaks ou scanner equivalente esteja disponível no CI Linux, deve executar de forma autoritativa.

## 13.1 PUBLIC-HISTORY-01 — Histórico Git publicado

Agora que o repositório é público, a proteção não se limita ao working tree. Gate:

```text
fetch de todas as refs/tags remotas
+
scanner de secrets com cobertura de histórico Git alcançável
+
verificação de objetos/refs efetivamente publicados
→ zero credencial real alcançável pelo clone público
```

Arquivos removidos do HEAD continuam acessíveis em commits antigos.

Se aparecer segredo real no histórico público:

```text
P0
→ revogar/rotacionar primeiro
→ depois decidir sobre history rewrite
```

Apagar o arquivo do HEAD não resolve o acesso ao conteúdo em commits anteriores.

Notas operacionais:

* inventoriar refs locais que não estão publicadas (ex.: o grupo `refs/pi-rewind/store`, documentado como débito local) e registrar quais refs são publicadas vs locais — apenas as publicadas são alcançáveis pelo clone;
* qualquer decisão de GC/rewrite de histórico exige plano explícito de preservação/rotação e autorização humana separada;
* o resultado do scan (ferramenta, refs cobertas, findings redigidos) entra no relatório final.

---

# 14. CI-03 — Deploy confiável

`PWA Deploy` e `Agent Deploy` somente podem prosseguir quando:

```text
workflow_run.event == push
head_branch == main
head_repository == repository atual
CI == success
PWA CI == success
candidate SHA == current main
```

ou proteção equivalente tecnicamente comprovada.

Estado atual verificado (Anexo A): os deploys já checam `conclusion == success`, CI + PWA CI `success` para o mesmo `head_sha` via API (fail-closed se ausente), rejeição de SHA stale (`candidate == main`) e origens validadas por `scripts/validate-deploy-origins.mjs`. O filtro `branches: [main]` do `workflow_run` restringe a `head_branch == main`, e forks não têm acesso a secrets. O delta é a **checagem explícita de `head_repository`** (hoje a proteção é indireta): adicioná-la ou documentar formalmente a equivalência.

Contribuição externa nunca deve ser capaz de satisfazer sozinha o gate de production deploy.

---

# 15. CI-04 — Proteção de main

Preferência:

```text
PR
↓
CI + PWA CI
↓
merge
```

Configurar ruleset/branch protection quando suportado pelo repositório/conta:

* required CI;
* required PWA CI;
* impedir force push em `main`;
* impedir deletion de `main`.

Se a automação não tiver permissão administrativa para configurar isso, registrar a limitação e fornecer instrução manual exata.

---

# 16. Release provenance

## REL-01 — PWA

Preservar o modelo existente:

```text
build once
test
artifact
deploy same artifact
```

Não regredir para rebuild no deploy.

## REL-02 — API

Melhorar a prova de release.

Preferência:

```text
CI
↓
Docker image
↓
immutable digest
↓
registry/artifact
↓
deploy exact digest
```

A solução preferencial é GHCR se compatível com a infraestrutura existente.

Estado atual: `Dockerfile` já recebe `BUILD_SHA/BUILD_ID/BUILD_TIME` e `/health` os expõe; o job `docker` do CI builda `:ci` + smoke, mas **não há push para registry**; deploy é manual na VPS (`docs/reports/v4.1-release-bridge-execution.md`).

Se automação de deploy VPS estiver fora do escopo de credenciais disponíveis:

* produzir image/artifact imutável;
* registrar digest;
* atualizar runbook para deploy manual pelo digest;
* NÃO inventar acesso à VPS.

## REL-03 — Agent

No mínimo registrar e validar:

* source SHA;
* lockfile hash;
* Wrangler version;
* build ID;
* release timestamp;
* `/health.buildSha`.

Estado atual: `/health.buildSha` e deploy `--var BUILD_SHA/...` existem; o manifest do CI (`agent-deploy-manifest-SHA`) contém `{sha, workflow, runId}` e é verificado no deploy — faltam lockfile hash e versão do Wrangler.

Se for tecnicamente simples promover bundle imutável testado, implementar.

Não redesenhar a infraestrutura somente para atingir byte-for-byte parity nesta rodada.

## REL-04 — Manifest de release

Não existe formato único hoje — são 3 mecanismos por app (tarball PWA, build-args de image API, manifest JSON Agent).

**REQUIRED** — cada app individualmente rastreável até commit/build/artifact (validar sem regressão):

```text
API     → build-args de image + /health (gitSha, buildId, builtAt)
PWA     → artifact tarball + smoke gitSha
Agent   → manifest + /health.buildSha
```

**DESIRED** — manifest único consolidando os três, por exemplo:

```json
{
  "gitSha": "...",
  "buildId": "...",
  "builtAt": "...",
  "components": {
    "api": {},
    "pwa": {},
    "agent": {}
  }
}
```

Se o manifest único for simples (documento canônico gerado/consumido por runbook), implementa nesta rodada. Se começar a exigir registry, pipeline novo ou redesign de deploy, torna-se débito P2 pós-closure — o fechamento da V4.1 não depende dele.

---

# 17. Reconciliação financeira

Criar uma execução/readiness atual da reconciliação.

Ferramentas existentes (não recriar): CLI read-only em `apps/api/src/scripts/reconciliation/` (`pnpm reconciliation`, `SELECT`-only via `default_transaction_read_only=on`), triagem histórica em `docs/reports/v4.1-reconciliation-triage.md` (63 findings), baseline em `docs/reports/v4.1-baseline.md`.

Classificar cada finding como:

```text
resolved
deterministic-candidate
ambiguous
new-regression
```

Regras:

* nenhum repair em produção automaticamente;
* nenhum `UPDATE/DELETE/INSERT` financeiro em produção;
* nenhuma inferência sobre intenção financeira histórica;
* gerar relatório reproduzível;
* se aparecer finding criado após V4.1, tratá-lo como possível regressão e elevar prioridade.

Repairs só poderão ocorrer após autorização humana explícita separada.

---

# 18. Documentação

Separar claramente:

```text
CURRENT
HISTORICAL
GENERATED FACTS
```

Mecanismo de facts **já existe** — `scripts/generate-documentation-facts.mjs`, contract tests (`documentation-facts-contract.test.mjs`, `canonical-docs-contract.test.mjs` no job `docs`) e `pnpm docs:lint`. O trabalho é:

1. regenerar `docs/architecture/runtime-facts.json` (hoje: V035/35 migrations vs V001–V057 na árvore);
2. manter o drift check no CI (contrato já roda no job `docs`);
3. marcar snapshots históricos com:

```text
status: historical
verifiedAt: ...
```

— em particular `docs/ESTADO-E-PROXIMOS-PASSOS.md` (congela 2026-08-26, pré-V4.1) e qualquer `runtime-facts.json` arquivado — para que não pareçam documentação canônica atual.

Os facts devem cobrir pelo menos:

* apps ativos;
* latest migration;
* quantidade de migrations;
* runtime PWA;
* runtime Agent;
* source of truth;
* schema mode relevante.

---

# 19. Non-goals

Esta SPEC NÃO deve:

* criar funcionalidades novas;
* refatorar todo o `AppStateProvider`;
* refatorar todo o `FinanceChatAgent`;
* trocar framework;
* mudar banco;
* realizar Canonical Cutover;
* executar Release B antes dos gates;
* reparar automaticamente dados financeiros reais;
* redesenhar UI;
* implementar writes offline;
* remover compatibilidade legada antes dos testes;
* mudar visibilidade do repo novamente;
* fazer deploy de produção sem autorização explícita;
* mergear `main` sem autorização explícita.

---

# 20. Gate para Release B

Release B só fica **READY**, não automaticamente executada, quando:

```text
AUTH-T01..T08 GREEN
TX-T01..T06 GREEN
CI novo GREEN
public-safety strict GREEN
production provenance verificável
zero regressões financeiras novas
```

e o threshold operacional já definido para uso de bearer legado for satisfeito (0 eventos `auth.request.legacy_bearer_used` em 14 dias — ver `docs/reports/v4.1-decision-gates.md`).

---

# 21. Gate para Canonical Cutover

Canonical Cutover permanece fora desta SPEC.

Só pode ser planejado posteriormente quando:

```text
V4.1 Closure DONE
+
reconciliação compreendida
+
nenhum drift inexplicado novo
+
rollback comprovado
```

---

# 22. Definition of Done

A SPEC estará DONE quando houver evidência de:

1. Cookie-only funcional de ponta a ponta.
2. Snapshot offline V3 independente de bearer/device secret.
3. 401/403 fail-closed.
4. Offline por indisponibilidade funcionando read-only.
5. Keyed mutations fail-closed quando `*InTx` faltar.
6. Testes de crash/concorrência verdes.
7. `public-safety --strict` verde e required no CI; histórico publicado sem credenciais (PUBLIC-HISTORY-01).
8. CI e PWA CI novos e verdes no mesmo SHA.
9. Deploy workflows protegidos contra origem não confiável.
10. Provenance documentada para API/PWA/Agent.
11. Reconciliação reexecutada sem repairs automáticos.
12. Documentação canônica/facts atualizada.
13. Auto-review concluída sem P0/P1 abertos.
14. Relatório final contendo evidências e débitos restantes.

Nenhum item pode ser marcado DONE apenas porque o código “parece correto”.

---

# Anexo A — Autorevisão documental (2026-09-21)

Auditoria das alegações factuais desta SPEC contra a HEAD `e0d5601` (branch `v4.1-hardening`), por 3 explorações read-only independentes. Vereditos: CONFIRMADO / PARCIAL / AJUSTADO nesta revisão.

| # | Alegação | Veredito | Evidência principal |
|---|----------|----------|---------------------|
| 1 | F1: bootstrap gated por bearer em storage | CONFIRMADO | `app-state-context.tsx:376-380` (`apiUsable`), `:466, :714, :722-723`; comentário `:367-374` |
| 2 | F1: flag OFF fecha o gate mesmo com cookie válido | CONFIRMADO | `token-store.ts:35-45, :53-98`; `api/client.ts:108-109` |
| 3 | F1: `fetchSession` colapsa 401/403/rede | CONFIRMADO (adicionado à SPEC) | `api/auth.ts:74-87`; `AuthGate.tsx:33-47, :80-81` |
| 4 | F2: fingerprint de token é parte da identidade do snapshot | CONFIRMADO (com nuance: partição primária é `offlineSubjectId`; acoplamento é via `effectiveOnlineToken()`) | `snapshot-db.ts:4-6, :58-73, :364-384, :447-450`; `app-state-context.tsx:388-390, :705, :722` |
| 5 | AUTH: distinguição 401/403 vs rede existe nas camadas fundas mas falha no boot sem bearer | CONFIRMADO (nota adicionada em INV-05) | `auth-state-machine.ts:52-73`; `client.ts:277-307`; `sync-engine.ts:71-84`; `AuthGate.tsx:47` |
| 6 | F3: fallback fail-open existe nos dispatchers | CONFIRMADO — 7 dispatchers + `applyReversal`, 24 operações keyed (2 bulk) + 3 branches de undo | `writes/keyed-mutations.ts:84-114`; `payables/keyed-mutations.ts:136-172, :221-233`; `cards/keyed-mutations.ts:108-138`; `goals/keyed-mutations.ts:67-88`; `budgets/keyed-mutations.ts:53-68`; `subscriptions/keyed-mutations.ts:40-46`; `approvals/undo.ts:109-127` |
| 7 | F3: há buraco real de atomicidade hoje | CONFIRMADO — subscriptions legacy sem `createSubscriptionInTx` (adicionado à SPEC) | `subscriptions/legacy-postgres.ts:42-145` |
| 8 | Testes cristalizam o fallback plain | CONFIRMADO (adicionado à SPEC §11) | `tests/writes/domain-keyed-dispatch.test.ts:61-73, :101-103, :152-154` |
| 9 | F5: PRs de fork sem secrets; sem `pull_request_target`; deploys com gates | CONFIRMADO (delta `head_repository` explicitado em §14) | `ci.yml:11-12`; `pwa-deploy.yml:16, :23-74`; `agent-deploy.yml:16, :23-74`; grep `pull_request_target` = 0 |
| 10 | F6: PWA build-once → deploy do mesmo artifact | CONFIRMADO | `ci.yml:163-169`; `pwa-ci.yml:68-76`; `pwa-deploy.yml:103-140`; `production-smoke.spec.ts:74-75` |
| 11 | F6: API sem artifact imutável/registry | CONFIRMADO | `apps/api/Dockerfile:55-58`; `routes/index.ts:561-566`; `docs/reports/v4.1-release-bridge-execution.md:39-42` |
| 12 | F6: Agent manifest sem lockfile/wrangler version | CONFIRMADO (seção REL-04 adicionada) | `ci.yml:67-77`; `agent-deploy.yml:100-152`; `worker.ts:249-261` |
| 13 | F7: CLI read-only + 63 findings documentados | CONFIRMADO | `apps/api/src/scripts/reconciliation/`; `docs/reports/v4.1-reconciliation-triage.md:13-30` |
| 14 | F8: runtime-facts.json obsoleto | CONFIRMADO — e gerador já existe (SPEC ajustada) | `docs/architecture/runtime-facts.json:2-4, :28-36` (V035/35) vs `apps/api/src/read-models/sql/V001–V057`; `scripts/generate-documentation-facts.mjs:8-73` |
| 15 | Baseline `7292dd8` válida | AJUSTADO — HEAD é `e0d5601` (2 commits à frente, nenhum implementa esta SPEC) | `git log`; `git show --stat 1c097df e0d5601` |

Findings da autorevisão incorporados ao texto: distinção de sinais no boot (INV-05, §7), nuance da partição V2 (F2, §5), purge de subject/stamp na troca de workspace (AUTH-T07), inventário real de dispatchers e gap subscriptions-legacy (§9, §10), inversão de testes (§11), delta `head_repository` (§14), seção REL-04, referências exatas de reconciliação (§17) e reenquadramento de F8/§18 (gerador existente, foco em regeneração + marcação histórica).
