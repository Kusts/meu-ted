/**
 * T5.3 (H-14, SPEC §22) — TedChat invalidation dispatch (surgical contract).
 *
 * When an approval is resolved inside the TED (confirm/cancel/retry or a
 * turn that succeeded), the chat dispatches `pi:pending-operations-changed`
 * so external reflections (Home badge, Aprovações page) refetch the
 * authoritative listing. The decision itself stays in the TED.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { TedChat } from "../TedChat";
import { PENDING_OPERATIONS_CHANGED_EVENT } from "@/lib/state/use-pending-operations";
import * as agentClient from "@/lib/api/agent-client";

vi.mock("@/lib/auth/workspace-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/workspace-context")>();
  const mockWs = {
    workspaces: [
      { id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner" },
    ],
    activeWorkspace: { id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner" },
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

const reconcileMutation = vi.fn(async () => ({
  targets: [],
  refreshed: [],
  failed: [],
  deduped: false,
}));

vi.mock("@/lib/state/app-state-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/state/app-state-context")>();
  return { ...actual, useAppState: () => ({ reconcileMutation }) };
});

beforeEach(() => {
  vi.restoreAllMocks();
  reconcileMutation.mockClear();
});

describe("TedChat — pending-operations invalidation dispatch (T5.3)", () => {
  it("dispatches pi:pending-operations-changed when an approval is resolved", async () => {
    const user = userEvent.setup();
    const dispatched: Array<{ detail?: unknown }> = [];
    const listener = (event: Event) => dispatched.push({ detail: (event as CustomEvent).detail });
    window.addEventListener(PENDING_OPERATIONS_CHANGED_EVENT, listener);

    try {
      vi.spyOn(agentClient, "fetchAgentHistory").mockResolvedValue([]);
      vi.spyOn(agentClient, "sendAgentMessage").mockResolvedValue({
        turnId: "turn-1",
        status: "completed",
        pendingOperation: {
          id: "op-1",
          status: "proposed",
          operation: "transactions.expense.create",
          summary: "Mercado",
        },
      });
      vi.spyOn(agentClient, "decidePendingOperation").mockResolvedValue({
        operationId: "op-1",
        status: "succeeded",
      });

      render(<TedChat open onClose={() => {}} />);

      await user.type(
        screen.getByLabelText("Mensagem para o assistente"),
        "registre mercado 850",
      );
      await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));
      await user.click(await screen.findByRole("button", { name: "Aprovar" }));

      await waitFor(() => {
        expect(dispatched.length).toBeGreaterThanOrEqual(1);
      });
    } finally {
      window.removeEventListener(PENDING_OPERATIONS_CHANGED_EVENT, listener);
    }
  });
});
