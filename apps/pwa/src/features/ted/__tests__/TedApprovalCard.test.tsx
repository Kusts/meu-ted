import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { TedApprovalCard } from "../TedApprovalCard";
import * as agentClient from "@/lib/api/agent-client";

vi.mock("@/lib/api/agent-client", () => ({
  decidePendingOperation: vi.fn(),
}));

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
});
