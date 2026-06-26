import { render } from "@/lib/test-utils";
import Icon from "../Icon";

describe("Icon", () => {
  it("renders an SVG with the given name", () => {
    const { container } = render(<Icon name="home" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "22");
    expect(svg).toHaveAttribute("height", "22");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });

  it("accepts a custom size", () => {
    const { container } = render(<Icon name="home" size={16} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("height", "16");
  });

  it("renders paths for bell icon", () => {
    const { container } = render(<Icon name="bell" />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it("applies custom className", () => {
    const { container } = render(<Icon name="home" className="my-icon" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("my-icon");
  });
});
