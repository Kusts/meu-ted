import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import BottomSheet from "../BottomSheet";

describe("BottomSheet", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <BottomSheet open={false} onClose={vi.fn()} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title and content when open=true", () => {
    render(
      <BottomSheet open={true} onClose={vi.fn()} title="Minha Sheet">
        <div>Meu conteúdo</div>
      </BottomSheet>,
    );
    expect(screen.getByText("Minha Sheet")).toBeInTheDocument();
    expect(screen.getByText("Meu conteúdo")).toBeInTheDocument();
  });

  it("calls onClose when backdrop overlay is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <BottomSheet open={true} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    const dialog = screen.getByRole("dialog");
    // The overlay is the first child of the dialog
    const overlay = dialog.firstElementChild;
    await user.click(overlay!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <BottomSheet open={true} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    await user.click(screen.getByLabelText("Fechar"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <BottomSheet open={true} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose for non-Escape keys", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <BottomSheet open={true} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    await user.keyboard("{Enter}");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("restores body overflow on unmount", () => {
    document.body.style.overflow = "scroll";
    const { unmount } = render(
      <BottomSheet open={true} onClose={vi.fn()} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
