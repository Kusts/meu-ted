import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool.js";
import { createPostgresPhoneWorkspaceStore } from "../../src/auth/phone-workspace-postgres.js";

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

describe("Postgres phone workspace identity resolution integration", () => {
  beforeAll(() => {
    if (DB_URL) pool = createPool({ connectionString: DB_URL, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  itIfDatabase(
    "binds and resolves phone numbers to users and workspaces in PostgreSQL",
    async () => {
      if (!pool) throw new Error("database pool not initialized");
      const store = createPostgresPhoneWorkspaceStore(pool);

      const userId = randomUUID();
      const workspaceId = randomUUID();
      const phone = "5511999998888";

      // Seed household, user, and membership
      // Seed user (owner), household, and membership
      await pool.query(
        `INSERT INTO users (id, email, name, status) VALUES ($1, $2, 'Integration User', 'active') ON CONFLICT DO NOTHING`,
        [userId, `integration-${userId}@example.com`],
      );
      await pool.query(
        `INSERT INTO households (id, name, kind, owner_user_id) VALUES ($1, 'Integration Household', 'shared', $2) ON CONFLICT DO NOTHING`,
        [workspaceId, userId],
      );
      await pool.query(
        `INSERT INTO memberships (household_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active') ON CONFLICT DO NOTHING`,
        [workspaceId, userId],
      );

      try {
        await store.bindPhone({
          phone: "+55 (11) 99999-8888",
          userId,
          workspaceId,
        });

        const res = await store.resolvePhone("5511999998888");
        expect(res.userId).toBe(userId);
        expect(res.workspaceId).toBe(workspaceId);
        expect(res.role).toBe("owner");
        expect(res.userName).toBe("Integration User");

        // Unbind phone
        await store.unbindPhone(phone);
        await expect(store.resolvePhone(phone)).rejects.toThrow();
      } finally {
        // Shared workspaces must retain >=1 owner, so fixture teardown
        // downgrades to replica to neutralise the owner-guard trigger.
        await pool.query(`SET session_replication_role = replica`);
        await pool.query(`DELETE FROM user_phone_bindings WHERE phone = $1`, [phone]);
        await pool.query(`DELETE FROM memberships WHERE household_id = $1`, [workspaceId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
        await pool.query(`DELETE FROM households WHERE id = $1`, [workspaceId]);
        await pool.query(`SET session_replication_role = origin`);
      }
    },
  );
});
