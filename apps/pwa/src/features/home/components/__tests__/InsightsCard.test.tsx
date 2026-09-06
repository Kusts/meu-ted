import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { InsightsCard } from "../InsightsCard";
import { OPEN_TED_CHAT_EVENT } from "@/features/ted/TedChatLauncher";

describe("InsightsCard", () => {
  it("empty state renders secondary CTA 'Conversar com o TED'", () => {
    render(<InsightsCard insights={[]} />);
    expect(screen.getByText("Sem insights por enquanto")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /conversar com o ted/i }),
    ).toBeInTheDocument();
  });

  it("CTA dispatches the launcher's public open event", async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    window.addEventListener(OPEN_TED_CHAT_EVENT, handler);
    try {
      render(<InsightsCard insights={[]} />);
      await user.click(
        screen.getByRole("button", { name: /conversar com o ted/i }),
      );
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(OPEN_TED_CHAT_EVENT, handler);
    }
  });

  it("non-empty state renders insights without the CTA", () => {
    render(
      <InsightsCard
        insights={[
          { title: "Gasto alto", body: "Alimentação subiu R$ 100", color: "#C8483B" },
        ]}
      />,
    );
    expect(screen.getByText("Gasto alto")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /conversar com o ted/i }),
    ).not.toBeInTheDocument();
  });
});
