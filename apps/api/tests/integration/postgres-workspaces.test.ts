import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool.js";
import { createPostgresWorkspaceStore } from "../../src/auth/workspaces-postgres.js";
import { WorkspaceError } from "../../src/auth/workspaces-http.js";

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

describe("Postgres workspace store integration", () => {
  beforeAll(() => {
    if (DB_URL) pool = createPool({ connectionString: DB_URL, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  const seedUser = async (client: Pool, authUserId: string, email: string, name = "Integration User") => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO users (auth_user_id, email, name, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [authUserId, email, name],
    );
    return result.rows[0]!.id;
  };

  itIfDatabase(
    "lists, creates shared and personal workspaces, manages members and leave",
    async () => {
      if (!pool) throw new Error("database pool not initialized");
      const store = createPostgresWorkspaceStore(pool);

      const authUser = `auth-${randomUUID()}`;
      const userEmail = `ws-${randomUUID()}@example.com`;
      const userId = await seedUser(pool, authUser, userEmail);

      // Empty list
      const empty = await store.list(authUser);
      expect(empty).toEqual([]);

      // Create shared workspace
      const shared = await store.create({ authUserId: authUser, name: "Casa", kind: "shared" });
      expect(shared.kind).toBe("shared");
      expect(shared.role).toBe("owner");

      // Create personal workspace (owner membership via V021 trigger)
      const personal = await store.create({ authUserId: authUser, name: "Só eu", kind: "personal" });
      expect(personal.kind).toBe("personal");

      // List returns both (personal first)
      const list = await store.list(authUser);
      expect(list.map((w) => w.id).sort()).toEqual([shared.id, personal.id].sort());
      expect(list.find((w) => w.id === personal.id)!.role).toBe("owner");

      // Members includes owner
      const members = await store.listMembers({ authUserId: authUser, householdId: shared.id });
      expect(members.some((m) => m.userId === userId && m.role === "owner")).toBe(true);

      // Add a second member via SQL, then owner can remove
      const member2Auth = `auth-${randomUUID()}`;
      const member2Id = await seedUser(pool, member2Auth, `ws-${randomUUID()}@example.com`);
      await pool.query(
        `INSERT INTO memberships (household_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')`,
        [shared.id, member2Id],
      );

      await store.removeMember({ authUserId: authUser, householdId: shared.id, memberUserId: member2Id });
      const afterRemove = await store.listMembers({ authUserId: authUser, householdId: shared.id });
      expect(afterRemove.some((m) => m.userId === member2Id)).toBe(false);

      // Member cannot remove others
      await pool.query(
        `INSERT INTO memberships (household_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')`,
        [shared.id, member2Id],
      );
      await expect(
        store.removeMember({ authUserId: member2Auth, householdId: shared.id, memberUserId: userId }),
      ).rejects.toThrow(WorkspaceError);

      // Owner cannot leave last-owner shared workspace
      await pool.query(
        `DELETE FROM memberships WHERE household_id = $1 AND user_id = $2`,
        [shared.id, member2Id],
      );
      await expect(
        store.leave({ authUserId: authUser, householdId: shared.id }),
      ).rejects.toThrow(WorkspaceError);

      // Personal owner cannot leave personal workspace
      await expect(
        store.leave({ authUserId: authUser, householdId: personal.id }),
      ).rejects.toThrow(WorkspaceError);

      // Cleanup
      await pool.query(`DELETE FROM households WHERE id = ANY($1::uuid[])`, [[shared.id, personal.id]]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userId, member2Id]]);
    },
  );
});