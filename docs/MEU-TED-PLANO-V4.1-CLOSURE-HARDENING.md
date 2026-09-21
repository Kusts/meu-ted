# MEU TED — Plano de Implementação V4.1 Closure & Release Hardening

**SPEC:** `docs/MEU-TED-SPEC-V4.1-CLOSURE-HARDENING.md`
**Baseline declarada:** `main@7292dd896c2d34905e3747f4fc2fa53705b3bd48`
**Branch de trabalho atual (verificado 2026-09-21):** `v4.1-hardening` @ `e0d5601` (dois commits à frente da baseline declarada; nenhum implementa itens desta SPEC — ver Anexo A da SPEC). A Fase 0.1 reconfirma na execução.

---

# Princípio de execução

Executar:

```text
baseline
→ testes RED
→ implementação mínima
→ testes GREEN
→ integração
→ CI remoto
→ revisão independente
→ evidências
```

Não misturar refatorações cosméticas com fechamento de invariantes.

---

# Phase 0 — Baseline e publicação

## 0.1 Atualizar baseline real

Antes da primeira alteração:

```text
git fetch --all --prune
git status
git rev-parse HEAD
git rev-parse origin/main
```

Se `main` mudou após `7292dd8`, usar o novo HEAD e registrar no relatório.

Estado conhecido em 2026-09-21: branch `v4.1-hardening` @ `e0d5601` = `7292dd8` + `1c097df` (undo-proposal do Agent + migrations V055–V057) + `e0d5601` (contrato V054 legado).

## 0.2 Branch de trabalho

Reutilizar `v4.1-hardening` se ela continuar sendo a branch dedicada desta implementação e estiver baseada no estado correto. Criar `v4.1-closure-hardening` apenas se for necessária uma branch nova por isolamento ou se `v4.1-hardening` já contiver trabalho fora do escopo desta SPEC.

Não desenvolver diretamente em `main`.

## 0.3 Confirmar propagação pública

Verificar por acesso não autenticado que `Kusts/meu-ted` está público.

Não alterar visibilidade.

Registrar apenas:

```text
visibility verified
timestamp
baseline SHA
```

## 0.4 Public safety

Executar antes das alterações:

```text
pnpm public-safety --strict
```

(script: `scripts/check-public-safety.mjs`; modo `--strict` trata warnings como falha) e scanners Linux/CI disponíveis.

Qualquer secret real encontrado é P0.

Não imprimir secret em relatório.

Redigir apenas:

```text
secret class
file/history location
rotation required: yes/no
```

### 0.4.1 Scan de histórico Git publicado (PUBLIC-HISTORY-01)

Agora que o repo é público, o scan não se limita ao working tree:

```text
git fetch --all --tags --prune
+
scanner de secrets com cobertura de histórico (ex.: gitleaks/trufflehog em modo git history)
+
inventário de refs publicadas vs locais (ex.: refs/pi-rewind/store é débito local documentado)
→ zero credencial real alcançável pelo clone público
```

Segredo real no histórico público:

```text
P0
→ revogar/rotacionar primeiro
→ depois decidir history rewrite (exige plano de preservação + autorização humana separada)
```

Apagar o arquivo do HEAD não remove o conteúdo de commits antigos.

## 0.5 Baseline local

Executar as suites atuais definidas nos `package.json` (raiz: `pnpm typecheck`, `pnpm test`, `pnpm docs:lint`, `pnpm governance:check`; API: `pnpm test:integration:all` dentro de `apps/api` — o script vive no `apps/api/package.json`, não na raiz).

Registrar:

```text
PASS
FAIL
SKIP
environment limitation
```

Não “corrigir” baseline failures sem primeiro classificá-los.

### Gate P0

Só avançar se:

* árvore segura para repo público;
* histórico publicado sem credencial real (PUBLIC-HISTORY-01) — ou P0 tratado, com revogação/rotação registrada;
* baseline conhecido;
* nenhum secret P0 ativo.

---

# Phase 1 — Testes RED de cookie-only

Antes da implementação, criar os testes faltantes da SPEC.

Cobrir:

```text
compat OFF + cookie válido
compat OFF + zero storage bearer
offline unreachable
401
403 revocation
user switch
workspace switch (incl. purge de offlineSubjectId/stamp — hoje preservados em troca de workspace)
TTL
```

Atualizar principalmente as suites próximas de:

