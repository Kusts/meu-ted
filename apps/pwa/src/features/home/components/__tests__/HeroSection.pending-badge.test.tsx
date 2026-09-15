/**
 * T5.3 (H-14, SPEC §22) — HeroSection pending-approvals badge.
 *
 * Real count only: 1 → "1 aprovação pendente", N → "N aprovações
 * pendentes"; zero or unknown (null/error) → hidden. Tapping the badge
 * opens the TED — decisions never happen here.
 */
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { HeroSection } from "../HeroSection";
import { openTedChat } from "@/features/ted/TedChatLauncher";

vi.mock("@/components/WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

vi.mock("@/features/ted/TedChatLauncher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/ted/TedChatLauncher")>();
  return { ...actual, openTedChat: vi.fn() };
});

const baseProps = {
  profile: { name: "Marina", avatarColor: "#820AD1" },
  pendingCount: null as number | null,
  totalBalance: 100000,
  totalIncome: 50000,
  totalExpenses: 20000,
  netResult: 30000,
  balanceHidden: false,
  onToggleBalance: vi.fn(),
  animatedBalance: 100000,
  onOpenProfile: vi.fn(),
  onOpenNotifications: vi.fn(),
};

describe("HeroSection pending approvals badge (T5.3)", () => {
  it("hides the badge when the count is unknown (null — error/loading)", () => {
    render(<HeroSection {...baseProps} pendingCount={null} />);
    expect(screen.queryByTestId("hero-pending-approvals")).not.toBeInTheDocument();
  });

  it("hides the badge when there is nothing pending (zero)", () => {
    render(<HeroSection {...baseProps} pendingCount={0} />);
    expect(screen.queryByTestId("hero-pending-approvals")).not.toBeInTheDocument();
  });

  it("shows the singular label for exactly one pending approval", () => {
    render(<HeroSection {...baseProps} pendingCount={1} />);
    expect(screen.getByTestId("hero-pending-approvals")).toHaveTextContent("1 aprovação pendente");
  });

  it("shows the plural label for several pending approvals", () => {
    render(<HeroSection {...baseProps} pendingCount={3} />);
    expect(screen.getByTestId("hero-pending-approvals")).toHaveTextContent("3 aprovações pendentes");
  });

  it("opens the TED when the badge is tapped (no decision surface here)", async () => {
    const user = userEvent.setup();
    render(<HeroSection {...baseProps} pendingCount={2} />);

    await user.click(screen.getByTestId("hero-pending-approvals"));

    expect(openTedChat).toHaveBeenCalledOnce();
  });
});
