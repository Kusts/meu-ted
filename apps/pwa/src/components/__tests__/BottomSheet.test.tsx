import { render, screen, fireEvent } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import BottomSheet from "../BottomSheet";

function drag(zone: HTMLElement, fromY: number, toY: number) {
  const point = (y: number) => [{ clientX: 200, clientY: y, identifier: 0 }];
  fireEvent.touchStart(zone, { touches: point(fromY) });
  fireEvent.touchMove(zone, { touches: point(toY) });
  fireEvent.touchEnd(zone, { touches: point(toY) });
}

function installMatchMedia(reduceMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches:
        query === "(prefers-reduced-motion: reduce)" ? reduceMotion : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => false,
    }),
  });
}

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

  it("restores the original body overflow on unmount (ref-counted lock)", () => {
    document.body.style.overflow = "scroll";
    const { unmount } = render(
      <BottomSheet open={true} onClose={vi.fn()} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    // Ref-counted lock restores the overflow captured before the acquire.
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = "";
  });

  describe("drag-to-dismiss (spec AGY Onda 2/3 §4.2)", () => {
    it("closes when the header is dragged down more than 90px", () => {
      const onClose = vi.fn();
      render(
        <BottomSheet open={true} onClose={onClose} title="Sheet">
          <div>content</div>
        </BottomSheet>,
      );

      drag(screen.getByTestId("bottom-sheet-drag"), 100, 220);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close on a short drag and snaps back", () => {
      const onClose = vi.fn();
      const { container } = render(
        <BottomSheet open={true} onClose={onClose} title="Sheet">
          <div>content</div>
        </BottomSheet>,
      );

      drag(screen.getByTestId("bottom-sheet-drag"), 100, 140);
      expect(onClose).not.toHaveBeenCalled();
      const sheet = container.querySelector(
        '[data-testid="bottom-sheet-drag"]',
      )?.parentElement as HTMLElement;
      expect(sheet.style.transform).toBe("");
    });

    it("does not close on an upward drag", () => {
      const onClose = vi.fn();
      render(
        <BottomSheet open={true} onClose={onClose} title="Sheet">
          <div>content</div>
        </BottomSheet>,
      );

      drag(screen.getByTestId("bottom-sheet-drag"), 220, 100);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("still closes on a long drag under reduced motion", () => {
      installMatchMedia(true);
      const onClose = vi.fn();
      render(
        <BottomSheet open={true} onClose={onClose} title="Sheet">
          <div>content</div>
        </BottomSheet>,
      );

      drag(screen.getByTestId("bottom-sheet-drag"), 100, 220);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not interfere with taps on content", async () => {
      const onClose = vi.fn();
      const onAction = vi.fn();
      const user = userEvent.setup();
      render(
        <BottomSheet open={true} onClose={onClose} title="Sheet">
          <button type="button" onClick={onAction}>
            Ação
          </button>
        </BottomSheet>,
      );

      await user.click(screen.getByRole("button", { name: "Ação" }));
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
