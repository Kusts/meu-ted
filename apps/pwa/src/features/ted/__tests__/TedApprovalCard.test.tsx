import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { TedApprovalCard } from "../TedApprovalCard";
import * as agentClient from "@/lib/api/agent-client";

vi.mock("@/lib/api/agent-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/agent-client")>();
  return { ...actual, decidePendingOperation: vi.fn() };
});

describe("TedApprovalCard V2", () => {
  it("sends only a confirm decision to the authenticated Agent RPC", async () => {
    const user = userEvent.setup();
    vi.mocked(agentClient.decidePendingOperation).mockResolvedValue({
      operationId: "op-1",
      status: "succeeded",
    });

    render(
      <TedApprovalCard
        operation={{ id: "op-1", status: "proposed", operation: "transactions.expense.create" }}
        workspaceId="workspace-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Aprovar" }));

    await waitFor(() =>
      expect(agentClient.decidePendingOperation).toHaveBeenCalledWith(
        "workspace-1",
        "op-1",
        "confirm",
      ),
    );
    expect(JSON.stringify(vi.mocked(agentClient.decidePendingOperation).mock.calls)).not.toContain("attestation");
    expect(await screen.findByText(/registrada/i)).toBeInTheDocument();
  });

  it("does not render an action for a non-proposed (resolved) shape", () => {
    render(
      <TedApprovalCard
        operation={{ id: "legacy-1", status: "expired", operation: "transactions.expense.create" }}
        workspaceId="workspace-1"
      />,
    );

    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
  });

  it("T3.4 RED: renders Valor/Conta/Categoria/Data from the canonical presentation (INV-02)", () => {
    render(
      <TedApprovalCard
        operation={{
          id: "pending-v2-1",
          status: "proposed",
          operation: "transactions.expense.create",
          presentation: {
            id: "pending-v2-1",
            status: "proposed",
            tool: "transactions.expense.create",
            title: "Confirmar despesa",
            amountCents: 85000,
            description: "Mercado",
            date: "2026-09-14",
            account: { id: "acc-1", label: "Nubank" },
            category: { id: "cat-1", label: "Alimentação" },
            expiresAt: "2026-09-14T13:00:00.000Z",
            warnings: [],
          },
        }}
        workspaceId="workspace-1"
      />,
    );

    expect(screen.getByText(/Confirmar despesa/)).toBeInTheDocument();
    expect(screen.getByText("R$ 850,00")).toBeInTheDocument();
    expect(screen.getByText("Nubank")).toBeInTheDocument();
    expect(screen.getByText("Alimentação")).toBeInTheDocument();
    expect(screen.getByText("14/09/2026")).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar R\$ 850,00/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("T3.4 RED: legacy payload without presentation degrades gracefully with a generic title", () => {
    render(
      <TedApprovalCard
        operation={{ id: "legacy-2", status: "proposed", operation: "transactions.expense.create", summary: "Mercado" }}
        workspaceId="workspace-1"
      />,
    );

    expect(screen.getByRole("button", { name: "Aprovar" })).toBeInTheDocument();
    expect(screen.queryByText("R$")).not.toBeInTheDocument();
  });

  it("T3.4 RED: shows the executing state without premature success (INV-03)", () => {
    render(
      <TedApprovalCard
        operation={{ id: "op-exec", status: "executing", operation: "transactions.expense.create" }}
        workspaceId="workspace-1"
      />,
    );

    expect(screen.getByText(/processando opera/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("V3-FIX-CARD-FAILCLOSED RED: proposed + presentation without account/category renders degraded without Confirm", () => {
    render(
      <TedApprovalCard
        operation={{
          id: "pending-v2-degraded",
          status: "proposed",
          operation: "transactions.expense.create",
          presentation: {
            id: "pending-v2-degraded",
            status: "proposed",
            tool: "transactions.expense.create",
            title: "Confirmar despesa",
            amountCents: 85000,
            description: "Mercado",
            date: "2026-09-14",
            expiresAt: "2026-09-14T13:00:00.000Z",
            warnings: ["Dados da conta indisponíveis no momento"],
          },
        }}
        workspaceId="workspace-1"
      />,
    );

    // Financial context is incomplete: the Confirm button must NOT render.
    expect(screen.queryByRole("button", { name: /Confirmar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Dados da operação incompletos/)).toBeInTheDocument();
    // Canceling moves no money, so Cancel stays available.
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    // Whatever data exists is still shown.
    expect(screen.getByText("R$ 850,00")).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
  });

  it("T3.3: onResolved receives the decision including the real execution receipt", async () => {    const user = userEvent.setup();
    const onResolved = vi.fn();
    const receipt: agentClient.PendingOperationReceipt = {
      mutationId: "mut-1",
      mutationKind: "transactions.expense.create",
      status: "succeeded" as const,
      affectedTargets: ["transactions", "accounts", "dashboard-summary", "budgets", "quick-insights"],
      operationId: "op-1",
      entity: { type: "transaction", id: "op-1" },
    };
    vi.mocked(agentClient.decidePendingOperation).mockResolvedValue({
      operationId: "op-1",
      status: "succeeded",
      receipt,
    });

    render(
      <TedApprovalCard
        operation={{ id: "op-1", status: "proposed", operation: "transactions.expense.create" }}
        workspaceId="workspace-1"
        onResolved={onResolved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Aprovar" }));

    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(
        expect.objectContaining({ status: "succeeded", receipt }),
      ),
    );
  });
});
