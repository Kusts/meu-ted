import { render } from "@testing-library/react";
import Skeleton from "../Skeleton";

describe("Skeleton", () => {
  it("renders with role=status and aria-label", () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('[role="status"]');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-label", "Carregando");
  });

  it("applies block variant by default", () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el.className).toMatch(/animate-pulse/);
    expect(el.className).toMatch(/bg-fill-medium/);
  });

  it("applies custom width and height when provided", () => {
    const { container } = render(<Skeleton width={120} height={20} />);
    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el.style.width).toBe("120px");
    expect(el.style.height).toBe("20px");
  });

  it("supports text variant with default height", () => {
    const { container } = render(<Skeleton variant="text" />);
    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el.style.borderRadius).toBeTruthy();
  });

  it("supports circle variant with rounded shape", () => {
    const { container } = render(<Skeleton variant="circle" width={40} height={40} />);
    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el.style.borderRadius).toBe("9999px");
  });

  it("supports card variant", () => {
    const { container } = render(<Skeleton variant="card" />);
    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el).toBeInTheDocument();
  });
});