```text
apps/pwa/src/features/auth/__tests__/AuthGate.test.tsx
apps/pwa/src/lib/auth/auth-state-machine.test.ts
apps/pwa/src/lib/state/__tests__/session-first-boot.t2-5.test.tsx
apps/pwa/src/lib/state/__tests__/snapshot-db.test.ts
apps/pwa/src/lib/state/__tests__/snapshot-store.test.ts
apps/pwa/src/lib/state/__tests__/offline-lock.t2-6.test.ts
apps/pwa/e2e/xlt/xlt-02-cookie-auth.spec.ts
apps/pwa/e2e/xlt/xlt-08-offline-lock.spec.ts
apps/pwa/e2e/xlt/xlt-09-logout-cleanup.spec.ts
```

O primeiro objetivo é reproduzir:

```text
AuthGate unlocked
+
AppStateProvider não bootstrapa
```

com compat OFF (gate real: `apiUsable()` em `apps/pwa/src/lib/state/app-state-context.tsx:376-380`).

### Gate P1

Pelo menos um teste novo deve falhar pelo problema real antes da correção.

---

# Phase 2 — Session-first real

## 2.1 Criar autoridade explícita de sessão

Evoluir `SessionContext` (hoje só expõe `expireSession` — `apps/pwa/src/lib/auth/session-context.tsx:5-17`) ou criar módulo equivalente.

Não usar storage token como fonte de autenticação.

Expor ao estado da aplicação informação suficiente para distinguir:

```text
authenticated
unauthenticated
unreachable
```

e identidade autenticada não secreta.

## 2.2 Ajustar AuthGate e a sonda de sessão

A sonda de sessão precisa distinguir:

```text
2xx
401/403
network/timeout/unreachable
```

`fetchSession()` atual colapsa tudo em `{ user: null }` (`apps/pwa/src/lib/api/auth.ts:74-87`) e o `AuthGate` repete o padrão (`features/auth/AuthGate.tsx:33-38`); no caminho sem bearer, rede vira login (`:47`).

Evitar `catch { session = null }` quando isso apaga a distinção entre:

```text
não autenticado
servidor indisponível
```

A máquina de estados adequada já existe (`auth-state-machine.ts:52-73`) — reusá-la.

## 2.3 Remover gate de bearer do AppStateProvider

Eliminar a semântica:

```text
apiUsable = token presente
```

(`app-state-context.tsx:376-380` e ~40 chamadas `if(!apiUsable())return;`)

Substituir pela autoridade de sessão.

O bootstrap online deve funcionar com:

```text
cookie only
```

## 2.4 Não remover compat ainda

`NEXT_PUBLIC_LEGACY_BEARER_COMPAT` continua existindo durante esta implementação (`token-store.ts:35-98`).

Objetivo:

```text
ON funciona
OFF funciona
```

Só depois Release B poderá ser considerada READY.

### Gate P2

AUTH-T01 e AUTH-T02 verdes.

---

# Phase 3 — Snapshot Offline V3

## 3.1 Criar identidade offline não secreta

Persistir somente após autenticação online válida.

Necessário:

```text
principal
workspace
```

Produzir owner key estável sem usar bearer/device secret.

Nota: a partição primária `offlineSubjectId` já existe no V2 (`snapshot-db.ts:58-73`); o trabalho é desacoplar emissão/validade/leitura de `effectiveOnlineToken()` (`app-state-context.tsx:388-390, :705, :722`) e alimentar a partição a partir da identidade autenticada.

## 3.2 Envelope V3

Introduzir schema V3.

Não modificar V2 in-place de forma ambígua.

## 3.3 Migração V2 → V3

Quando:

```text
sessão validada online
+
owner atual conhecido
+
V2 legível com segurança
```

migrar para V3.

Caso contrário:

```text
invalidar/re-sync
```

Nunca atribuir snapshot antigo a um usuário por heurística.

## 3.4 Offline routing

Implementar:

```text
session unreachable
+
V3 ownership válido
+
age válido
→ offline read-only
```

Manter:

```text
401/403
→ purge/login
```

(TTL já existe: `DEFAULT_MAX_OFFLINE_AUTH_AGE_HOURS=72` em `apps/pwa/src/lib/capabilities.ts:79`, env override `:81-97`, kill-switch `:105-113`.)

## 3.5 Logout/revogação/troca de workspace

Garantir limpeza de:

```text
offline principal
workspace binding
snapshot
agent session
legacy token residue
offlineSubjectId + last-online-auth stamp
```

conforme o caso.

