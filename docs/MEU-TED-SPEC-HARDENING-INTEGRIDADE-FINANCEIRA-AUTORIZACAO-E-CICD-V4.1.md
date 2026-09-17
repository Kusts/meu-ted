# MEU TED — SPEC V4.1

## Hardening, Integridade Financeira, Autorização, CI/CD, Publicização Segura e Preparação para Canonical

**Status:** Pronta para implementação
**Tipo:** Closure / Hardening / Reliability SPEC
**Projeto:** Meu TED
**Versão:** V4.1
**Origem:** Consolidação das auditorias técnicas posteriores à V4
**Baseline auditada anteriormente:** `main@dd10e2b1a004edae5c4ec60c3cb6c993f675c586`

> O agente NÃO deve assumir que o SHA acima continua sendo o HEAD atual. A primeira etapa da execução é registrar o SHA real utilizado como baseline e verificar divergências ocorridas após a auditoria.

> **Registro de baseline verificado (2026-09-16, na documentação desta SPEC):** o HEAD da `main` é exatamente `dd10e2b1a004edae5c4ec60c3cb6c993f675c586`, que já contém o merge da V4 (`ce787e4`). A baseline auditada coincide com o HEAD de planejamento atual. O estado de produção (imagem da API na VPS) deve ser reconfirmado na Fase 0 — a última confirmação documentada é `v3-3305152` (V3), possivelmente desatualizada.

---

# 1. Contexto

A V4 corrigiu problemas arquiteturais importantes do Meu TED e eliminou ou reduziu diversos caminhos legados.

Entre as melhorias já realizadas estavam:

- eliminação do protocolo `[EXEC_ACTION]`;
- consolidação do fluxo principal do TED;
- introdução de orquestração de conversa;
- respostas financeiras apoiadas em evidências;
- pending operations com confirmação;
- proteções contra replay e duplicidade;
- hardening de device tokens;
- undo real;
- proxies same-origin na PWA;
- redução das capacidades mutáveis do Agent;
- descomissionamento parcial de superfícies antigas.

A arquitetura macro resultante é adequada.

A auditoria pós-V4, porém, encontrou problemas mais profundos que não são principalmente arquiteturais: são problemas de **invariantes, concorrência, autorização, lifecycle, idempotência, paridade entre schemas e gates de release**.

A V4.1 existe para fechar essas lacunas.

---

# 2. Objetivo principal

Transformar o estado atual do Meu TED em uma base financeiramente confiável e operacionalmente segura antes de:

- ampliar funcionalidades;
- migrar definitivamente do schema `legacy` para o schema `canonical`;
- remover os últimos componentes legados;
- considerar a arquitetura financeira estabilizada.

A prioridade absoluta é garantir:

```text
mesmo comando lógico
      ↓
um único efeito financeiro
      ↓
estado consistente
      ↓
autorização válida no momento da operação
      ↓
resultado reproduzível por testes
      ↓
mesmo commit testado, construído e implantado
```

---

# 3. Princípios obrigatórios

Durante a V4.1:

1. Integridade financeira prevalece sobre conveniência de implementação.
2. Banco de dados deve participar ativamente da garantia de invariantes.
3. Idempotência deve cobrir o efeito financeiro real, não apenas a requisição HTTP.
4. Autenticação de dispositivo não substitui autorização atual de workspace.
5. Nenhum estado financeiro crítico pode depender de read-modify-write não protegido.
6. Nenhuma operação deve retornar sucesso ignorando parte do comando.
7. Legacy e Canonical não devem divergir semanticamente.
8. Nenhum switch para Canonical poderá ocorrer enquanto existirem débitos conhecidos.
9. Nenhuma correção deve apagar ou reescrever silenciosamente histórico financeiro ambíguo.
10. Testes precisam comprovar invariantes e concorrência, não apenas endpoints isolados.
11. O artefato implantado deve ser exatamente o artefato testado.
12. Código público não pode carregar segredos ou dados operacionais sensíveis.
13. O agente deve corrigir causas, não adicionar patches compensatórios.

---

# 4. Classificação de severidade

## P0-PROD

Defeito que pode causar:

- criação ou perda de dinheiro lógico;
- duplicação de operações;
- autorização indevida;
- acesso continuado após revogação;
- corrupção de estado financeiro;
- inconsistência grave em produção.

Bloqueia fechamento da V4.1.

---

## P1-PROD

Problema funcional ou de confiabilidade relevante em produção, mas com menor possibilidade imediata de corrupção financeira crítica.

Também deve ser corrigido antes do encerramento da V4.1 salvo exceção formal documentada.

---

## MIGRATION BLOCKER

Problema que impede migração segura para o schema Canonical.

Não necessariamente afeta o Legacy atual, mas bloqueia qualquer alteração de `DB_SCHEMA=legacy` para Canonical.

---

## HARDENING

Defesa em profundidade, infraestrutura, segurança ou confiabilidade operacional.

---

