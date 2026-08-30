import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Button } from "../Button";

describe("Button", () => {
  it("renders with default primary variant and md size", () => {
    render(<Button>Clique aqui</Button>);
    const button = screen.getByRole("button", { name: /clique aqui/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("bg-primary");
  });

  it("renders with secondary variant", () => {
    render(<Button variant="secondary">Secundário</Button>);
    const button = screen.getByRole("button", { name: /secundário/i });
    expect(button).toHaveClass("bg-surface-2");
  });

  it("renders with outline variant", () => {
    render(<Button variant="outline">Outline</Button>);
    const button = screen.getByRole("button", { name: /outline/i });
    expect(button).toHaveClass("border-border-medium");
  });

  it("renders with ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const button = screen.getByRole("button", { name: /ghost/i });
    expect(button).toHaveClass("hover:bg-surface-2");
  });

  it("renders with danger variant", () => {
    render(<Button variant="danger">Excluir</Button>);
    const button = screen.getByRole("button", { name: /excluir/i });
    expect(button).toHaveClass("bg-danger");
  });

  it("renders with accent variant", () => {
    render(<Button variant="accent">Destaque</Button>);
    const button = screen.getByRole("button", { name: /destaque/i });
    expect(button).toHaveClass("bg-accent-money");
  });

  it("handles different sizes (sm, lg, icon)", () => {
    const { rerender } = render(<Button size="sm">Pequeno</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-8");

    rerender(<Button size="lg">Grande</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-12");

    rerender(<Button size="icon" aria-label="Ícone">✕</Button>);
    expect(screen.getByRole("button")).toHaveClass("w-10");
  });

  it("renders in loading state with spinner and disabled behavior", () => {
    render(<Button loading>Salvar</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={handleClick}>Ação</Button>);

    await user.click(screen.getByRole("button", { name: /ação/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
