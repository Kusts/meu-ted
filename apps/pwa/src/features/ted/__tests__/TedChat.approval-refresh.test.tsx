/**
 * T3.3 — TedChat post-approval path (SPEC §15.4, §25.6 frontend).
 *
 * Approval success refreshes BOTH the chat history (existing behavior,
 * must not regress) AND the financial UI through the single
 * MutationReconciler (new: reconcileMutation with the operation-derived
 * mutationKind until T3.4 exposes the execution receipt via agent-client).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { TedChat } from "../TedChat";
import * as agentClient from "@/lib/api/agent-client";

vi.mock("@/lib/auth/workspace-context", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/auth/workspace-context")
  >();
  const mockWs = {
    workspaces: [
      {
        id: "ws-1",
        name: "Minhas Finanças",
        kind: "personal" as const,
        role: "owner",
      },
    ],
    activeWorkspace: {
      id: "ws-1",
      name: "Minhas Finanças",
      kind: "personal" as const,
      role: "owner",
    },
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
  const actual = await importOriginal<
    typeof import("@/lib/state/app-state-context")
  >();
  return { ...actual, useAppState: () => ({ reconcileMutation }) };
});

beforeEach(() => {
  vi.restoreAllMocks();
  reconcileMutation.mockClear();
});

describe("TedChat — post-approval reconciliation (T3.3)", () => {
  it("approval success reconciles financial UI AND reloads chat history", async () => {
    const user = userEvent.setup();
    // Deferred history: approving while a reload is in flight must still
    // reconcile first, then reload (SPEC §15.4: chat + financial UI).
    let releaseHistory!: (messages: never[]) => void;
    const historyGate = () =>
      new Promise<never[]>((resolve) => {
        releaseHistory = resolve;
      });
    const historySpy = vi
      .spyOn(agentClient, "fetchAgentHistory")
      .mockImplementation(historyGate);
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

    // Send a message that yields a pending approval (history still pending,
    // so the card stays mounted — loadHistory resets pendingOps on resolve).
    await user.type(
      screen.getByLabelText("Mensagem para o assistente"),
      "registre mercado 850",
    );
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    expect(
      await screen.findByRole("button", { name: "Aprovar" }),
    ).toBeInTheDocument();
    expect(reconcileMutation).not.toHaveBeenCalled();

    const historyCallsAfterProposal = historySpy.mock.calls.length;

    // Approve: financial UI reconciles, then chat history reloads.
    await user.click(screen.getByRole("button", { name: "Aprovar" }));

    await waitFor(() =>
      expect(reconcileMutation).toHaveBeenCalledWith({
        mutationKind: "transactions.expense.create",
      }),
    );
    await waitFor(() =>
      expect(historySpy.mock.calls.length).toBeGreaterThan(
        historyCallsAfterProposal,
      ),
    );

    // Release the in-flight history reloads; the card resolves to the
    // "registrada" state and no error surfaces.
    releaseHistory([]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull(),
    );
  });
});
