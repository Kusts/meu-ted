/**
 * T5.3 deep-link (SPEC §22) — per-item CTA passes the operation id.
 *
 * RED: per-item "Abrir no TED" must call openTedChat with { operationId } so
 * the TED can focus the right card. No second executor is introduced here.
 */
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import PendingOperationsPage from "../PendingOperationsPage";
import type { ActivePendingOperation } from "@/lib/api/agent-client";
import type { WorkspaceContextValue } from "@/lib/auth/workspace-context";

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/endpoints")>();
  return { ...actual, undoLastAction: vi.fn() };
});

const openTedChat = vi.fn();

vi.mock("@/features/ted/TedChatLauncher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/ted/TedChatLauncher")>();
  return { ...actual, openTedChat: (...args: unknown[]) => openTedChat(...args) };
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

describe("PendingOperationsPage deep-link (T5.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceSafe.mockReturnValue(activeWorkspace());
  });

  it("per-item CTA passes its operationId to the TED launcher", async () => {
    const user = userEvent.setup();
    fetchActivePendingOperations.mockResolvedValue([
      {
        id: "op-1",
        status: "proposed",
        tool: "transactions.expense.create",
        createdAt: "2026-09-15T10:00:00.000Z",
        expiresAt: "2026-09-15T15:00:00.000Z",
        amountCents: 8500,
        description: "Mercado",
        date: "2026-09-15",
      },
      {
        id: "op-2",
        status: "proposed",
        tool: "transactions.expense.create",
        createdAt: "2026-09-15T10:00:00.000Z",
        expiresAt: "2026-09-15T15:00:00.000Z",
        amountCents: 1250,
        description: "Assinatura",
        date: "2026-09-15",
      },
    ]);

    render(<PendingOperationsPage />);

    const ctas = await screen.findAllByTestId("pending-open-ted-item");
    expect(ctas).toHaveLength(2);

    await user.click(ctas[1]!);
    expect(openTedChat).toHaveBeenCalledWith({ operationId: "op-2" });
  });

  it("general CTA opens the TED without inventing an operation id", async () => {
    const user = userEvent.setup();
    fetchActivePendingOperations.mockResolvedValue([
      {
        id: "op-1",
        status: "proposed",
        tool: "transactions.expense.create",
        createdAt: "2026-09-15T10:00:00.000Z",
        expiresAt: "2026-09-15T15:00:00.000Z",
        description: "Mercado",
      },
    ]);

    render(<PendingOperationsPage />);

    await user.click(await screen.findByTestId("pending-open-ted"));
    expect(openTedChat).toHaveBeenCalledTimes(1);
    expect(openTedChat.mock.calls[0]?.[0]).toBeUndefined();
  });
});
