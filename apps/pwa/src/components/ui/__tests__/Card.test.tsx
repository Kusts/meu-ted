import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Card } from "../Card";

describe("Card", () => {
  it("renders default card variant with surface-1 styling", () => {
    render(<Card>Conteúdo do cartão</Card>);
    const card = screen.getByText("Conteúdo do cartão");
    expect(card).toHaveClass("bg-surface-1");
    expect(card).toHaveClass("border-border-subtle");
  });

  it("renders glass variant with backdrop blur", () => {
    render(<Card variant="glass">Cartão translúcido</Card>);
    const card = screen.getByText("Cartão translúcido");
    expect(card).toHaveClass("backdrop-blur-md");
  });

  it("renders gradient hero variant", () => {
    render(<Card variant="gradient">Hero Banner</Card>);
    const card = screen.getByText("Hero Banner");
    expect(card).toHaveClass("text-white");
  });

  it("handles interactive card clicks", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(<Card variant="interactive" onClick={handleClick}>Cartão Clicável</Card>);

    const card = screen.getByText("Cartão Clicável");
    expect(card).toHaveClass("cursor-pointer");

    await user.click(card);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
