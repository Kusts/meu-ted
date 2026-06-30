import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WriteErrorBanner } from "../WriteErrorBanner";

describe("WriteErrorBanner", () => {
  it("renders nothing when message is null", () => {
    const { container } = render(
      <WriteErrorBanner message={null} onDismiss={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the error message", () => {
    render(
      <WriteErrorBanner message="Backend indisponível" onDismiss={vi.fn()} />,
    );
    expect(screen.getByText(/backend indisponível/i)).toBeInTheDocument();
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <WriteErrorBanner message="Erro de rede" onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
