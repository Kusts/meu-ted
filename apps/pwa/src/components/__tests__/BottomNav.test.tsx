import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BottomNav from "../BottomNav";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));

describe("BottomNav", () => {
  const handlers = {
    onNavClick: vi.fn(),
  };

  function renderNav(active: "home" | "records" | "compromissos" | "hub" | null = "home") {
    return render(<BottomNav active={active} onNavClick={handlers.onNavClick} />);
  }

  beforeEach(() => {
    handlers.onNavClick.mockClear();
    navigation.push.mockClear();
  });

  describe("rendering", () => {
    it("renders a nav element with data-nav='bottom'", () => {
      const { container } = renderNav();
      const nav = container.querySelector('[data-nav="bottom"]');
      expect(nav).toBeInTheDocument();
      expect(nav?.tagName).toBe("NAV");
    });

    it("renders the 4 canonical items + FAB (item 13)", () => {
      renderNav();
      expect(screen.getByText("Início")).toBeInTheDocument();
      expect(screen.getByText("Extrato")).toBeInTheDocument();
      expect(screen.getByText("Minhas Contas")).toBeInTheDocument();
      expect(screen.getByText("Mais")).toBeInTheDocument();
      expect(screen.getByLabelText("Nova transação")).toBeInTheDocument();
    });
  });

  describe("responsive containerization", () => {
    it("constrains itself to --shell-max-w so it stays inside the shell on desktop", () => {
      const { container } = renderNav();
      const nav = container.querySelector('[data-nav="bottom"]') as HTMLElement;
      expect(nav.className).toMatch(/max-w-\[var\(--shell-max-w\)\]/);
    });

    it("centers itself with mx-auto so it's not glued to viewport edges on desktop", () => {
      const { container } = renderNav();
      const nav = container.querySelector('[data-nav="bottom"]') as HTMLElement;
      expect(nav.className).toMatch(/mx-auto/);
    });

    it("remains fixed at the bottom (mobile-first invariant)", () => {
      const { container } = renderNav();
      const nav = container.querySelector('[data-nav="bottom"]') as HTMLElement;
      expect(nav.className).toMatch(/fixed/);
      expect(nav.className).toMatch(/bottom-0/);
    });
  });

  describe("interactions", () => {
    it("calls onNavClick when a tab is clicked", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(screen.getByText("Mais"));
      expect(handlers.onNavClick).toHaveBeenCalledWith("hub");
    });

    it("opens the quick menu when FAB is clicked", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByRole("menu", { name: "Novo lançamento" })).toBeInTheDocument();
      for (const label of ["Despesa", "Receita", "Transferência", "Ler Comprovante"]) {
        expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument();
      }
    });

    it("dispatches pwa:open-tx for Despesa/Receita/Transferência", async () => {
      const user = userEvent.setup();
      const dispatch = vi.spyOn(window, "dispatchEvent");
      renderNav();
      await user.click(screen.getByLabelText("Nova transação"));
      await user.click(screen.getByRole("menuitem", { name: "Receita" }));
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "pwa:open-tx" }),
      );
      const event = dispatch.mock.calls.map(([e]) => e).find((e) => (e as Event).type === "pwa:open-tx") as CustomEvent;
      expect(event.detail).toMatchObject({ kind: "income" });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("navigates to /capture for Ler Comprovante", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(screen.getByLabelText("Nova transação"));
      await user.click(screen.getByRole("menuitem", { name: "Ler Comprovante" }));
      expect(navigation.push).toHaveBeenCalledWith("/capture");
    });

    it("closes the quick menu on Escape", async () => {
      const user = userEvent.setup();
      renderNav();
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  describe("onda 5: larger tap targets (user feedback)", () => {
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
      for (const label of ["Início", "Extrato", "Minhas Contas", "Mais"]) {
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
      const { container } = renderNav("records");
      const extartoBtn = screen.getByText("Extrato").closest("button")!;
      expect(extartoBtn).toHaveAttribute("aria-current", "page");
      expect(extartoBtn.className).toMatch(/bg-primary-tint/);
      const dot = extartoBtn.querySelector('span[aria-hidden="true"]')!;
      expect(dot.className).toMatch(/bg-primary/);
      expect(dot.className).toMatch(/h-1 w-1/);

      // Inactive tabs keep a transparent dot (no layout shift) and no pill
      const inicioBtn = screen.getByText("Início").closest("button")!;
      expect(inicioBtn).not.toHaveAttribute("aria-current");
      expect(inicioBtn.className).not.toMatch(/bg-primary-tint/);
      const idleDot = inicioBtn.querySelector('span[aria-hidden="true"]')!;
      expect(idleDot.className).toMatch(/bg-transparent/);
      expect(container.querySelector('[data-nav="bottom"]')).toBeInTheDocument();
    });

    it("uses token-driven FAB gradient (A10, no hardcoded hex)", () => {
      renderNav();
      const fab = screen.getByLabelText("Nova transação") as HTMLElement;
      expect(fab.style.background).toContain("var(--primary)");
      expect(fab.style.background).toContain("var(--primary-dark)");
      expect(fab.style.background).not.toMatch(/#[0-9A-Fa-f]{6}/);
    });
  });
});
