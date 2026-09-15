import { describe, it, expect, vi, afterEach } from "vitest";
import { useLayoutEffect, useRef } from "react";
import { render, screen, fireEvent } from "@/lib/test-utils";
import { useOverlayDialog, getFocusableElements } from "../overlay-a11y";

// SPEC §21 (H2): shared overlay a11y primitive — initial focus, focus trap,
// focus restore, Escape (topmost only), stacking and background inert.

afterEach(() => {
  // Safety net: no test may leak inert marks into another test's DOM.
  document.querySelectorAll("[inert]").forEach((el) => el.removeAttribute("inert"));
});

interface TestOverlayProps {
  open: boolean;
  onClose?: () => void;
  initialFocus?: "first" | "container" | (() => HTMLElement | null);
  label?: string;
}

function TestOverlay({ open, onClose, initialFocus, label = "teste" }: TestOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  useOverlayDialog(ref, { open, onEscape: onClose, initialFocus });
  if (!open) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid={`overlay-${label}`}
    >
      <button type="button">primeiro {label}</button>
      <button type="button">meio {label}</button>
      <button type="button">último {label}</button>
    </div>
  );
}

describe("useOverlayDialog – initial focus", () => {
  it("moves initial focus to the first focusable element", () => {
    render(<TestOverlay open onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "primeiro teste" })).toHaveFocus();
  });

  it("supports initialFocus 'container'", () => {
    render(<TestOverlay open onClose={vi.fn()} initialFocus="container" />);
    expect(screen.getByTestId("overlay-teste")).toHaveFocus();
  });

  it("supports an explicit initial focus getter", () => {
    render(
      <TestOverlay
        open
        onClose={vi.fn()}
        initialFocus={() => screen.getByRole("button", { name: "meio teste" })}
      />,
    );
    expect(screen.getByRole("button", { name: "meio teste" })).toHaveFocus();
  });

  it("respects an element focused inside the overlay before the effect runs (React autoFocus)", () => {
    function AutoFocusButton() {
      const ref = useRef<HTMLButtonElement>(null);
      useLayoutEffect(() => {
        ref.current?.focus();
      }, []);
      return (
        <button ref={ref} type="button">
          auto
        </button>
      );
    }
    function AutoFocusOverlay() {
      const ref = useRef<HTMLDivElement>(null);
      useOverlayDialog(ref, { open: true });
      return (
        <div ref={ref} role="dialog" aria-modal="true" aria-label="auto">
          <button type="button">antes</button>
          <AutoFocusButton />
        </div>
      );
    }
    render(<AutoFocusOverlay />);
    expect(screen.getByRole("button", { name: "auto" })).toHaveFocus();
  });
});

describe("useOverlayDialog – focus trap", () => {
  it("wraps Tab from the last focusable back to the first", () => {
    render(<TestOverlay open onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "primeiro teste" });
    const last = screen.getByRole("button", { name: "último teste" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
  });

  it("wraps Shift+Tab from the first focusable to the last", () => {
    render(<TestOverlay open onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "primeiro teste" });
    const last = screen.getByRole("button", { name: "último teste" });
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("pulls focus into the dialog when Tab is pressed while focus is outside", () => {
    render(
      <>
        <button type="button">fundo</button>
        <TestOverlay open onClose={vi.fn()} />
      </>,
    );
    screen.getByRole("button", { name: "fundo" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "primeiro teste" })).toHaveFocus();
  });

  it("keeps focus on the container when there is nothing focusable inside", () => {
    function EmptyOverlay() {
      const ref = useRef<HTMLDivElement>(null);
      useOverlayDialog(ref, { open: true });
      return (
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="vazio"
          tabIndex={-1}
          data-testid="empty-overlay"
        />
      );
    }
    render(<EmptyOverlay />);
    const dialog = screen.getByTestId("empty-overlay");
    dialog.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(dialog).toHaveFocus();
  });
});

describe("useOverlayDialog – focus restore", () => {
  it("restores focus to the opener when it is still in the DOM", () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button" data-testid="trigger">
            abrir
          </button>
          <TestOverlay open={open} onClose={vi.fn()} />
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();

    rerender(<Harness open />);
    expect(screen.getByRole("button", { name: "primeiro teste" })).toHaveFocus();

    rerender(<Harness open={false} />);
    expect(trigger).toHaveFocus();
  });

  it("restores focus to the data-overlay-restore-fallback element when the opener is gone", () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          {open ? null : (
            <button type="button" data-testid="trigger">
              abrir
            </button>
          )}
          <button type="button" data-overlay-restore-fallback data-testid="fallback">
            destino seguro
          </button>
          <TestOverlay open={open} onClose={vi.fn()} />
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    screen.getByTestId("trigger").focus();

    rerender(<Harness open />);
    rerender(<Harness open={false} />);

    expect(screen.getByTestId("fallback")).toHaveFocus();
  });

  it("falls back to the first focusable element when the opener is gone and no fallback exists", () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button" data-testid="bg">
            fundo
          </button>
          <TestOverlay open={open} onClose={vi.fn()} />
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    document.body.focus();

    rerender(<Harness open />);
    rerender(<Harness open={false} />);

    expect(screen.getByTestId("bg")).toHaveFocus();
  });
});

