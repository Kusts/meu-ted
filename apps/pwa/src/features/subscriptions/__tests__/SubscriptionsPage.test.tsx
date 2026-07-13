import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import SubscriptionsPage from "../SubscriptionsPage";

describe("SubscriptionsPage", () => {
  it("renders the page header", () => {
    render(<SubscriptionsPage />);
    expect(screen.getByText("Assinaturas")).toBeInTheDocument();
  });

  it("shows monthly total", () => {
    render(<SubscriptionsPage />);
    expect(screen.getByText(/522,\d{2}/)).toBeInTheDocument();
  });

  it("renders Ativas and Canceladas tabs", () => {
    render(<SubscriptionsPage />);
    expect(screen.getByText("Ativas")).toBeInTheDocument();
    expect(screen.getByText("Canceladas")).toBeInTheDocument();
  });

  it("renders active subscription names by default", () => {
    render(<SubscriptionsPage />);
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("Spotify")).toBeInTheDocument();
  });

  it("switches to Canceladas tab", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsPage />);
    await user.click(screen.getByText("Canceladas"));
    expect(screen.getByText("Vivo Internet")).toBeInTheDocument();
  });

  it("renders without emoji in service presets", () => {
    const { container } = render(<SubscriptionsPage />);
    const spans = container.querySelectorAll("span");
    for (const s of spans) {
      const txt = s.textContent ?? "";
      const code = txt.codePointAt(0) ?? 0;
      if (txt.length >= 1 && txt.length <= 2) {
        expect(code).toBeLessThan(0x1F300);
      }
    }
  });

  describe("clickable cards and detail sheet", () => {
    it("cards are clickable buttons (no inline Cancelar)", () => {
      render(<SubscriptionsPage />);
      // No inline Cancelar button visible
      expect(screen.queryAllByText("Cancelar").length).toBe(0);
    });

    it("clicking active card opens detail sheet", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByText("Netflix"));
      expect(screen.getByText("Cancelar assinatura")).toBeInTheDocument();
      expect(screen.getByText("Ativa")).toBeInTheDocument();
    });

    it("detail sheet for cancelled sub shows Cancelada but no cancel action", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByText("Canceladas"));
      await user.click(screen.getByText("Vivo Internet"));
      expect(screen.getByText("Cancelada")).toBeInTheDocument();
      expect(screen.queryByText("Cancelar assinatura")).not.toBeInTheDocument();
    });

    it("clicking Cancelar assinatura in sheet opens confirm dialog", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByText("Netflix"));
      await user.click(screen.getByText("Cancelar assinatura"));
      // Both the sheet's cancel button and the confirm dialog have this text
      expect(screen.getAllByText("Cancelar assinatura").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Tem certeza/i)).toBeInTheDocument();
    });
  });
});
