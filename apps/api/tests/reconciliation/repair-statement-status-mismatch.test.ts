import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_TARGET_COUNT,
  REPAIR_VERSION,
  applyRepair,
  assertValidRepairTargets,
  createRepairPool,
  dryRunRepair,
  main,
  parseRepairArgs,
  resolveRepairConnectionString,
} from "../../src/scripts/reconciliation/repair-statement-status-mismatch.js";
import type {
  RepairClient,
  RepairPool,
  RepairQueryResult,
} from "../../src/scripts/reconciliation/repair-statement-status-mismatch.js";

type RowState = { status: string; paidCents: number };

const makeFakePool = (initial: Record<string, RowState>) => {
  const states = new Map<string, RowState>(
    Object.entries(initial).map(([id, s]) => [id, { ...s }]),
  );
  const queries: string[] = [];
  let writes = 0;
  let commits = 0;
  let rollbacks = 0;

  const runQuery = (text: string, values?: unknown[]): RepairQueryResult => {
    queries.push(text);
    const normalized = text.trim().toUpperCase();
    if (normalized === "BEGIN" || normalized === "COMMIT") {
      if (normalized === "COMMIT") commits += 1;
      return { rows: [], rowCount: 0 };
    }
    if (normalized === "ROLLBACK") {
      rollbacks += 1;
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("SELECT")) {
      const ids = (values?.[0] as string[]) ?? [];
      return {
        rows: ids
          .filter((id) => states.has(id))
          .map((id) => ({
            id,
            status: states.get(id)!.status,
            paid_cents: states.get(id)!.paidCents,
          })),
      };
    }
    if (normalized.startsWith("UPDATE")) {
      // Guarded UPDATE: only paid-with-zero-paid rows transition.
      expect(text).toMatch(/status = 'paid'/);
      expect(text).toMatch(/paid_cents = 0/);
      const ids = (values?.[0] as string[]) ?? [];
      let affected = 0;
      for (const id of ids) {
        const state = states.get(id);
        if (state && state.status === "paid" && state.paidCents === 0) {
          states.set(id, { ...state, status: "open" });
          affected += 1;
        }
      }
      writes += affected;
      return { rows: [], rowCount: affected };
    }
    throw new Error(`unexpected query: ${text}`);
  };

  const client: RepairClient = {
    query: async (text, values) => runQuery(text, values),
    release: () => undefined,
  };
  const pool: RepairPool = {
    query: async (text, values) => runQuery(text, values),
    connect: async () => client,
  };
  return {
    pool,
    queries,
    states,
    commits: () => commits,
    rollbacks: () => rollbacks,
    writes: () => writes,
  };
};

const twoIds = (): [string, string] => [randomUUID(), randomUUID()];

describe("repair-statement-status-mismatch args", () => {
  it("defaults to dry-run and requires exactly two distinct UUIDs", () => {
    const [a, b] = twoIds();
    expect(parseRepairArgs([`--statement=${a}`, `--statement=${b}`])).toEqual({
      apply: false,
      statementIds: [a, b],
    });
    expect(EXPECTED_TARGET_COUNT).toBe(2);
  });

  it("rejects zero, one, three, duplicated, or malformed target sets", () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    expect(() => parseRepairArgs([])).toThrow(/exactly 2/);
    expect(() => parseRepairArgs([`--statement=${a}`])).toThrow(/exactly 2/);
    expect(() =>
      parseRepairArgs([
        `--statement=${a}`,
        `--statement=${b}`,
        `--statement=${c}`,
      ]),
    ).toThrow(/exactly 2/);
    expect(() =>
      parseRepairArgs([`--statement=${a}`, `--statement=${a}`]),
    ).toThrow(/duplicate/);
    expect(() =>
      parseRepairArgs([`--statement=${a}`, "--statement=not-a-uuid"]),
    ).toThrow(/invalid statement id/);
    expect(() => parseRepairArgs([`--statement=${a}`, "--bogus"])).toThrow(
      /unknown argument/,
    );
  });

  it("returns help without requiring targets", () => {
    expect(parseRepairArgs(["--help"])).toEqual({ help: true });
  });
});

