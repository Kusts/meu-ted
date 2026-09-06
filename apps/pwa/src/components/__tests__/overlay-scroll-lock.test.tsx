import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BottomSheet from "../ui/BottomSheet";
import { Dialog } from "../ui/Dialog";
import { ConfirmActionDialog } from "../ConfirmActionDialog";

function Sheet({ open }: { open: boolean }) {
  return (
    <BottomSheet open={open} onClose={vi.fn()} title="Sheet">
      <div>conteúdo</div>
    </BottomSheet>
  );
}

function Modal({ open }: { open: boolean }) {
  return (
    <Dialog open={open} onClose={vi.fn()} title="Modal">
      <div>conteúdo</div>
    </Dialog>
  );
}

describe("overlay scroll lock ref counting (P1-3)", () => {
  it("keeps body locked while a second overlay remains open (sheet + dialog)", async () => {
    const { rerender: rerenderSheet } = render(<Sheet open={false} />);
    const { rerender: rerenderModal } = render(<Modal open={false} />);

    rerenderSheet(<Sheet open={true} />);
    rerenderModal(<Modal open={true} />);
    expect(document.body.style.overflow).toBe("hidden");

    // First overlay closes, second stays open: lock must remain.
    // (The sheet plays its exit animation before releasing.)
    rerenderSheet(<Sheet open={false} />);
    expect(document.body.style.overflow).toBe("hidden");

    rerenderModal(<Modal open={false} />);
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("keeps body locked while a BottomSheet stays open under a ConfirmActionDialog", async () => {
    const { rerender: rerenderSheet } = render(<Sheet open={false} />);
    const { rerender: rerenderConfirm } = render(
      <ConfirmActionDialog
        open={false}
        title="Confirmar"
        message="msg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    rerenderSheet(<Sheet open={true} />);
    rerenderConfirm(
      <ConfirmActionDialog
        open={true}
        title="Confirmar"
        message="msg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerenderConfirm(
      <ConfirmActionDialog
        open={false}
        title="Confirmar"
        message="msg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerenderSheet(<Sheet open={false} />);
    // The sheet plays its exit animation before releasing the lock.
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });
});
