import type { DbPool } from '../../db/pool.js';
import { applyMigrationTimeouts } from '../../db/pool.js';
import { requireTestDatabase } from '../../db/db-guard.js';
import { ARCHIVE_SCHEMA } from './archive-and-bootstrap.js';

/**
 * M3 canonical converter: balance recomputation (pure computation core).
 *
 * After the M2 import every canonical account lands with `balance_cents = 0`
 * and the V058 `initial_balance_cents` anchor backfilled from the archive.
 * This module recomputes the materialized balance as
 * `initial + income − expense − transfer_out + transfer_in`, mirroring
 * EXACTLY the canonical write-path balance semantics:
 * - plain income (`writes/postgres.ts` createIncomeInTx): `balance += amount`;
 * - plain expense (createExpenseInTx): `balance -= amount`;
 * - transfer (createTransferInTx): `from -= amount`, `to += amount`;
 * - card-purchase expense (`cards/postgres.ts` createCardPurchaseInTx carries
 *   `statement_id`): NEVER touches `accounts.balance_cents` — only the
 *   statement totals move. The canonical reconciliation (`reconciliation/sql.ts`
 *   accounts_balance) excludes statement-linked expenses from its expense leg
 *   for the same reason, so this computation skips them too and the two agree
 *   by construction.
 * - statement-payment expense (`cards/postgres.ts` payStatementInTx carries
 *   `statement_payment_id` with `statement_id` NULL): debits the payer AND
 *   credits the card via a statements join, a leg with no transaction row
 *   that the reconciliation does not model either. The two disagree here by
 *   design of the live system (pre-existing, out of converter scope), so this
 *   module does NOT invent the credit: it fails closed (`BalanceError`) and
 *   the caller must resolve or exclude such rows first. Imported (M2) rows
 *   never carry `statement_payment_id` (the mapper leaves it NULL), so the
 *   recomputation over converter data never hits this path.
 *
 * Domain rule (ADR-018 / V055): `bank`/`cash` results may be negative (no
 * clamp); a negative `credit_card` result fails closed BEFORE any write,
 * mirroring `assertDebitAllowed` in the write path.
 */

export class BalanceError extends Error {
  constructor(detail: string) {
    super(`cannot compute canonical balances: ${detail}`);
    this.name = 'BalanceError';
  }
}

/**
 * FINDING-2: money moves as bigint end-to-end. pg BIGINT money arrives as
 * a string; parsing through `number` silently loses precision past
 * 2^53-1. Every amount/anchor is parsed to bigint, summed in bigint, and
 * range-checked against the PostgreSQL BIGINT span before any write, with
 * writes bound as exact decimal strings.
 */
export const PG_BIGINT_MIN = -(2n ** 63n);
export const PG_BIGINT_MAX = 2n ** 63n - 1n;

const MONEY_RE = /^-?\d+$/;

export const parseMoney = (value: unknown, what: string): bigint => {
  let text: string;
  if (typeof value === 'bigint') {
    text = value.toString();
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new BalanceError(`${what} is not a safe integer (${String(value)}): pass pg BIGINT money as a string`);
    }
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    throw new BalanceError(`${what} is not an exact integer (${String(value)})`);
  }
  if (!MONEY_RE.test(text)) {
    throw new BalanceError(`${what} is not an exact integer (${String(value)})`);
  }
  const parsed = BigInt(text);
  if (parsed < PG_BIGINT_MIN || parsed > PG_BIGINT_MAX) {
    throw new BalanceError(`${what} (${text}) exceeds the PostgreSQL BIGINT range`);
  }
  return parsed;
};

export type BalanceAccountInput = {
  id: string;
  householdId: string;
  kind: string;
  /** Anchor backfilled from the legacy origin; NULL/undefined means 0 (column DEFAULT 0). */
  initialBalanceCents: number | string | bigint | null | undefined;
};

export type BalanceTransactionInput = {
  id?: string | undefined;
  householdId: string;
  kind: 'income' | 'expense' | 'transfer' | string;
  accountId: string;
  transferToAccountId?: string | null | undefined;
  amountCents: number | string | bigint;
  /** Card-purchase link: rows carrying it have no balance effect (see header). */
  statementId?: string | null | undefined;
  /** Payment link: unresolvable here — fails closed (see header). */
  statementPaymentId?: string | null | undefined;
  deletedAt?: string | Date | null | undefined;
  deleted?: boolean | undefined;
};

