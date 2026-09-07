import { render, screen } from "@/lib/test-utils";
import Hub from "../../hub/page";
import HubConfiguracoes from "../../hub/configuracoes/page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/hub",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("hub pages (item 13)", () => {
  it("hub lists the six canonical modules with links", () => {
    render(<Hub />);
    expect(screen.getByRole("heading", { name: "Hub" })).toBeInTheDocument();
    for (const [label, href] of [
      ["Patrimônio", "/hub/patrimonio"],
      ["Planejamento", "/hub/planejamento"],
      ["Relatórios", "/hub/relatorios"],
      ["Alertas", "/hub/alertas"],
      ["Categorias", "/hub/categorias"],
      ["Configurações", "/hub/configuracoes"],
    ] as const) {
      const link = screen.getByRole("link", { name: new RegExp(label) });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("configuracoes links the kept real subpages", () => {
    render(<HubConfiguracoes />);
    expect(screen.getByRole("heading", { name: "Configurações" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Perfil/ })).toHaveAttribute("href", "/perfil");
    expect(screen.getByRole("link", { name: /Workspaces/ })).toHaveAttribute("href", "/workspaces");
    expect(screen.getByRole("link", { name: /Auditoria/ })).toHaveAttribute("href", "/audit");
  });
});
