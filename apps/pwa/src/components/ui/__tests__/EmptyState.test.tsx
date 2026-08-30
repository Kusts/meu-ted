import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        title="Nenhuma transação encontrada"
        description="Suas transações aparecerão aqui quando você registrar um gasto."
      />
    );

    expect(screen.getByText("Nenhuma transação encontrada")).toBeInTheDocument();
    expect(
      screen.getByText("Suas transações aparecerão aqui quando você registrar um gasto.")
    ).toBeInTheDocument();
  });

  it("renders custom action button and responds to clicks", async () => {
    const handleAction = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState
        title="Nenhum alerta"
        action={<button onClick={handleAction}>Novo Alerta</button>}
      />
    );

    const button = screen.getByRole("button", { name: "Novo Alerta" });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });
});
