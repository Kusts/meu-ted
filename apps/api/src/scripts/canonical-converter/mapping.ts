/**
 * M2 canonical converter: pure row mappers (no I/O).
 *
 * Each mapper converts ONE legacy_archive row into its canonical `public`
 * shape. Mappers never touch the database: they take a plain record and
 * return `{ values, unmapped }`, where `values` holds exactly the columns
 * bound for the canonical INSERT and `unmapped` holds every legacy column
 * with no canonical destination (preserved in `legacy_archive`, reported
 * per entity by the import orchestrator — never dropped silently).
 *
 * Fail-closed mapping: incoherent rows (missing scope, missing NOT NULL
 * targets, orphan legs, range overflows) throw `MappingError` so the
 * per-entity transaction rolls back before anything is written.
 *
 * Notes per entity:
 * - accounts: `is_credit_card=true -> 'credit_card'`, anything else ->
 *   'bank'. 'cash' is NEVER inferred (ADR-024). `balance_cents` is NOT
 *   computed here (M3 owns balances): the mapper writes 0 and maps the
 *   legacy `initial_balance_cents` anchor EXACTLY (pg BIGINT arrives as a
 *   string; M4 plan + M3 backfill carry it to the V058 column). A
 *   non-integer anchor fails closed — inventing or truncating the anchor
 *   would mask a true drift.
 * - transactions: expense -> `account_id = from`; income ->
 *   `account_id = to`; transfer -> `account_id = from` plus
 *   `transfer_to_account_id = to`. `statement_payment_id` (V056/V057)
 *   stays absent/NULL.
 * - device_tokens: auth resolves by hash (`auth/device-token.ts`), so the
 *   legacy secret in `token` is NEVER copied. The canonical NOT NULL
 *   `token` column receives the non-secret placeholder
 *   `'converted:' || token_hash`; the redacted secret is reported under
 *   `unmapped.token` (field name only, never the value downstream).
 * - audit_logs: intentionally NOT mapped (stays in the archive).
 */

export type LegacyRow = Record<string, unknown>;

export type MappedRow = {
  /** Canonical-bound column values (exactly what the INSERT writes). */
  values: Record<string, unknown>;
  /** Legacy columns with no canonical destination (stay in the archive). */
  unmapped: Record<string, unknown>;
};

export class MappingError extends Error {
  readonly entity: string;
  constructor(entity: string, detail: string) {
    super(`cannot map ${entity} row: ${detail}`);
    this.name = 'MappingError';
    this.entity = entity;
  }
}

const isPresent = (value: unknown): boolean =>
  value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');

const required = (row: LegacyRow, entity: string, column: string): unknown => {
  const value = row[column];
  if (!isPresent(value)) throw new MappingError(entity, `missing required column '${column}'`);
  return value;
};

const requireScope = (row: LegacyRow, entity: string, keys: readonly string[]): void => {
  if (keys.length === 0) return;
  const ok = keys.some((key) => isPresent(row[key]));
  if (!ok) {
    throw new MappingError(entity, `missing household scope (expected one of: ${keys.join(', ')})`);
  }
};

const pickIfPresent = (row: LegacyRow, columns: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const column of columns) {
    if (row[column] !== undefined) out[column] = row[column];
  }
  return out;
};

const leftover = (row: LegacyRow, consumed: ReadonlySet<string>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    // NULL legacy cells carry no information to preserve (the archive
    // keeps them as-is); reporting them would drown the unmappedFields
    // signal in noise, so only non-null leftovers are collected.
    if (!consumed.has(key) && value !== null && value !== undefined) out[key] = value;
  }
  return out;
};

const MAX_INT32 = 2 ** 31 - 1;

const requireIntRange = (value: unknown, entity: string, column: string): number => {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isSafeInteger(num) || num < 0 || num > MAX_INT32) {
    throw new MappingError(entity, `column '${column}' out of INTEGER range`);
  }
  return num;
};

/**
 * FINDING-2: pg BIGINT money arrives as a string; routing it through
 * `number` loses precision past 2^53-1. This parses exactly to bigint,
 * range-checks against the PostgreSQL BIGINT span, and returns the
 * canonical decimal string so the import binds the exact value (never a
 * rounded float).
 */