# 5. Estado operacional considerado pela SPEC

Na auditoria anterior, produção operava usando:

```text
DB_SCHEMA=legacy
```

Portanto:

- defeitos do Legacy são considerados produção;
- defeitos exclusivamente Canonical são migration blockers;
- a V4.1 NÃO deve trocar o schema de produção automaticamente.

A primeira fase deve confirmar se essa condição continua verdadeira.

---

# 6. Decisões de domínio obrigatórias antes da implementação

O agente NÃO pode decidir sozinho estas questões.

Elas precisam ser registradas como decisões explícitas antes das mudanças que dependem delas.

## D1. Saldo negativo

Definir:

```text
A) contas podem ficar negativas
```

ou:

```text
B) saldo insuficiente bloqueia determinadas operações
```

Se negativo for permitido:

- remover clamps artificiais;
- aplicar deltas exatos.

Se negativo for proibido:

- Legacy e Canonical devem validar saldo;
- transferências devem falhar antes de qualquer crédito;
- saldos históricos negativos precisam ser tratados explicitamente.

---

## D2. Fonte de verdade de compras no cartão

Recomendação arquitetural da auditoria:

```text
transactions
    = ledger financeiro definitivo

card_purchases
    = entidade/projeção de domínio vinculada à transaction
```

Essa decisão deve ser confirmada.

---

## D3. Pagamento de payable

Definir formalmente:

```text
pagar payable → sempre cria expense transaction?
```

A recomendação é SIM.

Se confirmado:

- payable pago deve possuir exatamente uma transação ativa de pagamento;
- undo deve desfazer os dois lados.

---

## D4. Undo de payable

Confirmar:

```text
undo(payment)
    → reabre payable
    → remove/invalida financeiramente a transação vinculada
```

Nunca pode deixar payable pendente com despesa ainda ativa.

---

## D5. Budget startDate

Definir exatamente como `startDate` ancora períodos de:

- semanal;
- mensal;
- trimestral;
- anual.

---

## D6. Budget rollover

Definir se rollover:

- existe realmente;
- como calcula sobra;
- quando expira;
- como interage com novo período.

Não implementar comportamento presumido.

---

## D7. Subscription semanal

O campo `day` precisa significar algo inequívoco.

Provável modelo:

```text
weekly → weekday
```

e não `1..31`.

---

## D8. Subscription anual

Definir:

```text
month + day
```

e não um campo ambíguo isolado.

---

## D9. Recurring card purchases

Definir componente responsável pela materialização:

```text
definition
    ↓
scheduler
    ↓
idempotent materialization
    ↓
real transaction
```

Sem scheduler real, não anunciar comportamento recorrente completo.

---

## D10. Offline snapshot

Definir:

- idade máxima;
- dados permitidos;
- comportamento após revogação;
- possibilidade de usuário desativar offline.

---

## D11. Legacy bearer

Definir critério de desligamento baseado em telemetria, e não apenas uma data arbitrária.

---

# 7. FASE 0 — Freeze, baseline e evidências

## Objetivo

Criar baseline verificável antes de alterar comportamento.

### Obrigatório

Registrar:

- SHA inicial;
- branch;
- `DB_SCHEMA` efetivo;
- versão de Node/pnpm;
- versão do PostgreSQL;
- configurações relevantes;
- suites de teste atualmente executadas;
- workflows ativos.

Nenhuma feature nova deve ser desenvolvida durante esta fase.

---

## 7.1 Reconciliation inicial

Criar scripts read-only capazes de detectar:

### Statements

```text
stored statement total
vs
SUM(active linked transactions)
```

### Statement payments

```text
statement.paid
vs
SUM(valid payment transactions)
```

### Card purchases

```text
card_purchase
vs
linked financial transaction
```

### Payables

```text
paid payable
vs
active payment transaction
```

### Goals

```text
goal.current
vs
SUM(valid contributions)
```

### Duplicidade

Detectar:

- dois pagamentos para mesmo payable;
- operações idempotentes duplicadas;
- compras/transactions órfãs;
- pagamentos de statement inconsistentes.

---

## Regra crítica

Os scripts devem inicialmente apenas:

```text
READ
REPORT
FAIL/PASS
```

Não reparar automaticamente dados ambíguos.

---

# 8. FASE 1 — Authorization Lifecycle

Esta fase é P0 e deve ocorrer antes da maior parte das melhorias de produto.

---

# 8.1 Device Token não pode representar autorização permanente

**Severidade:** P0-PROD

## Problema

Um device token válido não pode continuar garantindo autoridade sobre um workspace independentemente do estado atual do usuário.

A autorização deve depender de:

```text
valid token
AND
active user
AND
active workspace
AND
active membership
AND
current role
```

---

## Requisito

Introduzir resolução equivalente a:

```text
resolveAuthorizedDeviceContext()
```

O resultado precisa derivar dinamicamente:

- `userId`;
- `workspaceId`;
- `deviceId`;
- role atual;
- status da membership;
- status do workspace.

