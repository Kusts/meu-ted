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
    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  describe("retry CTA", () => {
    it("does not render retry button when onRetry is not provided", () => {
      render(
        <WriteErrorBanner message="Erro" onDismiss={vi.fn()} />,
      );
      expect(
        screen.queryByRole("button", { name: /tentar de novo/i }),
      ).not.toBeInTheDocument();
    });

    it("renders 'Tentar de novo' button when onRetry is provided", () => {
      render(
        <WriteErrorBanner
          message="Erro ao salvar"
          onDismiss={vi.fn()}
          onRetry={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("button", { name: /tentar de novo/i }),
      ).toBeInTheDocument();
    });

    it("calls onRetry when retry button is clicked", () => {
      const onRetry = vi.fn();
      render(
        <WriteErrorBanner
          message="Erro ao salvar"
          onDismiss={vi.fn()}
          onRetry={onRetry}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("does not call onDismiss when retry is clicked", () => {
      const onDismiss = vi.fn();
      const onRetry = vi.fn();
      render(
        <WriteErrorBanner
          message="Erro"
          onDismiss={onDismiss}
          onRetry={onRetry}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });
});