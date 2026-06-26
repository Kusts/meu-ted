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
});