export type AccountBalanceComputation = {
  accountId: string;
  householdId: string;
  kind: string;
  initial: bigint;
  income: bigint;
  expense: bigint;
  transferIn: bigint;
  transferOut: bigint;
  computed: bigint;
};

const isPresent = (value: unknown): boolean =>
  value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');

export const computeCanonicalBalances = (
  accounts: BalanceAccountInput[],
  transactions: BalanceTransactionInput[],
): AccountBalanceComputation[] => {
  const byId = new Map<string, AccountBalanceComputation>();
  for (const account of accounts) {
    if (!isPresent(account.id)) throw new BalanceError('account without id');
    if (!isPresent(account.householdId)) throw new BalanceError(`account '${String(account.id)}' without household`);
    if (byId.has(account.id)) throw new BalanceError(`duplicate account '${account.id}'`);
    const initial = account.initialBalanceCents === null || account.initialBalanceCents === undefined
      ? 0n
      : parseMoney(account.initialBalanceCents, `initial balance of account '${account.id}'`);
    byId.set(account.id, {
      accountId: account.id,
      householdId: account.householdId,
      kind: account.kind,
      initial,
      income: 0n,
      expense: 0n,
      transferIn: 0n,
      transferOut: 0n,
      computed: initial,
    });
  }
  for (const tx of transactions) {
    if (tx.deleted === true || tx.deletedAt !== null && tx.deletedAt !== undefined) continue;
    const row = byId.get(tx.accountId);
    if (!row) throw new BalanceError(`transaction '${String(tx.id ?? '?')}' references unknown account '${tx.accountId}'`);
    if (tx.householdId !== row.householdId) {
      throw new BalanceError(
        `transaction '${String(tx.id ?? '?')}' household mismatch (row holds another household's movement)`,
      );
    }
    const amount = parseMoney(tx.amountCents, `amount of transaction '${String(tx.id ?? '?')}'`);
    if (amount <= 0n) throw new BalanceError(`transaction '${String(tx.id ?? '?')}' amount must be positive`);
    if (tx.kind === 'income') {
      row.income += amount;
      row.computed += amount;
    } else if (tx.kind === 'expense') {
      if (isPresent(tx.statementId)) continue;
      if (isPresent(tx.statementPaymentId)) {
        throw new BalanceError(
          `transaction '${String(tx.id ?? '?')}' carries statement_payment_id: the card credit leg is unresolvable from ledger rows alone (write-path credits via statements join; reconciliation does not model it)`,
        );
      }
      row.expense += amount;
      row.computed -= amount;
    } else if (tx.kind === 'transfer') {
      if (!isPresent(tx.transferToAccountId)) {
        throw new BalanceError(`transfer '${String(tx.id ?? '?')}' without transfer_to_account_id`);
      }
      const dest = byId.get(tx.transferToAccountId as string);
      if (!dest) {
        throw new BalanceError(
          `transfer '${String(tx.id ?? '?')}' references unknown destination account '${String(tx.transferToAccountId)}'`,
        );
      }
      if (dest.householdId !== row.householdId) {
        throw new BalanceError(`transfer '${String(tx.id ?? '?')}' crosses households`);
      }
      if (dest.accountId === row.accountId) {
        throw new BalanceError(`transfer '${String(tx.id ?? '?')}' with identical account legs`);
      }
      row.transferOut += amount;
      row.computed -= amount;
      dest.transferIn += amount;
      dest.computed += amount;
    } else {
      throw new BalanceError(`transaction '${String(tx.id ?? '?')}' has unknown kind '${String(tx.kind)}'`);
    }
  }
  const out = [...byId.values()];
  for (const row of out) {
    if (row.computed < PG_BIGINT_MIN || row.computed > PG_BIGINT_MAX) {
      throw new BalanceError(
        `account '${row.accountId}' balance (${row.computed.toString()}) exceeds the PostgreSQL BIGINT range: refusing before any write`,
      );
    }
    if (row.kind === 'credit_card' && row.computed < 0n) {
      throw new BalanceError(
        `account '${row.accountId}' (credit_card) would go negative (${row.computed.toString()}): refusing before any write`,
      );
    }
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* I/O layer: backfill the V058 anchor, recompute, apply.              */
/*                                                                     */
/* The M2 import lands every account with `balance_cents = 0` and the  */
/* anchor at its DEFAULT 0 (the mapper refuses nonzero initials as     */
/* belt-and-braces). `backfillInitialBalances` copies the true anchor  */
/* from `legacy_archive.accounts`; `runBalancesStep` then recomputes   */
/* over the canonical tables and persists the result. Import.ts        */
/* intentionally does NOT call this: the orchestrator runs             */
/* `runBalancesStep` after `runCanonicalImport` (fail-closed           */
/* preconditions below mirror the import gates where they apply).      */
/* ------------------------------------------------------------------ */

export type BalancesStepOptions = {
  schema?: string | undefined;
  archiveSchema?: string | undefined;
  /** Restrict to one household; omitted processes every household present. */
  householdId?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
};

export type BackfillResult = {
  /** Canonical accounts updated with the archived anchor. */
  updated: number;
  /** Canonical accounts in scope (must equal updated, else fail-closed). */
  canonicalCount: number;
};

export type AppliedBalance = AccountBalanceComputation & { storedBefore: bigint };

export type BalancesStepResult = {
  households: string[];
  backfilled: BackfillResult;
  applied: AppliedBalance[];
  durationMs: number;
};

type Row = Record<string, unknown>;

const quoteIdent = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const str = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new BalanceError('database returned an empty id');
  return value;
};

/**
 * Copies `initial_balance_cents` from the archived legacy accounts into the
 * canonical V058 anchor column (matched by id + household). Fail-closed when
 * the archive relation is absent or when any in-scope canonical account has
 * no archived anchor row — inventing a zero anchor would mask a true drift.
 */
export const backfillInitialBalances = async (
  pool: DbPool,
  opts: BalancesStepOptions = {},
): Promise<BackfillResult> => {
  const schema = opts.schema ?? 'public';
  const archiveSchema = opts.archiveSchema ?? ARCHIVE_SCHEMA;
  const params: unknown[] = [];
  const scope = opts.householdId === undefined
    ? ''
    : (() => {
      params.push(opts.householdId);
      return ` AND c.household_id = $1`;
    })();
  const archived = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'accounts') AS ok`,
    [archiveSchema],
  );
  if (archived.rows[0]?.ok !== true) {
    throw new BalanceError(`archive accounts table "${archiveSchema}.accounts" is missing: refusing to invent anchors`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await applyMigrationTimeouts(client);
    const updated = await client.query(
      `UPDATE ${quoteIdent(schema)}.accounts AS c
          SET initial_balance_cents = a.initial_balance_cents
         FROM ${quoteIdent(archiveSchema)}.accounts AS a
        WHERE c.id = a.id AND c.household_id = a.household_id AND c.deleted_at IS NULL${scope}`,
      params,
    );
    const counted = await client.query(
      `SELECT COUNT(*)::int AS n FROM ${quoteIdent(schema)}.accounts AS c WHERE c.deleted_at IS NULL${scope}`,
      params,
    );
    const canonicalCount = Number(counted.rows[0]?.n ?? 0);
    const updatedCount = updated.rowCount ?? 0;
    if (updatedCount !== canonicalCount) {
      await client.query('ROLLBACK');
      throw new BalanceError(
        `anchor backfill matched ${updatedCount} of ${canonicalCount} canonical accounts: refusing to leave accounts unanchored`,
      );
    }
    await client.query('COMMIT');
    return { updated: updatedCount, canonicalCount };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure; surface the original error
    }
    throw error;
  } finally {
    client.release();
  }
};

const readCanonicalState = async (
  pool: DbPool,
  schema: string,
  householdId: string | undefined,
): Promise<{
  accounts: BalanceAccountInput[];
  transactions: BalanceTransactionInput[];
  storedBeforeByAccount: Map<string, bigint>;
}> => {
  const params: unknown[] = [];
  const scope = (column: string): string => {
    if (householdId === undefined) return '';
    params.push(householdId);
    return ` AND ${column} = $${params.length}`;
  };
  const accRes = await pool.query(
    `SELECT id, household_id, kind, initial_balance_cents, balance_cents
       FROM ${quoteIdent(schema)}.accounts
      WHERE deleted_at IS NULL${scope('household_id')}`,
    params,
  );
  const txParams: unknown[] = [];
  const txScope = householdId === undefined
    ? ''
    : (() => {
      txParams.push(householdId);
      return ` AND household_id = $1`;
    })();
  const txRes = await pool.query(
    `SELECT id, household_id, kind, account_id, transfer_to_account_id, amount_cents,
            statement_id, statement_payment_id, deleted_at
       FROM ${quoteIdent(schema)}.transactions
      WHERE deleted_at IS NULL${txScope}`,
    txParams,
  );
  return {
    accounts: (accRes.rows as Row[]).map((r) => ({
      id: str(r['id']),
      householdId: str(r['household_id']),
      kind: String(r['kind']),
      initialBalanceCents: r['initial_balance_cents'] === null || r['initial_balance_cents'] === undefined
        ? 0n
        : parseMoney(r['initial_balance_cents'], `initial balance of account '${String(r['id'])}'`),
    })),
    transactions: (txRes.rows as Row[]).map((r) => ({
      id: String(r['id'] ?? ''),
      householdId: str(r['household_id']),
      kind: String(r['kind']),
      accountId: str(r['account_id']),
      transferToAccountId: r['transfer_to_account_id'] === null || r['transfer_to_account_id'] === undefined
        ? null
        : String(r['transfer_to_account_id']),
      amountCents: parseMoney(r['amount_cents'], `amount of transaction '${String(r['id'] ?? '')}'`),
      statementId: r['statement_id'] === null || r['statement_id'] === undefined ? null : String(r['statement_id']),
      statementPaymentId:
        r['statement_payment_id'] === null || r['statement_payment_id'] === undefined
          ? null
          : String(r['statement_payment_id']),
      deletedAt: null,
    })),
    storedBeforeByAccount: new Map<string, bigint>(
      (accRes.rows as Row[]).map((r) => [
        str(r['id']),
        parseMoney(r['balance_cents'], `stored balance of account '${String(r['id'])}'`),
      ]),
    ),
  };
};

/**
 * Transactionally persists recomputed balances (`accounts.balance_cents`).
 * The pure computation runs BEFORE the transaction opens, so a
 * `credit_card`-negative refusal never leaves a half-written household.
 */
export const applyBalances = async (
  pool: DbPool,
  schema: string,
  computed: AccountBalanceComputation[],
  storedBeforeByAccount: Map<string, bigint>,
): Promise<AppliedBalance[]> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await applyMigrationTimeouts(client);
    const applied: AppliedBalance[] = [];
    for (const row of computed) {
      // FINDING-2: bind the recomputed balance as an exact decimal string —
      // a JS number would lose precision past 2^53-1 on the way to pg.
      const res = await client.query(
        `UPDATE ${quoteIdent(schema)}.accounts
            SET balance_cents = $1, updated_at = NOW()
          WHERE id = $2 AND household_id = $3 AND deleted_at IS NULL`,
        [row.computed.toString(), row.accountId, row.householdId],
      );
      if ((res.rowCount ?? 0) !== 1) {
        throw new BalanceError(`account '${row.accountId}' vanished mid-apply: rolled back`);
      }
      applied.push({ ...row, storedBefore: storedBeforeByAccount.get(row.accountId) ?? 0n });
    }
    await client.query('COMMIT');
    return applied;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure; surface the original error
    }
    throw error;
  } finally {
    client.release();
  }
};

/**
 * M3 pipeline step: backfill anchors from the archive, recompute balances
 * over the canonical tables, persist them. Returns per-account detail for
 * the conversion report. Any failure (unanchored account, unresolvable
 * payment leg, negative credit card, vanished row) aborts BEFORE a partial
 * write: backfill and apply are separate transactions and compute runs
 * between them.
 */
export const runBalancesStep = async (
  pool: DbPool,
  opts: BalancesStepOptions = {},
): Promise<BalancesStepResult> => {
  const schema = opts.schema ?? 'public';
  const startedAt = Date.now();
  const env = opts.env ?? process.env;
  if (env.NODE_ENV !== 'production') {
    await requireTestDatabase(pool, 'canonical-converter-balances');
  }
  const backfilled = await backfillInitialBalances(pool, opts);
  // FINDING-1: legacy card purchases may link via
  // `card_purchases.transaction_id` while the transaction row carries no
  // `statement_id` (V032/V033 normalization). Resolve those links BEFORE
  // reading the ledger, so statement-linked purchases are excluded from
  // the balance exactly like the canonical write path excludes them.
  await resolveStatementLinks(pool, opts);
  const state = await readCanonicalState(pool, schema, opts.householdId);
  const computed = computeCanonicalBalances(state.accounts, state.transactions);
  const applied = await applyBalances(pool, schema, computed, state.storedBeforeByAccount);
  const households = [...new Set(applied.map((r) => r.householdId))].sort();
  return { households, backfilled, applied, durationMs: Date.now() - startedAt };
};

export type BalanceMismatch = {
  accountId: string;
  householdId: string;
  stored: bigint;
  expected: bigint;
};

export type BalancesVerification = {
  checked: number;
  mismatched: BalanceMismatch[];
};

/**
 * M4 read-only counterpart of `runBalancesStep`: recomputes balances from
 * anchor + ledger and compares against stored values WITHOUT writing.
 * Used as the post-step proof inside the completion report and as the
 * balances leg of the rerun no-op verification (`stored == anchor+ledger`).
 * Any mismatch (or an uncomputable ledger) fails closed via throw.
 */
export const verifyBalances = async (
  pool: DbPool,
  opts: BalancesStepOptions = {},
): Promise<BalancesVerification> => {
  const schema = opts.schema ?? 'public';
  const env = opts.env ?? process.env;
  if (env.NODE_ENV !== 'production') {
    await requireTestDatabase(pool, 'canonical-converter-balances-verify');
  }
  const state = await readCanonicalState(pool, schema, opts.householdId);
  const computed = computeCanonicalBalances(state.accounts, state.transactions);
  const mismatched: BalanceMismatch[] = [];
  for (const row of computed) {
    const stored = state.storedBeforeByAccount.get(row.accountId) ?? 0n;
    if (stored !== row.computed) {
      mismatched.push({ accountId: row.accountId, householdId: row.householdId, stored, expected: row.computed });
    }
  }
  return { checked: computed.length, mismatched };
};

/* ------------------------------------------------------------------ */
/* FINDING-1: statement-link resolution (pre-balances step).            */
/*                                                                     */
/* Legacy card-purchase expenses may carry NO `statement_id` on the    */
/* transaction row itself: the link lives in                           */
/* `card_purchases.transaction_id -> card_purchases.statement_id`      */
/* (V032/V033 normalization). The M2 mapper copies `statement_id`      */
/* as-is, so without this step such a purchase would be debited from   */
/* the account balance while the canonical write path                  */
/* (`cards/postgres.ts` createCardPurchaseInTx) never touches          */
/* `accounts.balance_cents` for statement-linked purchases.            */
/*                                                                     */
/* `resolveStatementLinks` backfills the canonical `transactions`      */
/* `statement_id` from the archived links, fail-closed when the        */
/* archive is incoherent: an orphan purchase (`transaction_id` with    */
/* no transaction), a transaction flagged `is_credit_card_purchase`    */
/* with no purchase row, or a purchase pointing at a missing           */
/* statement. Runs inside `runBalancesStep` before the ledger is       */
/* read; `verifyBalances` stays read-only and runs after it.           */
/* ------------------------------------------------------------------ */

export type StatementLinkResult = {
  /** Canonical transaction rows backfilled with the archived statement link. */
  backfilled: number;
  /** Archived card-purchase links examined. */
  checked: number;
};

const tableExists = async (pool: DbPool, schema: string, table: string): Promise<boolean> => {
  const res = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS ok`,
    [schema, table],
  );
  return (res.rows[0] as Row | undefined)?.ok === true;
};

