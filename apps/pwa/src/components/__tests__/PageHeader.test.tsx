import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/lib/test-utils";
import PageHeader from "../PageHeader";

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value });
}

describe("PageHeader morphing (item premium 1)", () => {
  beforeEach(() => {
    setScrollY(0);
  });

  it("renders the large title and offsets the top with the safe-area inset", () => {
    const { container } = render(<PageHeader title="Contas a pagar" />);
    expect(screen.getByRole("heading", { name: "Contas a pagar" })).toBeInTheDocument();
    expect(container.innerHTML).toMatch(/env\(safe-area-inset-top\)/);
    expect(container.innerHTML).toMatch(/var\(--page-pt\)/);
  });

  it("renders subtitle, action, TED shortcut and profile avatar", () => {
    render(
      <PageHeader
        title="Registros"
        subtitle="Tudo que entrou e saiu"
        action={<button type="button">Ação</button>}
      />,
    );
    expect(screen.getByText("Tudo que entrou e saiu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ação" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir assistente TED" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir perfil" })).toHaveAttribute("href", "/perfil");
  });

  it("mounts the compact bar only past 20px", () => {
    const { container } = render(<PageHeader title="Contas a pagar" />);
    expect(container.querySelector(".morph-bar")).not.toBeInTheDocument();

    setScrollY(64);
    fireEvent.scroll(window);
    const bar = container.querySelector(".morph-bar") as HTMLElement;
    expect(bar).toBeInTheDocument();
    expect(bar.textContent).toContain("Contas a pagar");
  });

  it("opens the TED chat from the header shortcut", async () => {
    const { openTedChat } = await import("@/features/ted/TedChatLauncher");
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<PageHeader title="Registros" />);
    await user.click(screen.getByRole("button", { name: "Abrir assistente TED" }));
    expect(dispatch).toHaveBeenCalled();
    expect(openTedChat).toBeDefined();
  });
});
