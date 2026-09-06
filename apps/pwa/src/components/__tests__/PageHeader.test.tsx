import { describe, it, expect } from "vitest";
import { render, screen } from "@/lib/test-utils";
import PageHeader from "../PageHeader";

describe("PageHeader (v2 A2 safe-area)", () => {
  it("renders the title and offsets the top with the safe-area inset", () => {
    const { container } = render(<PageHeader title="Contas a pagar" />);
    expect(screen.getByText("Contas a pagar")).toBeInTheDocument();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/env\(safe-area-inset-top\)/);
    expect(root.className).toMatch(/var\(--page-pt\)/);
  });

  it("renders subtitle and action when provided", () => {
    render(
      <PageHeader
        title="Registros"
        subtitle="Tudo que entrou e saiu"
        action={<button type="button">Ação</button>}
      />,
    );
    expect(screen.getByText("Tudo que entrou e saiu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ação" })).toBeInTheDocument();
  });
});
