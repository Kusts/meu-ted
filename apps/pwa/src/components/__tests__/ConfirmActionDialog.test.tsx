import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import BottomSheet from "../ui/BottomSheet";

function Harness({ open }: { open: boolean }) {
  return (
    <>
      <button type="button" data-testid="trigger" onClick={() => {}}>
        Excluir conta
      </button>
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

describe("ConfirmActionDialog (P1-2 a11y)", () => {
  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmActionDialog
        open
        title="Confirmar exclusão"
        message="msg"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel for non-Escape keys", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmActionDialog
        open
        title="Confirmar exclusão"
        message="msg"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("exposes the title via aria-labelledby", () => {
    render(
      <ConfirmActionDialog
        open
        title="Confirmar exclusão"
        message="msg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const titleEl = document.getElementById(labelledBy!);
    expect(titleEl).toHaveTextContent("Confirmar exclusão");
  });

  it("restores focus to the trigger after closing", () => {
    const { rerender } = render(<Harness open={false} />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    expect(trigger).toHaveFocus();

    rerender(<Harness open={true} />);
    rerender(<Harness open={false} />);

    expect(trigger).toHaveFocus();
  });
});

describe("ConfirmActionDialog stacking (P1-3)", () => {
  it("renders above an open BottomSheet", () => {
    render(
      <BottomSheet open onClose={vi.fn()} title="Minha Sheet">
        <div>conteúdo</div>
      </BottomSheet>,
    );
    render(
      <ConfirmActionDialog
        open
        title="Confirmar exclusão"
        message="msg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialogs = screen.getAllByRole("dialog");
    const confirm = dialogs.find((el) =>
      el.textContent?.includes("Confirmar exclusão"),
    )!;
    const sheet = dialogs.find((el) => el.textContent?.includes("Minha Sheet"))!;

    const zOf = (el: Element) => {
      const z = getComputedStyle(el).zIndex;
      return z === "" || z === "auto" ? 0 : Number(z);
    };
    expect(zOf(confirm)).toBeGreaterThan(zOf(sheet));
  });
});
