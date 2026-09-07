import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { HeroSection } from "../HeroSection";
import { OPEN_TED_CHAT_EVENT } from "@/features/ted/TedChatLauncher";

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

describe("HeroSection TED shortcut (item premium 3)", () => {
  it("renders the 28px mascot shortcut opening the TED chat", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    window.addEventListener(OPEN_TED_CHAT_EVENT, handler);
    try {
      render(<HeroSection {...baseProps} />);
      const shortcut = screen.getByRole("button", { name: "Abrir assistente TED" });
      expect(shortcut).toBeInTheDocument();
      await user.click(shortcut);
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(OPEN_TED_CHAT_EVENT, handler);
    }
  });

  it("shows no pulse dot without pending insights", () => {
    const { container } = render(<HeroSection {...baseProps} hasPendingInsights={false} />);
    expect(container.querySelector(".pulse-dot")).not.toBeInTheDocument();
  });

  it("shows the emerald pulse dot with pending insights", () => {
    const { container } = render(<HeroSection {...baseProps} hasPendingInsights />);
    const dot = container.querySelector(".pulse-dot");
    expect(dot).toBeInTheDocument();
    expect(dot?.className).toMatch(/bg-primary/);
  });
});