describe("programmatic entry-point validation (no bypass)", () => {
  const invalidSets = (): { label: string; ids: string[]; pattern: RegExp }[] => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    return [
      { label: "zero targets", ids: [], pattern: /exactly 2/ },
      { label: "one target", ids: [a], pattern: /exactly 2/ },
      { label: "three targets", ids: [a, b, c], pattern: /exactly 2/ },
      { label: "duplicated targets", ids: [a, a], pattern: /duplicate/ },
      {
        label: "malformed uuid",
        ids: [a, "not-a-uuid"],
        pattern: /invalid statement id/,
      },
    ];
  };

  it("assertValidRepairTargets accepts exactly two distinct UUIDs", () => {
    const [a, b] = [randomUUID(), randomUUID()];
    expect(() => assertValidRepairTargets([a, b])).not.toThrow();
  });

  it("dryRunRepair rejects invalid sets before touching the database", async () => {
    for (const { ids, pattern } of invalidSets()) {
      const fake = makeFakePool({});
      await expect(dryRunRepair(fake.pool, ids)).rejects.toThrow(pattern);
      expect(fake.queries).toEqual([]);
    }
  });

  it("applyRepair rejects invalid sets before opening a transaction", async () => {
    for (const { ids, pattern } of invalidSets()) {
      const fake = makeFakePool({});
      await expect(applyRepair(fake.pool, ids)).rejects.toThrow(pattern);
      expect(fake.queries).toEqual([]);
      expect(fake.commits()).toBe(0);
      expect(fake.rollbacks()).toBe(0);
    }
  });
});

describe("repair-statement-status-mismatch connection wiring", () => {
  it("prefers DATABASE_URL, falls back to DATABASE_URL_TEST, else undefined", () => {
    expect(
      resolveRepairConnectionString({
        DATABASE_URL: "postgres://primary/db",
        DATABASE_URL_TEST: "postgres://test/db",
      }),
    ).toBe("postgres://primary/db");
    expect(
      resolveRepairConnectionString({ DATABASE_URL_TEST: "postgres://test/db" }),
    ).toBe("postgres://test/db");
    expect(resolveRepairConnectionString({})).toBeUndefined();
    expect(
      resolveRepairConnectionString({ DATABASE_URL: "  " }),
    ).toBeUndefined();
  });

  it("creates and closes the owned pool without connecting (no I/O)", async () => {
    // pg.Pool is lazy: construction + end() with zero checkouts never
    // opens a socket, so this proves the open/close path with no database.
    const real = createRepairPool("postgresql://127.0.0.1:1/no-such-db", true);
    expect(real).toBeDefined();
    await expect(real.end()).resolves.toBeUndefined();
  });

  it("main() without pool or env refuses without touching a database", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const out: string[] = [];
    const err: string[] = [];
    const code = await main([`--statement=${a}`, `--statement=${b}`], {}, {
      stdout: (t: string) => out.push(t),
      stderr: (t: string) => err.push(t),
    });
    expect(code).toBe(2);
    expect(err.join("")).toMatch(/DATABASE_URL/);
  });
});

describe("repair-statement-status-mismatch dry-run", () => {
  it("reports eligibility without writing", async () => {
    const [a, b] = twoIds();
    const fake = makeFakePool({
      [a]: { status: "paid", paidCents: 0 },
      [b]: { status: "paid", paidCents: 0 },
    });
    const report = await dryRunRepair(fake.pool, [a, b]);
    expect(report.version).toBe(REPAIR_VERSION);
    expect(report.mode).toBe("dry-run");
    expect(report.updated).toBe(0);
    expect(report.results).toEqual([
      { statementId: a, eligible: true },
      { statementId: b, eligible: true },
    ]);
    expect(fake.writes()).toBe(0);
    expect(fake.commits()).toBe(0);
    expect(fake.states.get(a)?.status).toBe("paid");
    expect(fake.states.get(b)?.status).toBe("paid");
  });

  it("flags a diverged target in dry-run without writing", async () => {
    const [a, b] = twoIds();
    const fake = makeFakePool({
      [a]: { status: "paid", paidCents: 0 },
      [b]: { status: "open", paidCents: 0 },
    });
    const report = await dryRunRepair(fake.pool, [a, b]);
    expect(report.updated).toBe(0);
    expect(report.results).toEqual([
      { statementId: a, eligible: true },
      { statementId: b, eligible: false, reason: "state_diverged" },
    ]);
    expect(fake.writes()).toBe(0);
  });
});

