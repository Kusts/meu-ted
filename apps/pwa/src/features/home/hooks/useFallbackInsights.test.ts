import { renderHook } from "@/lib/test-utils";
import { useFallbackInsights } from "./useFallbackInsights";
import type {
  Budget,
  Payable,
  Transaction,
} from "@/lib/state/types";

function tx(partial: Partial<Transaction> & { id: string }): Transaction {
  return {
    description: partial.id,
    amountCents: 10000,
    date: "2026-06-20",
    kind: "expense",
    categoryId: "cat1",
    accountId: "acc1",
    ...partial,
  };
}

const base = {
  transactions: [] as Transaction[],
  budgets: [] as Budget[],
  payables: [] as Payable[],
  quickInsights: [],
  monthIncome: null as number | null,
  monthExpenses: null as number | null,
  macros: [],
};

describe("useFallbackInsights", () => {
  it("returns empty when there is no data source", () => {
    const { result } = renderHook(() => useFallbackInsights(base));
    expect(result.current).toEqual([]);
  });

  it("builds savings + top-macro insights from server totals and shared breakdown", () => {
    const { result } = renderHook(() =>
      useFallbackInsights({
        ...base,
        monthIncome: 1000000,
        monthExpenses: 600000,
        macros: [
          { name: "Moradia", amountCents: 150000, pct: 75 },
          { name: "Alimentação", amountCents: 50000, pct: 25 },
        ],
      }),
    );
    const titles = result.current.map((i) => i.title);
    expect(titles).toContain("Taxa de poupança");
    expect(titles).toContain("Maior categoria de gasto");
    const macro = result.current.find((i) => i.title === "Maior categoria de gasto")!;
    expect(macro.body).toMatch(/Moradia/);
  });

  it("keeps only specific API insights (with R$) alongside local ones", () => {
    const { result } = renderHook(() =>
      useFallbackInsights({
        ...base,
        monthIncome: 1000000,
        monthExpenses: 900000,
        quickInsights: [
          { id: "g", title: "Mês equilibrado", body: "Receitas e despesas empatadas.", severity: "info" },
          { id: "s", title: "Caixa crescendo", body: "Caixa subiu R$ 100,00 em 30 dias.", severity: "good" },
        ],
      }),
    );
    const titles = result.current.map((i) => i.title);
    expect(titles).toContain("Caixa crescendo");
    expect(titles).not.toContain("Mês equilibrado");
  });

  it("flags budgets near the limit with the concise copy", () => {
    const budget: Budget = {
      id: "b1",
      categoryId: "cat1",
      name: "Alimentação",
      amountCents: 50000,
      spentCents: 0,
      period: "monthly",
    };
    const { result } = renderHook(() =>
      useFallbackInsights({
        ...base,
        budgets: [budget],
        transactions: [tx({ id: "t1", amountCents: 48000 })],
        quickInsights: [],
      }),
    );
    const body = result.current.map((i) => i.body).join(" ");
    expect(body).toMatch(/Alimentação está perto do limite/);
  });
});
