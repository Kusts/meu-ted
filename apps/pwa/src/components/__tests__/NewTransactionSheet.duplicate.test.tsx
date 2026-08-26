import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import NewTransactionSheet from "../NewTransactionSheet";
import type { Account, Category } from "@/lib/state/types";

const accounts: Account[] = [
  { id: "acc1", name: "Nubank", balanceCents: 100000, kind: "checking", color: "#820AD1" },
];

const categories: Category[] = [
  { id: "cat1", name: "Alimentação", kind: "expense", icon: "UtensilsCrossed" },
];

describe("NewTransactionSheet duplicate-detector", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    localStorage.setItem("pi-finance:token", "tok-123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("mock de fetch detecta duplicate e mostra dialog de confirmação com force:true", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    // Mock fetch: first call is duplicate check returning duplicate_detected:true, second is not used directly (onSave is mocked)
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/transactions/detect-duplicate")) {
        return new Response(
          JSON.stringify({
            duplicate_detected: true,
            match: {
              id: "existing-1",
              description: "Supermercado Sao Paulo",
              amount_cents: "5000",
              date: "2026-08-26T00:00:00.000Z",
              match_type: "semantic",
              similarity: 0.85,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      // AppState bootstrap fetches (accounts, categories, etc.) — return empty list to avoid unhandled rejection
      if (url.includes("/accounts") || url.includes("/categories") || url.includes("/transactions") || url.includes("/payables") || url.includes("/budgets") || url.includes("/goals") || url.includes("/profile") || url.includes("/insights") || url.includes("/dashboard")) {
        return new Response(JSON.stringify({ items: [], total: 0, profile: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={onSave} />);

    // Fill amount and description that will trigger duplicate
    const valorInput = screen.getByPlaceholderText(/0,00/);
    await user.type(valorInput, "5000");
    const descInput = screen.getByPlaceholderText(/aluguel|descrição/i);
    await user.type(descInput, "Supermercado Sao Paulo");

    // Select category to allow save? Not required but fill
    await user.click(screen.getByText("Alimentação"));

    // Click Salvar -> should call detect-duplicate, not yet onSave
    await user.click(screen.getByRole("button", { name: /^Salvar$/ }));

    // Wait for dialog to appear with warning respecting formatDuplicateWarning
    await waitFor(() => {
      expect(screen.getByText(/Lançamento parecido encontrado/)).toBeInTheDocument();
    });
    // Warning message should contain formatDuplicateWarning pattern: includes match description, amount, similarity
    expect(screen.getByText(/Supermercado Sao Paulo/)).toBeInTheDocument();
    expect(screen.getByText(/85% similar/)).toBeInTheDocument();

    // onSave should not have been called yet (duplicate blocks)
    expect(onSave).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/transactions/detect-duplicate"),
      expect.objectContaining({ method: "POST" }),
    );

    // Click "Salvar mesmo assim" (force:true)
    await user.click(screen.getByRole("button", { name: /Salvar mesmo assim/ }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    // Verify saved data is the same pending data
    const saved = onSave.mock.calls[0][0];
    expect(saved.description).toBe("Supermercado Sao Paulo");
    expect(saved.amountCents).toBe(5000);
  });

  it("não bloqueia quando duplicate_detected false", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/transactions/detect-duplicate")) {
        return new Response(JSON.stringify({ duplicate_detected: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/accounts") || url.includes("/categories") || url.includes("/transactions") || url.includes("/payables") || url.includes("/budgets") || url.includes("/goals") || url.includes("/profile") || url.includes("/insights") || url.includes("/dashboard")) {
        return new Response(JSON.stringify({ items: [], total: 0, profile: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 });
    });

    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={onSave} />);
    await user.type(screen.getByPlaceholderText(/0,00/), "10000");
    await user.type(screen.getByPlaceholderText(/aluguel|descrição/i), "Unico");
    await user.click(screen.getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Lançamento parecido encontrado/)).not.toBeInTheDocument();
  });

  it("fail-open: quando detect falha, salva normalmente", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/transactions/detect-duplicate")) {
        return new Response("server error", { status: 500 });
      }
      if (url.includes("/accounts") || url.includes("/categories") || url.includes("/transactions") || url.includes("/payables") || url.includes("/budgets") || url.includes("/goals") || url.includes("/profile") || url.includes("/insights") || url.includes("/dashboard")) {
        return new Response(JSON.stringify({ items: [], total: 0, profile: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 });
    });

    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={onSave} />);
    await user.type(screen.getByPlaceholderText(/0,00/), "10000");
    await user.type(screen.getByPlaceholderText(/aluguel|descrição/i), "Teste fail-open");
    await user.click(screen.getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });
});
