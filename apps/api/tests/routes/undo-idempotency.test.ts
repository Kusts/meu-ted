import { describe, expect, it } from 'vitest';
import { createInMemoryAuditLogStore, type AuditLog } from '../../src/audit/store.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryIdempotencyStore } from '../../src/writes/idempotency.js';
import { createUndoService } from '../../src/approvals/undo.js';
import { DomainError } from '../../src/writes/errors.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import type { Account, Category, Transaction } from '../../src/types/domain.js';

/**
 * FIX-P1-UNDO-IDEMPOTENCY (TDD RED→GREEN, auditoria r3 HIGH):
 * o undo deve ter idempotência persistente e atomicamente protegida contra
 * concorrência, reutilizando o `IdempotencyStore` existente da API.
 */
const ACCOUNT_A: Account = {
  id: '11111111-1111-4111-8111-111111111111',
  householdId: HOUSEHOLD_A,
  name: 'Itaú A',
  kind: 'bank',
  balanceCents: 10_000_00,
  status: 'active',
};

const CATEGORY_A: Category = {
  id: '22222222-2222-4222-8222-222222222221',
  householdId: HOUSEHOLD_A,
  name: 'Mercado A',
  kind: 'expense',
  status: 'active',
};

const TX_A1: Transaction = {
  id: '33333333-3333-4333-8333-333333333301',
  householdId: HOUSEHOLD_A,
  kind: 'expense',
  description: 'Compra A1',
  amountCents: 5_000,
  date: '2026-06-10',
  accountId: ACCOUNT_A.id,
  categoryId: CATEGORY_A.id,
};

const TX_A2: Transaction = {
  id: '33333333-3333-4333-8333-333333333302',
  householdId: HOUSEHOLD_A,
  kind: 'expense',
  description: 'Compra A2',
  amountCents: 7_000,
  date: '2026-06-11',
  accountId: ACCOUNT_A.id,
  categoryId: CATEGORY_A.id,
};

const OP_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const OP_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

const makeAudit = (id: string, entityId: string, createdAt: string): AuditLog => ({
  id,
  workspaceId: HOUSEHOLD_A,
  actorType: 'device',
  actorId: 'dev-device-1',
  operation: 'transactions.expense.create',
  eventType: 'financial_effect.committed',
  payloadHash: 'hash',
  effectRef: entityId,
  metadata: { entityId },
  createdAt,
});

const buildDeps = (txs: Transaction[], audits: AuditLog[]) => {
  const { writes: raw } = createInMemoryStores({
    accounts: [ACCOUNT_A],
    categories: [CATEGORY_A],
    transactions: txs,
  });
  let reversals = 0;
  const writes = {
    ...raw,
    async softDeleteTransaction(householdId: string, id: string) {
      reversals += 1;
      return raw.softDeleteTransaction(householdId, id);
    },
  };
  const auditLogs = createInMemoryAuditLogStore(audits);
  const idempotency = createInMemoryIdempotencyStore();
  return { writes, auditLogs, idempotency, reversals: () => reversals };
};

describe('FIX-P1-UNDO-IDEMPOTENCY: undo via IdempotencyStore persistente', () => {
  it('fluxo feliz com receipt canônico', async () => {
    const { writes, auditLogs, idempotency } = buildDeps(
      [TX_A1],
      [makeAudit(OP_A1, TX_A1.id, '2026-06-10T12:00:00.000Z')],
    );
    const svc = createUndoService({ auditLogs, writes, idempotency });
    const result = await svc.undo(HOUSEHOLD_A, 'dev-device-1', 'undo-happy-1');
    expect(result.undone).toMatchObject({
      operation: 'transactions.expense.create',
      entityId: TX_A1.id,
      reversal: 'soft_delete',
    });
    expect(result.receipt).toBeDefined();
    expect(result.receipt.entity).toMatchObject({ type: 'transaction', id: TX_A1.id });
  });

  it('concorrência: duas chamadas com a mesma chave executam a reversão EXATAMENTE uma vez', async () => {
    const deps = buildDeps(
      [TX_A1],
      [makeAudit(OP_A1, TX_A1.id, '2026-06-10T12:00:00.000Z')],
    );
    const svc = createUndoService({ auditLogs: deps.auditLogs, writes: deps.writes, idempotency: deps.idempotency });
    const [first, second] = await Promise.all([
      svc.undo(HOUSEHOLD_A, 'dev-device-1', 'undo-race-1'),
      svc.undo(HOUSEHOLD_A, 'dev-device-1', 'undo-race-1'),
    ]);
    expect(second).toEqual(first);
    expect(first.undone.entityId).toBe(TX_A1.id);
    expect(deps.reversals()).toBe(1);
  });

  it('replay cross-instância: nova instância com o MESMO store retorna o canônico sem re-executar', async () => {
    const deps = buildDeps(
      [TX_A1],
      [makeAudit(OP_A1, TX_A1.id, '2026-06-10T12:00:00.000Z')],
    );
    const svc1 = createUndoService({ auditLogs: deps.auditLogs, writes: deps.writes, idempotency: deps.idempotency });
    const first = await svc1.undo(HOUSEHOLD_A, 'dev-device-1', 'undo-replay-1');
    // Nova instância do serviço, mesmo store persistente (restart simulado).
    const svc2 = createUndoService({ auditLogs: deps.auditLogs, writes: deps.writes, idempotency: deps.idempotency });
    const replayed = await svc2.undo(HOUSEHOLD_A, 'dev-device-1', 'undo-replay-1');
    expect(replayed).toEqual(first);
    expect(deps.reversals()).toBe(1);
  });

  it('mesma chave com lastOperationId divergente → idempotency.conflict', async () => {
    const { writes, auditLogs, idempotency } = buildDeps(
      [TX_A1, TX_A2],
      [
        makeAudit(OP_A1, TX_A1.id, '2026-06-10T12:00:00.000Z'),
        makeAudit(OP_A2, TX_A2.id, '2026-06-11T12:00:00.000Z'),
      ],
    );
    const svc = createUndoService({ auditLogs, writes, idempotency });
    const first = await svc.undo(HOUSEHOLD_A, 'dev-device-1', 'undo-diverge-1', OP_A2);
    expect(first.undone.entityId).toBe(TX_A2.id);
    const err = await svc.undo(HOUSEHOLD_A, 'dev-device-1', 'undo-diverge-1', OP_A1).then(
      () => { throw new Error('expected idempotency.conflict'); },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe('idempotency.conflict');
  });
});
