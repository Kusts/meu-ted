import pg from "pg";
import { isSelectOnly as isReconSelectOnly } from "./reconciliation/sql.js";

export const PREFLIGHT_QUERIES = {
  legacyAccounts: `SELECT COUNT(*)::int AS count FROM accounts WHERE deleted_at IS NULL`,
  orphanTransactions: `SELECT COUNT(*)::int AS count
    FROM transactions t
    LEFT JOIN accounts af ON af.id = t.from_account_id AND af.household_id = t.household_id AND af.deleted_at IS NULL
    LEFT JOIN accounts at_to ON at_to.id = t.to_account_id AND at_to.household_id = t.household_id AND at_to.deleted_at IS NULL
    WHERE t.deleted_at IS NULL AND (
      (t.kind = 'expense' AND (t.from_account_id IS NULL OR af.id IS NULL)) OR
      (t.kind = 'income' AND (t.to_account_id IS NULL OR at_to.id IS NULL)) OR
      (t.kind = 'transfer' AND (t.from_account_id IS NULL OR t.to_account_id IS NULL OR af.id IS NULL OR at_to.id IS NULL))
    )`,
  orphanCardPurchases: `SELECT COUNT(*)::int AS count
    FROM card_purchases cp
    LEFT JOIN transactions t ON t.id = cp.transaction_id AND t.household_id = cp.household_id
    WHERE cp.deleted_at IS NULL AND (cp.transaction_id IS NULL OR t.id IS NULL OR t.deleted_at IS NOT NULL)`,
  duplicateCategories: `SELECT COUNT(*)::int AS count FROM (
    SELECT household_id, kind, parent_id, lower(name)
    FROM categories
    WHERE active = true AND deleted_at IS NULL
    GROUP BY household_id, kind, parent_id, lower(name)
    HAVING COUNT(*) > 1
  ) duplicates`,
  duplicateStatements: `SELECT COUNT(*)::int AS count FROM (
    SELECT household_id, account_id, cycle_year_month
    FROM statements
    GROUP BY household_id, account_id, cycle_year_month
    HAVING COUNT(*) > 1
  ) duplicates`,
  usersMissingEmail: `SELECT COUNT(*)::int AS count FROM users WHERE email IS NULL OR btrim(email) = ''`,
  membershipsUnresolved: `SELECT COUNT(*)::int AS count
    FROM memberships m
    LEFT JOIN users u ON u.auth_user_id = m.user_id
    WHERE u.id IS NULL`,
  invitesUnresolved: `SELECT COUNT(*)::int AS count
    FROM invites i
    LEFT JOIN users u ON u.auth_user_id = i.invited_by_user_id
    WHERE i.invited_by_user_id IS NOT NULL AND u.id IS NULL`,
  unlinkedStatementPayments: `SELECT COUNT(*)::int AS count
    FROM statements s
    WHERE s.status = 'paid' AND s.paid_cents > 0`,
} as const;

export const isSelectOnly = isReconSelectOnly;

export type CanonicalConversionEvidence = {
  [K in keyof typeof PREFLIGHT_QUERIES]: number;
};

export type CanonicalConversionFinding = {
  code: string;
  blocker: boolean;
  count: number;
  repair?: never;
};

export type CanonicalConversionPreflight = {
  ready: boolean;
  findings: CanonicalConversionFinding[];
};

export const buildPostMigrationV055Gate = (evidence: {
  legacyBalanceConstraintPresent: boolean;
  cardOnlyConstraintPresent: boolean;
}): CanonicalConversionPreflight => {
  const findings: CanonicalConversionFinding[] = [];
  if (evidence.legacyBalanceConstraintPresent) {
    findings.push({ code: "v055_legacy_balance_constraint_present", blocker: true, count: 1 });
  }
  if (!evidence.cardOnlyConstraintPresent) {
    findings.push({ code: "v055_card_only_constraint_missing", blocker: true, count: 1 });
  }
  return { ready: findings.length === 0, findings };
};

export type ReadOnlyQuery = (query: string) => Promise<Array<{ count: unknown }>>;

const blocker = (code: string, count: number): CanonicalConversionFinding | null =>
  count > 0 ? { code, blocker: true, count } : null;

export const buildCanonicalConversionPreflight = (
  evidence: CanonicalConversionEvidence,
): CanonicalConversionPreflight => {
  const findings = [
    evidence.legacyAccounts > 0
      ? { code: "legacy_accounts_default_to_bank", blocker: false, count: evidence.legacyAccounts }
      : null,
    blocker("orphan_transactions", evidence.orphanTransactions),
    blocker("orphan_card_purchases", evidence.orphanCardPurchases),
    blocker("duplicate_categories", evidence.duplicateCategories),
    blocker("duplicate_statements", evidence.duplicateStatements),
    blocker("users_missing_email", evidence.usersMissingEmail),
    blocker("memberships_unresolved", evidence.membershipsUnresolved),
    blocker("invites_unresolved", evidence.invitesUnresolved),
    evidence.unlinkedStatementPayments > 0
      ? { code: "unlinked_statement_payments", blocker: false, count: evidence.unlinkedStatementPayments }
      : null,
  ].filter((finding): finding is CanonicalConversionFinding => finding !== null);

  return { ready: !findings.some((finding) => finding.blocker), findings };
};

export const runCanonicalConversionPreflight = async (
  query: ReadOnlyQuery,
): Promise<CanonicalConversionPreflight> => {
  const entries = await Promise.all(
    Object.entries(PREFLIGHT_QUERIES).map(async ([name, text]) => {
      const rows = await query(text);
      const count = Number(rows[0]?.count);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error(`canonical conversion preflight returned an invalid count for ${name}`);
      }
      return [name, count] as const;
    }),
  );
  return buildCanonicalConversionPreflight(
    Object.fromEntries(entries) as CanonicalConversionEvidence,
  );
};

export const main = async (
  env: Record<string, string | undefined>,
): Promise<number> => {
  const connectionString = env.DATABASE_URL?.trim() || env.DATABASE_URL_TEST?.trim();
  if (!connectionString) {
    process.stderr.write("canonical conversion preflight: DATABASE_URL (or DATABASE_URL_TEST) is not set\n");
    return 2;
  }
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    options: "-c default_transaction_read_only=on",
  });
  try {
    const report = await runCanonicalConversionPreflight(
      async (text) => (await pool.query(text)).rows as Array<{ count: unknown }>,
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.ready ? 0 : 1;
  } catch (error) {
    process.stderr.write(`canonical conversion preflight failed: ${(error as Error).message}\n`);
    return 2;
  } finally {
    await pool.end();
  }
};

const invokedAsCli =
  process.argv[1] !== undefined &&
  /canonical-conversion-preflight\.(ts|js)$/.test(process.argv[1]);

if (invokedAsCli) {
  void main(process.env as Record<string, string | undefined>).then((code) => {
    process.exitCode = code;
  });
}
