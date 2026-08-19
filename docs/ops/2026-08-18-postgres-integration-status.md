# Status da Suíte de Integração PostgreSQL (2026-08-18, madrugada 19/08)

**Contexto:** com Docker daemon disponível nesta sessão, provisionei um Postgres
descartável (`pi-fin-test`, porta 55433) e `public._test_marker` com o UUID do
`DB_TEST_MARKER`. Isso tirou a suíte `apps/api/tests/integration/postgres-*.test.ts`
do modo skip e expôs a real conformidade do runtime. Documenta o que estava
mascarado por `it.skip` sem banco.

## Como rodar (reproduzível)

```bash
docker run -d --name pi-fin-test -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=pi_test -p 55433:5432 postgres:16-alpine
# dentro do container: cria _test_marker com o UUID do DB_TEST_MARKER
DATABASE_URL_TEST="postgres://postgres:postgres@127.0.0.1:55433/pi_test" \
DB_TEST_MARKER="550e8400-e29b-41d4-a716-446655440000" \
pnpm --filter pi-finance-api test:integration
```

O `db-guard` exige a tabela `public._test_marker` **pré-criada** com o UUID em
`DB_TEST_MARKER` (fail-closed, por design). Nenhuma migration cria o marker — ele
é provisionado pelo operador/CI, análogo aos env-guards.

## Resultado com Postgres real

De 11 arquivos / 24 testes:
- **7 arquivos verdes**: reminder-dedupe, reminder-lock, adoption, invites-race,
  phone-workspace, shadow-divergence, undo.
- **2 arquivos skipped**: postgres-store, postgres-write-store (gated por pré-requisito,
  ex. `createPool` ausente — typecheck pré-existente).
- **2 arquivos vermelhos (5 testes)** — dívida de **design de fase, não regressão**:

### 1. `postgres-idempotency-containment.test.ts` — 0.4.1 (2 testes)
Especificam o **caminho moderno de `operation_records`** (V013–V016): claim com
`status='processing'`, `lease_until`/`retry_until`/`retention_until`, `effect_ref`,
`metadata={entityType}`, `audit_logs.event_type='financial_effect.committed'` e
rollback atômico junto com o efeito financeiro.

**Estado:** o runtime (`src/writes/postgres.ts:createPostgresIdempotencyStore`) só
implementa o caminho legado (`idempotency_keys` + `operation_records` com
`household_id`/`payload_hash` sem lifecycle). **Nenhum código escreve** o schema
moderno (status/lease/effect_ref/entityType). Implementar = criar nova camada de
transação de produção sem o design dono (fase G2.2.5/0.4.x arquivada no inventory
P1 WIP).

### 2. `postgres-unit-of-work.test.ts` — G2.2.5 (3 testes)
Montam **schema legado próprio** (`LEGACY_SCHEMA`), inclusive `accounts_payable`
com `template_id`, e chamam `createLegacyPostgresPayableStore`/`CardStore` etc.
**Erro:** `column "template_id" of relation "accounts_payable" does not exist` —
o runtime legado atual espera o schema migrado V0xx (sem `template_id`). O teste
congela um contrato de schema que a migração já evoluiu.

## Identificação (P1 WIP, não regressão)

`docs/recovery/2026-08-16-working-tree-inventory.md` classifica ambos como
`project-wip | P1 | preserve` — "preservado exatamente como encontrado, aguardando
seu delivery dono". A spec `docs/superpowers/plans/2026-07-30-g2-2-5-unit-of-work.md`
está no `archive/`. Não são bugs do backfill (commit 753e7a7/0c2fccf os trazia).

## O que foi corrigido nesta sessão (verde agora)

| Suite | Correção | Evidência |
|---|---|---|
| reminder-dedupe + reminder-lock (G6.1.2) | Postgres real (nada de código) — runtime já completo | 3/3 green |
| phone-workspace | seed com `owner_user_id` + teardown replica | 1/1 green (commit 0ea9105) |
| shadow-divergence | seed owner real + email único por run + cleanup user | 1/1 green idempotente (2e789df) |
| undo 0.5 | `approve` concorrente: re-read canônico no race | 3/3 green (7b83ef8) + adversarial 5/5 |

## Recomendação

Tratar os 5 testes restantes como **histórias de implementação** (não defeitos):
- 0.4.1 → implementar o store moderno de `operation_records` com lifecycle (schema já
  existente via V013–V016); precisa do design owner para `effect_ref`/`entityType`.
- G2.2.5 → decidir se o runtime legado deve manter compat com `template_id` ou se os
  testes devem migrar para o schema atual.
