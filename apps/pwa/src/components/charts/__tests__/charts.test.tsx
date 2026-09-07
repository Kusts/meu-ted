import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@/lib/test-utils";
import { DonutChart } from "../DonutChart";
import { CashflowAreaChart } from "../CashflowAreaChart";
import { BudgetBulletBars } from "../BudgetBulletBars";
import { WeeklyHeatmap } from "../WeeklyHeatmap";
import { KpiCard } from "../KpiCard";

const fmt = (cents: number): string => `R$ ${(cents / 100).toFixed(2)}`;

describe("DonutChart", () => {
  const slices = [
    { id: "m1", name: "Moradia", valueCents: 50000, color: "#3E6FB0" },
    { id: "m2", name: "Comida", valueCents: 30000, color: "#E53E3E" },
  ];

  it("renders slice values and total in the accessible summary", () => {
    render(<DonutChart slices={slices} formatValue={fmt} />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toContain("R$ 800.00");
    expect(svg.getAttribute("aria-label")).toContain("Moradia");
    // Center shows the first (largest) slice value (also listed in the legend).
    expect(screen.getAllByText("R$ 500.00").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the tapped slice value in the center", () => {
    render(<DonutChart slices={slices} formatValue={fmt} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Comida/ }));
    expect(screen.getByText("R$ 300.00")).toBeInTheDocument();
  });

  it("renders a gray Outras slice passed by the caller", () => {
    render(
      <DonutChart
        slices={[...slices, { id: "outras", name: "Outras", valueCents: 20000, color: "#9AA5A0" }]}
        formatValue={fmt}
      />,
    );
    expect(screen.getByRole("button", { name: /Outras/ })).toBeInTheDocument();
  });
});

describe("CashflowAreaChart", () => {
  it("draws current area plus dashed previous line with text alternative", () => {
    const { container } = render(
      <CashflowAreaChart
        current={[
          { date: "2026-09-01", valueCents: -1000 },
          { date: "2026-09-02", valueCents: 5000 },
        ]}
        previous={[{ date: "2026-08-25", valueCents: 0 }]}
        formatValue={fmt}
      />,
    );
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toContain("R$ 50.00");
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(2);
  });
});

describe("BudgetBulletBars", () => {
  it("paints over-100% bars red with goal marker and text alternative", () => {
    const { container } = render(
      <BudgetBulletBars
        items={[{ id: "b1", name: "Lazer", spentCents: 12000, amountCents: 10000, pctUsed: 120 }]}
        formatValue={fmt}
      />,
    );
    // jsdom serializes hex to rgb: #F87171 -> rgb(248, 113, 113).
    const fill = container.querySelector('[style*="248, 113, 113"]');
    expect(fill).not.toBeNull();
    expect(screen.getByText("120%")).toBeInTheDocument();
    expect(screen.getByLabelText(/acima do teto/)).toBeInTheDocument();
  });

  it("uses mint below the ceiling", () => {
    const { container } = render(
      <BudgetBulletBars
        items={[{ id: "b1", name: "Comida", spentCents: 5000, amountCents: 10000, pctUsed: 50 }]}
        formatValue={fmt}
      />,
    );
    expect(container.querySelector('[style*="102, 194, 163"]')).not.toBeNull();
  });
});

describe("WeeklyHeatmap", () => {
  const weeks = [0, 1, 2, 3].map((w) => ({
    weekStart: `2026-08-${17 + w * 7}`,
    days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      date: `2026-08-${17 + w * 7 + d}`,
      totalCents: d === 0 ? 1000 * (w + 1) : 0,
      level: (d === 0 ? Math.min(4, w + 1) : 0) as 0 | 1 | 2 | 3 | 4,
    })),
  }));

  it("renders 7 rows x 4 columns with legend and summary", () => {
    const { container } = render(<WeeklyHeatmap weeks={weeks} formatValue={fmt} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("R$ 40.00");
    expect(container.querySelectorAll('[title^="2026-08"]').length).toBe(28);
    expect(screen.getByText("Mais")).toBeInTheDocument();
  });
});

describe("KpiCard", () => {
  it("renders value, delta and sparkline with accessible group label", () => {
    render(<KpiCard label="Taxa de poupança" value="25%" deltaText="+5 p.p. vs mês anterior" trend="up" spark={[10, 20, 25]} hint="meta >20%" />);
    expect(screen.getByRole("group", { name: /Taxa de poupança: 25%/ })).toBeInTheDocument();
    expect(screen.getByText("+5 p.p. vs mês anterior")).toBeInTheDocument();
    expect(screen.getByText("meta >20%")).toBeInTheDocument();
  });
});
