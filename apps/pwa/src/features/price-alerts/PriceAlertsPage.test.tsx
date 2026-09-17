import { render, screen } from "@/lib/test-utils";
import PriceAlertsPage from "./PriceAlertsPage";
import { ApiError } from "@/lib/api/client";
import { fetchPriceAlerts } from "@/lib/api/endpoints";

vi.mock("@/lib/api/endpoints", () => ({
  fetchPriceAlerts: vi.fn(),
  createPriceAlert: vi.fn(),
}));

vi.mock("@/components/StatusBar", () => ({
  default: () => null,
}));

vi.mock("@/components/PageHeader", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

describe("PriceAlertsPage flag-OFF gating (phase 7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an explicit unavailable state when GET /alerts/price 404s", async () => {
    vi.mocked(fetchPriceAlerts).mockRejectedValueOnce(new ApiError(404, "not_found", "Not Found"));
    render(<PriceAlertsPage />);
    expect(await screen.findByText("Alertas de preço indisponíveis")).toBeInTheDocument();
    expect(screen.getByText("Este recurso está desativado no momento.")).toBeInTheDocument();
    expect(screen.queryByText("Novo alerta")).not.toBeInTheDocument();
  });

  it("renders the form and empty state when the endpoint answers", async () => {
    vi.mocked(fetchPriceAlerts).mockResolvedValueOnce([]);
    render(<PriceAlertsPage />);
    expect(await screen.findByText("Novo alerta")).toBeInTheDocument();
    expect(screen.getByText("Nenhum alerta")).toBeInTheDocument();
  });
});
