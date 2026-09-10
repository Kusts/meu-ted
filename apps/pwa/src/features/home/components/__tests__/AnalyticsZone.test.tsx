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

const cashflowOk = {
  current: [
    { date: "2026-09-01", valueCents: 100 },
    { date: "2026-09-02", valueCents: 200 },
  ],
  previous: [{ date: "2026-08-01", valueCents: 50 }],
};

const mockOk = () => {
  vi.mocked(client.apiFetch).mockImplementation(async (path: string) => {
    if (path.startsWith("/analytics/kpis")) return kpis as never;
    if (path.startsWith("/analytics/cashflow-series")) return cashflowOk as never;
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

const mockNullStates = () => {
  vi.mocked(client.apiFetch).mockImplementation(async (path: string) => {
    if (path.startsWith("/analytics/kpis")) {
      return {
        ...kpis,
        openInvoices: { committedCents: 80000, limitCents: 0, utilizationPct: null },
        savingsRatePct: null,
        previousSavingsRatePct: null,
        fixedVsDiscretionary: {
          fixedCents: 300000,
          discretionaryCents: 150000,
          fixedPctOfIncome: null,
        },
      } as never;
    }
    if (path.startsWith("/analytics/cashflow-series")) return cashflowOk as never;
    if (path.startsWith("/analytics/category-breakdown")) {
      return { slices: [], totalCents: 0, kind: "expense" } as never;
    }
    if (path.startsWith("/analytics/budget-consumption")) return { items: [] } as never;
    if (path.startsWith("/analytics/daily-heatmap")) {
      return { endDate: "2026-09-07", weeks: [] } as never;
    }
    if (path.startsWith("/analytics/net-worth-history")) return { months: [] } as never;
    throw new Error(`unexpected path ${path}`);
  });
};

const calledPaths = () =>
  vi.mocked(client.apiFetch).mock.calls.map((call) => String(call[0]));

describe("HomeAnalyticsZone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("renderiza KPIs e fluxo sem heatmap e sem request de heatmap", async () => {
    mockOk();
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);

    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());
    // O saldo aparece no KPI e no resumo do Fluxo de caixa (integração).
    expect(screen.getAllByText("R$ 1.250,00")).toHaveLength(2);
    expect(screen.getByText("R$ 800,00")).toBeInTheDocument();
    expect(screen.getByText("22.5%")).toBeInTheDocument();
    expect(screen.getByText("R$ 3.000,00")).toBeInTheDocument();
    expect(screen.getByText("Fluxo de caixa")).toBeInTheDocument();
    // Heatmap saiu da Home (segue vivo em Reports).
    expect(screen.queryByText("Atividade semanal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("analytics-block-home-heatmap")).not.toBeInTheDocument();
    expect(calledPaths().some((p) => p.startsWith("/analytics/daily-heatmap"))).toBe(false);
  });

  it("indicadores têm títulos completos, ícones contextuais e micro-barras sem truncate", async () => {
    mockOk();
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);

    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());

    // Títulos completos, nunca cortados (o saldo também rotula o fluxo).
    expect(screen.getAllByText("Saldo disponível líquido")).toHaveLength(2);
    expect(screen.getByText("Faturas em aberto")).toBeInTheDocument();
    expect(screen.getByText("Taxa de poupança")).toBeInTheDocument();
    expect(screen.getByText("Fixo vs discricionário")).toBeInTheDocument();

    const grid = screen.getByTestId("home-kpi-grid");
    expect(grid.querySelectorAll(".truncate").length).toBe(0);

    // Um ícone Lucide contextual por indicador (aria-hidden).
    expect(grid.querySelectorAll('svg[aria-hidden="true"]').length).toBe(4);

    // Micro-barras semânticas de utilização do limite e % fixa da renda.
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBe(2);
    expect(
      screen.getByRole("progressbar", { name: /utilização do limite/i }),
    ).toHaveAttribute("aria-valuenow", "16");
    expect(screen.getByRole("progressbar", { name: /fixo/i })).toHaveAttribute(
      "aria-valuenow",
      "60",
    );
    expect(screen.getByText("uso de 16.0% do limite")).toBeInTheDocument();
    expect(screen.getByText("60.0% da renda é fixo")).toBeInTheDocument();
  });

  it("trata limite não informado e ausência de renda sem barras", async () => {
    mockNullStates();
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);

    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());

    expect(screen.getByText("Limite não informado")).toBeInTheDocument();
    // Poupança e Fixos sem renda: ambos sinalizam a ausência de renda.
    expect(screen.getAllByText("Sem renda no período")).toHaveLength(2);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("clampa layout legado com home-heatmap e não reexibe o bloco", async () => {
    mockOk();
    window.localStorage.setItem(
      "meu-ted:home-blocks",
      JSON.stringify({
        order: ["home-heatmap", "home-cashflow", "home-kpis"],
        hidden: ["home-heatmap"],
      }),
    );
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);

    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());
    expect(screen.queryByTestId("analytics-block-home-heatmap")).not.toBeInTheDocument();
    expect(screen.queryByText("Atividade semanal")).not.toBeInTheDocument();
    // O clamp preserva a ordem dos blocos conhecidos e descarta o id legado.
    const order = screen
      .getAllByTestId(/analytics-block-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["analytics-block-home-cashflow", "analytics-block-home-kpis"]);
    expect(calledPaths().some((p) => p.startsWith("/analytics/daily-heatmap"))).toBe(false);
  });

  it("repassa o saldo dos KPIs ao Fluxo de caixa com o rótulo do saldo", async () => {
    mockOk();
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);

    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());
    const cashflow = screen.getByTestId("analytics-block-home-cashflow");
    expect(within(cashflow).getByText("Saldo disponível líquido")).toBeInTheDocument();
    // O saldo (R$ 1.250,00) prevalece sobre o último ponto da série (R$ 2,00).
    expect(within(cashflow).getByTestId("cashflow-summary-value")).toHaveTextContent(
      "R$ 1.250,00",
    );
  });

  it("filtro de conta realimenta os endpoints", async () => {
    mockOk();
    const user = userEvent.setup();
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);

    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Conta: Todas/ }));
    await user.click(screen.getByRole("button", { name: "Nubank" }));

    await waitFor(() => {
      const kpisCalls = calledPaths().filter((p) => p.startsWith("/analytics/kpis"));
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
    const cashflowSection = screen.getByTestId("analytics-block-home-cashflow");
    await user.click(
      within(cashflowSection).getByRole("button", { name: /Mover Fluxo de caixa para cima/ }),
    );
    const order = screen
      .getAllByTestId(/analytics-block-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(order[0]).toBe("analytics-block-home-cashflow");

    unmount();
    render(<HomeAnalyticsZone accounts={ACCOUNTS} />);
    await waitFor(() => expect(screen.getByTestId("home-kpi-grid")).toBeInTheDocument());
    const orderAfter = screen
      .getAllByTestId(/analytics-block-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(orderAfter[0]).toBe("analytics-block-home-cashflow");

    await user.click(screen.getByRole("button", { name: "Editar blocos" }));
    const cashflowAfter = screen.getByTestId("analytics-block-home-cashflow");
    await user.click(
      within(cashflowAfter).getByRole("button", { name: /Ocultar Fluxo de caixa/ }),
    );
    expect(cashflowAfter.getAttribute("data-hidden")).toBe("true");
  });
});
