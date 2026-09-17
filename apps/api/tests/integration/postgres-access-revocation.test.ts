import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool.js";
import { createPostgresWorkspaceStore } from "../../src/auth/workspaces-postgres.js";
import { createPostgresDeviceTokenStore, hashDeviceToken } from "../../src/auth/device-token.js";
import { createPostgresPushSubscriptionStore } from "../../src/push/postgres.js";
import { createPostgresWorkspaceAccessStore } from "../../src/auth/workspace-access.js";
import { createPostgresOwnershipTransferStore } from "../../src/auth/ownership-transfers-postgres.js";
import { resolveAuthorizedDevice } from "../../src/auth/device-access.js";

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log(
    "[postgres-access-revocation] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER are required — " +
      "revocation lifecycle is only meaningful against real PostgreSQL, so every scenario below is skipped.",
  );
}

let pool: Pool | undefined;
const seedUser = async (db: Pool, authUserId: string): Promise<string> => {
  const email = `rev-${randomUUID()}@example.com`;
  await db.query(`INSERT INTO "user" (id, name, email, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`, [
    authUserId,
    "Revocation User",
    email,
  ]);
  const result = await db.query<{ id: string }>(
    `INSERT INTO users (auth_user_id, email, name, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id`,
    [authUserId, email, "Revocation User"],
  );
  return result.rows[0]!.id;
};
const addMember = async (db: Pool, householdId: string, userId: string, role: "owner" | "member"): Promise<void> => {
  await db.query(`INSERT INTO memberships (household_id, user_id, role, status) VALUES ($1, $2, $3, 'active')`, [
    householdId,
    userId,
    role,
  ]);
};

const cleanup = async (db: Pool, householdIds: string[], userIds: string[], authUserIds: string[]): Promise<void> => {
  if (householdIds.length > 0) {
    await db.query(`DELETE FROM push_subscriptions WHERE workspace_id = ANY($1::uuid[])`, [householdIds]);
    await db.query(`DELETE FROM device_tokens WHERE household_id = ANY($1::uuid[])`, [householdIds]);
    await db.query(`DELETE FROM ownership_transfers WHERE household_id = ANY($1::uuid[])`, [householdIds]);
    await db.query(`DELETE FROM households WHERE id = ANY($1::uuid[])`, [householdIds]);
  }
  if (userIds.length > 0) {
    await db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  }
  if (authUserIds.length > 0) {
    await db.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [authUserIds]);
  }
};

const pushInput = (userId: string, endpoint: string, workspaceId: string) => ({
  workspaceId,
  userId,
  endpoint,
  p256dh: "p256dh",
  auth: "auth",
});

