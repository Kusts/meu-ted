import type { Pool } from 'pg';
import { queryInTransaction, withTransaction } from '../db/pool.js';

type Row = Record<string, unknown>;

type TransferInput = {
  householdId: string;
  fromAuthUserId: string;
  toAuthUserId: string;
};

type AcceptInput = {
  householdId: string;
  transferId: string;
  destinationAuthUserId: string;
};

const findUser = async (pool: Pool, authUserId: string): Promise<Row | undefined> => {
  const result = await queryInTransaction<Row>(pool, 'SELECT id FROM users WHERE auth_user_id = $1', [authUserId]);
  return result.rows[0];
};

const quoteIdentifier = (identifier: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error('invalid database role');
  return `"${identifier}"`;
};

const setTrustedDatabaseRole = (pool: Pool, role?: string) => {
  if (!role) return Promise.resolve();
  return queryInTransaction(pool, `SET LOCAL ROLE ${quoteIdentifier(role)}`);
};

const setAuthenticatedUser = (pool: Pool, userId: string) => queryInTransaction(pool,
  'SELECT set_ownership_transfer_context($1::uuid)',
  [userId],
);

export class OwnershipTransferError extends Error {
  constructor(readonly code: 'ownership_transfer.not_allowed' | 'ownership_transfer.invalid', readonly statusCode: number, message: string) {
    super(message);
    this.name = 'OwnershipTransferError';
  }
}

export const createPostgresOwnershipTransferStore = (pool: Pool, trustedDatabaseRole?: string) => ({
  async create(input: TransferInput) {
    return withTransaction(pool, async () => {
      await setTrustedDatabaseRole(pool, trustedDatabaseRole);
      const actor = await findUser(pool, input.fromAuthUserId);
      if (!actor) throw new OwnershipTransferError('ownership_transfer.not_allowed', 403, 'ownership transfer is not allowed');
      await setAuthenticatedUser(pool, actor['id'] as string);
      const result = await queryInTransaction<Row>(pool,
        `INSERT INTO ownership_transfers (household_id, from_user_id, to_user_id)
         SELECT $1, source.id, target.id
           FROM users source, users target
          WHERE source.auth_user_id = $2 AND target.auth_user_id = $3
         RETURNING id, household_id, from_user_id, to_user_id, status, created_at`,
        [input.householdId, input.fromAuthUserId, input.toAuthUserId],
      );
      if (result.rowCount !== 1) throw new OwnershipTransferError('ownership_transfer.not_allowed', 403, 'ownership transfer is not allowed');
      return result.rows[0]!;
    });
  },

  async accept(input: AcceptInput) {
    return withTransaction(pool, async () => {
      await setTrustedDatabaseRole(pool, trustedDatabaseRole);
      const target = await findUser(pool, input.destinationAuthUserId);
      if (!target) throw new OwnershipTransferError('ownership_transfer.not_allowed', 403, 'only destination can accept transfer');
      await setAuthenticatedUser(pool, target['id'] as string);
      const result = await queryInTransaction<Row>(pool,
        `UPDATE ownership_transfers transfer
            SET status = 'accepted', accepted_by = target.id, accepted_at = NOW()
           FROM users target
          WHERE transfer.id = $1
            AND transfer.household_id = $2
            AND transfer.status = 'pending'
            AND transfer.to_user_id = target.id
            AND target.auth_user_id = $3
        RETURNING transfer.id, transfer.household_id, transfer.from_user_id,
                  transfer.to_user_id, transfer.status, transfer.accepted_at`,
        [input.transferId, input.householdId, input.destinationAuthUserId],
      );
      if (result.rowCount !== 1) {
        throw new OwnershipTransferError('ownership_transfer.not_allowed', 403, 'only destination can accept transfer');
      }
      return result.rows[0]!;
    });
  },
});

export type OwnershipTransferStore = ReturnType<typeof createPostgresOwnershipTransferStore>;
