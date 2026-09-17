/**
 * Legacy Postgres implementation of SubscriptionStore.
 *
 * Maps the canonical subscription contract onto the legacy pi_financeiro
 * schema. Activated by DB_SCHEMA=legacy.
 *
 * Schema notes:
 * - The `subscriptions` table is created by V009 (`src/read-models/sql/V009__categories_parent_subscriptions.sql`).
 *   V009 defines `status TEXT` ('active' | 'cancelled'), NOT an `active` BOOLEAN.
 *   An earlier draft of this adapter assumed `active BOOLEAN` (matching V008's
 *   `payable_templates` pattern) but that assumption was wrong for V009.
 * - `deleted_at` is set on cancel (soft-delete).
 * - `created_at` uses NOW() with timezone.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Subscription } from '../types/domain.js';
import { withTransaction } from '../db/pool.js';
import { domainErrors } from '../writes/errors.js';
import type { SubscriptionStore, } from './store.js';

type Row = Record<string, unknown>;

const mapSubscription = (r: Row): Subscription => {
  const cancelledAt = r['cancelled_at'] != null ? (r['cancelled_at'] as Date).toISOString() : undefined;
  const base: Subscription = {
    id: r['id'] as string,
    householdId: r['household_id'] as string,
    name: r['name'] as string,
    amountCents: Number(r['amount_cents']),
    cycle: r['cycle'] as Subscription['cycle'],
    day: Number(r['day']),
    paymentMethod: r['payment_method'] as string,
    status: r['status'] as Subscription['status'],
    createdAt: (r['created_at'] as Date).toISOString(),
  };
  if (cancelledAt) (base as any).cancelledAt = cancelledAt;
  return base;
};

export const createLegacyPostgresSubscriptionStore = (pool: Pool): SubscriptionStore => {
  const query = async <R extends Row = Row>(text: string, values: unknown[] = []): Promise<R[]> => {
    const res = await pool.query<R>(text, values);
    return res.rows;
  };

  return {
    async listSubscriptions(householdId, status) {
      const values: unknown[] = [householdId];
      const statusClause = status ? ` AND status = $2` : '';
      if (status) values.push(status);
      const rows = await query<Row>(
        `SELECT id, household_id, name, amount_cents, cycle, day, payment_method,
                status, created_at, cancelled_at
           FROM subscriptions
          WHERE household_id = $1
            AND deleted_at IS NULL${statusClause}
          ORDER BY created_at DESC`,
        values,
      );
      return rows.map(mapSubscription);
    },

    async createSubscription(householdId, input) {
      return withTransaction(pool, async (client) => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO subscriptions (id, household_id, name, amount_cents, cycle, day, payment_method, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW(), NOW())`,
          [id, householdId, input.name, input.amountCents, input.cycle, input.day, input.paymentMethod],
        );
        const res = await client.query<Row>(
          `SELECT id, household_id, name, amount_cents, cycle, day, payment_method, status, created_at, cancelled_at
             FROM subscriptions WHERE id = $1 AND household_id = $2`,
          [id, householdId],
        );
        return mapSubscription(res.rows[0]!);
      });
    },

    async cancelSubscription(householdId, id) {
      return withTransaction(pool, async (client) => {
        const existing = await client.query<Row>(
          `SELECT id, household_id, name, amount_cents, cycle, day, payment_method, status, created_at, cancelled_at
             FROM subscriptions
            WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
          [id, householdId],
        );
        if (existing.rowCount === 0) throw domainErrors.notFound('Assinatura');
        const sub = mapSubscription(existing.rows[0]!);
        if (sub.status !== 'active') throw domainErrors.invalid('status', 'assinatura não está ativa');

        const res = await client.query<Row>(
          `UPDATE subscriptions
              SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND household_id = $2
            RETURNING id, household_id, name, amount_cents, cycle, day, payment_method, status, created_at, cancelled_at`,
          [id, householdId],
        );
        return mapSubscription(res.rows[0]!);
      });
    },

    async getSubscription(householdId, id) {
      const rows = await query<Row>(
        `SELECT id, household_id, name, amount_cents, cycle, day, payment_method, status, created_at, cancelled_at
           FROM subscriptions
          WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
        [id, householdId],
      );
      if (rows.length === 0) return null;
      return mapSubscription(rows[0]!);
    },

    async updateSubscription(householdId, id, input) {
      const existing = await query<Row>(
        `SELECT id FROM subscriptions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
        [id, householdId],
      );
      if (existing.length === 0) throw domainErrors.notFound('Assinatura');

      // Task 2.19 (SPEC §9.11): placeholders derived from params.length —
      // the fixed $3..$7 below misbound every partial PATCH (same bug class
      // as cards before Task 2.5/2.6). Keys are $1/$2; each provided field
      // takes the next index so any single field or combination binds.
      const sets: string[] = [];
      const params: unknown[] = [id, householdId];
      if (input.name !== undefined) { sets.push(`name = $${params.length + 1}`); params.push(input.name); }
      if (input.amountCents !== undefined) { sets.push(`amount_cents = $${params.length + 1}`); params.push(input.amountCents); }
      if (input.cycle !== undefined) { sets.push(`cycle = $${params.length + 1}`); params.push(input.cycle); }
      if (input.day !== undefined) { sets.push(`day = $${params.length + 1}`); params.push(input.day); }
      if (input.paymentMethod !== undefined) { sets.push(`payment_method = $${params.length + 1}`); params.push(input.paymentMethod); }
      if (sets.length === 0) throw domainErrors.invalid('body', 'nenhum campo para atualizar');

      const res = await query<Row>(
        `UPDATE subscriptions
            SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $1 AND household_id = $2
          RETURNING id, household_id, name, amount_cents, cycle, day, payment_method, status, created_at, cancelled_at`,
        params,
      );
      return mapSubscription(res[0]!);
    },
  };
};