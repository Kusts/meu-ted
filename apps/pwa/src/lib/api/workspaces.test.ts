import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client";
import { acceptWorkspaceInvite, archiveWorkspace, createWorkspace, createWorkspaceInvite, fetchWorkspaceMembers, fetchWorkspaces, leaveWorkspace, removeWorkspaceMember, renameWorkspace, restoreWorkspace } from "./workspaces";

vi.mock("./client", () => ({ apiFetch: vi.fn() }));
const mocked = vi.mocked(apiFetch);

beforeEach(() => {
  mocked.mockReset();
  mocked.mockResolvedValue({ items: [] } as never);
});

describe("workspace API", () => {
  it("lists workspaces through the session boundary", async () => {
    await fetchWorkspaces();
    expect(mocked).toHaveBeenCalledWith("/workspaces", expect.objectContaining({ responseSchema: expect.anything() }));
  });

  it("selects workspace metadata and manages members", async () => {
    await createWorkspace({ name: "Equipe", kind: "shared" });
    await fetchWorkspaceMembers("workspace-1");
    await removeWorkspaceMember("workspace-1", "member-1");
    await leaveWorkspace("workspace-1");
    expect(mocked.mock.calls.map(([path]) => path)).toEqual([
      "/workspaces",
      "/workspaces/workspace-1/members",
      "/workspaces/workspace-1/members/member-1",
      "/workspaces/workspace-1/leave",
    ]);
  });

  it("creates and accepts an invite without putting the token in the URL", async () => {
    await createWorkspaceInvite("workspace-1", "member@example.com");
    await acceptWorkspaceInvite("a".repeat(64));
    expect(mocked.mock.calls[0][0]).toBe("/auth/invites");
    expect(mocked.mock.calls[1][0]).toBe("/auth/invites/accept");
    expect(String(mocked.mock.calls[1][0])).not.toContain("a".repeat(64));
  });

  it("uses idempotent requests for workspace lifecycle mutations", async () => {
    await renameWorkspace("workspace-1", "Novo nome");
    await archiveWorkspace("workspace-1");
    await restoreWorkspace("workspace-1");

    expect(mocked.mock.calls.map(([path]) => path)).toEqual([
      "/workspaces/workspace-1",
      "/workspaces/workspace-1/archive",
      "/workspaces/workspace-1/restore",
    ]);
    for (const [, options] of mocked.mock.calls) {
      expect(options).toEqual(expect.objectContaining({ idempotencyKey: expect.any(String) }));
    }
  });

  it("fetches, resends, and revokes pending invites via authoritative REST routes", async () => {
    const { fetchPendingInvites, resendWorkspaceInvite, revokeWorkspaceInvite } = await import("./workspaces");
    await fetchPendingInvites("workspace-1");
    await resendWorkspaceInvite("workspace-1", "invite-1");
    await revokeWorkspaceInvite("workspace-1", "invite-1");

    expect(mocked.mock.calls.map(([path]) => path)).toEqual([
      "/workspaces/workspace-1/invites",
      "/workspaces/workspace-1/invites/invite-1/resend",
      "/workspaces/workspace-1/invites/invite-1",
    ]);
    expect(mocked.mock.calls[1]![1]).toEqual(expect.objectContaining({ method: "POST", idempotencyKey: expect.any(String) }));
    expect(mocked.mock.calls[2]![1]).toEqual(expect.objectContaining({ method: "DELETE", idempotencyKey: expect.any(String) }));
  });

  it("fetches, creates, and accepts ownership transfers via authoritative REST routes", async () => {
    const { fetchOwnershipTransfers, createOwnershipTransfer, acceptOwnershipTransfer } = await import("./workspaces");
    await fetchOwnershipTransfers("workspace-1");
    await createOwnershipTransfer("workspace-1", "user-2");
    await acceptOwnershipTransfer("workspace-1", "transfer-1");

    expect(mocked.mock.calls.map(([path]) => path)).toEqual([
      "/workspaces/workspace-1/ownership-transfers",
      "/workspaces/workspace-1/ownership-transfers",
      "/workspaces/workspace-1/ownership-transfers/transfer-1/accept",
    ]);
    expect(mocked.mock.calls[1]![1]).toEqual(expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ toUserId: "user-2" }),
    }));
    expect(mocked.mock.calls[2]![1]).toEqual(expect.objectContaining({
      method: "POST",
    }));
  });

  it("normalizes ownership transfer responses whether returned in snake_case or camelCase", async () => {
    const { ownershipTransferSchema } = await import("./schemas");

    // POST create response from Postgres (snake_case)
    const snakeCaseCreate = {
      id: "transfer-1",
      household_id: "household-1",
      from_user_id: "user-1",
      to_user_id: "user-2",
      status: "pending",
      created_at: "2026-08-31T10:00:00.000Z",
    };
    const normalizedCreate = ownershipTransferSchema.parse(snakeCaseCreate);
    expect(normalizedCreate).toEqual({
      id: "transfer-1",
      householdId: "household-1",
      fromUserId: "user-1",
      toUserId: "user-2",
      status: "pending",
      createdAt: "2026-08-31T10:00:00.000Z",
      acceptedAt: undefined,
    });

    // POST accept response from Postgres (snake_case)
    const snakeCaseAccept = {
      id: "transfer-1",
      household_id: "household-1",
      from_user_id: "user-1",
      to_user_id: "user-2",
      status: "accepted",
      accepted_at: "2026-08-31T10:05:00.000Z",
    };
    const normalizedAccept = ownershipTransferSchema.parse(snakeCaseAccept);
    expect(normalizedAccept).toEqual({
      id: "transfer-1",
      householdId: "household-1",
      fromUserId: "user-1",
      toUserId: "user-2",
      status: "accepted",
      createdAt: "",
      acceptedAt: "2026-08-31T10:05:00.000Z",
    });

    // GET list response in camelCase
    const camelCase = {
      id: "transfer-1",
      householdId: "household-1",
      fromUserId: "user-1",
      toUserId: "user-2",
      status: "pending",
      createdAt: "2026-08-31T10:00:00.000Z",
    };
    const normalizedCamel = ownershipTransferSchema.parse(camelCase);
    expect(normalizedCamel).toEqual({
      id: "transfer-1",
      householdId: "household-1",
      fromUserId: "user-1",
      toUserId: "user-2",
      status: "pending",
      createdAt: "2026-08-31T10:00:00.000Z",
      acceptedAt: undefined,
    });
  });
});