const archiveColumnExists = async (pool: DbPool, schema: string, table: string, column: string): Promise<boolean> => {
  const res = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AS ok`,
    [schema, table, column],
  );
  return (res.rows[0] as Row | undefined)?.ok === true;
};

export const resolveStatementLinks = async (
  pool: DbPool,
  opts: BalancesStepOptions = {},
): Promise<StatementLinkResult> => {
  const schema = opts.schema ?? 'public';
  const archiveSchema = opts.archiveSchema ?? ARCHIVE_SCHEMA;
  // REVIEW-R2-H: no early return when the archive `card_purchases` table is
  // absent. A transaction flagged `is_credit_card_purchase` with no purchase
  // table to resolve it must still fail closed below — otherwise it would be
  // silently debited as a plain expense. An absent table with no flagged
  // rows keeps the old quiet `{ backfilled: 0, checked: 0 }` result.
  const archivePurchasesExist = await tableExists(pool, archiveSchema, 'card_purchases');

  const params: unknown[] = [];
  // Pre-V032 archives may carry card_purchases without household_id: only
  // scope when the column exists (the link checks below are global then,
  // still fail-closed on orphans and missing statements).
  const purchasesHaveHousehold = archivePurchasesExist &&
    (opts.householdId === undefined ||
      (await archiveColumnExists(pool, archiveSchema, 'card_purchases', 'household_id')));
  const householdScope = (column: string): string => {
    if (opts.householdId === undefined || !purchasesHaveHousehold) return '';
    params.push(opts.householdId);
    return ` AND ${column} = $${params.length}`;
  };

  const purchasesRes = archivePurchasesExist
    ? await pool.query(
      `SELECT transaction_id, statement_id${purchasesHaveHousehold ? ', household_id' : ''} FROM ${quoteIdent(archiveSchema)}.${quoteIdent('card_purchases')} WHERE transaction_id IS NOT NULL${householdScope('household_id')}`,
      params,
    )
    : { rows: [] as Row[] };
  const purchases = (purchasesRes.rows as Row[]).map((r) => ({
    transactionId: String(r['transaction_id']),
    statementId: r['statement_id'] === null || r['statement_id'] === undefined ? null : String(r['statement_id']),
    householdId: String(r['household_id'] ?? ''),
  }));
  // NOTE: no early return on an empty purchase list — a transaction flagged
  // `is_credit_card_purchase` with no purchase row must still fail closed
  // below instead of silently debiting as a plain expense.

  const txParams: unknown[] = [];
  const txScope = opts.householdId === undefined
    ? ''
    : (() => {
      txParams.push(opts.householdId);
      return ` AND household_id = $1`;
    })();
  const archivedTxIds = new Set<string>();
  if (await tableExists(pool, archiveSchema, 'transactions')) {
    const txRes = await pool.query(
      `SELECT id FROM ${quoteIdent(archiveSchema)}.${quoteIdent('transactions')} WHERE deleted_at IS NULL${txScope}`,
      txParams,
    );
    const txRows = txRes.rows as Row[];
    for (const r of txRows) archivedTxIds.add(String(r['id']));
  }
  for (const purchase of purchases) {
    if (!archivedTxIds.has(purchase.transactionId)) {
      throw new BalanceError(
        `orphan card purchase links transaction '${purchase.transactionId}' with no archived transaction: refusing to guess its statement`,
      );
    }
  }

  if (await archiveColumnExists(pool, archiveSchema, 'transactions', 'is_credit_card_purchase')) {
    const flaggedRes = await pool.query(
      `SELECT id FROM ${quoteIdent(archiveSchema)}.${quoteIdent('transactions')} WHERE is_credit_card_purchase = true AND deleted_at IS NULL${txScope}`,
      txParams,
    );
    const flaggedRows = flaggedRes.rows as Row[];
    const linked = new Set(purchases.map((p) => p.transactionId));
    for (const r of flaggedRows) {
      if (!linked.has(String(r['id']))) {
        // REVIEW-R2-H: without the archive purchase table there is no link
        // to resolve at all — say so explicitly instead of reusing the
        // missing-row message.
        throw new BalanceError(
          archivePurchasesExist
            ? `transaction '${String(r['id'])}' is flagged is_credit_card_purchase with no card_purchases row: refusing to debit it as a plain expense`
            : `transaction '${String(r['id'])}' is flagged is_credit_card_purchase but archive "${archiveSchema}.card_purchases" is missing: cannot resolve its statement link, refusing to debit it as a plain expense`,
        );
      }
    }
  }

  const linkedStatementIds = [...new Set(purchases.map((p) => p.statementId).filter((id): id is string => id !== null))];
  if (linkedStatementIds.length > 0) {
    const stmtParams: unknown[] = [];
    const stmtScope = opts.householdId === undefined
      ? ''
      : (() => {
        stmtParams.push(opts.householdId);
        return ` AND household_id = $1`;
      })();
    const stmtRows = await tableExists(pool, archiveSchema, 'statements')
      ? (
        (
          await pool.query(
            `SELECT id FROM ${quoteIdent(archiveSchema)}.${quoteIdent('statements')}${stmtScope ? ` WHERE 1 = 1${stmtScope}` : ''}`,
            stmtParams,
          )
        ).rows as Row[]
      ).map((r) => String(r['id']))
      : [];
    const archivedStatements = new Set(stmtRows);
    for (const id of linkedStatementIds) {
      if (!archivedStatements.has(id)) {
        throw new BalanceError(
          `card purchase points at missing statement '${id}': refusing to link it`,
        );
      }
    }
  }

  if (!(await tableExists(pool, schema, 'card_purchases'))) return { backfilled: 0, checked: purchases.length };
  if (purchases.length === 0) return { backfilled: 0, checked: 0 };
  // REVIEW-R2-M1: the backfill below only fills `statement_id IS NULL` rows.
  // A transaction that ALREADY carries a statement_id divergent from its
  // linked purchase row would silently survive with the wrong link (and the
  // wrong balance effect). Detect that BEFORE the update and fail closed
  // with a bounded example list plus the total count. Scope is deliberately
  // narrow — both sides non-NULL and unequal: a NULL purchase statement
  // next to a copied transaction statement is left for the orphan/flag
  // checks above, not invented here.
  const divergentParams: unknown[] = [];
  const divergentScope = opts.householdId === undefined
    ? ''
    : (() => {
      divergentParams.push(opts.householdId);
      return ` AND t.household_id = $1`;
    })();
  const divergentCount = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ${quoteIdent(schema)}.${quoteIdent('transactions')} AS t
        JOIN ${quoteIdent(schema)}.${quoteIdent('card_purchases')} AS cp
          ON cp.transaction_id = t.id AND cp.household_id = t.household_id
       WHERE t.statement_id IS NOT NULL AND cp.statement_id IS NOT NULL
         AND t.statement_id <> cp.statement_id AND t.deleted_at IS NULL${divergentScope}`,
    divergentParams,
  );
  const divergentTotal = Number((divergentCount.rows as Row[])[0]?.n ?? 0);
  if (divergentTotal > 0) {
    const divergentExamples = await pool.query(
      `SELECT t.id AS id, t.statement_id AS current_statement_id, cp.statement_id AS linked_statement_id
          FROM ${quoteIdent(schema)}.${quoteIdent('transactions')} AS t
          JOIN ${quoteIdent(schema)}.${quoteIdent('card_purchases')} AS cp
            ON cp.transaction_id = t.id AND cp.household_id = t.household_id
         WHERE t.statement_id IS NOT NULL AND cp.statement_id IS NOT NULL
           AND t.statement_id <> cp.statement_id AND t.deleted_at IS NULL${divergentScope}
         ORDER BY t.id LIMIT 5`,
      divergentParams,
    );
    const examples = (divergentExamples.rows as Row[])
      .map((r) => `'${String(r['id'])}' holds '${String(r['current_statement_id'])}' but purchase links '${String(r['linked_statement_id'])}'`)
      .join('; ');
    throw new BalanceError(
      `${divergentTotal} transaction(s) already carry a statement_id divergent from the linked card_purchases row (e.g. ${examples}): refusing to silently keep the pre-existing link`,
    );
  }
  const backParams: unknown[] = [];
  const backScope = opts.householdId === undefined
    ? ''
    : (() => {
      backParams.push(opts.householdId);
      return ` AND t.household_id = $1`;
    })();
  const backfilled = await pool.query(
    `UPDATE ${quoteIdent(schema)}.${quoteIdent('transactions')} AS t
        SET statement_id = cp.statement_id
       FROM ${quoteIdent(schema)}.${quoteIdent('card_purchases')} AS cp
      WHERE cp.transaction_id = t.id AND cp.household_id = t.household_id
        AND t.statement_id IS NULL AND cp.statement_id IS NOT NULL AND t.deleted_at IS NULL${backScope}`,
    backParams,
  );
  return { backfilled: backfilled.rowCount ?? 0, checked: purchases.length };
};
