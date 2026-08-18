import { render, screen } from "@/lib/test-utils";
import { describe, expect, it, vi } from "vitest";
import NewTransactionSheet from "@/components/NewTransactionSheet";
import type { Account, Category } from "@/lib/state/types";

const accounts: Account[] = [
  {
    id: "account-1",
    name: "Conta principal",
    balanceCents: 10000,
    kind: "checking",
    color: "#0E8C5A",
  },
];

const categories: Category[] = [
  {
    id: "category-1",
    name: "Alimentação",
    kind: "expense",
    icon: "UtensilsCrossed",
  },
];

describe("NewTransactionSheet prefill", () => {
  it("starts with the shared description", () => {
    render(
      <NewTransactionSheet
        accounts={accounts}
        categories={categories}
        onSave={vi.fn()}
        initialDescription="Mercado"
      />,
    );

    expect(screen.getByDisplayValue("Mercado")).toBeInTheDocument();
  });
});
