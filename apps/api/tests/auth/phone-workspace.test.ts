import { describe, it, expect, beforeEach } from "vitest";
import {
  createInMemoryPhoneWorkspaceStore,
  normalizePhone,
  PhoneResolutionError,
  type PhoneWorkspaceStore,
} from "../../src/auth/phone-workspace.js";

describe("Phone Workspace Identity Resolution", () => {
  let store: PhoneWorkspaceStore;

  const USER_1 = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Alice Silva",
    email: "alice@example.com",
    status: "active" as const,
  };

  const USER_2_DISABLED = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Bob Santos",
    email: "bob@example.com",
    status: "disabled" as const,
  };

  const USER_3_MULTI = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Carol Multi",
    email: "carol@example.com",
    status: "active" as const,
  };

  const WORKSPACE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const WORKSPACE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  beforeEach(() => {
    store = createInMemoryPhoneWorkspaceStore({
      users: [USER_1, USER_2_DISABLED, USER_3_MULTI],
      memberships: [
        { userId: USER_1.id, householdId: WORKSPACE_A, role: "owner", status: "active" },
        { userId: USER_2_DISABLED.id, householdId: WORKSPACE_A, role: "member", status: "active" },
        { userId: USER_3_MULTI.id, householdId: WORKSPACE_A, role: "owner", status: "active" },
        { userId: USER_3_MULTI.id, householdId: WORKSPACE_B, role: "member", status: "active" },
      ],
      bindings: [
        { phone: "+55 (11) 99999-1111", userId: USER_1.id, status: "active" },
        { phone: "5511999992222", userId: USER_2_DISABLED.id, status: "active" },
        { phone: "+5511999993333", userId: USER_3_MULTI.id, status: "active" },
      ],
    });
  });

  it("normalizes phone numbers by stripping formatting characters", () => {
    expect(normalizePhone("+55 (11) 99999-1111")).toBe("5511999991111");
    expect(normalizePhone("  55-11-98888-7777  ")).toBe("5511988887777");
    expect(normalizePhone("")).toBe("");
  });

  it("resolves single active user and workspace automatically", async () => {
    const res = await store.resolvePhone("+55 (11) 99999-1111");
    expect(res.userId).toBe(USER_1.id);
    expect(res.workspaceId).toBe(WORKSPACE_A);
    expect(res.role).toBe("owner");
    expect(res.userName).toBe("Alice Silva");
    expect(res.email).toBe("alice@example.com");
  });

  it("rejects unregistered phone number with 404", async () => {
    await expect(store.resolvePhone("5511000000000")).rejects.toThrowError(
      expect.objectContaining({ code: "auth.user_not_found", statusCode: 404 }),
    );
  });

  it("rejects disabled user with 403", async () => {
    await expect(store.resolvePhone("5511999992222")).rejects.toThrowError(
      expect.objectContaining({ code: "auth.user_disabled", statusCode: 403 }),
    );
  });

  it("rejects ambiguous resolution when user has multiple workspaces without preference", async () => {
    await expect(store.resolvePhone("5511999993333")).rejects.toThrowError(
      expect.objectContaining({ code: "auth.ambiguous_workspace", statusCode: 409 }),
    );
  });

  it("resolves multi-workspace user when preferred workspace is explicitly specified", async () => {
    const res = await store.resolvePhone("5511999993333", WORKSPACE_B);
    expect(res.userId).toBe(USER_3_MULTI.id);
    expect(res.workspaceId).toBe(WORKSPACE_B);
    expect(res.role).toBe("member");
  });

  it("rejects access if preferred workspace membership is revoked or absent", async () => {
    const nonExistentWorkspace = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await expect(store.resolvePhone("5511999993333", nonExistentWorkspace)).rejects.toThrowError(
      expect.objectContaining({ code: "auth.membership_revoked", statusCode: 403 }),
    );
  });
});
