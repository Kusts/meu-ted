/**
 * T5.3 (H-14, SPEC §22) — HomePage integration: the HeroSection receives
 * the REAL pending count from the authoritative Agent listing (never the
 * hardcoded `null`), scoped to the active workspace.
 */
import { render, screen } from "@/lib/test-utils";
import HomePage from "../HomePage";
import type { WorkspaceContextValue } from "@/lib/auth/workspace-context";
import type { PendingOperationsState } from "@/lib/state/use-pending-operations";

const mockRouter = { push: vi.fn(), refresh: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/components/WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

const workspaceSafe = vi.fn<() => WorkspaceContextValue | null>(() => null);

vi.mock("@/lib/auth/workspace-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/workspace-context")>();
  return { ...actual, useWorkspaceSafe: () => workspaceSafe() };
});

const usePendingOperations = vi.fn<(workspaceId: string | null) => PendingOperationsState>();

vi.mock("@/lib/state/use-pending-operations", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/state/use-pending-operations")>();
  return {
    ...actual,
    usePendingOperations: (workspaceId: string | null) => usePendingOperations(workspaceId),
  };
});

const activeWorkspace = (id: string): WorkspaceContextValue =>
  ({
    activeWorkspace: { id, name: "Minhas Finanças", kind: "personal", role: "owner" },
  }) as unknown as WorkspaceContextValue;

const pendingState = (overrides: Partial<PendingOperationsState> = {}): PendingOperationsState => ({
  items: null,
  pendingCount: null,
  error: false,
  loading: false,
  refresh: vi.fn(async () => {}),
  ...overrides,
});

describe("HomePage pending count integration (T5.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceSafe.mockReturnValue(null);
  });

  it("passes the real count from the hook to the hero badge, scoped to the active workspace", () => {
    workspaceSafe.mockReturnValue(activeWorkspace("ws-42"));
    usePendingOperations.mockReturnValue(pendingState({ pendingCount: 2, items: [] }));

    render(<HomePage />);

    expect(usePendingOperations).toHaveBeenCalledWith("ws-42");
    expect(screen.getByTestId("hero-pending-approvals")).toHaveTextContent("2 aprovações pendentes");
  });

  it("keeps the badge hidden when the count is unknown (no workspace)", () => {
    workspaceSafe.mockReturnValue(null);
    usePendingOperations.mockReturnValue(pendingState());

    render(<HomePage />);

    expect(usePendingOperations).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId("hero-pending-approvals")).not.toBeInTheDocument();
  });
});
