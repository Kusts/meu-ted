import { render } from "@/lib/test-utils";
import Badge from "../Badge";

describe("Badge", () => {
  describe("abbreviation generation", () => {
    it("uses first 2 chars (uppercase) for single-word labels", () => {
      const { container } = render(<Badge label="Nubank" />);
      expect(container.textContent).toBe("NU");
    });

    it("uses initials of the first two words for multi-word labels", () => {
      const { container } = render(<Badge label="Nubank Crédito" />);
      expect(container.textContent).toBe("NC");
    });

    it("uses initials for long multi-word labels (Inter Mastercard → IM)", () => {
      const { container } = render(<Badge label="Inter Mastercard" />);
      expect(container.textContent).toBe("IM");
    });

    it("uses single char for short labels", () => {
      const { container } = render(<Badge label="P" />);
      expect(container.textContent).toBe("P");
    });

    it("handles 3+ words by using only the first two initials", () => {
      const { container } = render(<Badge label="Banco do Brasil" />);
      expect(container.textContent).toBe("BD");
    });

    it("trims whitespace around words", () => {
      const { container } = render(<Badge label="  Itaú   Personnalité  " />);
      expect(container.textContent).toBe("IP");
    });

    it("falls back to first 2 chars if any word starts with a non-letter", () => {
      // single-word with leading number — should still take first 2 chars
      const { container } = render(<Badge label="123Conta" />);
      expect(container.textContent).toBe("12");
    });
  });

  describe("title / tooltip exposure", () => {
    it("exposes full label via title attribute for hover tooltip and QA inspection", () => {
      const { container } = render(<Badge label="Nubank Crédito" />);
      const span = container.firstChild as HTMLElement;
      expect(span.getAttribute("title")).toBe("Nubank Crédito");
    });

    it("keeps title in sync with label even for single-word labels", () => {
      const { container } = render(<Badge label="Itaú" />);
      const span = container.firstChild as HTMLElement;
      expect(span.getAttribute("title")).toBe("Itaú");
    });
  });

  describe("rendering", () => {
    it("renders with default color", () => {
      const { container } = render(<Badge label="NU" />);
      const span = container.firstChild;
      expect(span).toBeInTheDocument();
    });

    it("renders with custom color", () => {
      const { container } = render(<Badge label="IT" color="#EC7000" />);
      expect(container.textContent).toBe("IT");
    });

    it("renders with sm size", () => {
      const { container } = render(<Badge label="X" size="sm" />);
      const span = container.firstChild as HTMLElement;
      expect(span.style.width).toBe("28px");
    });

    it("renders with lg size", () => {
      const { container } = render(<Badge label="X" size="lg" />);
      const span = container.firstChild as HTMLElement;
      expect(span.style.width).toBe("52px");
    });

    it("remains aria-hidden (account name is rendered as adjacent text)", () => {
      const { container } = render(<Badge label="Nubank" />);
      const span = container.firstChild as HTMLElement;
      expect(span.getAttribute("aria-hidden")).toBe("true");
    });
  });
});