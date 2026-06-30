import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import GoalsPage from "../GoalsPage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals, mockDebts } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

function defaultState(): AppState {
  return {
    accounts: [...mockAccounts], categories: [...mockCategories],
    transactions: [...ALL_MOCK_TRANSACTIONS], payables: [...mockPayables],
    budgets: [...mockBudgets], goals: [...mockGoals],
    debts: [...mockDebts],
    subscriptions: [], loading: false, error: null,
    addTransaction: vi.fn(), deleteTransaction: vi.fn(), markPayablePaid: vi.fn(), cancelPayable: vi.fn(), createPayable: vi.fn(), createBudget: vi.fn(), updateBudget: vi.fn(), createGoal: vi.fn(), contributeToGoal: vi.fn(), cancelGoal: vi.fn(),
    cardStatements: [], writeError: null, clearWriteError: vi.fn(),
    sync: {
      accounts: { source: "mock", syncedAt: null },
      categories: { source: "mock", syncedAt: null },
      transactions: { source: "mock", syncedAt: null },
      payables: { source: "mock", syncedAt: null },
      budgets: { source: "mock", syncedAt: null },
      goals: { source: "mock", syncedAt: null },
      subscriptions: { source: "mock", syncedAt: null },
      cardStatements: { source: "mock", syncedAt: null },
    },
    readOnly: false,
    addAccount: vi.fn(), addCategory: vi.fn(), addCard: vi.fn(), updateCard: vi.fn(),
    addSubscription: vi.fn(), cancelSubscription: vi.fn(),
    createTransfer: vi.fn(), payStatement: vi.fn(), createInstallments: vi.fn(),
  };
}
function mockState(o: Partial<AppState>): AppState { return { ...defaultState(), ...o }; }

describe("GoalsPage", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  describe("with data", () => {
    it("renders page header", () => { render(<GoalsPage />); expect(screen.getByText("Metas & Dívidas")).toBeInTheDocument(); });
    it("renders goal cards", () => { render(<GoalsPage />); const reserva = screen.getAllByText("Reserva de emergência"); expect(reserva.length).toBeGreaterThanOrEqual(1); expect(screen.getByText("Viagem fim de ano")).toBeInTheDocument(); });
    it("shows percentages", () => { render(<GoalsPage />); expect(screen.getByText("25.0%")).toBeInTheDocument(); expect(screen.getByText("26.7%")).toBeInTheDocument(); });
    it("shows current/target amounts", () => { render(<GoalsPage />); expect(screen.getByText(/1\.500,\d{2}/)).toBeInTheDocument(); expect(screen.getByText(/6\.000,\d{2}/)).toBeInTheDocument(); });
    it("switches to Dívidas tab", async () => { const user = userEvent.setup(); render(<GoalsPage />); await user.click(screen.getByText("Dívidas")); expect(screen.getByText("Financiamento Carro")).toBeInTheDocument(); });
    it("active Metas tab by default", () => { render(<GoalsPage />); expect(screen.getByText("Metas")).toBeInTheDocument(); });
  });

  describe("loading", () => {
    it("shows loading indicator", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true })); render(<GoalsPage />); expect(screen.getByText(/carregando/i)).toBeInTheDocument(); expect(screen.queryByText("Metas")).not.toBeInTheDocument(); });
  });

  describe("error", () => {
    it("shows error banner alongside data", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "Erro API" })); render(<GoalsPage />); expect(screen.getByText(/Erro API/i)).toBeInTheDocument(); expect(screen.getByText("Metas")).toBeInTheDocument(); });
  });

  describe("debts tab — no debts (backend mode)", () => {
    it("shows 'não implementado' state when debts is empty", async () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({ goals: [], debts: [] }),
      );
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Dívidas"));
      expect(
        screen.getByText(/não disponível|em breve|não implementad/i),
      ).toBeInTheDocument();
    });
  });

  describe("dead CTA signals", () => {
    it("shows Em breve labels on debt cards instead of dead buttons", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Dívidas"));
      const emBreves = screen.getAllByText("Em breve");
      expect(emBreves.length).toBeGreaterThanOrEqual(2); // one on card header, one on next installment
    });

    it("opens new goal form when Nova is clicked", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Nova"));
      expect(screen.getByText("Nova meta")).toBeInTheDocument();
      expect(screen.getByText("Salvar meta")).toBeInTheDocument();
    });
  });
});
