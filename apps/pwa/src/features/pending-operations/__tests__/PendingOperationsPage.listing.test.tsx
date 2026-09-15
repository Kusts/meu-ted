/**
 * T5.3 (H-14, SPEC §22) — Aprovações page listing.
 *
 * Lists the AUTHORITATIVE lean projection in pt-BR and routes every
 * decision back to the TED via `openTedChat()` (the Decision Service owns
 * confirmation/cancel/retry). There is no second approval executor here —
 * ever. Failures render an honest retryable error, never invented data.
 */
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import PendingOperationsPage from "../PendingOperationsPage";
import * as agentClient from "@/lib/api/agent-client";
import type { ActivePendingOperation } from "@/lib/api/agent-client";
import type { WorkspaceContextValue } from "@/lib/auth/workspace-context";

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/endpoints")>();
  return { ...actual, undoLastAction: vi.fn() };
});

const openTedChat = vi.fn();

vi.mock("@/features/ted/TedChatLauncher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/ted/TedChatLauncher")>();
  return { ...actual, openTedChat: () => openTedChat() };
});

const workspaceSafe = vi.fn<() => WorkspaceContextValue | null>(() => null);

vi.mock("@/lib/auth/workspace-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/workspace-context")>();
  return { ...actual, useWorkspaceSafe: () => workspaceSafe() };
});

const fetchActivePendingOperations = vi.fn<
  (workspaceId: string) => Promise<ActivePendingOperation[]>
>();

vi.mock("@/lib/api/agent-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/agent-client")>();
  return {
    ...actual,
    fetchActivePendingOperations: (workspaceId: string) =>
      fetchActivePendingOperations(workspaceId),
  };
});

const activeWorkspace = (): WorkspaceContextValue =>
  ({
    activeWorkspace: { id: "ws-1", name: "Minhas Finanças", kind: "personal", role: "owner" },
  }) as unknown as WorkspaceContextValue;

const leanItem = (overrides: Partial<ActivePendingOperation> = {}): ActivePendingOperation => ({
  id: "op-1",
  status: "proposed",
  tool: "transactions.expense.create",
  createdAt: "2026-09-15T10:00:00.000Z",
  expiresAt: "2026-09-15T15:00:00.000Z",
  amountCents: 8500,
  description: "Mercado",
  date: "2026-09-15",
  ...overrides,
});

describe("PendingOperationsPage — active listing (T5.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceSafe.mockReturnValue(activeWorkspace());
  });

  it("lists the lean operations in pt-BR (valor, descrição, data, status)", async () => {
    fetchActivePendingOperations.mockResolvedValue([
      leanItem(),
      leanItem({ id: "op-2", status: "executing", amountCents: 1250, description: "Assinatura" }),
    ]);

    render(<PendingOperationsPage />);

    expect(await screen.findByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText("R$ 85,00")).toBeInTheDocument();
    expect(screen.getAllByText("15/09/2026")).toHaveLength(2);
    expect(screen.getByText("aguardando aprovação")).toBeInTheDocument();
    expect(screen.getByText("Assinatura")).toBeInTheDocument();
    expect(screen.getByText("R$ 12,50")).toBeInTheDocument();
    expect(screen.getByText("processando operação…")).toBeInTheDocument();
  });

  it("sends every decision to the TED: per-item CTA opens the chat, never a second executor", async () => {
    const user = userEvent.setup();
    fetchActivePendingOperations.mockResolvedValue([leanItem()]);

    render(<PendingOperationsPage />);
    const itemCta = await screen.findAllByRole("button", { name: /Abrir no TED/i });
    expect(itemCta.length).toBeGreaterThanOrEqual(2); // per item + geral

    await user.click(itemCta[0]!);

    expect(openTedChat).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /^Aprovar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Cancelar$/i })).not.toBeInTheDocument();
  });

  it("renders an honest retryable error when the listing fails", async () => {
    const user = userEvent.setup();
    fetchActivePendingOperations.mockRejectedValueOnce(new Error("agent unavailable"));

    render(<PendingOperationsPage />);

    expect(
      await screen.findByText("Não foi possível carregar as aprovações agora."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/R\$ \d/)).not.toBeInTheDocument();

    fetchActivePendingOperations.mockResolvedValue([leanItem()]);
    await user.click(screen.getByRole("button", { name: /Tentar novamente/i }));

    expect(await screen.findByText("Mercado")).toBeInTheDocument();
  });

  it("keeps the informational TED-only state when there is nothing pending", async () => {
    fetchActivePendingOperations.mockResolvedValue([]);

    render(<PendingOperationsPage />);

    expect(await screen.findByTestId("pending-v2-info")).toHaveTextContent("no TED");
  });

  it("falls back to the informational state when no workspace is active", () => {
    workspaceSafe.mockReturnValue(null);

    render(<PendingOperationsPage />);

    expect(screen.getByTestId("pending-v2-info")).toBeInTheDocument();
    expect(fetchActivePendingOperations).not.toHaveBeenCalled();
  });

  it("keeps undo as a separate action (regression guard)", async () => {
    fetchActivePendingOperations.mockResolvedValue([leanItem()]);
    const { undoLastAction } = await import("@/lib/api/endpoints");
    vi.mocked(undoLastAction).mockResolvedValue({
      undone: { operation: "transactions.expense.create", entityId: "tx-1", reversal: "transaction.delete" },
    });
    const user = userEvent.setup();

    render(<PendingOperationsPage />);
    await screen.findByText("Mercado");
    await user.click(screen.getByTestId("undo-last-action"));

    await waitFor(() => expect(undoLastAction).toHaveBeenCalledOnce());
  });
});
