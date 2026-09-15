import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@/lib/test-utils";
import BottomSheet from "../ui/BottomSheet";
import { getFocusableElements } from "@/lib/ui/overlay-a11y";

// SPEC §21 (H2): the sheet must manage focus via the shared overlay
// primitive — initial focus, trap, restore and background inert.

function installReducedMotion() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
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
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
  document.querySelectorAll("[inert]").forEach((el) => el.removeAttribute("inert"));
});

interface SheetHarnessProps {
  open: boolean;
  onClose?: () => void;
}

function SheetHarness({ open, onClose = vi.fn() }: SheetHarnessProps) {
  return (
    <>
      <button type="button" data-testid="trigger">
        abrir sheet
      </button>
      <div data-testid="bg">
        <button type="button">fundo</button>
      </div>
      <BottomSheet open={open} onClose={onClose} title="Minha Sheet">
        <button type="button">conteúdo ação</button>
      </BottomSheet>
    </>
  );
}

describe("BottomSheet focus management (SPEC §21)", () => {
  it("moves initial focus to the sheet close button", () => {
    installReducedMotion();
    render(<SheetHarness open />);
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
  });

  it("traps Tab cycling inside the sheet in both directions", () => {
    installReducedMotion();
    render(<SheetHarness open />);
    const panel = screen.getByTestId("bottom-sheet-panel");
    const focusables = getFocusableElements(panel);
    expect(focusables.length).toBeGreaterThanOrEqual(2);

    const last = focusables[focusables.length - 1]!;
    const first = focusables[0]!;

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("pulls focus into the sheet when Tab is pressed from the background", () => {
    installReducedMotion();
    render(<SheetHarness open />);
    screen.getByRole("button", { name: "fundo" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    const panel = screen.getByTestId("bottom-sheet-panel");
    const focusables = getFocusableElements(panel);
    expect(focusables).toContain(document.activeElement);
  });

  it("restores focus to the opener after closing", () => {
    installReducedMotion();
    const { rerender } = render(<SheetHarness open={false} />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();

    rerender(<SheetHarness open />);
    rerender(<SheetHarness open={false} />);

    expect(trigger).toHaveFocus();
  });

  it("marks the background inert while open and restores it after close", () => {
    installReducedMotion();
    const { rerender } = render(<SheetHarness open={false} />);
    const bg = screen.getByTestId("bg");

    rerender(<SheetHarness open />);
    expect(bg).toHaveAttribute("inert");

    rerender(<SheetHarness open={false} />);
    expect(bg).not.toHaveAttribute("inert");
  });

  it("still closes on Escape through the shared primitive", () => {
    installReducedMotion();
    const onClose = vi.fn();
    render(<SheetHarness open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
