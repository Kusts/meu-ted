import { render, screen, fireEvent, act } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import BottomSheet, { SHEET_EXIT_MS } from "../BottomSheet";

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

const originalMatchMedia: typeof window.matchMedia | undefined =
  typeof window.matchMedia === "function" ? window.matchMedia : undefined;

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

function panel(): HTMLElement {
  return screen.getByTestId("bottom-sheet-panel");
}

function expectExitAnimation(el: HTMLElement) {
  // A animação de entrada é suprimida para o translateY(100%) prevalecer.
  expect(el.classList.contains("animate-sheet-up")).toBe(false);
  expect(el.style.animation).toBe("none");
  expect(el.style.transform).toBe("translateY(100%)");
  expect(el.style.transition).toContain(`transform ${SHEET_EXIT_MS}ms`);
  expect(el.style.transition).toContain("var(--easing-standard)");
}

function runExitTimers() {
  act(() => {
    vi.advanceTimersByTime(SHEET_EXIT_MS);
  });
}

function overlay(): Element {
  const dialog = screen.getByRole("dialog");
  const el = dialog.firstElementChild;
  if (!el) throw new Error("overlay not found");
  return el;
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

  it("animates exit on overlay click and calls onClose after the animation", () => {
    installMatchMedia(false);
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <BottomSheet open={true} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    fireEvent.click(overlay());

    expect(onClose).not.toHaveBeenCalled();
    expectExitAnimation(panel());
    runExitTimers();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("animates exit on close button click and calls onClose after the animation", () => {
    installMatchMedia(false);
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <BottomSheet open={true} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    fireEvent.click(screen.getByLabelText("Fechar"));

    expect(onClose).not.toHaveBeenCalled();
    expectExitAnimation(panel());
    runExitTimers();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("animates exit on Escape and calls onClose after the animation", () => {
    installMatchMedia(false);
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <BottomSheet open={true} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
    expectExitAnimation(panel());
    runExitTimers();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores repeated close triggers while the exit animation plays", () => {
    installMatchMedia(false);
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <BottomSheet open={true} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    fireEvent.click(overlay());
    fireEvent.click(screen.getByLabelText("Fechar"));
    fireEvent.keyDown(document, { key: "Escape" });

    runExitTimers();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("animates exit when the parent closes it (open=false) before unmounting", () => {
    installMatchMedia(false);
    vi.useFakeTimers();
    document.body.style.overflow = "";
    const onClose = vi.fn();
    const { rerender } = render(
      <BottomSheet open={true} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    rerender(
      <BottomSheet open={false} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    // Still mounted, playing the exit curve; scroll stays locked meanwhile.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expectExitAnimation(panel());
    expect(document.body.style.overflow).toBe("hidden");
    expect(onClose).not.toHaveBeenCalled();

    runExitTimers();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
    document.body.style.overflow = "";
  });

  it("animates exit even when closed right after opening (P2: entry suppressed)", () => {
    installMatchMedia(false);
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <BottomSheet open={true} onClose={onClose} title="Sheet">
        <div>content</div>
      </BottomSheet>,
    );

    // Entrada ainda em curso (sheetUp dura 280ms): a classe está ativa.
    expect(panel().classList.contains("animate-sheet-up")).toBe(true);

    // Fecha imediatamente: a saída deve prevalecer sobre a entrada.
    fireEvent.click(overlay());

    expect(onClose).not.toHaveBeenCalled();
    expectExitAnimation(panel());
    runExitTimers();
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
    it("animates exit on a long drag instead of snapping back", () => {
      installMatchMedia(false);
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(
        <BottomSheet open={true} onClose={onClose} title="Sheet">
          <div>content</div>
        </BottomSheet>,
      );

      drag(screen.getByTestId("bottom-sheet-drag"), 100, 220);

      // The finger-offset transform is NOT zeroed: the sheet eases out.
      expect(onClose).not.toHaveBeenCalled();
      expectExitAnimation(panel());
      runExitTimers();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close on a short drag and snaps back", () => {
      installMatchMedia(false);
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
      installMatchMedia(false);
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

  describe("prefers-reduced-motion (Onda 4: instant close)", () => {
    it("calls onClose immediately on overlay click", () => {
      installMatchMedia(true);
      const onClose = vi.fn();
      render(
        <BottomSheet open={true} onClose={onClose} title="Sheet">
          <div>content</div>
        </BottomSheet>,
      );

      fireEvent.click(overlay());

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose immediately on close button click", () => {
      installMatchMedia(true);
      const onClose = vi.fn();
      render(
        <BottomSheet open={true} onClose={onClose} title="Sheet">
          <div>content</div>
        </BottomSheet>,
      );

      fireEvent.click(screen.getByLabelText("Fechar"));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("unmounts immediately when the parent closes it", () => {
      installMatchMedia(true);
      const onClose = vi.fn();
      const { rerender } = render(
        <BottomSheet open={true} onClose={onClose} title="Sheet">
          <div>content</div>
        </BottomSheet>,
      );

      rerender(
        <BottomSheet open={false} onClose={onClose} title="Sheet">
          <div>content</div>
        </BottomSheet>,
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