Atenção: `selectWorkspace` e a revogação de acesso hoje chamam `clearSensitiveSession({clearV1Snapshot:true, clearProfile:true})` **sem** `clearToken` — apagam snapshots mas preservam subject/stamp (`workspace-context.tsx:298-313`). A SPEC exige rebinding/limpeza da identidade offline na troca (AUTH-T07).

### Gate P3

AUTH-T03..AUTH-T08 verdes.

Rodar XLT real além de units (`xlt-02`, `xlt-08`, `xlt-09` no mínimo).

---

# Phase 4 — Atomicidade fail-closed

## 4.1 Inventário de dispatchers (já levantado; reconfirmar na execução)

Superfície real = **7 dispatchers + `applyReversal`, 24 operações keyed (incluindo 2 bulk de payables) + 3 branches de reversal do undo** (contagem exata a reconfirmar dispatcher a dispatcher na execução):

| Domínio | Dispatcher | Ops |
|---|---|---|
| transactions | `apps/api/src/writes/keyed-mutations.ts` | 5 |
| payables individuais | `apps/api/src/payables/keyed-mutations.ts` | 6 |
| payables bulk | `apps/api/src/payables/keyed-mutations.ts` | 2 |
| cards | `apps/api/src/cards/keyed-mutations.ts` | 5 |
| goals | `apps/api/src/goals/keyed-mutations.ts` | 3 |
| budgets | `apps/api/src/budgets/keyed-mutations.ts` | 2 |
| subscriptions | `apps/api/src/subscriptions/keyed-mutations.ts` | 1 |
| undo | `apps/api/src/approvals/undo.ts:applyReversal` | 3 branches |

Gap real conhecido: `subscriptions/legacy-postgres.ts:42-145` não expõe `createSubscriptionInTx`. O mecanismo V2 (`writes/pending-idempotency.ts`) já é fail-closed por construção.

## 4.2 Alterar regra

Para cada mutação:

```text
claimTx presente
+
InTx ausente
→ invariant error
```

Plain fallback somente quando:

```text
claimTx ausente
```

## 4.3 Criar erro semântico

Preferir erro específico, por exemplo:

```text
idempotency.atomic_mutation_not_supported
```

Não existe hoje (`DomainErrorCode` em `writes/errors.ts:8-22` só tem `idempotency.conflict/in_progress` + `unsupported` genérico). Adicionar o código dedicado ou estender o domínio de erros.

Não devolver detalhes internos desnecessários ao cliente.

## 4.4 Atualizar testes unitários

Inverter testes que hoje esperam o fallback:

```text
tests/writes/domain-keyed-dispatch.test.ts:61-73  (Tx sem InTx → plain, never throws)
tests/writes/domain-keyed-dispatch.test.ts:101-103 (bulk refresh)
tests/writes/domain-keyed-dispatch.test.ts:152-154 (goal contribute)
```

para:

```text
Tx + no InTx → throw + zero plain calls
```

## 4.5 Postgres proofs

Rodar e, se necessário, ampliar (suites existentes: `keyed-mutations-postgres.test.ts`, `domain-keyed-mutations-postgres.test.ts`, `postgres-idempotency-lease.test.ts`, `postgres-unit-of-work.test.ts`, `xlt-07-undo-crash.test.ts`; concorrência = 19 arquivos em `vitest.concurrency.config.ts`):

```text
concurrency
failure injection
same-key replay
claim takeover
bulk payables
cards
goals
transactions
InTx ausente (novo)
DB_SCHEMA=legacy subscriptions (novo)
```

Integração Postgres real: `pnpm test:integration:all` (em `apps/api`).

### Gate P4

TX-T01..TX-T06 verdes.

Nenhuma rota financeira externa deve poder perder atomicidade silenciosamente.

---

# Phase 5 — Hardening de CI para repo público

Estado de partida (verificado): 5 workflows (`ci.yml`, `pwa-ci.yml`, `pwa-deploy.yml`, `agent-deploy.yml`, `production-smoke.yml`); sem `pull_request_target`; actions SHA-pinned; `permissions: contents:read`; deploys com gates duplos (conclusion + CI/PWA CI success no mesmo `head_sha` + stale check + origens validadas).

## 5.1 Revisar triggers

Auditar `.github/workflows`.

Classificar:

```text
untrusted CI
trusted CI
production deploy
manual operations
```

## 5.2 PRs externos

Garantir que workflows de PR:

* não recebem production secrets;
* não possuem `contents: write` sem necessidade;
* não possuem `packages: write` sem necessidade;
* não fazem deploy;
* não executam código não confiável em contexto privilegiado.

## 5.3 workflow_run deploy — delta explícito

Adicionar aos PWA/Agent deploys a checagem explícita de:

```text
head_repository == current repository
```

(hoje a proteção é indireta: branches filter + stale SHA + secrets indisponíveis em fork). Manter e não regredir os gates existentes.

## 5.4 Public-safety no CI

`public-safety --strict` passa a ser **required check do CI**: o job roda com `--strict` e o gate agregador `gate` passa a depender dele. O modo default (warnings tolerados) deixa de ser suficiente para o verde do CI e permanece apenas como sinal intermediário, se útil.

## 5.5 Branch protection/ruleset

Tentar configurar:

```text
main
  required CI
  required PWA CI
  no force push
  no deletion
```

Se o token/app não tiver permissão:

* não contornar;
* registrar;
* gerar comandos/passos manuais.

### Gate P5

Modelo de threat para PR externo validado.

---

# Phase 6 — Rodar CI novo

Após mudanças:

```text
commit
push branch
```

Criar/atualizar PR.

Usar os runs NOVOS.

Não utilizar como evidência os failures de 18/09.

Obrigatório:

```text
CI       success
PWA CI   success
same SHA
```

Se um job falhar:

```text
investigar logs
corrigir causa
push
rerun
```

Não desabilitar checks para obter verde.

### Gate P6

CI remoto novo totalmente verde.

---

# Phase 7 — Provenance de release

## 7.1 PWA

Validar que continua:

```text
CI artifact == deployed artifact
```

(tarball `pwa-cloudflare-build-*-SHA`, deploy sem rebuild, smoke `gitSha == SHA`). Sem regressão.

## 7.2 API

Mapear mecanismo atual de build/deploy (Dockerfile com `BUILD_SHA/BUILD_ID/BUILD_TIME`; `/health` expõe; deploy manual VPS; sem push para registry).

Implementar a menor mudança que produza:

```text
immutable image/artifact
+
digest
+
gitSha
```

Preferência GHCR.

Se deploy automático VPS exigir credencial/acesso ausente:

```text
STOP no deploy
```

Produzir artifact/digest e runbook (base: `docs/reports/v4.1-release-bridge-execution.md`).

## 7.3 Agent

Registrar no release manifest (hoje `{sha, workflow, runId}` em `agent-deploy-manifest-SHA`, verificado no deploy):

```text
gitSha (existe)
lockfile hash (faltando)
wrangler version (faltando)
build ID (existe via --var)
build time (existe via --var)
```

Validar `/health.buildSha` (existe, smoke cobre).

Só implementar promoção de bundle byte-identical se isso couber sem redesenho do deploy.

## 7.4 Release manifest

**REQUIRED** — rastreabilidade individual por app (já existente; validar sem regressão):

```text
API     → build-args de image + /health (gitSha, buildId, builtAt)
PWA     → artifact tarball + smoke gitSha
Agent   → manifest + /health.buildSha
```

**DESIRED** — formato único consolidando os três, por exemplo:

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

Se for simples (documento canônico gerado/consumido por runbook), implementa nesta rodada. Se começar a puxar registry, pipeline novo ou redesign de deploy, vira débito P2 pós-closure — o fechamento da V4.1 não depende dele.

### Gate P7

É possível correlacionar uma release com o source exato.

Nenhum deploy de produção é necessário para concluir a implementação.

---

# Phase 8 — Reconciliação read-only

## 8.1 Executar contra ambiente permitido

Ferramenta: `pnpm reconciliation` (em `apps/api`; CLI SELECT-only via `default_transaction_read_only=on`).

Preferência:

```text
backup/réplica
```

Produção somente em modo read-only se o acesso já existir e for autorizado operacionalmente.

## 8.2 Classificar

Comparar com os 63 findings históricos (`docs/reports/v4.1-reconciliation-triage.md`; baseline em `docs/reports/v4.1-baseline.md`).

Taxonomia canônica (a mesma da SPEC §17):

```text
resolved
deterministic-candidate
ambiguous
new-regression
```

Mapeamento: um finding que persiste é `deterministic-candidate` (quando houver verificação determinística possível) ou `ambiguous`; finding surgido após a V4.1 é `new-regression` e dispara o gate P8.

## 8.3 Regra absoluta

NÃO executar:

```sql
INSERT
UPDATE
DELETE
```

em dados financeiros reais.

Produzir somente relatório e SQLs de verificação read-only.

### Gate P8

Nenhuma regressão financeira nova inexplicada.

Caso exista:

```text
elevar para P0/P1
não seguir para DONE
```

---

# Phase 9 — Documentação canônica

## 9.1 Atualizar runtime facts

Não editar contagens manualmente se puderem ser derivadas.

O gerador/check **já existe** (`scripts/generate-documentation-facts.mjs`; contratos no job `docs` do CI). Executar a regeneração de `docs/architecture/runtime-facts.json` (hoje: V035/35 migrations vs V001–V057 na árvore) e manter o drift check verde.

## 9.2 Marcar histórico

Documentos antigos devem declarar claramente:

```text
HISTORICAL SNAPSHOT
verifiedAt
supersededBy
```

quando aplicável. Caso imediato: `docs/ESTADO-E-PROXIMOS-PASSOS.md` (congela 2026-08-26, pré-V4.1) e snapshots de produção em `docs/ops/`.

## 9.3 Current architecture

Garantir uma entrada canônica simples para agentes:

```text
docs/current/
```

ou equivalente.

Não duplicar arquitetura em cinco arquivos concorrentes.

Nota: `docs/ARCHITECTURE-CURRENT.md` já é o ponto canônico listado em `AGENTS.md`; preferir atualizá-lo a criar árvore concorrente. Se novos docs canônicos forem criados, adicioná-los à lista fechada de `scripts/lint-docs.mjs`.

### Gate P9

Um agente novo consegue descobrir a arquitetura atual sem escolher acidentalmente um snapshot de agosto.

---

# Phase 10 — Auto-review

Após implementação:

## Review 1 — Architecture

Validar:

* authority;
* auth state;
* offline;
* UOW;
* legacy coexistence.

## Review 2 — Security

Validar:

* repo público;
* secrets;
* fork PR;
* workflow privilege;
* auth;
* IDOR/workspace boundaries.

## Review 3 — Reliability

Validar:

* retries;
* idempotency;
* concurrency;
* failure injection;
* migration;
* release gates.

Cada finding novo deve ser:

```text
P0
P1
P2
P3
```

Corrigir P0/P1 antes da conclusão.

P2 pode permanecer apenas com justificativa e debt explícito.

---

# Phase 11 — Relatório final

Criar:

```text
docs/reports/v4.1-closure-hardening-final.md
```

Conteúdo mínimo:

```text
baseline SHA
final SHA

findings corrigidos
arquivos alterados
decisões

tests locais
CI URLs/run IDs
CI status

public-safety
public-history (PUBLIC-HISTORY-01)
security review

auth/offline evidence
atomicity evidence

release provenance
reconciliation status

remaining debts
human gates
rollback notes
```

## 11.1 Gate de observação bearer legado (condição de READY para Release B)

Release B READY exige, além dos gates acima, a janela operacional já definida:

```text
14 dias consecutivos
+
0 eventos auth.request.legacy_bearer_used
```

Consultar a métrica server-side (referência canônica: `docs/reports/v4.1-decision-gates.md`; mede uso efetivo do fallback, não mera presença de header). A janela é temporal: registrá-la no relatório final como observação pendente/em curso, com a consulta exata utilizada. Implementação e CI não podem antecipar ou simular essa evidência.

---

# Ordem resumida

```text
0 baseline/public safety
↓
1 RED auth tests
↓
2 session-first
↓
3 offline V3
↓
4 atomicity fail-closed
↓
5 public CI hardening
↓
6 CI remoto GREEN
↓
7 release provenance
↓
8 reconciliation read-only
↓
9 docs
↓
10 independent review
↓
11 final report
```

---

# Autorizações

Este plano, quando executado sob a autorização vigente do owner, permite ao agente:

* editar o repositório;
* criar testes;
* preparar branch e commits para revisão.

Conforme a governança do repositório (`AGENTS.md`), commits diretos, push da branch e criação de PR ocorrem somente após aprovação e validação do Planner/Supervisor ou autorização explícita vigente no momento da execução.

Este plano NÃO autoriza o agente a:

* mergear `main`;
* deployar produção;
* alterar dados financeiros reais;
* executar repairs de reconciliação;
* mudar novamente a visibilidade;
* rotacionar secrets sem confirmação;
* executar Canonical Cutover;
* executar Release B.

Esses passos exigem autorização humana separada.