const PG_BIGINT_MIN = -(2n ** 63n);
const PG_BIGINT_MAX = 2n ** 63n - 1n;
const MONEY_RE = /^-?\d+$/;

const requireMoney = (value: unknown, entity: string, column: string): string => {
  let text: string;
  if (typeof value === 'bigint') {
    text = value.toString();
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new MappingError(entity, `column '${column}' is not an exact integer (${String(value)})`);
    }
    text = String(value);
  } else if (typeof value === 'string' && MONEY_RE.test(value.trim())) {
    text = value.trim();
  } else {
    throw new MappingError(entity, `column '${column}' is not an exact integer (${String(value)})`);
  }
  const parsed = BigInt(text);
  if (parsed < PG_BIGINT_MIN || parsed > PG_BIGINT_MAX) {
    throw new MappingError(entity, `column '${column}' exceeds the PostgreSQL BIGINT range`);
  }
  return parsed.toString();
};

export const mapAccountRow = (row: LegacyRow): MappedRow => {
  const entity = 'accounts';
  const id = required(row, entity, 'id');
  const householdId = required(row, entity, 'household_id');
  const name = required(row, entity, 'name');
  const initial = row['initial_balance_cents'];
  let initialBalanceCents = '0';
  if (initial !== null && initial !== undefined) {
    // FINDING-2: exact anchor, never a rounded float (see requireMoney).
    initialBalanceCents = requireMoney(initial, entity, 'initial_balance_cents');
  }
  const consumed = new Set([
    'id',
    'household_id',
    'name',
    'is_credit_card',
    'active',
    'initial_balance_cents',
  ]);
  const values: Record<string, unknown> = {
    id,
    household_id: householdId,
    name,
    kind: row['is_credit_card'] === true ? 'credit_card' : 'bank',
    balance_cents: 0,
    initial_balance_cents: initialBalanceCents,
    status: row['active'] === false ? 'inactive' : 'active',
    ...pickIfPresent(row, ['credit_limit_cents', 'closing_day', 'due_day', 'created_at', 'updated_at', 'deleted_at']),
  };
  return { values, unmapped: leftover(row, consumed) };
};

export const mapCategoryRow = (row: LegacyRow): MappedRow => {
  const entity = 'categories';
  const consumed = new Set([
    'id',
    'household_id',
    'name',
    'kind',
    'active',
    'parent_id',
    'icon',
    'color',
    'sort_order',
    'is_default',
    'is_system',
    'created_at',
    'updated_at',
    'deleted_at',
  ]);
  const values: Record<string, unknown> = {
    id: required(row, entity, 'id'),
    household_id: required(row, entity, 'household_id'),
    name: required(row, entity, 'name'),
    kind: required(row, entity, 'kind'),
    status: row['active'] === false ? 'inactive' : 'active',
    ...pickIfPresent(row, [
      'parent_id',
      'icon',
      'color',
      'sort_order',
      'is_default',
      'is_system',
      'created_at',
      'updated_at',
      'deleted_at',
    ]),
  };
  return { values, unmapped: leftover(row, consumed) };
};

const TRANSACTION_KINDS = new Set(['expense', 'income', 'transfer']);

