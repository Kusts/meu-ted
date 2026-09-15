/**
 * PendingOperationV2 store transition-matrix contract (T0.3-FILES, tests ONLY).
 *
 * Exports `definePendingV2ContractSuite(suiteName, makeStore, hooks?)` and runs
 * it for the IN-MEMORY store. The Postgres half lives in
 * `pending-v2-postgres-red.test.ts` and reuses this SAME harness.
 *
 * Matrix (identical assertions for any store):
 *  proposed -> confirmed | cancelled | expired
 *  confirmed -> executing (via claim) | cancelled | expired
 *  executing -> succeeded | failed
 *  failed -> confirmed (via retry, NEW attestation — non-regression)
 *  terminal (succeeded/cancelled/expired) reject every transition
 * Forbidden: executing->confirmed, succeeded->executing,
 *  cancelled->confirmed, expired->confirmed.
 *
 * One RED-BY-DESIGN test asserts TARGET behavior (claim parity, T2.3) and
 * is EXPECTED to fail until T2.3 lands. Do not weaken it. The H-03
 * recoverable-confirm tests (T2.2) already assert target behavior and pass.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { computePendingOperationV2Hash } from '@pi-finance/llm-contracts';
import {
  createInMemoryPendingOperationV2Store,
  PendingOperationV2Error,
  type PendingIdentity,
  type PendingOperationV2Record,
  type PendingOperationV2Store,
} from '../../src/approvals/pending-v2.js';

export type PendingV2ContractHooks = {
  /** Called with every workspaceId created (lets the Postgres half track cleanup). */
  trackWorkspace?: (workspaceId: string) => void;
  /** Runs after each test (lets the Postgres half delete its rows). */
  cleanup?: () => Promise<void>;
};

