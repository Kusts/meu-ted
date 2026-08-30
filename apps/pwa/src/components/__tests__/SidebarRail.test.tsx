import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SidebarRail from "../SidebarRail";

let mockPath = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: vi.fn() }),
}));

describe("SidebarRail", () => {
  beforeEach(() => {
    mockPath = "/";
  });

  it("renders the Pi Financeiro logo and branding", () => {
    render(<SidebarRail onNewTransaction={vi.fn()} />);
    expect(screen.getByText("Pi Financeiro")).toBeInTheDocument();
  });

  it("renders primary navigation items (Resumo, Registros, A pagar, Cartões, Contas)", () => {
    render(<SidebarRail onNewTransaction={vi.fn()} />);
    expect(screen.getByText("Resumo")).toBeInTheDocument();
    expect(screen.getByText("Registros")).toBeInTheDocument();
    expect(screen.getByText("A pagar")).toBeInTheDocument();
    expect(screen.getByText("Cartões")).toBeInTheDocument();
    expect(screen.getByText("Contas")).toBeInTheDocument();
    expect(screen.getByText("Orçamentos")).toBeInTheDocument();
    expect(screen.getByText("Metas")).toBeInTheDocument();
    expect(screen.getByText("Patrimônio")).toBeInTheDocument();
  });

  it("marks the active route with aria-current='page'", () => {
    mockPath = "/registros";
    render(<SidebarRail onNewTransaction={vi.fn()} />);

    const registrosLink = screen.getByText("Registros").closest("a");
    expect(registrosLink).toHaveAttribute("aria-current", "page");

    const resumoLink = screen.getByText("Resumo").closest("a");
    expect(resumoLink).not.toHaveAttribute("aria-current");
  });

  it("links to the workspace manager and marks it active", () => {
    mockPath = "/workspaces";
    render(<SidebarRail onNewTransaction={vi.fn()} />);

    const workspacesLink = screen.getByRole("link", { name: "Workspaces" });
    expect(workspacesLink).toHaveAttribute("href", "/workspaces");
    expect(workspacesLink).toHaveAttribute("aria-current", "page");
  });

  it("calls onNewTransaction when new transaction button is clicked", async () => {
    const handleNewTx = vi.fn();
    const user = userEvent.setup();
    render(<SidebarRail onNewTransaction={handleNewTx} />);

    const newTxBtn = screen.getByRole("button", { name: /novo lançamento/i });
    await user.click(newTxBtn);
    expect(handleNewTx).toHaveBeenCalledTimes(1);
  });

  it("renders theme toggle button", async () => {
    render(<SidebarRail onNewTransaction={vi.fn()} />);
    const themeBtn = screen.getByLabelText(/alternar tema/i);
    expect(themeBtn).toBeInTheDocument();
  });
});