---

## Proibido

Não pode existir:

```ts
role: 'owner'
```

fabricado somente porque o request usa device token.

---

## Acceptance tests

### Removed member

```text
member has token
→ owner removes member
→ same token immediately loses access
```

Sem depender de expiração.

### Member remains member

```text
member token
→ request
→ role == member
```

Nunca owner.

### Archived workspace

```text
valid token
+ archived workspace
→ deny
```

### Ownership transfer

```text
owner A transfers ownership to B
→ next request from A token reflects new role
→ next request from B reflects owner
```

---

# 8.2 Proibir fallback de workspace durante criação de token

**Severidade:** P0-PROD

Um usuário autenticado sem membership ativa NÃO pode cair automaticamente em:

```text
DEFAULT_HOUSEHOLD_ID
```

nem demo household.

Comportamento correto:

```text
session valid
+
zero active workspaces
=
device registration denied
```

ou resposta explícita indicando ausência de workspace.

Fallback de demo só pode existir sob modo explícito:

```text
development/test
```

---

# 8.3 Revogação completa de acesso

**Severidade:** P0-PROD

Eventos que devem invalidar autorização:

- member removal;
- leave;
- user disabled;
- workspace archived;
- membership revoked;
- ownership lifecycle quando aplicável.

A segurança principal deve vir da validação dinâmica.

Além disso, executar limpeza defensiva de:

- device tokens;
- rotation successors;
- lineage relacionada;
- subscriptions vinculadas ao dispositivo.

---

# 8.4 Push subscriptions

**Severidade:** P0/P1

Push subscription não pode sobreviver semanticamente à autorização do usuário.

Após member removal:

```text
future workspace notifications
→ zero delivery to removed member
```

Implementar:

- limpeza de subscriptions;
- vínculo inequívoco ao usuário/device;
- filtro de autorização atual quando necessário.

---

# 9. FASE 2 — Integridade Financeira Legacy

Legacy é prioridade porque é o schema de produção auditado.

---

# 9.1 Payable double payment

**Severidade:** P0-PROD

## Problema

Dois comandos distintos ou concorrentes podem tentar pagar o mesmo payable.

Idempotency key sozinha não resolve comandos semanticamente diferentes.

---

## Implementação

Dentro de uma única transaction:

```sql
SELECT ...
FOR UPDATE
```

Depois:

```text
pending
    → permitir pagamento

paid
    → retornar estado idempotente ou conflict

cancelled
    → conflict
```

Criação de transação e geração da próxima recorrência devem ocorrer no mesmo commit.

---

## Acceptance

Duas chamadas simultâneas:

```text
pay(payableId)
pay(payableId)
```

Resultado:

```text
1 payment transaction
1 state transition
1 recurring successor
```

---

# 9.2 Card purchases: uma única autoridade financeira

**Severidade:** P0-PROD

Se D2 for confirmada:

```text
transactions = ledger
card_purchases = projection/domain metadata
```

Toda atualização precisa:

1. lock purchase;
2. lock transaction;
3. lock affected statement;
4. atualizar ledger;
5. atualizar projection;
6. recalcular statement se necessário;
7. commit único.

Nunca permitir que descrição/valor/data em `card_purchases` divirja silenciosamente da `transaction`.

---

# 9.3 Card partial PATCH SQL placeholders

**Severidade:** P0-PROD

Eliminar SQL com parâmetros dinâmicos e placeholders fixos incompatíveis.

Implementação deve derivar placeholder de:

```ts
params.length
```

Testar individualmente cada campo.

---

# 9.4 Statement total lost update

**Severidade:** P0-PROD

Mutação que altera statement deve obter lock:

```sql
SELECT ...
FROM statements
WHERE ...
FOR UPDATE
```

Dentro da mesma transaction:

```text
change purchase
→ recompute SUM
→ update total
```

Invariant obrigatório:

```text
statement.total_cents
==
SUM(active linked transactions)
```

---

# 9.5 Statement payment concurrency

**Severidade:** P0-PROD

`payStatement()` deve:

1. abrir transaction;
2. lock statement;
3. ler paid atual;
4. calcular remaining;
5. validar amount;
6. criar payment transaction;
7. incrementar paid;
8. recalcular status;
9. commit.

Acceptance:

Duas chamadas concorrentes não podem utilizar o mesmo saldo restante antigo.

---

# 9.6 Goal contribution lost update

**Severidade:** P0-PROD

Proibido:

```text
read current
current + value
write absolute
```

Preferir:

```sql
UPDATE goals
SET current_amount_cents =
    current_amount_cents + $1
RETURNING ...
```

Na mesma transaction que registra contribution.

Invariant:

```text
goal.current_amount_cents
==
SUM(valid contributions)
```

---

# 9.7 Legacy transaction PATCH contract

**Severidade:** P1-PROD

A API não pode aceitar um campo e ignorá-lo.

Para cada campo:

```text
supported
→ validate + apply

unsupported
→ 422
```

Nunca:

```text
200 OK
+
field silently ignored
```

---

# 9.8 Category invariants

**Severidade:** P1-PROD

Centralizar funções equivalentes a:

```text
resolveCategoryForExpense()
resolveCategoryForIncome()
resolveSubcategory()
```

Consumidores:

- transactions;
- cards;
- payables;
- budgets;
- subscriptions;
- recurrences.

---

# 9.9 Recurring card purchase validation

**Severidade:** P1-PROD

Aplicar a mesma validação da compra normal.

Card precisa:

- existir;
- estar ativo;
- ser `is_credit_card = true`.

Category precisa pertencer ao tipo esperado.

---

# 9.10 Installment date arithmetic

**Severidade:** P1-PROD

Não usar `Date.setUTCMonth()` diretamente para billing date.

Criar:

```text
addBillingMonths(date, months)
```

Sem overflow.

Exemplo:

```text
2026-01-31 + 1 month
→ 2026-02-28
```

ou 29 em leap year.

Testar:

- 28;
- 29;
- 30;
- 31;
- leap year;
- dezembro → janeiro.

---

# 9.11 Subscription PATCH

**Severidade:** P1-PROD

Corrigir o mesmo padrão de placeholders dinâmicos encontrado em cards.

---

# 10. FASE 3 — Unit of Work e Idempotência End-to-End

Esta é uma das mudanças centrais da V4.1.

---

# 10.1 Mutation Unit of Work

**Severidade:** P0-PROD

O problema atual não deve ser resolvido apenas passando `PoolClient`.

Criar uma abstração equivalente a:

```text
MutationUnitOfWork
```

ou:

```text
FinancialUnitOfWork
```

Ela deve garantir:

```text
BEGIN

claim idempotency

lock domain state

validate invariants

apply financial effect

write audit/receipt

complete idempotency claim

COMMIT
```

Qualquer falha:

```text
ROLLBACK everything
```

---

# 10.2 Regra de atomicidade

Nunca:

```text
TX A = idempotency claim
TX B = financial mutation
```

onde TX B possa commit antes da conclusão da claim.

---

# 10.3 Idempotency hash v2

Unificar todas as implementações.

Criar canonical JSON recursivo.

Regras:

- object keys sorted recursively;
- arrays preserve order;
- explicit type semantics;
- null preserved;
- numbers deterministic;
- strings exact.

Hash:

```text
SHA-256
```

Com versão:

```text
payload_hash_version = 2
```

---

# 10.4 Compatibilidade de hash

Durante retry window:

```text
new claims → V2
existing legacy claim → V1 replay compatibility
```

Eliminar V1 somente quando seguro.

---

# 10.5 Client command ID

Idempotency key não pode ser somente HTTP-attempt scoped.

O cliente deve criar:

```text
commandId
```

para a intenção lógica.

O mesmo `commandId` deve sobreviver:

- timeout;
- connection drop;
- retry automático;
- retry manual após resultado desconhecido.

Novo command ID somente após:

```text
definitive result
```

ou nova intenção do usuário.

---

# 10.6 Mutation inventory

Criar inventário formal de todos endpoints mutáveis.

Para cada endpoint registrar:

```text
operation
idempotency
approval
receipt
undo
authorization
```

Exemplos que devem ser revisados:

- goals cancel;
- subscriptions;
- price alerts;
- peripheral mutators.

---

# 11. FASE 4 — Canonical Parity

Nenhuma migração antes da conclusão desta fase.

---

# 11.1 Transfer money creation

**Severidade:** MIGRATION BLOCKER / P0 se ativado

Proibido:

```text
source = max(0, source - amount)
destination += amount
```

Exemplo:

```text
source 20
transfer 100

source -> 0
destination -> +100
```

Cria 80 unidades monetárias.

Correção depende de D1.

---

# 11.2 Negative-balance parity

Legacy e Canonical devem implementar a mesma regra.

Não aceitar:

```text
legacy allows negative
canonical clamps zero
```

---

# 11.3 Transaction update delta engine

**Severidade:** MIGRATION BLOCKER

Para updates que alterem:

- amount;
- account;
- type;

usar modelo:

```text
beforeState
afterState

reverse(beforeState)
apply(afterState)
```

Exatamente uma vez.

---

# 11.4 Deterministic account locking

Qualquer mutação de saldo materializado:

```sql
SELECT account ...
FOR UPDATE
```

Para duas contas:

```text
sort account IDs
lock in deterministic order
```

Reduzir deadlock.

---

# 11.5 Canonical payable payment

Pagamento deve usar a mesma primitive financeira do ledger.

Não basta inserir transaction sem atualizar saldo materializado.

Ideal:

```text
FinancialLedger.createExpenseInTx()
```

ou equivalente.

---

# 11.6 Canonical payable undo

O vínculo com `paidTransactionId` precisa ser garantido pelo schema/mapper.