export function definePendingV2ContractSuite(
  suiteName: string,
  makeStore: () => PendingOperationV2Store,
  hooks: PendingV2ContractHooks = {},
): void {
  describe(suiteName, () => {
    let store: PendingOperationV2Store;

    beforeEach(() => {
      store = makeStore();
    });

    afterEach(async () => {
      await hooks.cleanup?.();
    });

    const newIdentity = (): PendingIdentity => {
      const identity: PendingIdentity = {
        workspaceId: randomUUID(),
        actorId: randomUUID(),
        deviceId: randomUUID(),
      };
      hooks.trackWorkspace?.(identity.workspaceId);
      return identity;
    };

    /** Realistic canonical expense args — never an empty object. */
    const proposeCanonical = async (identity: PendingIdentity): Promise<PendingOperationV2Record> => {
      const base = {
        version: 2 as const,
        workspaceId: identity.workspaceId,
        actorId: identity.actorId,
        deviceId: identity.deviceId,
        tool: 'transactions.expense.create',
        normalizedArgs: {
          description: 'Team lunch with client',
          amountCents: 1250,
          date: '2026-09-14',
          accountId: randomUUID(),
          categoryId: randomUUID(),
        },
        proposalHash: '',
        idempotencyKey: randomUUID(),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        bindings: {
          workspaceId: identity.workspaceId,
          actorId: identity.actorId,
          deviceId: identity.deviceId,
        },
      };
      const proposalHash = await computePendingOperationV2Hash(base);
      return store.propose({ ...base, proposalHash });
    };

    const succeededResult = () => ({ status: 'succeeded', operationId: randomUUID() });

    it('proposed → confirmed issues a one-use attestation', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      expect(saved.status).toBe('proposed');
      const confirmed = await store.confirm(saved.id, id);
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.attestation).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    });

    it('proposed → cancelled', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      const cancelled = await store.cancel(saved.id, id);
      expect(cancelled.status).toBe('cancelled');
    });

    it('proposed → expired', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      const expired = await store.expire(saved.id, id);
      expect(expired.status).toBe('expired');
    });

    it('confirmed → executing via claim, then succeeded', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      const confirmed = await store.confirm(saved.id, id);
      const done = await store.execute(confirmed.attestation!, id, async () => succeededResult());
      expect(done.status).toBe('succeeded');
      expect(done.execution).toMatchObject({ status: 'succeeded' });
    });

    it('confirmed → cancelled', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      await store.confirm(saved.id, id);
      const cancelled = await store.cancel(saved.id, id);
      expect(cancelled.status).toBe('cancelled');
    });

    it('confirmed → expired', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      await store.confirm(saved.id, id);
      const expired = await store.expire(saved.id, id);
      expect(expired.status).toBe('expired');
    });

    it('executing → failed on executor error', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      const confirmed = await store.confirm(saved.id, id);
      await expect(
        store.execute(confirmed.attestation!, id, async () => {
          throw new Error('downstream outage');
        }),
      ).rejects.toThrow('downstream outage');
      expect((await store.get(saved.id, id)).status).toBe('failed');
    });

    it('failed → confirmed via retry issues NEW attestation and clears consumption (non-regression)', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      const confirmed = await store.confirm(saved.id, id);
      const firstToken = confirmed.attestation!;
      await expect(
        store.execute(firstToken, id, async () => {
          throw new Error('downstream outage');
        }),
      ).rejects.toThrow('downstream outage');
      const retried = await store.retry(saved.id, id);
      expect(retried.status).toBe('confirmed');
      expect(retried.attestation).toBeTruthy();
      expect(retried.attestation).not.toBe(firstToken);
      // The fresh attestation must be claimable: proves attestation_consumed_at was cleared.
      const done = await store.execute(retried.attestation!, id, async () => succeededResult());
      expect(done.status).toBe('succeeded');
    });

    it('terminal states (succeeded/cancelled/expired) reject all transitions', async () => {
      const sId = newIdentity();
      const sOp = await proposeCanonical(sId);
      const sConfirmed = await store.confirm(sOp.id, sId);
      await store.execute(sConfirmed.attestation!, sId, async () => succeededResult());

      const cId = newIdentity();
      const cOp = await proposeCanonical(cId);
      const cConfirmed = await store.confirm(cOp.id, cId);
      await store.cancel(cOp.id, cId);

      const eId = newIdentity();
      const eOp = await proposeCanonical(eId);
      const eConfirmed = await store.confirm(eOp.id, eId);
      await store.expire(eOp.id, eId);

      const cases: Array<{ label: string; identity: PendingIdentity; id: string; token: string }> = [
        { label: 'succeeded', identity: sId, id: sOp.id, token: sConfirmed.attestation! },
        { label: 'cancelled', identity: cId, id: cOp.id, token: cConfirmed.attestation! },
        { label: 'expired', identity: eId, id: eOp.id, token: eConfirmed.attestation! },
      ];
      for (const c of cases) {
        await expect(store.confirm(c.id, c.identity), c.label).rejects.toBeInstanceOf(PendingOperationV2Error);
        await expect(store.retry(c.id, c.identity), c.label).rejects.toBeInstanceOf(PendingOperationV2Error);
        await expect(store.cancel(c.id, c.identity), c.label).rejects.toBeInstanceOf(PendingOperationV2Error);
        await expect(store.expire(c.id, c.identity), c.label).rejects.toBeInstanceOf(PendingOperationV2Error);
        await expect(
          store.execute(c.token, c.identity, async () => succeededResult()),
          c.label,
        ).rejects.toBeInstanceOf(PendingOperationV2Error);
      }
    });

    it(
      'forbidden: executing → confirmed is rejected',
      { timeout: 20_000 },
      async () => {
        const id = newIdentity();
        const saved = await proposeCanonical(id);
        const confirmed = await store.confirm(saved.id, id);
        // Deferred executor: while it is parked, the operation is mid-claim
        // (executing). On Postgres the concurrent confirm blocks on the row
        // lock and resolves after commit — hence the extended timeout.
        let started!: () => void;
        const startedP = new Promise<void>((resolve) => {
          started = resolve;
        });
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const execution = store.execute(confirmed.attestation!, id, async () => {
          started();
          await gate;
          return succeededResult();
        });
        await startedP;
        const confirmAttempt = store.confirm(saved.id, id);
        confirmAttempt.catch(() => undefined);
        release();
        const done = await execution;
        expect(done.status).toBe('succeeded');
        await expect(confirmAttempt).rejects.toMatchObject({ code: 'approval.not_pending' });
      },
    );

    it('forbidden: succeeded → executing is rejected', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      const confirmed = await store.confirm(saved.id, id);
      await store.execute(confirmed.attestation!, id, async () => succeededResult());
      let executorRan = false;
      await expect(
        store.execute(confirmed.attestation!, id, async () => {
          executorRan = true;
          return succeededResult();
        }),
      ).rejects.toMatchObject({ code: 'approval.attestation_replayed' });
      expect(executorRan).toBe(false);
    });

    it('forbidden: cancelled → confirmed is rejected', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      await store.confirm(saved.id, id);
      await store.cancel(saved.id, id);
      await expect(store.confirm(saved.id, id)).rejects.toBeInstanceOf(PendingOperationV2Error);
    });

    it('forbidden: expired → confirmed is rejected', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      await store.expire(saved.id, id);
      await expect(store.confirm(saved.id, id)).rejects.toBeInstanceOf(PendingOperationV2Error);
    });

    it('recoverable confirm (H-03, SPEC §9): second confirm on confirmed re-emits a NEW attestation and invalidates the old', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      const first = await store.confirm(saved.id, id);
      expect(first.attestation).toBeTruthy();
      expect(first.attestationIssuedAt).toBeTruthy();
      const firstToken = first.attestation!;
      const second = await store.confirm(saved.id, id);
      expect(second.status).toBe('confirmed');
      expect(second.attestation).toBeTruthy();
      expect(second.attestation).not.toBe(firstToken);
      // Old token is invalid immediately after rotation: exactly one valid
      // attestation at any instant.
      await expect(
        store.execute(firstToken, id, async () => succeededResult()),
      ).rejects.toMatchObject({ code: 'approval.attestation_replayed' });
      // The new token executes exactly once: recovery without duplication.
      const done = await store.execute(second.attestation!, id, async () => succeededResult());
      expect(done.status).toBe('succeeded');
      await expect(
        store.execute(second.attestation!, id, async () => succeededResult()),
      ).rejects.toMatchObject({ code: 'approval.attestation_replayed' });
    });

    it('confirm after the attestation was consumed never re-emits (replay path rejects per protocol)', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      const confirmed = await store.confirm(saved.id, id);
      await store.execute(confirmed.attestation!, id, async () => succeededResult());
      await expect(store.confirm(saved.id, id)).rejects.toBeInstanceOf(PendingOperationV2Error);
    });

    it('get after confirm never exposes attestation', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      await store.confirm(saved.id, id);
      const fetched = await store.get(saved.id, id);
      expect(fetched.attestation).toBeUndefined();
    });

    it('RED-BY-DESIGN (claim parity): execute after cancel rejects with approval.attestation_replayed', async () => {
      const id = newIdentity();
      const saved = await proposeCanonical(id);
      const confirmed = await store.confirm(saved.id, id);
      await store.cancel(saved.id, id);
      await expect(
        store.execute(confirmed.attestation!, id, async () => succeededResult()),
      ).rejects.toMatchObject({ code: 'approval.attestation_replayed' });
    });
  });
}

definePendingV2ContractSuite(
  'pending-v2 contract (in-memory)',
  () => createInMemoryPendingOperationV2Store(),
);