export const mapTransactionRow = (row: LegacyRow): MappedRow => {
  const entity = 'transactions';
  const kind = required(row, entity, 'kind');
  if (typeof kind !== 'string' || !TRANSACTION_KINDS.has(kind)) {
    throw new MappingError(entity, `unknown kind '${String(kind)}'`);
  }
  const from = row['from_account_id'];
  const to = row['to_account_id'];
  // FINDING-2: normalize pg BIGINT money to the exact decimal string.
  const amountCents = requireMoney(required(row, entity, 'amount_cents'), entity, 'amount_cents');
  const values: Record<string, unknown> = {
    id: required(row, entity, 'id'),
    household_id: required(row, entity, 'household_id'),
    kind,
    description: required(row, entity, 'description'),
    amount_cents: amountCents,
    date: required(row, entity, 'date'),
  };
  if (kind === 'expense') {
    if (!isPresent(from)) throw new MappingError(entity, 'expense without from_account_id');
    if (isPresent(to)) throw new MappingError(entity, 'expense with unexpected to_account_id');
    values['account_id'] = from;
  } else if (kind === 'income') {
    if (!isPresent(to)) throw new MappingError(entity, 'income without to_account_id');
    if (isPresent(from)) throw new MappingError(entity, 'income with unexpected from_account_id');
    values['account_id'] = to;
  } else {
    if (!isPresent(from) || !isPresent(to)) {
      throw new MappingError(entity, 'transfer without both account legs');
    }
    if (from === to) throw new MappingError(entity, 'transfer with identical account legs');
    if (isPresent(row['category_id'])) {
      throw new MappingError(entity, 'transfer with unexpected category_id');
    }
    values['account_id'] = from;
    values['transfer_to_account_id'] = to;
  }
  Object.assign(
    values,
    pickIfPresent(row, [
      'category_id',
      'subcategory_id',
      'notes',
      // NOTE: legacy `is_credit_card_purchase` has NO canonical
      // transactions column (card charges live in card_purchases); it is
      // intentionally left out of `values` so it lands in `unmapped`
      // (preserved in the archive, reported per entity) instead of
      // failing the canonical INSERT.
      'statement_id',
      'installments_total',
      'installment_number',
      'created_at',
      'updated_at',
      'deleted_at',
    ]),
  );
  // statement_payment_id (V056/V057) is canonical-only and stays NULL here.
  const consumed = new Set([
    ...Object.keys(values),
    'from_account_id',
    'to_account_id',
    'statement_payment_id',
  ]);
  return { values, unmapped: leftover(row, consumed) };
};

export const mapCardPurchaseRow = (row: LegacyRow): MappedRow => {
  const entity = 'card_purchases';
  const values: Record<string, unknown> = {
    id: required(row, entity, 'id'),
    household_id: required(row, entity, 'household_id'),
  };
  const rawTotal = row['installments_total'] ?? row['installments'];
  if (rawTotal !== null && rawTotal !== undefined) {
    values['installments_total'] = requireIntRange(rawTotal, entity, 'installments_total');
  }
  if (row['installment_number'] !== null && row['installment_number'] !== undefined) {
    values['installment_number'] = requireIntRange(row['installment_number'], entity, 'installment_number');
  }
  Object.assign(
    values,
    pickIfPresent(row, [
      'account_id',
      'statement_id',
      'description',
      'amount_cents',
      'date',
      'category_id',
      'subcategory_id',
      'notes',
      'is_recurring',
      'transaction_id',
      'created_at',
      'updated_at',
      'deleted_at',
    ]),
  );
  // `installments` is the legacy alias consumed into installments_total;
  // `source_message_id` has no canonical destination (stays in the archive).
  // FINDING-2: exact money for the purchase amount when present.
  if (values['amount_cents'] !== undefined && values['amount_cents'] !== null) {
    values['amount_cents'] = requireMoney(values['amount_cents'], entity, 'amount_cents');
  }
  const consumed = new Set([...Object.keys(values), 'installments']);
  return { values, unmapped: leftover(row, consumed) };
};

export const CONVERTED_TOKEN_PREFIX = 'converted:';

export const mapDeviceTokenRow = (row: LegacyRow): MappedRow => {
  const entity = 'device_tokens';
  const tokenHash = required(row, entity, 'token_hash');
  if (typeof tokenHash !== 'string' || tokenHash.trim() === '') {
    throw new MappingError(entity, 'empty token_hash');
  }
  const values: Record<string, unknown> = {
    token: `${CONVERTED_TOKEN_PREFIX}${tokenHash}`,
    token_hash: tokenHash,
    device_id: required(row, entity, 'device_id'),
    household_id: required(row, entity, 'household_id'),
    ...pickIfPresent(row, [
      'created_at',
      'revoked_at',
      'user_id',
      'name',
      'last_used_at',
      'expires_at',
      'legacy',
    ]),
  };
  const unmapped = leftover(row, new Set([...Object.keys(values), 'token']));
  // The legacy secret never leaves the archive: report the field name with
  // a redacted marker instead of the value.
  if ('token' in row) unmapped['token'] = '[redacted-legacy-secret]';
  return { values, unmapped };
};

export type CopyThroughOptions = {
  entity: string;
  /** Canonical columns accepted into `values`; anything else is unmapped. */
  targetColumns: readonly string[];
  /** Scope keys of which at least one must be present (default household). */
  scopeKeys?: readonly string[] | undefined;
};

