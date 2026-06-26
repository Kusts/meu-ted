import { render, screen } from "@/lib/test-utils";
import Badge from "../Badge";

describe("Badge", () => {
  it("renders first 2 uppercase chars of label", () => {
    const { container } = render(<Badge label="Nubank Card" />);
    expect(container.textContent).toBe("NU");
  });

  it("renders single char for short label", () => {
    const { container } = render(<Badge label="P" />);
    expect(container.textContent).toBe("P");
  });

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
    // sm size = 28px
    expect(span.style.width).toBe("28px");
  });

  it("renders with lg size", () => {
    const { container } = render(<Badge label="X" size="lg" />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.width).toBe("52px");
  });
});
