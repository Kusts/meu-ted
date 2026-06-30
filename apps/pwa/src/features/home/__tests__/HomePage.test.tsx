import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import HomePage from "../HomePage";

const mockRouter = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes to profile when avatar button is clicked", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.click(screen.getByRole("button", { name: "M" }));

    expect(mockRouter.push).toHaveBeenCalledWith("/perfil");
  });

  it("opens notifications sheet when bell button is clicked", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.click(screen.getByRole("button", { name: "Notificações" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Notificações")).toBeInTheDocument();
    expect(screen.getByText("Contas a vencer hoje")).toBeInTheDocument();
  });
});
