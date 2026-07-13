import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BottomNav from "../BottomNav";

describe("BottomNav", () => {
  const noop = () => {};
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
});