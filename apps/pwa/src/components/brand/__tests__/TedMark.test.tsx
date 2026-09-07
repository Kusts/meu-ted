import { render, screen } from "@/lib/test-utils";
import { TedAvatar, TedMark } from "../TedMark";

describe("TedMark brand kit (item premium 3)", () => {
  it("renders the geometric monogram with mint on charcoal", () => {
    const { container } = render(<TedMark size={28} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "28");
    expect(svg).toHaveAttribute("aria-label", "Ted");
    expect(svg.innerHTML).toContain("#1F2A27");
    expect(svg.innerHTML).toContain("#66C2A3");
  });

  it("renders relaxed and check variants", () => {
    const { container, rerender } = render(<TedMark variant="relaxed" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    rerender(<TedMark variant="check" />);
    expect(container.querySelector("svg")!.innerHTML).toContain("#0B7A5B");
  });

  it("renders the 36px TED avatar", () => {
    render(<TedAvatar />);
    expect(screen.getByLabelText("TED")).toBeInTheDocument();
  });
});
