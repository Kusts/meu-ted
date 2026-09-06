import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@/lib/test-utils";
import { TedChat } from "../TedChat";
import { bodyScrollLockCount } from "@/lib/ui/overlay-a11y";
import * as agentAuth from "@/lib/api/agent-auth";

vi.mock("@/lib/auth/workspace-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/workspace-context")>();
  const mockWs = {
    workspaces: [{ id: "ws-1", name: "Minhas Finanças", kind: "shared" as const, role: "owner" }],
    activeWorkspace: { id: "ws-1", name: "Minhas Finanças", kind: "shared" as const, role: "owner" },
    members: [],
    loading: false,
    membersLoading: false,
    error: null,
    selectWorkspace: vi.fn(),
    refreshWorkspaces: vi.fn(),
    refreshMembers: vi.fn(),
    createWorkspace: vi.fn(),
    inviteMember: vi.fn(),
    acceptInvite: vi.fn(),
    removeMember: vi.fn(),
    leave: vi.fn(),
  };
  return { ...actual, useWorkspace: () => mockWs, useWorkspaceSafe: () => mockWs };
});

vi.mock("@/lib/api/agent-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/agent-client")>();
  return {
    ...actual,
    fetchAgentHistory: vi.fn().mockResolvedValue([]),
    sendAgentMessage: vi.fn().mockResolvedValue({ turnId: "t", status: "completed" }),
    fetchPendingOperations: vi.fn().mockResolvedValue([]),
  };
});

describe("TedChat – PWA mobile resizing (dvh + safe-area + keyboard)", () => {
  beforeEach(() => {
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("mock-token");
  });

  it("usa dvh e safe-area para evitar overflow no teclado (modal h-[100dvh] max-h)", async () => {
    const { container } = render(<TedChat open={true} onClose={vi.fn()} />);
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    // Outer overlay should handle safe-area and dvh
    const dialogClass = dialog?.className ?? "";
    // Should have dvh handling; fallback permissive: must contain 100dvh or dvh
    expect(dialogClass).toMatch(/dvh/);

    const modal = container.querySelector('[role="dialog"] > div');
    const modalClass = modal?.className ?? "";
    // Modal should use h-[100dvh] and max-h, not only 92dvh without safe-area
    expect(modalClass).toMatch(/h-\[100dvh\]/);
    expect(modalClass).toMatch(/max-h-\[100dvh\]/);
    // Should include safe-area bottom padding on container or footer
    const footer = container.querySelector("form");
    const footerClass = footer?.className ?? "";
    expect(footerClass + modalClass).toMatch(/safe-area|env\(safe-area-inset-bottom\)/);
  });

  it("message container evita scroll bleed e permite contido", async () => {
    const { container } = render(<TedChat open={true} onClose={vi.fn()} />);
    const scrollArea = container.querySelector(".overflow-y-auto");
    expect(scrollArea).not.toBeNull();
    const cls = scrollArea?.className ?? "";
    expect(cls).toMatch(/overscroll-contain/);
    // flex-1 with min-h-0 prevents overflow when keyboard opens
    expect(cls).toMatch(/flex-1/);
    // Check parent has min-h-0 or flex-1
    const parentCls = scrollArea?.parentElement?.className ?? "";
    // modal should have flex flex-col
    expect(parentCls + cls).toMatch(/flex/);
  });

  it("não usa h-[92dvh] isolado sem 100dvh fallback", async () => {
    const { container } = render(<TedChat open={true} onClose={vi.fn()} />);
    const modal = container.querySelector('[role="dialog"] > div');
    const modalClass = modal?.className ?? "";
    // After fix, should not solely rely on 92dvh; must have 100dvh
    // This test will fail if only 92dvh remains
    expect(modalClass).toMatch(/100dvh/);
    // Ensure safe-area is present
    expect(container.innerHTML).toMatch(/safe-area|env\(safe-area/);
  });
});

describe("TedChat — body scroll lock (v2 review)", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    // RTL auto-cleanup unmounts; o lock ref-counted deve voltar a zero.
    expect(bodyScrollLockCount()).toBe(0);
  });

  it("trava o scroll do body enquanto aberto e libera ao fechar", () => {
    const view = render(<TedChat open={true} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    expect(bodyScrollLockCount()).toBe(1);

    view.rerender(<TedChat open={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("");
    expect(bodyScrollLockCount()).toBe(0);
  });

  it("não trava o scroll quando fechado", () => {
    render(<TedChat open={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("");
    expect(bodyScrollLockCount()).toBe(0);
  });
});