describe("repair-statement-status-mismatch apply", () => {
  it("transitions exactly the two guarded targets in one transaction", async () => {
    const [a, b] = twoIds();
    const fake = makeFakePool({
      [a]: { status: "paid", paidCents: 0 },
      [b]: { status: "paid", paidCents: 0 },
    });
    const report = await applyRepair(fake.pool, [a, b]);
    expect(report.mode).toBe("apply");
    expect(report.updated).toBe(2);
    expect(fake.states.get(a)?.status).toBe("open");
    expect(fake.states.get(b)?.status).toBe("open");
    expect(fake.commits()).toBe(1);
    expect(fake.rollbacks()).toBe(0);
  });

  it("refuses a diverged set with rollback and no writes", async () => {
    const [a, b] = twoIds();
    const fake = makeFakePool({
      [a]: { status: "paid", paidCents: 0 },
      [b]: { status: "paid", paidCents: 1500 },
    });
    await expect(applyRepair(fake.pool, [a, b])).rejects.toThrow(
      /paid-with-zero-paid guard/,
    );
    expect(fake.writes()).toBe(0);
    expect(fake.states.get(a)?.status).toBe("paid");
    expect(fake.states.get(b)?.status).toBe("paid");
    expect(fake.commits()).toBe(0);
  });

  it("refuses a missing target with rollback and no writes", async () => {
    const [a, b] = twoIds();
    const fake = makeFakePool({ [a]: { status: "paid", paidCents: 0 } });
    await expect(applyRepair(fake.pool, [a, b])).rejects.toThrow(
      /not_found/,
    );
    expect(fake.writes()).toBe(0);
    expect(fake.states.get(a)?.status).toBe("paid");
  });

  it("is re-execution safe: a second apply fails closed with no extra writes", async () => {
    const [a, b] = twoIds();
    const fake = makeFakePool({
      [a]: { status: "paid", paidCents: 0 },
      [b]: { status: "paid", paidCents: 0 },
    });
    const first = await applyRepair(fake.pool, [a, b]);
    expect(first.updated).toBe(2);
    await expect(applyRepair(fake.pool, [a, b])).rejects.toThrow(
      /paid-with-zero-paid guard/,
    );
    expect(fake.writes()).toBe(2);
  });

  it("never reports amounts or household data", async () => {
    const [a, b] = twoIds();
    const fake = makeFakePool({
      [a]: { status: "paid", paidCents: 0 },
      [b]: { status: "paid", paidCents: 0 },
    });
    const report = await applyRepair(fake.pool, [a, b]);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/paid_cents/i);
    expect(serialized).not.toMatch(/household/i);
    expect(serialized).not.toMatch(/total_cents/i);
    expect(report).toMatchObject({
      version: REPAIR_VERSION,
      from: "paid",
      to: "open",
    });
  });

  it("main() dry-runs by default and applies only with --apply", async () => {
    const [a, b] = twoIds();
    const fake = makeFakePool({
      [a]: { status: "paid", paidCents: 0 },
      [b]: { status: "paid", paidCents: 0 },
    });
    const out: string[] = [];
    const err: string[] = [];
    const deps = {
      pool: fake.pool,
      stdout: (t: string) => out.push(t),
      stderr: (t: string) => err.push(t),
    };
    const dryCode = await main(
      [`--statement=${a}`, `--statement=${b}`],
      {},
      deps,
    );
    expect(dryCode).toBe(0);
    expect(fake.writes()).toBe(0);
    expect(fake.states.get(a)?.status).toBe("paid");
    const applyCode = await main(
      ["--apply", `--statement=${a}`, `--statement=${b}`],
      {},
      deps,
    );
    expect(applyCode).toBe(0);
    expect(fake.states.get(a)?.status).toBe("open");
    expect(err.join("")).toBe("");
    expect(out.join("")).toMatch(/"mode": "apply"/);
  });
});
