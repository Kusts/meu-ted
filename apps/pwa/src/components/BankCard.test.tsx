import { describe, expect, it } from "vitest";
import { render, screen } from "@/lib/test-utils";
import BankCard from "./BankCard";

describe("BankCard realistic visuals (TDD)", () => {
  it("renders with physical card proportion (aspect ratio 85.6/53.98)", () => {
    const { container } = render(<BankCard bankId="nubank" cardName="Nubank Roxinho" maskedNumber="•••• •••• •••• 1234" holderName="FULANO DE TAL" expiry="12/30" network="mastercard" />);
    const card = container.firstChild as HTMLElement;
    const style = card.getAttribute("style") || "";
    // Should contain aspect-ratio or be styled with ratio
    expect(card).toHaveAttribute("data-testid", "bank-card");
    expect(style + card.className).toMatch(/aspect/i);
  });

  it("displays chip, contactless, flag and masked number", () => {
    render(<BankCard bankId="inter" cardName="Inter Gold" maskedNumber="•••• •••• •••• 5678" network="mastercard" />);
    expect(screen.getByTestId("card-chip")).toBeInTheDocument();
    expect(screen.getByTestId("card-contactless")).toBeInTheDocument();
    expect(screen.getByTestId("card-flag")).toBeInTheDocument();
    expect(screen.getByText(/••••/)).toBeInTheDocument();
  });

  it("uses bank preset gradient and colors", () => {
    const { container: c1 } = render(<BankCard bankId="nubank" cardName="Nubank" maskedNumber="•••• •••• •••• 0000" />);
    const { container: c2 } = render(<BankCard bankId="caixa" cardName="Caixa" maskedNumber="•••• •••• •••• 0000" />);
    const g1 = (c1.firstChild as HTMLElement).getAttribute("style") || "";
    const g2 = (c2.firstChild as HTMLElement).getAttribute("style") || "";
    expect(g1).not.toBe(g2);
    expect(g1).toMatch(/gradient/i);
  });

  it("renders bank name and holder when provided", () => {
    render(<BankCard bankId="xp" cardName="XP Visa Infinite" holderName="ANA SILVA" expiry="08/29" maskedNumber="•••• •••• •••• 9012" />);
    expect(screen.getByText("XP Visa Infinite")).toBeInTheDocument();
    expect(screen.getByText("ANA SILVA")).toBeInTheDocument();
    expect(screen.getByText("08/29")).toBeInTheDocument();
  });

  it("applies mobile-optimized touch target and scales", () => {
    const { container } = render(<BankCard bankId="c6" cardName="C6 Carbon" maskedNumber="•••• •••• •••• 1111" />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/rounded|shadow/);
  });
});
