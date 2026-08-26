# Cancelamento Auditável de Compras de Cartão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cancelar compras de cartão de forma auditável, removendo-as de faturas ativas sem exclusão física.

**Architecture:** Uma migration V033 adiciona vínculo explícito entre `card_purchases` e `transactions` e soft-delete de compras. `CardStore` recebe uma operação transacional de cancelamento que aplica soft-delete, recalcula a fatura e usa associação legada apenas quando não há ambiguidade. A rota `DELETE /cards/purchases/:id` expõe a capacidade com isolamento por household.

**Tech Stack:** Fastify, TypeScript, Zod, PostgreSQL, Vitest.

**Agent Orchestration:** Supervisor-Workers — migration/testes e adapters podem ser investigados em paralelo, mas alterações no mesmo adapter serão serializadas.

---

## Arquivos e responsabilidades

- `apps/api/src/read-models/sql/V033__card_purchase_cancellation.sql`: alteração aditiva de schema e índices.
- `apps/api/src/read-models/sql/migrate.ts`: inclui V033 na allowlist legada.
- `apps/api/src/cards/store.ts`: contrato `cancelPurchase` e erros de conflito.
- `apps/api/src/cards/postgres.ts`: cancelamento para modelo canônico.
- `apps/api/src/cards/legacy-postgres.ts`: cancelamento para dupla gravação legado e associação segura.
- `apps/api/src/cards/in-memory.ts`: comportamento equivalente para testes de rota.
- `apps/api/src/routes/cards.ts`: endpoint e resposta HTTP.
- `apps/api/tests/routes/cards.test.ts`: contrato HTTP, idempotência e IDOR.
- `apps/api/tests/integration/*`: migration e comportamento PostgreSQL.

### Task 1: Definir o contrato de cancelamento no store e testes RED

**Files:**
- Modify: `apps/api/src/cards/store.ts`
- Modify: `apps/api/src/cards/in-memory.ts`
- Test: `apps/api/tests/routes/cards.test.ts`

- [ ] **Step 1: Adicionar testes de rota que falhem para cancelamento.**

Cobrir `DELETE /cards/purchases/:id` para compra ativa (204), repetição (204), compra de outro household (404) e fatura não aberta (409). Usar IDs fixos e confirmar que o total da fatura diminui apenas na primeira chamada.

- [ ] **Step 2: Executar RED.**

Run: `pnpm --filter pi-finance-api exec vitest run tests/routes/cards.test.ts`

Expected: FAIL porque a rota e `cancelPurchase` ainda não existem.

- [ ] **Step 3: Adicionar contrato mínimo.**

Adicionar ao `CardStore`:

```ts
cancelPurchase(input: {
  householdId: string;
  purchaseId: string;
}): Promise<void>;
```

Implementar no in-memory store marcando a compra como cancelada, atualizando a transação relacionada e recalculando a fatura ativa; chamadas repetidas não devem alterar estado.

- [ ] **Step 4: Executar GREEN focal.**

Run: `pnpm --filter pi-finance-api exec vitest run tests/routes/cards.test.ts`

Expected: PASS para os testes de contrato existentes e novos.

### Task 2: Criar migration V033 aditiva e teste de upgrade PostgreSQL

**Files:**
- Create: `apps/api/src/read-models/sql/V033__card_purchase_cancellation.sql`
- Modify: `apps/api/src/read-models/sql/migrate.ts`
- Create: `apps/api/tests/integration/card-purchase-cancellation-migration.test.ts`

- [ ] **Step 1: Escrever teste RED de migration.**

Criar schema legado temporário contendo `card_purchases` e `transactions`; verificar que V033 cria `transaction_id`, `deleted_at`, FK `ON DELETE RESTRICT` e índice parcial de compras ativas por household/fatura.

- [ ] **Step 2: Executar RED usando somente `DATABASE_URL_TEST`.**

Run: `env -u DATABASE_URL pnpm --filter pi-finance-api exec vitest run tests/integration/card-purchase-cancellation-migration.test.ts`

Expected: FAIL até V033 existir; SKIP é aceitável somente sem `DATABASE_URL_TEST`.

- [ ] **Step 3: Implementar V033 e allowlist.**

SQL deve usar `ADD COLUMN IF NOT EXISTS`, criar FK apenas após validar referências não nulas, e criar índice parcial:

```sql
CREATE INDEX IF NOT EXISTS card_purchases_active_statement_idx
  ON card_purchases (household_id, statement_id)
  WHERE deleted_at IS NULL;
```

