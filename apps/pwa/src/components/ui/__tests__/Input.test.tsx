import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Input } from "../Input";

describe("Input", () => {
  it("renders with placeholder and accepts user typing", async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(<Input placeholder="Digite seu nome" onChange={handleChange} />);

    const input = screen.getByPlaceholderText("Digite seu nome");
    expect(input).toBeInTheDocument();

    await user.type(input, "João");
    expect(handleChange).toHaveBeenCalled();
    expect(input).toHaveValue("João");
  });

  it("renders with associated label using htmlFor/id", () => {
    render(<Input label="E-mail" id="email-field" />);
    const label = screen.getByText("E-mail");
    const input = screen.getByLabelText("E-mail");

    expect(label).toHaveAttribute("for", "email-field");
    expect(input).toHaveAttribute("id", "email-field");
  });

  it("renders error message and aria-invalid attributes", () => {
    render(<Input label="Senha" error="Senha é obrigatória" />);
    const input = screen.getByLabelText("Senha");
    const errorMsg = screen.getByText("Senha é obrigatória");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveClass("border-danger");
    expect(errorMsg).toBeInTheDocument();
  });

  it("renders prefix and suffix elements", () => {
    render(<Input prefix="R$" suffix="BRL" placeholder="0,00" />);
    expect(screen.getByText("R$")).toBeInTheDocument();
    expect(screen.getByText("BRL")).toBeInTheDocument();
  });

  it("respects disabled state", () => {
    render(<Input disabled placeholder="Desabilitado" />);
    const input = screen.getByPlaceholderText("Desabilitado");
    expect(input).toBeDisabled();
  });

  it("uses 16px font-size so iOS does not auto-zoom on focus (WCAG/A5)", () => {
    render(<Input placeholder="Nome" />);
    expect(screen.getByPlaceholderText("Nome")).toHaveClass("text-[16px]");
  });
});
