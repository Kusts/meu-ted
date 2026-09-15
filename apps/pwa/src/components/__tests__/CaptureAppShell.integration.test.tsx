import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AppShell from "@/components/AppShell";
import { CaptureBridge } from "@/app/capture/capture-bridge";

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams({ kind: "expense", text: "Mercado" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/capture",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("@/lib/state/app-state-context", () => ({
  // TedChat calls useOptionalAppState unconditionally (null-safe via
  // optionalAppState?.reconcileMutation); this suite renders outside a
  // provider, so null is the coherent value — no reconciliation exercised.
  useOptionalAppState: () => null,
  useAppState: () => ({
    accounts: [
      {
        id: "account-1",
        name: "Conta principal",
        balanceCents: 10000,
        kind: "checking",
        color: "#0E8C5A",
      },
    ],
    categories: [
      {
        id: "category-1",
        name: "Alimentação",
        kind: "expense",
        icon: "UtensilsCrossed",
      },
    ],
    transactions: [],
    addTransaction: vi.fn(),
    createTransfer: vi.fn(),
    addAccount: vi.fn(),
    addCategory: vi.fn(),
    addCard: vi.fn(),
    createInstallments: vi.fn(),
  }),
}));

vi.mock("@/lib/sheet-context", () => ({
  useSheet: () => ({ sheetKind: null, closeSheet: vi.fn() }),
}));

vi.mock("@/lib/unsaved-changes", () => ({
  useUnsavedChangesSafe: () => ({ isDirty: false }),
  useFormDirtySafe: () => ({ markDirty: vi.fn(), markClean: vi.fn() }),
}));

vi.mock("@/components/BottomNav", () => ({
  // Mirrors the real FAB quick menu: opens a fresh preselected expense sheet.
  default: () => (
    <button
      type="button"
      aria-label="Nova transação"
      onClick={() => window.dispatchEvent(new CustomEvent("pwa:open-tx", { detail: { kind: "expense" } }))}
    />
  ),
}));

vi.mock("@/components/ConfirmActionDialog", () => ({
  ConfirmActionDialog: () => null,
}));

vi.mock("@/components/BottomSheet", () => ({
  default: ({
    open,
    children,
    onClose,
  }: {
    open: boolean;
    children: React.ReactNode;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="bottom-sheet">
        <button type="button" onClick={onClose}>
          Fechar
        </button>
        {children}
      </div>
    ) : null,
}));
describe("capture route with AppShell", () => {
  it("opens the real transaction form with the shared description", async () => {
    render(
      <AppShell>
        <CaptureBridge />
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Mercado")).toBeInTheDocument();
    });
  });
  it("clears shared description before opening a normal expense", async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <CaptureBridge />
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Mercado")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    await user.click(screen.getByRole("button", { name: "Nova transação" }));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Ex: Aluguel, mercado..."),
      ).toHaveValue("");
    });
  });
});