Undo deve provar:

```text
payable restored
AND
payment financial effect reversed
```

---

# 11.7 `template_id` schema debt

Eliminar incompatibilidade atualmente mascarada por testes pulados.

Nenhuma dependência em campo inexistente deve permanecer.

---

# 11.8 Zero financial skips

Antes de Canonical:

```text
financial integration .skip = 0
financial integration .todo = 0
```

salvo allowlist formal com bloqueio explícito da migração.

---

# 12. FASE 5 — PWA, Auth e Offline

---

# 12.1 Auth state machine

**Severidade:** P1-PROD

Distinguir:

```text
authenticated
unauthenticated
unreachable
```

Comportamento:

```text
authenticated
→ online app

unauthenticated
→ login

unreachable + valid offline snapshot
→ offline mode
```

Não tratar:

```text
no response
```

como:

```text
no session
```

---

# 12.2 Device token não substitui sessão online

Device credential pode ser usada conforme contrato, mas não deve destravar uma aplicação online que imediatamente necessita cookie session para bootstrap.

---

# 12.3 Static NEXT_PUBLIC variables

Eliminar acesso dinâmico a:

```ts
process.env[someVariable]
```

para valores públicos usados pelo bundle.

Usar referências estáticas explícitas.

---

# 12.4 Build-time config

Todas as `NEXT_PUBLIC_*` necessárias precisam estar definidas antes de:

```text
next build
```

e testadas no bundle final.

---

# 12.5 Legacy bearer shutdown

Executar em releases separados.

### Release A

- corrigir public env;
- manter bearer compatibility;
- adicionar telemetria.

### Observar

Medir uso residual.

### Release B

```text
legacy bearer default OFF
```

Ausência da flag deve significar:

```text
disabled
```

---

# 12.6 Same-origin API

Browser deve preferir:

```text
/api/backend
```

Direct backend host somente como dev/test escape hatch explícito.

Remover dependência estrutural de hostname específico de produção.

---

# 12.7 Offline snapshot

Não implementar falsa criptografia usando chave armazenada no mesmo JavaScript/browser.

Controles reais:

- TTL;
- minimize data;
- subject binding;
- purge logout;
- purge membership revocation;
- purge workspace switch;
- optional offline disable.

---

# 13. FASE 6 — Publicização Segura do Repositório

Objetivo: permitir que o repositório seja público e que GitHub Actions público execute CI completo, sem exposição indevida.

---

# 13.1 Regra de segurança

Tudo presente em:

- current tree;
- history;
- branches;
- tags;
- test fixtures;
- artifacts publicados;

deve ser considerado público.

`.gitignore` não protege um segredo que já entrou no histórico.

---

# 13.2 Secret audit

Antes da mudança de visibilidade:

- scan working tree;
- scan full git history;
- scan branches;
- scan tags;
- scan workflow files;
- scan fixtures;
- scan docs;
- scan logs/snapshots committed.

Buscar:

- passwords;
- API keys;
- bearer tokens;
- private keys;
- JWT secrets;
- signing keys;
- Cloudflare tokens;
- DB credentials;
- OpenAI/OpenRouter/provider credentials;
- SMTP;
- VAPID private key;
- cookies;
- dumps;
- production exports.

---

# 13.3 Segredo encontrado no histórico

Procedimento obrigatório:

```text
remove from history
+
rotate credential
```

Remover do HEAD não é suficiente.

---

# 13.4 Dados operacionais e pessoais

Revisar também valores que não são credentials, mas não precisam estar públicos:

- email administrativo pessoal;
- hostnames de produção;
- infraestrutura pessoal;
- endpoints administrativos;
- nomes internos desnecessários;
- topology details.

Parametrizar quando apropriado.

---

# 13.5 Repositório público recomendado

Preferência:

```text
Meu TED principal
→ public repository
```

depois de sanitização.

Evitar um fork usado apenas como executor de CI.

---

# 13.6 Mirror sanitizado

Usar somente se houver source real que precise permanecer privado.

Arquitetura possível:

```text
private source
       ↓
sanitizer/export
       ↓
public CI mirror
```

Mas exige prova criptográfica/manifest de equivalência.

Sem isso:

```text
CI público passou
```

não garante que:

```text
private production source
```

é o código testado.

---

# 13.7 Public CI

CI público deve operar sem production secrets.

Executar:

- lint;
- typecheck;
- units;
- contracts;
- integration;
- Postgres;
- concurrency;
- XLT;
- migrations;
- Agent evals;
- PWA E2E;
- builds;
- static security;
- secret scan.

Banco:

```text
ephemeral + synthetic data only
```

---

# 13.8 Protected production workflow

Deploy:

```text
never from fork PR
never from untrusted PR
```

Usar:

```text
GitHub Environment: production
```

Secrets somente neste boundary ou nos provedores finais.

---

# 13.9 Public safety CI gate

Adicionar gate específico que falha para:

- private keys;
- `.env` reais;
- dumps;
- backups;
- credential patterns;
- known production tokens;
- URLs contendo usuário/senha;
- production data;
- prohibited operational metadata definidos em policy.

Allowlist deve ser mínima e revisável.

---

# 14. FASE 7 — Legacy Surface Decommission

---

# 14.1 Pending Operations V1

**Severidade:** P1-PROD

Provar que não existem consumidores reais.

Pesquisar:

- PWA;
- Agent;
- API;
- scripts;
- tests;
- external integration docs.

Se zero consumidores:

```text
remove production registration
```

V1 pode permanecer temporariamente apenas sob:

```text
explicit dev/test compatibility flag
```

Depois remover código/migrations de acordo com política de rollback.

---

# 14.2 `/auth/bridge-context`

Rota é legado do WhatsApp removido.

Provar ausência de consumidores.

Se nenhum:

```text
remove route
```

Depois avaliar remoção de:

- context-token hooks;
- storage;
- compatibility code.

---

# 14.3 Price Alerts

Não manter feature pseudo-production baseada em memória/mock.

Escolher:

```text
A) production feature OFF
```

ou implementar:

```text
Postgres
+
real provider
+
scheduler
+
notification delivery
```

---

# 14.4 Recurring card materialization

Se não houver executor real:

- documentar como definição apenas;
- não simular recurrence;
- não anunciar como completo.

---

# 15. FASE 8 — Security e Infra

---

# 15.1 Codex Broker fail closed

**Severidade:** HARDENING alto

Produção não pode aceitar default semelhante a:

```text
local-development-signing-key-change-me
```

Startup de produção deve falhar se chave forte estiver ausente.

---

# 15.2 Cloudflare Access

Produção deve exigir:

```text
valid Cloudflare Access
```

ou flag explícita:

```text
BROKER_TRUST_PRIVATE_NETWORK=1
```

Nunca confiar implicitamente.

---

# 15.3 Broker replay

Estado in-memory pode permanecer enquanto deployment for singleton e janela pequena.

Se escalar horizontalmente:

```text
shared replay storage required
```

---

# 15.4 Agent SSRF

Proteções existentes devem ser complementadas contra:

- DNS rebinding;
- IPv6 private/link-local;
- mapped IPv4;
- arbitrary ports.

Preferência:

```text
controlled egress
```

ou host allowlist rigorosa para capacidades sensíveis.

---

# 15.5 Migration advisory lock

Migration runner deve adquirir global advisory lock antes do primeiro migration e liberar ao fim.

Evitar duas instâncias executando migrations simultaneamente.

---

# 15.6 DB pool hardening

Configurar explicitamente:

```text
connectionTimeoutMillis
statement_timeout
lock_timeout
idle_in_transaction_session_timeout
```

Não resolver contenção apenas aumentando pool size.

---

# 15.7 SQLSTATE mapping

Centralizar erros conhecidos:

```text
23505 → conflict
23503 → FK violation
23514 → check violation
22007 → invalid date
22P02 → invalid input
40001 → serialization retry
40P01 → deadlock retry
```

Nunca devolver SQL interno cru.

---

# 15.8 Date validation

Regex não basta.

Criar schema compartilhado que valide calendário real.

Deve rejeitar:

```text
2026-02-31
```

---

# 15.9 Money validation

Valores monetários devem exigir:

```text
integer
AND
Number.isSafeInteger
AND
domain max
```

---

# 16. FASE 9 — CI/CD

Esta fase transforma os invariantes da SPEC em gates obrigatórios.

---

# 16.1 Full Postgres integration suite

O CI deve executar:

```text
tests/integration/**
```

completamente.

Não apenas subconjunto de reminders.

---

# 16.2 XLT mandatory

Testes adversariais/XLT não podem ficar fora do gate final.

---

# 16.3 Financial concurrency suite

Criar suite dedicada cobrindo no mínimo:

- duplicate payable payment;
- simultaneous statement payment;
- simultaneous statement mutations;
- simultaneous goal contributions;
- same command id repeated;
- different command IDs same payable;
- two-account transfers;
- deadlock retry behavior.

---

# 16.4 Critical skip/todo policy

CI deve rejeitar `.skip` e `.todo` em diretórios financeiros críticos.

Exceção somente com allowlist contendo:

```text
reason
owner
issue
expiration
```

---

# 16.5 Invariant tests

Testes devem verificar propriedades pós-operação.

Exemplos:

```text
account displayed balance
==
recomputed ledger
```

```text
statement total
==
sum linked transactions
```

```text
statement paid
==
sum valid payment transactions
```

```text
paid payable
==
exactly one active linked payment
```

```text
goal current
==
sum contributions
```

```text
transfer debit
==
transfer credit
```

```text
card_purchase
==
linked transaction projection
```

---

# 16.6 `validate:final`

Gate final deve explicitamente executar:

```text
unit
contracts
all integration
concurrency
XLT
PWA E2E
Agent eval
all builds
security
public-safety
migration validation
```

