import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool.js";
import { createPostgresShadowDivergenceStore } from "../../src/observability/shadow-divergence-postgres.js";

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

const VALID_HASH_A = "a".repeat(64);
const VALID_HASH_B = "b".repeat(64);
const VALID_HASH_C = "c".repeat(64);

describe("Postgres shadow divergence integration", () => {
  beforeAll(() => {
    if (DB_URL) pool = createPool({ connectionString: DB_URL, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  itIfDatabase(
    "persists shadow divergence events and computes aggregated summaries per workspace",
    async () => {
      if (!pool) throw new Error("database pool not initialized");
      const store = createPostgresShadowDivergenceStore(pool);
      const workspaceId = randomUUID();

      // Create dummy household if needed by foreign key
      // Create owner user and dummy household if needed by foreign key
      await pool.query(
        `INSERT INTO users (id, email, name, status) VALUES ($1, 'shadow-owner-' || $2 || '@example.test', 'Shadow Owner', 'active') ON CONFLICT DO NOTHING`,
        [workspaceId, workspaceId],
      );
      await pool.query(
        `INSERT INTO households (id, name, kind, owner_user_id) VALUES ($1, 'Shadow Test Workspace', 'shared', $2) ON CONFLICT DO NOTHING`,
        [workspaceId, workspaceId],
      );

      try {
        await store.recordEvent({
          workspaceId,
          capability: "list_accounts",
          outcome: "match",
          requestHash: VALID_HASH_A,
          apiHash: VALID_HASH_B,
          legacyHash: VALID_HASH_B,
          durationMs: 30,
        });

        await store.recordEvent({
          workspaceId,
          capability: "list_accounts",
          outcome: "divergence",
          requestHash: VALID_HASH_A,
          apiHash: VALID_HASH_B,
          legacyHash: VALID_HASH_C,
          durationMs: 45,
        });

        await store.recordEvent({
          workspaceId,
          capability: "get_balance",
          outcome: "legacy_error",
          requestHash: VALID_HASH_A,
          error: "Connection timeout",
          durationMs: 120,
        });

        const summaries = await store.getSummary(workspaceId);
        expect(summaries).toHaveLength(2);

        const listAccounts = summaries.find((s) => s.capability === "list_accounts")!;
        expect(listAccounts.totalRuns).toBe(2);
        expect(listAccounts.matches).toBe(1);
        expect(listAccounts.divergences).toBe(1);
        expect(listAccounts.divergenceRate).toBe(0.5);

        const getBalance = summaries.find((s) => s.capability === "get_balance")!;
        expect(getBalance.totalRuns).toBe(1);
        expect(getBalance.legacyErrors).toBe(1);

        const events = await store.listEvents(workspaceId, { limit: 10 });
        expect(events).toHaveLength(3);
        expect(events[0]?.workspaceId).toBe(workspaceId);
      } finally {
        // Shared workspaces must retain >=1 owner, so fixture teardown
        // downgrades to replica to neutralise the owner-guard trigger.
        await pool.query(`SET session_replication_role = replica`);
        await pool.query(`DELETE FROM shadow_divergence_events WHERE workspace_id = $1`, [workspaceId]);
        await pool.query(`DELETE FROM households WHERE id = $1`, [workspaceId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [workspaceId]);
        await pool.query(`SET session_replication_role = origin`);
      }
    },
  );
});
