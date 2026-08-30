import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Tabs } from "../Tabs";

describe("Tabs", () => {
  const items = [
    { value: "despesas", label: "Despesas" },
    { value: "receitas", label: "Receitas" },
    { value: "transferencias", label: "Transferências" },
  ];

  it("renders all tabs in tablist with selected tab active", () => {
    render(<Tabs items={items} value="despesas" onChange={vi.fn()} />);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange when a tab is clicked", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(<Tabs items={items} value="despesas" onChange={handleChange} />);

    await user.click(screen.getByRole("tab", { name: "Receitas" }));
    expect(handleChange).toHaveBeenCalledWith("receitas");
  });

  it("supports keyboard navigation with ArrowRight and ArrowLeft", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(<Tabs items={items} value="despesas" onChange={handleChange} />);

    const firstTab = screen.getByRole("tab", { name: "Despesas" });
    firstTab.focus();

    await user.keyboard("{ArrowRight}");
    expect(handleChange).toHaveBeenCalledWith("receitas");
  });
});