---

# 16.7 Same-SHA deployment

Antes de deploy:

```text
candidate SHA
==
current main SHA
```

Se main avançou:

```text
skip stale deployment
```

---

# 16.8 Agent deployment concurrency

Não usar concurrency group contendo SHA.

Usar algo equivalente a:

```text
agent-production
```

para impedir duas versões diferentes implantando simultaneamente.

---

# 16.9 Release identity

Runtime deve expor:

```json
{
  "gitSha": "...",
  "schemaVersion": "...",
  "buildId": "...",
  "builtAt": "..."
}
```

Production smoke deve confirmar `gitSha` esperado.

---

# 16.10 Artifact identity

Objetivo final:

```text
artifact tested
==
artifact deployed
```

Evitar rebuild independente durante deploy.

Pipeline preferível:

```text
build once
→ test artifact
→ approve
→ deploy same artifact
```

---

# 16.11 Dependency audit

Bloquear:

```text
critical
high
```

Allowlist apenas:

- temporária;
- documentada;
- com expiração.

---

# 16.12 GitHub Actions immutability

Após estabilização, pin de actions externas por commit SHA imutável.

Automatizar atualização via Dependabot quando possível.

---

# 17. FASE 10 — Reconciliation e Migration Readiness

Depois das correções:

rodar novamente todos os relatórios da Fase 0.

Esperado:

```text
financial drift = 0
```

ou toda divergência deve estar:

- explicada;
- classificada;
- aprovada.

---

# 17.1 Repair policy

Correção automática somente se transformação for deterministicamente correta.

Exemplo aceitável:

```text
projection differs from authoritative ledger
+
ledger is explicitly authoritative
→ regenerate projection
```

Exemplo NÃO aceitável:

```text
two plausible transactions
→ randomly choose one
```

Ambiguidade deve gerar relatório/manual review.

---

# 17.2 Legacy/Canonical parity

Executar mesma sequência de comandos contra ambos e comparar:

- resulting financial state;
- errors;
- statuses;
- receipts;
- undo behavior.

---

# 17.3 Shadow reads

Antes da troca:

```text
legacy result
vs
canonical result
```

Registrar divergências sem usar Canonical como fonte de produção.

---

# 17.4 Migration dry run

Executar migration completa sobre cópia sanitizada/sintética representativa.

Validar invariants antes e depois.

---

# 17.5 Switch gate

`DB_SCHEMA=canonical` somente poderá ser considerado depois de:

```text
all P0 resolved
all migration blockers resolved
zero financial critical skips
reconciliation clean
parity demonstrated
dry-run successful
rollback documented
```

Mudança real de produção NÃO faz parte automaticamente desta SPEC.

Deve ocorrer como release/migration explícita posterior.

---

# 18. Features que precisam de definição antes de expansão

---

## Budgets

Antes de otimizar N+1, definir corretamente:

- startDate semantics;
- rollover;
- check totals;
- quarterly representation;
- yearly representation.

Depois otimizar com queries agrupadas.

---

## Price Alerts

Feature real ou desligada.

Nada intermediário em produção.

---

## Recurring Card Purchase

Definição + scheduler + idempotent execution ou feature declaradamente incompleta.

---

# 19. Itens de otimização que NÃO bloqueiam primeiro fechamento

Após integridade:

- reduzir N+1 em budgets;
- revisar JS bundle measurement;
- dividir `AppStateProvider`;
- limpar código morto;
- reduzir duplicação de workflows;
- otimizar query plans;
- reduzir cold starts.

Não executar grandes refactors desses itens antes dos P0.

---

# 20. Explicit Non-Goals

A V4.1 NÃO deve:

- redesenhar UI;
- trocar Next.js;
- trocar Fastify;
- introduzir microservices;
- introduzir Redis sem necessidade comprovada;
- reescrever API inteira;
- migrar imediatamente para Canonical;
- reconstruir Agent sem necessidade;
- refatorar AppState antes da integridade;
- introduzir event sourcing;
- introduzir CQRS;
- redesenhar banco inteiro;
- alterar regras de negócio não relacionadas;
- auto-reparar histórico financeiro ambíguo;
- desligar bearer na mesma release da correção de env;
- usar um fork público como gambiarra permanente para CI.

---

# 21. Ordem obrigatória de implementação

Executar aproximadamente nesta sequência:

```text
0. Baseline + reconciliation
      ↓
1. Authorization lifecycle
      ↓
2. Legacy financial invariants
      ↓
3. Unit of Work + idempotency
      ↓
4. Canonical parity
      ↓
5. PWA/Auth/Offline
      ↓
6. Public repository safety
      ↓
7. Legacy surface decommission
      ↓
8. Security/Infrastructure
      ↓
9. CI/CD gates
      ↓
10. Final reconciliation + migration readiness
```

Uma fase pode compartilhar infraestrutura com outra, mas não deve esconder dependências nem pular validation gates.

---

