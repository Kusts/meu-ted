import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BottomNav from "../BottomNav";

describe("BottomNav", () => {
  const handlers = {
    onFabClick: vi.fn(),
    onMoreClick: vi.fn(),
    onNavClick: vi.fn(),
  };

  beforeEach(() => {
    handlers.onFabClick.mockClear();
    handlers.onMoreClick.mockClear();
    handlers.onNavClick.mockClear();
  });

  describe("rendering", () => {
    it("renders a nav element with data-nav='bottom'", () => {
      const { container } = render(
        <BottomNav
          active="home"
          onFabClick={handlers.onFabClick}
          onMoreClick={handlers.onMoreClick}
          onNavClick={handlers.onNavClick}
        />,
      );
      const nav = container.querySelector('[data-nav="bottom"]');
      expect(nav).toBeInTheDocument();
      expect(nav?.tagName).toBe("NAV");
    });

    it("renders the 4 nav items + FAB", () => {
      render(
        <BottomNav
          active="home"
          onFabClick={handlers.onFabClick}
          onMoreClick={handlers.onMoreClick}
          onNavClick={handlers.onNavClick}
        />,
      );
      expect(screen.getByText("Resumo")).toBeInTheDocument();
      expect(screen.getByText("Registros")).toBeInTheDocument();
      expect(screen.getByText("A pagar")).toBeInTheDocument();
      expect(screen.getByText("Mais")).toBeInTheDocument();
      expect(screen.getByLabelText("Nova transação")).toBeInTheDocument();
    });
  });

  describe("responsive containerization", () => {
    it("constrains itself to --shell-max-w so it stays inside the shell on desktop", () => {
      const { container } = render(
        <BottomNav
          active="home"
          onFabClick={handlers.onFabClick}
          onMoreClick={handlers.onMoreClick}
          onNavClick={handlers.onNavClick}
        />,
      );
      const nav = container.querySelector('[data-nav="bottom"]') as HTMLElement;
      expect(nav.className).toMatch(/max-w-\[var\(--shell-max-w\)\]/);
    });

    it("centers itself with mx-auto so it's not glued to viewport edges on desktop", () => {
      const { container } = render(
        <BottomNav
          active="home"
          onFabClick={handlers.onFabClick}
          onMoreClick={handlers.onMoreClick}
          onNavClick={handlers.onNavClick}
        />,
      );
      const nav = container.querySelector('[data-nav="bottom"]') as HTMLElement;
      expect(nav.className).toMatch(/mx-auto/);
    });

    it("remains fixed at the bottom (mobile-first invariant)", () => {
      const { container } = render(
        <BottomNav
          active="home"
          onFabClick={handlers.onFabClick}
          onMoreClick={handlers.onMoreClick}
          onNavClick={handlers.onNavClick}
        />,
      );
      const nav = container.querySelector('[data-nav="bottom"]') as HTMLElement;
      expect(nav.className).toMatch(/fixed/);
      expect(nav.className).toMatch(/bottom-0/);
    });
  });

  describe("interactions", () => {
    it("calls onFabClick when FAB is clicked", async () => {
      const user = userEvent.setup();
      render(
        <BottomNav
          active="home"
          onFabClick={handlers.onFabClick}
          onMoreClick={handlers.onMoreClick}
          onNavClick={handlers.onNavClick}
        />,
      );
      await user.click(screen.getByLabelText("Nova transação"));
      expect(handlers.onFabClick).toHaveBeenCalledTimes(1);
    });

    it("calls onMoreClick when Mais is clicked", async () => {
      const user = userEvent.setup();
      render(
        <BottomNav
          active="home"
          onFabClick={handlers.onFabClick}
          onMoreClick={handlers.onMoreClick}
          onNavClick={handlers.onNavClick}
        />,
      );
      await user.click(screen.getByText("Mais"));
      expect(handlers.onMoreClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("onda 5: larger tap targets (user feedback)", () => {
    function renderNav() {
      return render(
        <BottomNav
          active="home"
          onFabClick={handlers.onFabClick}
          onMoreClick={handlers.onMoreClick}
          onNavClick={handlers.onNavClick}
        />,
      );
    }

    it("renders nav icons at 24px", () => {
      const { container } = renderNav();
      const nav = container.querySelector('[data-nav="bottom"]')!;
      const iconSvgs = Array.from(nav.querySelectorAll("button svg")).filter(
        (svg) => svg.closest('button')?.getAttribute("aria-label") !== "Nova transação",
      );
      expect(iconSvgs).toHaveLength(4);
      for (const svg of iconSvgs) {
        expect(svg.getAttribute("width")).toBe("24");
        expect(svg.getAttribute("height")).toBe("24");
      }
    });

    it("renders labels at 11px", () => {
      renderNav();
      for (const label of ["Resumo", "Registros", "A pagar", "Mais"]) {
        expect(screen.getByText(label).className).toMatch(/text-\[11px\]/);
      }
    });

    it("keeps bar height on the token and touch targets >= 44px", () => {
      const { container } = renderNav();
      const nav = container.querySelector('[data-nav="bottom"]') as HTMLElement;
      expect(nav.style.height).toBe("var(--tab-bar-height)");
      const navButtons = Array.from(nav.querySelectorAll(":scope > button")) as HTMLElement[];
      expect(navButtons).toHaveLength(4);
      for (const btn of navButtons) {
        expect(btn.className).toMatch(/min-h-\[44px\]/);
      }
    });
  });

  describe("active indicator (spec AGY: pill + dot 4px)", () => {
    it("highlights the active tab with a pill bg + emerald dot and keeps aria-current", () => {
      const { container } = render(
        <BottomNav
          active="records"
          onFabClick={handlers.onFabClick}
          onMoreClick={handlers.onMoreClick}
          onNavClick={handlers.onNavClick}
        />,
      );
      const registrosBtn = screen.getByText("Registros").closest("button")!;
      expect(registrosBtn).toHaveAttribute("aria-current", "page");
      expect(registrosBtn.className).toMatch(/bg-primary-tint/);
      const dot = registrosBtn.querySelector('span[aria-hidden="true"]')!;
      expect(dot.className).toMatch(/bg-primary/);
      expect(dot.className).toMatch(/h-1 w-1/);

      // Inactive tabs keep a transparent dot (no layout shift) and no pill
      const resumoBtn = screen.getByText("Resumo").closest("button")!;
      expect(resumoBtn).not.toHaveAttribute("aria-current");
      expect(resumoBtn.className).not.toMatch(/bg-primary-tint/);
      const idleDot = resumoBtn.querySelector('span[aria-hidden="true"]')!;
      expect(idleDot.className).toMatch(/bg-transparent/);
      expect(container.querySelector('[data-nav="bottom"]')).toBeInTheDocument();
    });

    it("uses token-driven FAB gradient (A10, no hardcoded hex)", () => {
      render(
        <BottomNav
          active="home"
          onFabClick={handlers.onFabClick}
          onMoreClick={handlers.onMoreClick}
          onNavClick={handlers.onNavClick}
        />,
      );
      const fab = screen.getByLabelText("Nova transação") as HTMLElement;
      expect(fab.style.background).toContain("var(--primary)");
      expect(fab.style.background).toContain("var(--primary-dark)");
      expect(fab.style.background).not.toMatch(/#[0-9A-Fa-f]{6}/);
    });
  });
});