Adicionar `"V033"` a `LEGACY_SAFE_PREFIXES`.

- [ ] **Step 4: Executar GREEN da migration.**

Run: `env -u DATABASE_URL pnpm --filter pi-finance-api exec vitest run tests/integration/card-purchase-cancellation-migration.test.ts`

Expected: PASS quando houver banco de teste isolado.

### Task 3: Implementar cancelamento PostgreSQL auditável

**Files:**
- Modify: `apps/api/src/cards/postgres.ts`
- Modify: `apps/api/src/cards/legacy-postgres.ts`
- Test: `apps/api/tests/integration/card-store-idor.test.ts`

- [ ] **Step 1: Escrever testes RED de dados.**

Criar compra nova com `transaction_id`; cancelar e verificar `card_purchases.deleted_at`, `transactions.deleted_at`, fatura recalculada e compra ausente da leitura. Criar duas transações compatíveis para uma compra legada sem vínculo e esperar conflito, sem mutação.

- [ ] **Step 2: Executar RED.**

Run: `pnpm --filter pi-finance-api exec vitest run tests/integration/card-store-idor.test.ts`

Expected: FAIL porque os adapters não possuem cancelamento nem vínculo explícito.

- [ ] **Step 3: Implementar transação de cancelamento.**

Para compra com `transaction_id`, carregar compra e fatura com `household_id`, validar `status = 'open'`, aplicar `deleted_at = NOW()` em ambas as tabelas e recalcular `statements.total_cents` a partir de transações não deletadas.

Para compra sem vínculo, procurar transação ativa por household, statement, conta, valor e data. Exigir exatamente uma linha; zero ou mais de uma lança erro de conflito antes de qualquer update.

- [ ] **Step 4: Filtrar leituras.**

Acrescentar `cp.deleted_at IS NULL` às consultas de `card_purchases` em listagem e detalhe de fatura, mantendo registros cancelados fora das respostas ativas.

- [ ] **Step 5: Executar GREEN.**

Run: `pnpm --filter pi-finance-api exec vitest run tests/integration/card-store-idor.test.ts tests/routes/cards.test.ts`

Expected: PASS, incluindo associação legada segura e IDOR.

### Task 4: Expor endpoint HTTP e proteger idempotência

**Files:**
- Modify: `apps/api/src/routes/cards.ts`
- Test: `apps/api/tests/routes/cards.test.ts`

- [ ] **Step 1: Adicionar rota.**

Implementar:

```ts
app.delete('/cards/purchases/:id', async (req, reply) => {
  const ctx = await resolve(req);
  const params = z.object({ id: z.string().uuid() }).parse(req.params);
  await cards.cancelPurchase({ householdId: ctx.householdId, purchaseId: params.id });
  return reply.code(204).send();
});
```

Mapear erro de fatura não aberta e associação ambígua para 409; esconder compras de outro household como 404.

- [ ] **Step 2: Executar testes de rota.**

Run: `pnpm --filter pi-finance-api exec vitest run tests/routes/cards.test.ts`

Expected: PASS.

### Task 5: Verificação e reteste E2E

**Files:**
- Test: `apps/api/tests/routes/cards.test.ts`
- Test: `apps/api/tests/integration/card-purchase-cancellation-migration.test.ts`

- [ ] **Step 1: Executar gates.**

Run:

```bash
pnpm --filter pi-finance-api exec vitest run tests/routes/cards.test.ts tests/integration/card-store-idor.test.ts tests/integration/card-purchase-cancellation-migration.test.ts
pnpm --filter pi-finance-api typecheck
```

Expected: testes executados sem falhas; nenhum diagnóstico LSP nos arquivos TypeScript alterados.

- [ ] **Step 2: Revisar diff.**

Run: `semantic_review` no escopo `apps/api`.

Expected: nenhum problema de correção, segurança de household ou mutação não transacional.

- [ ] **Step 3: Reteste E2E isolado após deploy autorizado.**

Criar cartão e compra `E2E-*`, cancelar via API, confirmar compra ausente da fatura e total recalculado, depois desativar o cartão. Confirmar que não há compras ativas, transações ativas ou faturas abertas E2E.

## Critérios de aceite

- Cancelamento nunca executa exclusão física.
- Compras novas têm vínculo inequívoco com transação.
- Compra legada ambígua nunca é cancelada automaticamente.
- Todas as leituras de fatura omitem compras canceladas.
- Households não podem cancelar compras uns dos outros.
- Reteste E2E restaura baseline sem SQL direto.
