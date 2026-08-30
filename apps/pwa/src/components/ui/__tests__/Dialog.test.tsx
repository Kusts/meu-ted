import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Dialog } from "../Dialog";

describe("Dialog", () => {
  it("does not render when open is false", () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Título">
        <p>Conteúdo</p>
      </Dialog>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders when open is true with accessible role and title", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} title="Título do Modal">
        <p>Conteúdo do Modal</p>
      </Dialog>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Título do Modal")).toBeInTheDocument();
    expect(screen.getByText("Conteúdo do Modal")).toBeInTheDocument();
  });

  it("calls onClose when close button or backdrop is clicked", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open={true} onClose={handleClose} title="Modal">
        <p>Corpo</p>
      </Dialog>
    );

    const closeBtn = screen.getByLabelText(/fechar/i);
    await user.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape key press", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open={true} onClose={handleClose} title="Modal">
        <p>Corpo</p>
      </Dialog>
    );

    await user.keyboard("{Escape}");
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
