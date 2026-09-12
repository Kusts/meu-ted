import { render, screen } from "@/lib/test-utils";
import { HeroSection } from "../HeroSection";

vi.mock("@/components/WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

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

describe("HeroSection header (TED shortcut removed)", () => {
  it("does not render the TED chat shortcut", () => {
    render(<HeroSection {...baseProps} />);
    expect(screen.queryByRole("button", { name: "Abrir assistente TED" })).not.toBeInTheDocument();
  });

  it("keeps the notifications button", () => {
    render(<HeroSection {...baseProps} />);
    expect(screen.getByRole("button", { name: "Notificações" })).toBeInTheDocument();
  });

  it("renders no pulse dot", () => {
    const { container } = render(<HeroSection {...baseProps} />);
    expect(container.querySelector(".pulse-dot")).not.toBeInTheDocument();
  });
});
