import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client";
import { acceptWorkspaceInvite, createWorkspace, createWorkspaceInvite, fetchWorkspaceMembers, fetchWorkspaces, leaveWorkspace, removeWorkspaceMember } from "./workspaces";

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
});
