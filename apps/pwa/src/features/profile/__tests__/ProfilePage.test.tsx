import { render, screen } from "@/lib/test-utils";
import ProfilePage from "../ProfilePage";

const mockRouter = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

describe("ProfilePage", () => {
  it("renders the page header", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Perfil")).toBeInTheDocument();
  });

  it("renders profile name and email", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Marina Silva")).toBeInTheDocument();
    expect(screen.getByText("marina@email.com")).toBeInTheDocument();
  });

  it("renders Editar perfil item", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Editar perfil")).toBeInTheDocument();
  });

  it("renders Segurança and Notificações as disabled with Em breve label", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Segurança")).toBeInTheDocument();
    expect(screen.getByText("Notificações")).toBeInTheDocument();
    const breves = screen.getAllByText("Em breve");
    expect(breves).toHaveLength(2);
  });



  it("renders Chat com Pi (WhatsApp) item", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Chat com Pi (WhatsApp)")).toBeInTheDocument();
  });

  it("renders Sair da conta button", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Sair da conta")).toBeInTheDocument();
  });

it("logout button triggers navigation", () => {
    render(<ProfilePage />);
    screen.getByText("Sair da conta").click();
    expect(mockRouter.push).toHaveBeenCalledWith("/");
    expect(mockRouter.refresh).toHaveBeenCalled();
  });
});
