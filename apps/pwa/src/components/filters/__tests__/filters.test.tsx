import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@/lib/test-utils";
import { FilterPillBar } from "../FilterPillBar";
import {
  AnalyticsFiltersProvider,
  useAnalyticsFilters,
  ANALYTICS_FILTERS_KEY,
  DEFAULT_ANALYTICS_FILTERS,
} from "../analytics-filters";

const accounts = [
  { id: "acc-1", name: "Nubank" },
  { id: "acc-2", name: "Itaú" },
];

describe("FilterPillBar", () => {
  const base = { period: "last30days" as const };

  it("shows current period and account labels", () => {
    render(<FilterPillBar filters={base} accounts={accounts} onPeriodChange={vi.fn()} onAccountChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Período: Últimos 30 dias/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Conta: Todas/ })).toBeInTheDocument();
  });

  it("opens the period drawer and selects Mês Passado", () => {
    const onPeriodChange = vi.fn();
    render(<FilterPillBar filters={base} accounts={accounts} onPeriodChange={onPeriodChange} onAccountChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Período:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mês Passado" }));
    expect(onPeriodChange).toHaveBeenCalledWith("lastMonth");
  });

  it("requires both custom dates before confirming", () => {
    const onPeriodChange = vi.fn();
    render(<FilterPillBar filters={base} accounts={accounts} onPeriodChange={onPeriodChange} onAccountChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Período:/ }));
    const ok = screen.getByRole("button", { name: "OK" });
    expect(ok).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Data inicial personalizada"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Data final personalizada"), { target: { value: "2026-01-31" } });
    expect(screen.getByRole("button", { name: "OK" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onPeriodChange).toHaveBeenCalledWith("custom", { from: "2026-01-01", to: "2026-01-31" });
  });

  it("selects and clears an account", () => {
    const onAccountChange = vi.fn();
    render(
      <FilterPillBar
        filters={{ ...base, accountId: "acc-1" }}
        accounts={accounts}
        onPeriodChange={vi.fn()}
        onAccountChange={onAccountChange}
      />,
    );
    expect(screen.getByRole("button", { name: /Conta: Nubank/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Conta: Nubank/ }));
    fireEvent.click(screen.getByRole("button", { name: "Itaú" }));
    expect(onAccountChange).toHaveBeenCalledWith("acc-2");
  });
});

describe("analytics-filters store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function Probe() {
    const { filters, setPeriod, setAccountId, reset } = useAnalyticsFilters();
    return (
      <div>
        <span data-testid="state">{JSON.stringify(filters)}</span>
        <button type="button" onClick={() => setPeriod("lastMonth")}>
          month
        </button>
        <button type="button" onClick={() => setAccountId("acc-9")}>
          account
        </button>
        <button type="button" onClick={reset}>
          reset
        </button>
      </div>
    );
  }

  it("persists to localStorage and restores on mount", () => {
    const { unmount } = render(
      <AnalyticsFiltersProvider>
        <Probe />
      </AnalyticsFiltersProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText("month"));
      fireEvent.click(screen.getByText("account"));
    });
    expect(window.localStorage.getItem(ANALYTICS_FILTERS_KEY)).toContain("lastMonth");
    unmount();
    render(
      <AnalyticsFiltersProvider>
        <Probe />
      </AnalyticsFiltersProvider>,
    );
    expect(screen.getByTestId("state").textContent).toContain("acc-9");
  });

  it("falls back to defaults on corrupt storage", () => {
    window.localStorage.setItem(ANALYTICS_FILTERS_KEY, "not-json{{{");
    render(
      <AnalyticsFiltersProvider>
        <Probe />
      </AnalyticsFiltersProvider>,
    );
    expect(screen.getByTestId("state").textContent).toContain(JSON.stringify(DEFAULT_ANALYTICS_FILTERS.period));
  });
});