describe("useOverlayDialog – Escape", () => {
  it("invokes onEscape when Escape is pressed while open", () => {
    const onClose = vi.fn();
    render(<TestOverlay open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onEscape while the overlay is closed", () => {
    const onClose = vi.fn();
    render(<TestOverlay open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("useOverlayDialog – stacking", () => {
  it("Escape closes only the topmost overlay of the stack", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    const a = render(<TestOverlay open={false} onClose={closeA} label="a" />);
    const b = render(<TestOverlay open={false} onClose={closeB} label="b" />);

    a.rerender(<TestOverlay open onClose={closeA} label="a" />);
    b.rerender(<TestOverlay open onClose={closeB} label="b" />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();

    b.rerender(<TestOverlay open={false} onClose={closeB} label="b" />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeA).toHaveBeenCalledTimes(1);
  });

  it("only the topmost overlay traps Tab while stacked", () => {
    const a = render(<TestOverlay open={false} onClose={vi.fn()} label="a" />);
    const b = render(<TestOverlay open={false} onClose={vi.fn()} label="b" />);
    a.rerender(<TestOverlay open onClose={vi.fn()} label="a" />);
    b.rerender(<TestOverlay open onClose={vi.fn()} label="b" />);

    // Focus somehow landed in the bottom overlay: Tab must recover into the
    // topmost one instead of letting two traps fight over the keys.
    screen.getByRole("button", { name: "meio a" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "primeiro b" })).toHaveFocus();
  });

  it("keeps focus inside the topmost overlay when the lower overlay closes", () => {
    function LowerOverlay({ open }: { open: boolean }) {
      return (
        <>
          <button type="button" data-testid="background-opener">
            fundo
          </button>
          <TestOverlay open={open} onClose={vi.fn()} label="a" />
        </>
      );
    }
    const a = render(<LowerOverlay open={false} />);
    const b = render(<TestOverlay open={false} onClose={vi.fn()} label="b" />);
    screen.getByTestId("background-opener").focus();
    a.rerender(<LowerOverlay open />);
    b.rerender(<TestOverlay open onClose={vi.fn()} label="b" />);

    a.rerender(<LowerOverlay open={false} />);

    expect(screen.getByRole("button", { name: "primeiro b" })).toHaveFocus();
  });
});

describe("useOverlayDialog – background inert", () => {
  function Harness({ open }: { open: boolean }) {
    return (
      <>
        <div data-testid="bg">
          <button type="button">fundo</button>
        </div>
        <TestOverlay open={open} onClose={vi.fn()} />
      </>
    );
  }

  it("marks background siblings inert while open and restores them on close", () => {
    const { rerender } = render(<Harness open={false} />);
    const bg = screen.getByTestId("bg");
    expect(bg).not.toHaveAttribute("inert");

    rerender(<Harness open />);
    expect(bg).toHaveAttribute("inert");

    rerender(<Harness open={false} />);
    expect(bg).not.toHaveAttribute("inert");
  });

  it("keeps the background inaccessible while at least one stacked overlay remains open", () => {
    const a = render(<Harness open={false} />);
    const b = render(<TestOverlay open={false} onClose={vi.fn()} label="b" />);

    a.rerender(<Harness open />);
    b.rerender(<TestOverlay open onClose={vi.fn()} label="b" />);

    const bg = screen.getByTestId("bg");
    expect(bg).toHaveAttribute("inert");

    // Bottom overlay closes; the top one still holds the background down.
    a.rerender(<Harness open={false} />);
    expect(bg.closest("[inert]")).not.toBeNull();

    // Last overlay closes: everything becomes accessible again.
    b.rerender(<TestOverlay open={false} onClose={vi.fn()} label="b" />);
    expect(bg.closest("[inert]")).toBeNull();
    expect(bg).not.toHaveAttribute("inert");
  });
});

describe("getFocusableElements", () => {
  it("returns focusable descendants in DOM order and skips disabled/hidden ones", () => {
    function Mixed() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <div ref={ref} data-testid="mixed">
          <button type="button">um</button>
          <button type="button" disabled>
            desabilitado
          </button>
          <input type="hidden" />
          <button type="button" hidden>
            oculto
          </button>
          <a href="#x">link</a>
          <textarea aria-label="texto" readOnly />
        </div>
      );
    }
    render(<Mixed />);
    const container = screen.getByTestId("mixed");
    const names = getFocusableElements(container).map((el) =>
      el.getAttribute("aria-label") ?? el.textContent,
    );
    expect(names).toEqual(["um", "link", "texto"]);
  });
});
