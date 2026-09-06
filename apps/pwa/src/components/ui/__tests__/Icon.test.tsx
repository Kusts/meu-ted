import { describe, it, expect } from "vitest";
import { render } from "@/lib/test-utils";
import { Icon } from "../Icon";

function svgMarkup(name: Parameters<typeof Icon>[0]["name"]): string {
  const { container } = render(<Icon name={name} />);
  const svg = container.querySelector("svg");
  expect(svg).toBeInTheDocument();
  return svg!.outerHTML;
}

describe("Icon (v2 A6 unique drawer icons)", () => {
  it("renders the new workspaces/reports/budgets glyphs", () => {
    for (const name of ["layers", "pie-chart", "file-text"] as const) {
      expect(svgMarkup(name)).toContain("<svg");
    }
  });

  it("gives Categorias/Workspaces and Orçamentos/Relatórios distinct glyphs", () => {
    expect(svgMarkup("layers")).not.toBe(svgMarkup("folder-open"));
    expect(svgMarkup("pie-chart")).not.toBe(svgMarkup("file-text"));
    expect(svgMarkup("file-text")).not.toBe(svgMarkup("chart"));
  });
});
