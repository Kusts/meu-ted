import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { HomeAnalyticsZone } from "../AnalyticsZone";
import * as client from "@/lib/api/client";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});

const ACCOUNTS = [
  { id: "acc-1", name: "Conta corrente" },
  { id: "acc-2", name: "Nubank" },
];

const kpis = {
  netLiquidBalanceCents: 125000,
  openInvoices: { committedCents: 80000, limitCents: 500000, utilizationPct: 16 },
  savingsRatePct: 22.5,
  savingsRateTargetPct: 20,
  previousSavingsRatePct: 18.0,
  fixedVsDiscretionary: { fixedCents: 300000, discretionaryCents: 150000, fixedPctOfIncome: 60 },
  incomeCents: 500000,
  expenseCents: 400000,
  previousIncomeCents: 450000,
  previousExpenseCents: 380000,
  netWorthCents: 200000,
};

const mockOk = () => {
  vi.mocked(client.apiFetch).mockImplementation(async (path: string) => {
    if (path.startsWith("/analytics/kpis")) return kpis as never;
    if (path.startsWith("/analytics/cashflow-series")) {
      return {
        current: [
          { date: "2026-09-01", valueCents: 100 },
          { date: "2026-09-02", valueCents: 200 },
        ],
        previous: [{ date: "2026-08-01", valueCents: 50 }],
      } as never;
    }
    if (path.startsWith("/analytics/category-breakdown")) {
      return { slices: [], totalCents: 0, kind: "expense" } as never;
    }
    if (path.startsWith("/analytics/budget-consumption")) return { items: [] } as never;
    if (path.startsWith("/analytics/daily-heatmap")) {
      return {
        endDate: "2026-09-07",
        weeks: [
          {
            weekStart: "2026-09-01",
            days: [
              { date: "2026-09-01", totalCents: 1000, level: 2 },
              { date: "2026-09-02", totalCents: 0, level: 0 },
            ],
          },
        ],
      } as never;
    }
    if (path.startsWith("/analytics/net-worth-history")) return { months: [] } as never;
    throw new Error(`unexpected path ${path}`);
  });
};

describe("HomeAnalyticsZone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("renderiza KPIs, fluxo e heatmap com dados reais", async () => {
    mockOk();
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);

    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());
    expect(screen.getByText("R$ 1.250,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 800,00")).toBeInTheDocument();
    expect(screen.getByText("22.5%")).toBeInTheDocument();
    expect(screen.getByText("R$ 3.000,00")).toBeInTheDocument();
    expect(screen.getByText("Fluxo de caixa")).toBeInTheDocument();
    expect(screen.getByText("Atividade semanal")).toBeInTheDocument();
  });

  it("filtro de conta realimenta os endpoints", async () => {
    mockOk();
    const user = userEvent.setup();
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);

    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Conta: Todas/ }));
    await user.click(screen.getByRole("button", { name: "Nubank" }));

    await waitFor(() => {
      const kpisCalls = vi
        .mocked(client.apiFetch)
        .mock.calls.map((call) => String(call[0]))
        .filter((p) => p.startsWith("/analytics/kpis"));
      expect(kpisCalls.some((p) => p.includes("accountId=acc-2"))).toBe(true);
    });
  });

  it("erro com retry nunca dá tela branca", async () => {
    vi.mocked(client.apiFetch).mockRejectedValue(new Error("rede caiu"));
    const user = userEvent.setup();
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);

    await waitFor(() =>
      expect(screen.getByText("Não foi possível carregar os gráficos.")).toBeInTheDocument(),
    );
    mockOk();
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());
  });

  it("personalização persiste ocultar/reordenar entre remounts", async () => {
    mockOk();
    const user = userEvent.setup();
    const { unmount } = render(<HomeAnalyticsZone accounts={ACCOUNTS} />);
    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Editar blocos" }));
    const heatmapSection = screen.getByTestId("analytics-block-home-heatmap");
    await user.click(within(heatmapSection).getByRole("button", { name: /Ocultar Atividade semanal/ }));
    expect(heatmapSection.getAttribute("data-hidden")).toBe("true");

    const cashflowSection = screen.getByTestId("analytics-block-home-cashflow");
    await user.click(within(cashflowSection).getByRole("button", { name: /Mover Fluxo de caixa para cima/ }));
    const order = screen
      .getAllByTestId(/analytics-block-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(order[0]).toBe("analytics-block-home-cashflow");

    unmount();
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);
    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());
    expect(screen.queryByText("Atividade semanal")).not.toBeInTheDocument();
    const orderAfter = screen
      .getAllByTestId(/analytics-block-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(orderAfter[0]).toBe("analytics-block-home-cashflow");
  });
});
