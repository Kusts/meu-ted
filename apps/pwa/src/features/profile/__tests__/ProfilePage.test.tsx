import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import ProfilePage from "../ProfilePage";

const mockRouter = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("opens notifications sheet", async () => {
    const user = userEvent.setup();

    render(<ProfilePage />);

    await user.click(screen.getByRole("button", { name: /Notificações/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("Notificações").length).toBeGreaterThan(0);
    expect(screen.getByText("Resumo diário")).toBeInTheDocument();
  });

  it("renders Chat com Pi (WhatsApp) item", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Chat com Pi (WhatsApp)")).toBeInTheDocument();
  });

  it("renders Sair da conta button", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Sair da conta")).toBeInTheDocument();
  });

  it("logout button triggers navigation", async () => {
    const user = userEvent.setup();

    render(<ProfilePage />);

    await user.click(screen.getByText("Sair da conta"));

    expect(mockRouter.push).toHaveBeenCalledWith("/");
    expect(mockRouter.refresh).toHaveBeenCalled();
  });
});
