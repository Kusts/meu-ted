/**
 * ADR-020 repair — reopen exactly two `paid` with `paid_cents = 0` statements as `open`.
 *
 * Controlled, local, idempotent repair for the two
 * `statement_payment` / `status_mismatch` findings chosen by the owner
 * (triage `docs/reports/v4.1-reconciliation-triage.md` §4.3 items 2–3).
 *
 * Safety contract (acceptance criteria):
 * 1. Dry-run is the default: without `--apply` nothing is written.
 * 2. `--apply` requires exactly two distinct `--statement=<uuid>` targets.
 * 3. Each target only transitions when it is still `paid` AND `paid_cents = 0`.
 * 4. The update runs inside one transaction; any missing/diverged target
 *    aborts the whole repair (rollback) and is reported as a failure.
 *    Re-running after success fails closed (targets are `open` now, so the
 *    guard refuses) — no double write.
 * 5. No production data lives in this file and no amounts/households are
 *    reported: reports carry only statement ids, the `paid->open`
 *    transition label, counts, and per-target reason tags.
 *
 * This module ships code only. Execution against a database copy or
 * production is a separate, explicitly authorized step (see ADR-020).
 * When no pool is injected, the CLI connects via `DATABASE_URL`
 * (fallback `DATABASE_URL_TEST`): dry-run connects with
 * `default_transaction_read_only=on` so it can only read, and `--apply`
 * remains the sole write trigger. The owned pool always closes in `finally`.
 */

import pg from "pg";

export const REPAIR_VERSION = "adr-020-statement-status-mismatch-v1";

/** The owner authorized exactly two statements for this repair. */
export const EXPECTED_TARGET_COUNT = 2;

export const REPAIR_FROM_STATUS = "paid";
export const REPAIR_TO_STATUS = "open";

export type RepairMode = "dry-run" | "apply";

export type RepairCliOptions = {
  apply: boolean;
  statementIds: string[];
};

export type RepairTargetResult = {
  statementId: string;
  /** True when this target satisfies the `paid` + `paid_cents = 0` guard. */
  eligible: boolean;
  /** Present only when the guard fails: no values, just a reason tag. */
  reason?: "not_found" | "state_diverged";
};

export type RepairReport = {
  version: string;
  mode: RepairMode;
  from: typeof REPAIR_FROM_STATUS;
  to: typeof REPAIR_TO_STATUS;
  /** Echo of the requested targets (operator-supplied ids only). */
  targets: string[];
  /** Per-target guard outcome. Carries no amounts or household data. */
  results: RepairTargetResult[];
  /** Rows actually updated (always 0 in dry-run). */
  updated: number;
};

export type RepairQueryResult = {
  rows: Record<string, unknown>[];
  rowCount?: number;
};

export type RepairClient = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<RepairQueryResult>;
  release: () => void | Promise<void>;
};

export type RepairPool = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<RepairQueryResult>;
  connect?: () => Promise<RepairClient>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isRepairUuid = (value: string): boolean => UUID_RE.test(value);

/**
 * Single validation gate for every mutable entry point: exactly
 * {@link EXPECTED_TARGET_COUNT} distinct UUIDs. Called by the CLI parser
 * AND at the top of {@link dryRunRepair} / {@link applyRepair}, so no
 * programmatic caller can bypass it with 0/1/3/duplicated/malformed ids.
 */
export const assertValidRepairTargets = (
  statementIds: readonly string[],
): void => {
  if (statementIds.length !== EXPECTED_TARGET_COUNT) {
    throw new Error(
      `exactly ${EXPECTED_TARGET_COUNT} --statement=<uuid> targets are required (got ${statementIds.length})`,
    );
  }
  for (const id of statementIds) {
    if (!isRepairUuid(id)) throw new Error(`invalid statement id: ${id}`);
  }
  if (new Set(statementIds).size !== statementIds.length) {
    throw new Error("duplicate statement ids are not allowed");
  }
};