export const mapCopyThroughRow = (row: LegacyRow, opts: CopyThroughOptions): MappedRow => {
  requireScope(row, opts.entity, opts.scopeKeys ?? ['household_id']);
  const allowed = new Set(opts.targetColumns);
  const values: Record<string, unknown> = {};
  for (const column of opts.targetColumns) {
    // NULL legacy cells are omitted rather than written: nullable
    // canonical columns land NULL either way, while defaulted columns
    // (status, kind, timestamps) keep their canonical defaults instead
    // of tripping NOT NULL with an explicit NULL.
    if (row[column] !== undefined && row[column] !== null) values[column] = row[column];
  }
  return { values, unmapped: leftover(row, allowed) };
};

export type IdentityResolution = {
  /** application users.id values already in UUID form. */
  userIds: ReadonlySet<string>;
  /** Better-Auth id -> application users.id (from the archived users). */
  userIdByAuthId: ReadonlyMap<string, string>;
};

const resolveAppUserId = (raw: unknown, entity: string, ctx: IdentityResolution): string => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new MappingError(entity, 'missing user reference');
  }
  if (ctx.userIds.has(raw)) return raw;
  const resolved = ctx.userIdByAuthId.get(raw);
  if (!resolved) throw new MappingError(entity, `unresolved user reference '${raw}'`);
  return resolved;
};

const resolveOptionalAppUserId = (
  raw: unknown,
  entity: string,
  ctx: IdentityResolution,
): string | undefined => {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'string' && raw.trim() === '') return undefined;
  return resolveAppUserId(raw, entity, ctx);
};

export const mapMembershipRow = (row: LegacyRow, ctx: IdentityResolution): MappedRow => {
  const entity = 'memberships';
  const values: Record<string, unknown> = {
    user_id: resolveAppUserId(row['user_id'], entity, ctx),
    household_id: required(row, entity, 'household_id'),
    role: required(row, entity, 'role'),
    ...pickIfPresent(row, ['status', 'kind', 'created_at']),
  };
  // Same IDs, no synthesized owner/membership rows: the legacy surrogate
  // `id` has no canonical destination (the PK is user_id + household_id).
  const consumed = new Set([...Object.keys(values), 'id']);
  return { values, unmapped: leftover(row, consumed) };
};

export const mapInviteRow = (row: LegacyRow, ctx: IdentityResolution): MappedRow => {
  const entity = 'invites';
  const email = required(row, entity, 'email');
  if (typeof email !== 'string' || email.trim() === '') {
    throw new MappingError(entity, 'empty email');
  }
  const values: Record<string, unknown> = {
    id: required(row, entity, 'id'),
    household_id: required(row, entity, 'household_id'),
    email,
    email_normalized:
      typeof row['email_normalized'] === 'string' && row['email_normalized'].trim() !== ''
        ? row['email_normalized']
        : email.trim().toLowerCase(),
    role: required(row, entity, 'role'),
    token_hash: required(row, entity, 'token_hash'),
    expires_at: required(row, entity, 'expires_at'),
    ...pickIfPresent(row, ['created_at', 'revoked_at']),
  };
  // V017-era rows carry `accepted_at`; the canonical column is consumed_at.
  const consumedAt = row['consumed_at'] ?? row['accepted_at'];
  if (consumedAt !== null && consumedAt !== undefined) values['consumed_at'] = consumedAt;
  const invitedBy = resolveOptionalAppUserId(row['invited_by'] ?? row['invited_by_user_id'], entity, ctx);
  if (invitedBy !== undefined) values['invited_by'] = invitedBy;
  const consumed = new Set([...Object.keys(values), 'accepted_at', 'invited_by_user_id']);
  return { values, unmapped: leftover(row, consumed) };
};

export const mapUserRow = (row: LegacyRow): MappedRow => {
  const entity = 'users';
  const values: Record<string, unknown> = {
    id: required(row, entity, 'id'),
    email: required(row, entity, 'email'),
    name: required(row, entity, 'name'),
    ...pickIfPresent(row, ['auth_user_id', 'status', 'phone', 'created_at']),
  };
  return { values, unmapped: leftover(row, new Set(Object.keys(values))) };
};
