import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories } from "@/lib/state/mock-data";
import type { AppState, Transaction } from "@/lib/state/types";
import { TransactionEditSheet } from "../TransactionEditSheet";

const expenseTx: Transaction = {
  id: "tx1",
  kind: "expense",
  description: "Mercado",
  amountCents: 5000,
  date: "2026-06-01",
  categoryId: "cat1",
  accountId: "acc1",
};

function mockState(overrides: Partial<AppState> = {}): AppState {
  return {
    updateTransaction: vi.fn(),
    categories: [...mockCategories],
    accounts: [...mockAccounts],
    ...overrides,
  } as unknown as AppState;
}

function renderWithDirtyProvider(ui: ReactNode) {
  return render(<UnsavedChangesProvider>{ui}</UnsavedChangesProvider>);
}

describe("TransactionEditSheet — dirty-regression (live UnsavedChangesProvider)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps an edited description instead of snapping back to the original", async () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState());
    renderWithDirtyProvider(
      <TransactionEditSheet open onClose={vi.fn()} transaction={expenseTx} />,
    );

    const descInput = screen.getByLabelText("Descrição") as HTMLInputElement;
    fireEvent.change(descInput, { target: { value: "Mercado editado" } });

    // The edited value must SURVIVE microtasks/rerenders (dirty marking
    // must not reset the form to the original transaction values).
    await waitFor(() => expect(descInput).toHaveValue("Mercado editado"));
  });

  it("keeps an edited category instead of snapping back to the original", async () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState());
    renderWithDirtyProvider(
      <TransactionEditSheet open onClose={vi.fn()} transaction={expenseTx} />,
    );

    const categorySelect = screen.getByLabelText("Categoria") as HTMLSelectElement;
    expect(categorySelect).toHaveValue("cat1");
    fireEvent.change(categorySelect, { target: { value: "cat2" } });

    await waitFor(() => expect(categorySelect).toHaveValue("cat2"));
  });
});