# 22. Estratégia de implementação para o agente

Para cada problema:

### 1. Reproduzir

Criar ou ajustar teste que demonstre o defeito.

### 2. Confirmar causa

Não corrigir com base apenas no sintoma.

### 3. Implementar mudança mínima suficiente

Evitar broad refactor.

### 4. Executar testes locais da área

### 5. Executar integration/concurrency relacionados

### 6. Auto-revisar diff

Verificar:

- regressão;
- race conditions;
- nested transactions;
- authorization bypass;
- ignored fields;
- rollback incompleto.

### 7. Executar gates maiores

### 8. Registrar evidência

Cada fase precisa produzir relatório com:

```text
before
change
tests
invariants
remaining risks
```

---

# 23. Política de commits

Preferir commits logicamente independentes.

Exemplos:

```text
fix(auth): bind device credentials to active memberships
```

```text
fix(payables): serialize payable payment
```

```text
refactor(writes): introduce atomic mutation unit of work
```

```text
fix(cards): make ledger authoritative for card purchase updates
```

```text
test(finance): add financial concurrency invariant suite
```

Evitar commit único gigantesco cobrindo toda V4.1.

---

# 24. Definition of Done — V4.1

A V4.1 só pode ser considerada concluída se TODOS os requisitos abaixo aplicáveis forem satisfeitos.

## Authorization

- device token depende de membership atual;
- role nunca é fabricado como owner;
- removed member perde acesso imediatamente;
- archived workspace bloqueia tokens;
- no-workspace session não cria token para default household;
- push delivery para revoked member = zero.

## Financial Integrity

- payable concorrente gera um pagamento;
- statement concurrent payment correto;
- statement totals invariants corretos;
- goal contributions não se perdem;
- card purchase e transaction não divergem;
- transaction PATCH não ignora campos silenciosamente.

## Idempotency

- claim e financial effect compartilham commit;
- recursive canonical hash único;
- command ID persiste entre retries;
- N retries da mesma intenção = 1 effect.

## Canonical

- transferência não cria dinheiro;
- negative-balance semantics explícita;
- balance mutations têm locks;
- transaction update usa before/after delta;
- payable payment atualiza ledger/balance;
- payable undo é completo;
- schema debt `template_id` resolvido;
- zero financial critical skips.

## PWA/Auth

- authenticated/unauthenticated/unreachable distintos;
- offline funciona somente sob regra válida;
- public envs corretamente embutidos;
- same-origin é default;
- bearer deprecation é staged.

## Public Repository

- current secret scan limpo;
- historical secret scan limpo;
- qualquer segredo histórico rotacionado;
- production data ausente;
- personal/operational metadata revisado;
- public CI não depende de secrets;
- production deploy permanece protegido.

## Security

- Broker fail closed;
- production signing secret obrigatório;
- migration advisory lock;
- DB timeouts;
- SQLSTATE mapping;
- calendar validation;
- safe integer money validation.

## CI

- full Postgres integration executado;
- XLT executado;
- concurrency executado;
- no critical financial skip/todo;
- invariant suite executada;
- builds completos;
- PWA E2E;
- Agent eval;
- security;
- public-safety.

## Release

- same-SHA enforcement;
- stale deploy bloqueado;
- production concurrency correta;
- runtime expõe gitSha;
- smoke verifica gitSha;
- tested artifact == deployed artifact.

## Reconciliation

- financial drift igual a zero ou formalmente explicado;
- legacy/canonical parity conhecida;
- migration dry-run verde;
- nenhum migration blocker conhecido.

---

# 25. Resultado esperado

Ao final da V4.1, o Meu TED deve possuir o seguinte modelo operacional:

```text
User Intent
    ↓
Current Authorization
    ↓
Command ID
    ↓
Atomic Mutation Unit of Work
    ↓
Domain Locks
    ↓
Financial Ledger
    ↓
Projection Updates
    ↓
Audit / Receipt
    ↓
Idempotency Completion
    ↓
Single Commit
```

Com:

```text
tests reproducing concurrent reality
```

e:

```text
CI proving invariants
```

e:

```text
release proving artifact identity
```

A partir desse estado será seguro discutir:

- Canonical cutover;
- remoção definitiva do Legacy;
- novas features financeiras;
- otimizações estruturais;
- expansão do Agent.

---

# 26. Regra final para o agente

Em caso de conflito entre:

```text
fazer a feature funcionar
```

e:

```text
preservar uma invariante financeira/autorizativa
```

a invariante prevalece.

Se durante a implementação for descoberto um novo defeito que possa:

- criar dinheiro;
- apagar dinheiro;
- duplicar operação;
- quebrar vínculo de ownership;
- permitir acesso revogado;
- invalidar idempotência;

o agente deve:

1. registrar o achado;
2. criar reprodução;
3. classificar impacto;
4. incluir no escopo da V4.1;
5. corrigir antes de declarar DONE.

Nenhuma exceção silenciosa é permitida.