export const parseRepairArgs = (
  argv: string[],
): RepairCliOptions | { help: true } => {
  const opts: RepairCliOptions = { apply: false, statementIds: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--apply") {
      opts.apply = true;
      continue;
    }
    if (arg.startsWith("--statement=")) {
      const value = arg.slice("--statement=".length).trim();
      if (!value) throw new Error("empty --statement value");
      opts.statementIds.push(value);
      continue;
    }
    if (arg === "--statement") {
      const value = argv[i + 1]?.trim() ?? "";
      if (!value) throw new Error("missing value for --statement <uuid>");
      i += 1;
      opts.statementIds.push(value);
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  assertValidRepairTargets(opts.statementIds);
  return opts;
};

export const printRepairHelp = (): string =>
  [
    "repair-statement-status-mismatch — reopen exactly two paid-with-zero-paid statements as open (ADR-020)",
    "",
    "Usage (dry-run, default, no writes):",
    "  tsx src/scripts/reconciliation/repair-statement-status-mismatch.ts --statement=<uuid> --statement=<uuid>",
    "",
    "Usage (apply, guarded single transaction):",
    "  tsx src/scripts/reconciliation/repair-statement-status-mismatch.ts --apply --statement=<uuid> --statement=<uuid>",
    "",
    "Guards: exactly 2 distinct UUIDs; each target must still be status='paid' AND paid_cents=0;",
    "any missing/diverged target aborts with rollback (exit 1). Reports carry ids and counts only.",
    "Database: DATABASE_URL (fallback DATABASE_URL_TEST); dry-run connects read-only and only reads;",
    "--apply is the sole write trigger.",
    "Exit 0 on success, 1 on guard/repair failure, 2 on usage or runtime errors.",
  ].join("\n");

const SELECT_FOR_UPDATE = `SELECT id::text AS id, status, paid_cents
    FROM statements WHERE id = ANY($1) FOR UPDATE`;

const UPDATE_TO_OPEN = `UPDATE statements SET status = 'open', updated_at = NOW()
    WHERE id = ANY($1) AND status = 'paid' AND paid_cents = 0`;

type FetchedState = { id: string; status: string; paidCents: number };

const toState = (row: Record<string, unknown>): FetchedState | null => {
  if (typeof row["id"] !== "string" || typeof row["status"] !== "string") {
    return null;
  }
  const paid = Number(row["paid_cents"]);
  if (!Number.isFinite(paid)) return null;
  return { id: row["id"], status: row["status"], paidCents: paid };
};

const buildResults = (
  statementIds: string[],
  states: Map<string, FetchedState>,
): RepairTargetResult[] =>
  statementIds.map((id) => {
    const state = states.get(id);
    if (!state) return { statementId: id, eligible: false, reason: "not_found" as const };
    const eligible =
      state.status === REPAIR_FROM_STATUS && state.paidCents === 0;
    return eligible
      ? { statementId: id, eligible: true }
      : { statementId: id, eligible: false, reason: "state_diverged" as const };
  });

/**
 * Dry-run: reads current state, writes nothing. Returns the guard outcome
 * per target so the operator can confirm before `--apply`.
 */
export const dryRunRepair = async (
  pool: RepairPool,
  statementIds: string[],
): Promise<RepairReport> => {
  assertValidRepairTargets(statementIds);
  const result = await pool.query(
    `SELECT id::text AS id, status, paid_cents FROM statements WHERE id = ANY($1)`,
    [statementIds],
  );
  const states = new Map<string, FetchedState>();
  for (const row of result.rows) {
    const state = toState(row);
    if (state !== null && !states.has(state.id)) states.set(state.id, state);
  }
  const results = buildResults(statementIds, states);
  return {
    version: REPAIR_VERSION,
    mode: "dry-run",
    from: REPAIR_FROM_STATUS,
    to: REPAIR_TO_STATUS,
    targets: [...statementIds],
    results,
    updated: 0,
  };
};

/**
 * Guarded apply: exactly the two requested targets transition
 * `paid` -> `open` inside one transaction, and only while each still
 * satisfies `status = 'paid' AND paid_cents = 0`. Anything else rolls
 * back and throws (reported as a failure, exit 1 from the CLI).
 */
export const applyRepair = async (
  pool: RepairPool,
  statementIds: string[],
): Promise<RepairReport> => {
  assertValidRepairTargets(statementIds);
  if (typeof pool.connect !== "function") {
    throw new Error("apply requires a pool with connect() for transactions");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(SELECT_FOR_UPDATE, [statementIds]);
    const states = new Map<string, FetchedState>();
    for (const row of selected.rows) {
      const state = toState(row);
      if (state !== null && !states.has(state.id)) states.set(state.id, state);
    }
    const results = buildResults(statementIds, states);
    const blocked = results.filter((r) => !r.eligible);
    if (blocked.length > 0) {
      const reasons = blocked
        .map((r) => `${r.statementId}:${r.reason ?? "state_diverged"}`)
        .join(", ");
      throw new Error(
        `refusing repair: ${blocked.length} of ${statementIds.length} target(s) failed the paid-with-zero-paid guard (${reasons}); rolled back, nothing written`,
      );
    }
    const updated = await client.query(UPDATE_TO_OPEN, [statementIds]);
    const affected = updated.rowCount ?? 0;
    if (affected !== statementIds.length) {
      throw new Error(
        `refusing repair: guarded UPDATE affected ${affected} of ${statementIds.length} target(s); rolled back, nothing written`,
      );
    }
    await client.query("COMMIT");
    return {
      version: REPAIR_VERSION,
      mode: "apply",
      from: REPAIR_FROM_STATUS,
      to: REPAIR_TO_STATUS,
      targets: [...statementIds],
      results,
      updated: affected,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Best effort: the guard error below is the authoritative failure.
    }
    throw err;
  } finally {
    await client.release();
  }
};

export const formatRepairReport = (report: RepairReport): string => {
  const lines = [
    `repair ${report.version} mode=${report.mode} transition=${report.from}->${report.to} updated=${report.updated}`,
  ];
  for (const result of report.results) {
    lines.push(
      result.eligible
        ? `  [eligible] statements:${result.statementId}`
        : `  [blocked] statements:${result.statementId} reason=${result.reason ?? "state_diverged"}`,
    );
  }
  return `${lines.join("\n")}\n`;
};

/**
 * Resolve the connection string without guessing: `DATABASE_URL` first,
 * `DATABASE_URL_TEST` as fallback (same precedence as the reconciliation
 * CLI). Returns `undefined` when neither is set.
 */
export const resolveRepairConnectionString = (
  env: Record<string, string | undefined>,
): string | undefined => {
  const direct = env["DATABASE_URL"]?.trim();
  if (direct) return direct;
  const fallback = env["DATABASE_URL_TEST"]?.trim();
  return fallback || undefined;
};

/**
 * Create the owned PostgreSQL pool (same `pg.Pool` pattern as the
 * reconciliation CLI). Dry-run pools set `default_transaction_read_only`
 * so they can only read; apply pools are writable. Construction is lazy
 * (no connection until the first query); the caller must `end()` it.
 */
export const createRepairPool = (
  connectionString: string,
  readOnly: boolean,
): pg.Pool =>
  new pg.Pool({
    connectionString,
    max: 2,
    ...(readOnly ? { options: "-c default_transaction_read_only=on" } : {}),
  });

const adaptPool = (real: pg.Pool): RepairPool => {
  const runQuery = async (
    text: string,
    values?: unknown[],
  ): Promise<RepairQueryResult> => {
    const result = await real.query(text, values);
    // exactOptionalPropertyTypes: omit rowCount instead of assigning undefined.
    return result.rowCount == null
      ? { rows: result.rows as Record<string, unknown>[] }
      : {
          rows: result.rows as Record<string, unknown>[],
          rowCount: result.rowCount,
        };
  };
  return {
    query: runQuery,
    connect: async () => {
      const client = await real.connect();
      return {
        query: async (text: string, values?: unknown[]) => {
          const result = await client.query(text, values);
          return result.rowCount == null
            ? { rows: result.rows as Record<string, unknown>[] }
            : {
                rows: result.rows as Record<string, unknown>[],
                rowCount: result.rowCount,
              };
        },
        release: () => client.release(),
      };
    },
  };
};

export const main = async (
  argv: string[],
  env: Record<string, string | undefined>,
  deps: { pool?: RepairPool; stdout?: (text: string) => void; stderr?: (text: string) => void } = {},
): Promise<number> => {
  const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));
  let opts: RepairCliOptions;
  try {
    const parsed = parseRepairArgs(argv);
    if ("help" in parsed) {
      stdout(`${printRepairHelp()}\n`);
      return 0;
    }
    opts = parsed;
  } catch (err) {
    stderr(`error: ${(err as Error).message}\n${printRepairHelp()}\n`);
    return 2;
  }
  const pool = deps.pool;
  let owned: pg.Pool | undefined;
  let active = pool;
  if (!active) {
    const connectionString = resolveRepairConnectionString(env);
    if (!connectionString) {
      stderr(
        "error: DATABASE_URL (or DATABASE_URL_TEST) is not set; refusing to guess a database. Nothing to do.\n",
      );
      return 2;
    }
    // Dry-run connects read-only (can only read); --apply is the sole
    // write trigger and gets a writable pool.
    owned = createRepairPool(connectionString, !opts.apply);
    active = adaptPool(owned);
  }
  try {
    const report = opts.apply
      ? await applyRepair(active, opts.statementIds)
      : await dryRunRepair(active, opts.statementIds);
    stdout(JSON.stringify(report, null, 2));
    stdout("\n");
    const blocked = report.results.filter((r) => !r.eligible).length;
    if (opts.apply && (blocked > 0 || report.updated !== opts.statementIds.length)) {
      return 1;
    }
    return 0;
  } catch (err) {
    stderr(`repair failed: ${(err as Error).message}\n`);
    return 1;
  } finally {
    await owned?.end();
  }
};

const invokedAsCli =
  process.argv[1] !== undefined &&
  /reconciliation[/\\]repair-statement-status-mismatch\.(ts|js)$/.test(
    process.argv[1],
  );

if (invokedAsCli) {
  void main(
    process.argv.slice(2),
    process.env as Record<string, string | undefined>,
  ).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`repair failed: ${(err as Error).message}\n`);
      process.exitCode = 1;
    },
  );
}
