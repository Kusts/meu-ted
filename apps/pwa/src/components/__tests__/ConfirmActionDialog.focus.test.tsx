import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmActionDialog } from "../ConfirmActionDialog";

// SPEC §21 (H2): the confirm dialog is migrated from its local focus pattern
// to the shared overlay primitive — behavior must be equivalent or better.

afterEach(() => {
  document.querySelectorAll("[inert]").forEach((el) => el.removeAttribute("inert"));
});

interface DialogHarnessProps {
  open: boolean;
}

function DialogHarness({ open }: DialogHarnessProps) {
  return (
    <>
      <button type="button" data-testid="trigger">
        Excluir conta
      </button>
      <div data-testid="bg">
        <button type="button">fundo</button>
      </div>
      <ConfirmActionDialog
        open={open}
        title="Confirmar exclusão"
        message="Esta ação não pode ser desfeita."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    </>
  );
}

describe("ConfirmActionDialog focus management (SPEC §21)", () => {
  it("keeps initial focus on the dialog container", () => {
    render(<DialogHarness open />);
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("traps Tab cycling between the action buttons in both directions", () => {
    render(<DialogHarness open />);
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    const confirm = screen.getByRole("button", { name: "Confirmar" });

    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(cancel).toHaveFocus();

    cancel.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it("restores focus to the opener after closing", () => {
    const { rerender } = render(<DialogHarness open={false} />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();

    rerender(<DialogHarness open />);
    rerender(<DialogHarness open={false} />);

    expect(trigger).toHaveFocus();
  });

  it("marks the background inert while open and restores it after close", () => {
    const { rerender } = render(<DialogHarness open={false} />);
    const bg = screen.getByTestId("bg");
    expect(bg).not.toHaveAttribute("inert");

    rerender(<DialogHarness open />);
    expect(bg).toHaveAttribute("inert");

    rerender(<DialogHarness open={false} />);
    expect(bg).not.toHaveAttribute("inert");
  });
});