describeIfDb("Postgres access revocation lifecycle (V4.1 tasks 1.6/1.8/1.9)", () => {
  beforeAll(() => {
    if (DB_URL) pool = createPool({ connectionString: DB_URL, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("removeMember revokes device tokens (with rotation descendants) and zeroes push delivery", async () => {
    if (!pool) throw new Error("database pool not initialized");
    const db = pool;
    const tokens = createPostgresDeviceTokenStore(db);
    const push = createPostgresPushSubscriptionStore(db);
    const access = createPostgresWorkspaceAccessStore(db);
    const workspaces = createPostgresWorkspaceStore(db, {
      onMemberRevoked: async ({ userId, householdId }) => {
        await tokens.revokeAllForUserWorkspace(userId, householdId);
        await push.removeAllForUserWorkspace(householdId, userId);
      },
    });

    const ownerAuth = `auth-${randomUUID()}`;
    const memberAuth = `auth-${randomUUID()}`;
    const ownerId = await seedUser(db, ownerAuth);
    const memberId = await seedUser(db, memberAuth);
    const workspace = await workspaces.create({ authUserId: ownerAuth, name: "Casa", kind: "shared" });
    await addMember(db, workspace.id, memberId, "member");

    const memberToken = await tokens.register("member-phone", workspace.id, { userId: memberId });
    const memberRotated = await tokens.rotate(memberToken.token, "member-phone", workspace.id);
    const ownerToken = await tokens.register("owner-phone", workspace.id, { userId: ownerId });
    await push.upsert(pushInput(memberId, "https://push.example.test/member", workspace.id));
    await push.upsert(pushInput(ownerId, "https://push.example.test/owner", workspace.id));
    await push.upsert(pushInput(memberToken.deviceId, "https://push.example.test/member-legacy", workspace.id));

    await workspaces.removeMember({ authUserId: ownerAuth, householdId: workspace.id, memberUserId: memberId });

    const revokedRows = await db.query<{ revoked_at: string | null }>(
      `SELECT revoked_at FROM device_tokens WHERE token_hash = ANY($1::text[])`,
      [[hashDeviceToken(memberToken.token), hashDeviceToken(memberRotated.token), hashDeviceToken(ownerToken.token)]],
    );
    const byHash = new Map(
      (await db.query<{ token_hash: string; revoked_at: string | null }>(
        `SELECT token_hash, revoked_at FROM device_tokens WHERE token_hash = ANY($1::text[])`,
        [[hashDeviceToken(memberToken.token), hashDeviceToken(memberRotated.token), hashDeviceToken(ownerToken.token)]],
      )).rows.map((row) => [row.token_hash, row.revoked_at]),
    );
    expect(revokedRows.rowCount).toBe(3);
    expect(byHash.get(hashDeviceToken(memberToken.token))).not.toBeNull();
    expect(byHash.get(hashDeviceToken(memberRotated.token))).not.toBeNull();
    expect(byHash.get(hashDeviceToken(ownerToken.token))).toBeNull();

    await expect(tokens.resolve(memberToken.token, workspace.id)).rejects.toMatchObject({ code: "auth.invalid_token" });
    await expect(tokens.resolve(memberRotated.token, workspace.id)).rejects.toMatchObject({ code: "auth.invalid_token" });
    await expect(resolveAuthorizedDevice({ tokenStore: tokens, workspaceAccess: access }, memberToken.token, workspace.id)).rejects.toMatchObject({
      statusCode: 401,
    });
    const lingering = await tokens.register("member-phone-2", workspace.id, { userId: memberId });
    await expect(resolveAuthorizedDevice({ tokenStore: tokens, workspaceAccess: access }, lingering.token, workspace.id)).rejects.toMatchObject({
      code: "auth.workspace_forbidden",
    });

    const remaining = await db.query(`SELECT user_id FROM push_subscriptions WHERE workspace_id = $1`, [workspace.id]);
    expect(remaining.rows.map((row) => (row as { user_id: string }).user_id).sort()).toEqual([ownerId]);

    await push.upsert(pushInput(memberId, "https://push.example.test/member-stale", workspace.id));
    const pending = await push.listPending(workspace.id, `revocation:${randomUUID()}`);
    expect(pending.map((sub) => sub.userId)).toEqual([ownerId]);

    await cleanup(db, [workspace.id], [ownerId, memberId], [ownerAuth, memberAuth]);
  });

  it("leave revokes the departing member tokens and denies device requests", async () => {
    if (!pool) throw new Error("database pool not initialized");
    const db = pool;
    const tokens = createPostgresDeviceTokenStore(db);
    const push = createPostgresPushSubscriptionStore(db);
    const access = createPostgresWorkspaceAccessStore(db);
    const workspaces = createPostgresWorkspaceStore(db, {
      onMemberRevoked: async ({ userId, householdId }) => {
        await tokens.revokeAllForUserWorkspace(userId, householdId);
        await push.removeAllForUserWorkspace(householdId, userId);
      },
    });

    const ownerAuth = `auth-${randomUUID()}`;
    const memberAuth = `auth-${randomUUID()}`;
    const ownerId = await seedUser(db, ownerAuth);
    const memberId = await seedUser(db, memberAuth);
    const workspace = await workspaces.create({ authUserId: ownerAuth, name: "Casa", kind: "shared" });
    await addMember(db, workspace.id, memberId, "member");
    const memberToken = await tokens.register("member-phone", workspace.id, { userId: memberId });

    // A second member keeps the workspace removable-leavable without tripping last-owner guards.
    const extraAuth = `auth-${randomUUID()}`;
    const extraId = await seedUser(db, extraAuth);
    await addMember(db, workspace.id, extraId, "member");

    await workspaces.leave({ authUserId: memberAuth, householdId: workspace.id });

    await expect(tokens.resolve(memberToken.token, workspace.id)).rejects.toMatchObject({ code: "auth.invalid_token" });
    await expect(resolveAuthorizedDevice({ tokenStore: tokens, workspaceAccess: access }, memberToken.token, workspace.id)).rejects.toMatchObject({
      statusCode: 401,
    });
    const lingering = await tokens.register("member-phone-2", workspace.id, { userId: memberId });
    await expect(resolveAuthorizedDevice({ tokenStore: tokens, workspaceAccess: access }, lingering.token, workspace.id)).rejects.toMatchObject({
      code: "auth.workspace_forbidden",
    });

    await cleanup(db, [workspace.id], [ownerId, memberId, extraId], [ownerAuth, memberAuth, extraAuth]);
  });

  it("ownership transfer keeps roles until accept, then swaps them on the device path too", async () => {
    if (!pool) throw new Error("database pool not initialized");
    const db = pool;
    const tokens = createPostgresDeviceTokenStore(db);
    const access = createPostgresWorkspaceAccessStore(db);
    const workspaceStore = createPostgresWorkspaceStore(db);
    const transfers = createPostgresOwnershipTransferStore(db);

    const ownerAuth = `auth-${randomUUID()}`;
    const memberAuth = `auth-${randomUUID()}`;
    const ownerId = await seedUser(db, ownerAuth);
    const memberId = await seedUser(db, memberAuth);
    const workspace = await workspaceStore.create({ authUserId: ownerAuth, name: "Casa", kind: "shared" });
    await addMember(db, workspace.id, memberId, "member");
    const ownerToken = await tokens.register("owner-phone", workspace.id, { userId: ownerId });

    const deviceDeps = { tokenStore: tokens, workspaceAccess: access, workspaceStore };
    const roleBefore = (await resolveAuthorizedDevice(deviceDeps, ownerToken.token, workspace.id)).access.role;
    expect(roleBefore).toBe("owner");

    const transfer = (await transfers.create({ householdId: workspace.id, fromAuthUserId: ownerAuth, toAuthUserId: memberAuth })) as { id: string };
    expect((await access.resolve(ownerAuth, workspace.id))?.role).toBe("owner");
    expect((await access.resolve(memberAuth, workspace.id))?.role).toBe("member");

    await transfers.accept({ householdId: workspace.id, transferId: transfer.id, destinationAuthUserId: memberAuth });

    expect((await access.resolve(ownerAuth, workspace.id))?.role).toBe("member");
    expect((await access.resolve(memberAuth, workspace.id))?.role).toBe("owner");
    expect((await resolveAuthorizedDevice(deviceDeps, ownerToken.token, workspace.id)).access.role).toBe("member");

    await cleanup(db, [workspace.id], [ownerId, memberId], [ownerAuth, memberAuth]);
  });

  it("archived workspace denies device requests and excludes push delivery", async () => {
    if (!pool) throw new Error("database pool not initialized");
    const db = pool;
    const tokens = createPostgresDeviceTokenStore(db);
    const push = createPostgresPushSubscriptionStore(db);
    const access = createPostgresWorkspaceAccessStore(db);
    const workspaces = createPostgresWorkspaceStore(db);

    const ownerAuth = `auth-${randomUUID()}`;
    const ownerId = await seedUser(db, ownerAuth);
    const workspace = await workspaces.create({ authUserId: ownerAuth, name: "Casa", kind: "shared" });
    const ownerToken = await tokens.register("owner-phone", workspace.id, { userId: ownerId });
    await push.upsert(pushInput(ownerId, "https://push.example.test/owner", workspace.id));

    await workspaces.setStatus({ authUserId: ownerAuth, householdId: workspace.id, status: "archived" });

    await expect(
      resolveAuthorizedDevice({ tokenStore: tokens, workspaceAccess: access, workspaceStore: workspaces }, ownerToken.token, workspace.id),
    ).rejects.toMatchObject({ code: "auth.workspace_forbidden" });
    await expect(push.listPending(workspace.id, `archived:${randomUUID()}`)).resolves.toEqual([]);

    await cleanup(db, [workspace.id], [ownerId], [ownerAuth]);
  });
});
