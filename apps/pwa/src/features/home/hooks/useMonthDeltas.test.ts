import { renderHook } from "@/lib/test-utils";
import { useMonthDeltas } from "./useMonthDeltas";
import type { Transaction } from "@/lib/state/types";

function tx(
  id: string,
  kind: Transaction["kind"],
  amountCents: number,
  date: string,
  categoryId = "cat1",
): Transaction {
  return {
    id,
    description: id,
    amountCents,
    date,
    kind,
    categoryId,
    accountId: "acc1",
  };
}

describe("useMonthDeltas", () => {
  it("compares most-recent-month-with-data vs calendar previous", () => {
    const { result } = renderHook(() =>
      useMonthDeltas(
        [
          tx("july", "expense", 20000, "2026-07-10"),
          tx("june", "expense", 10000, "2026-06-10"),
        ],
        "expense",
      ),
    );
    expect(result.current).toBe(100);
  });

  it("returns null when there is no data or previous month is zero", () => {
    const { result: empty } = renderHook(() => useMonthDeltas([], "income"));
    expect(empty.current).toBeNull();

    const { result: noPrev } = renderHook(() =>
      useMonthDeltas([tx("june", "income", 10000, "2026-06-10")], "income"),
    );
    expect(noPrev.current).toBeNull();
  });

  it("ignores other kinds", () => {
    const { result } = renderHook(() =>
      useMonthDeltas(
        [
          tx("e1", "expense", 10000, "2026-06-10"),
          tx("i1", "income", 9999900, "2026-06-10"),
        ],
        "expense",
      ),
    );
    // Only one expense month (June) with no May → null, huge income ignored.
    expect(result.current).toBeNull();
  });
});
