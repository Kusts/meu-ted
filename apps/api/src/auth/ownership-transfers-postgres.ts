import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../db/pool.js';

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

const findUser = async (client: PoolClient, authUserId: string): Promise<Row | undefined> => {
  const result = await client.query<Row>('SELECT id FROM users WHERE auth_user_id = $1', [authUserId]);
  return result.rows[0];
};

const quoteIdentifier = (identifier: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error('invalid database role');
  return `"${identifier}"`;
};

const setTrustedDatabaseRole = (client: PoolClient, role?: string) => {
  if (!role) return Promise.resolve();
  return client.query(`SET LOCAL ROLE ${quoteIdentifier(role)}`);
};

const setAuthenticatedUser = (client: PoolClient, userId: string) => client.query(
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
    return withTransaction(pool, async (client) => {
      await setTrustedDatabaseRole(client, trustedDatabaseRole);
      const actor = await findUser(client, input.fromAuthUserId);
      if (!actor) throw new OwnershipTransferError('ownership_transfer.not_allowed', 403, 'ownership transfer is not allowed');
      await setAuthenticatedUser(client, actor['id'] as string);
      const result = await client.query<Row>(
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
    return withTransaction(pool, async (client) => {
      await setTrustedDatabaseRole(client, trustedDatabaseRole);
      const target = await findUser(client, input.destinationAuthUserId);
      if (!target) throw new OwnershipTransferError('ownership_transfer.not_allowed', 403, 'only destination can accept transfer');
      await setAuthenticatedUser(client, target['id'] as string);
      const result = await client.query<Row>(
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

  async listPending(input: { householdId: string; authUserId: string }): Promise<PendingOwnershipTransfer[]> {
    return withTransaction(pool, async (client) => {
      await setTrustedDatabaseRole(client, trustedDatabaseRole);
      const actor = await findUser(client, input.authUserId);
      if (!actor) return [];
      await setAuthenticatedUser(client, actor['id'] as string);
      const result = await client.query<Row>(
        `SELECT transfer.id,
                transfer.household_id,
                source.auth_user_id AS from_user_id,
                target.auth_user_id AS to_user_id,
                transfer.status,
                transfer.created_at
           FROM ownership_transfers transfer
           JOIN users source ON source.id = transfer.from_user_id
           JOIN users target ON target.id = transfer.to_user_id
          WHERE transfer.household_id = $1
            AND transfer.status = 'pending'
            AND (transfer.from_user_id = $2 OR transfer.to_user_id = $2)
          ORDER BY transfer.created_at DESC`,
        [input.householdId, actor['id']],
      );
      return result.rows.map((row) => ({
        id: row['id'] as string,
        householdId: row['household_id'] as string,
        fromUserId: row['from_user_id'] as string,
        toUserId: row['to_user_id'] as string,
        status: row['status'] as string,
        createdAt: (row['created_at'] instanceof Date ? row['created_at'] : new Date(row['created_at'] as string)).toISOString(),
      }));
    });
  },
});

export type PendingOwnershipTransfer = {
  id: string;
  householdId: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  createdAt: string;
};

export type OwnershipTransferStore = ReturnType<typeof createPostgresOwnershipTransferStore>;
