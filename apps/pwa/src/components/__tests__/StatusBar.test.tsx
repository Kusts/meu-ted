import { render } from "@testing-library/react";
import StatusBar from "../StatusBar";

describe("StatusBar", () => {
  it("returns null (removed synthetic device chrome)", () => {
    const { container } = render(<StatusBar />);
    // Component is a no-op — renders nothing
    expect(container.textContent).toBe("");
  });

  it("supports transparent prop without crashing", () => {
    const { container } = render(<StatusBar transparent />);
    expect(container.textContent).toBe("");
  });
});
