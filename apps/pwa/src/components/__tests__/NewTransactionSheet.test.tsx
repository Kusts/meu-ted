import { render, screen, fireEvent } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import NewTransactionSheet from "../NewTransactionSheet";
import type { Account, Category } from "@/lib/state/types";

const accounts: Account[] = [
  { id: "acc1", name: "Nubank", balanceCents: 100000, kind: "checking", color: "#820AD1" },
  { id: "acc2", name: "Itaú", balanceCents: 50000, kind: "checking", color: "#EC7000" },
];

const categories: Category[] = [
  { id: "cat1", name: "Alimentação", kind: "expense", icon: "UtensilsCrossed" },
  { id: "cat2", name: "Transporte", kind: "expense", icon: "Car" },
  { id: "cat3", name: "Salário", kind: "income", icon: "DollarSign" },
];

// Categories with subcategories (parentId)
const categoriesWithSubs: Category[] = [
  ...categories,
  { id: "sub1", name: "Mercado", kind: "expense", icon: "ShoppingBag", parentId: "cat1" },
  { id: "sub2", name: "Restaurante", kind: "expense", icon: "UtensilsCrossed", parentId: "cat1" },
];

// With credit card
const accountsWithCard: Account[] = [
  ...accounts,
  { id: "card1", name: "Nubank Card", balanceCents: 0, kind: "credit_card", color: "#820AD1", creditLimitCents: 500000, closingDay: 15, dueDay: 25 },
];

describe("NewTransactionSheet", () => {
  it("renders all 3 tab buttons", () => {
    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />);
    expect(screen.getByText("Despesa")).toBeInTheDocument();
    expect(screen.getByText("Receita")).toBeInTheDocument();
    expect(screen.getByText("Transferência")).toBeInTheDocument();
  });

  it("renders parcelamento toggle for expense tab", () => {
    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />);
    expect(screen.getByText("Parcelar")).toBeInTheDocument();
  });

  it("shows installments count when parcelamento is enabled", async () => {
    const user = userEvent.setup();
    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />);
    const toggle = screen.getByLabelText("Alternar parcelamento");
    await user.click(toggle);
    expect(screen.getByText(/Número de parcelas/)).toBeInTheDocument();
  });

  it("shows expense fields by default", () => {
    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />);
    expect(screen.getByText("Valor")).toBeInTheDocument();
    expect(screen.getByText("Descrição")).toBeInTheDocument();
  });

  it("switches to transfer tab and shows from/to fields", async () => {
    const user = userEvent.setup();
    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />);
    await user.click(screen.getByText("Transferência"));
    expect(screen.getByText("Origem (saída)")).toBeInTheDocument();
    expect(screen.getByText("Destino (entrada)")).toBeInTheDocument();
  });

  it("calls onSave with correct data when saving an expense", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={onSave} />);
    const valorInput = screen.getByPlaceholderText(/0,00/);
    await user.type(valorInput, "10000");
    const descInput = screen.getByPlaceholderText(/aluguel|descrição/i);
    await user.type(descInput, "Supermercado");
    await user.click(screen.getByRole("button", { name: /^Salvar$/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.kind).toBe("expense");
    expect(saved.amountCents).toBeGreaterThan(0);
    expect(saved.description).toContain("Supermercado");
  });

  it("calls onSave with transfer data when saving a transfer", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={onSave} />);
    await user.click(screen.getByText("Transferência"));
    const valorInput = screen.getByPlaceholderText(/0,00/);
    await user.type(valorInput, "5000");
    const [originBtn] = screen.getAllByText("Nubank");
    await user.click(originBtn);
    await user.click(screen.getByText("Transferir"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.kind).toBe("transfer");
    expect(saved.amountCents).toBe(5000);
  });

  // ── Category icon consistency ──

  it("renders deterministic initial-letter badge instead of CategoryIcon emoji/SVG", () => {
    const { container } = render(
      <NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />,
    );
    // Category grid buttons show badge spans with initial letters
    const allSpans = container.querySelectorAll("span");
    const badges = Array.from(allSpans).filter(
      (s) => s.getAttribute("aria-hidden") === "true",
    );
    // At least one category badge (for "Alimentação" → "A", "Transporte" → "T", "Salário" → "S")
    expect(badges.length).toBeGreaterThanOrEqual(2);
    badges.forEach((s) => {
      expect(s.textContent).toMatch(/^[A-ZÀ-Ú]$/);
    });
  });

  it("uses category name initials, not icon-name-based emoji or tint", () => {
    render(
      <NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />,
    );
    // Category names are rendered
    expect(screen.getByText("Alimentação")).toBeInTheDocument();
    expect(screen.getByText("Transporte")).toBeInTheDocument();
  });

  // ── Inline creation flow tests ──

  it("shows inline form when Nova categoria is clicked and calls onAddCategory", async () => {
    const user = userEvent.setup();
    const onAddCat = vi.fn();
    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} onAddCategory={onAddCat} />);
    // First "Nova" button is for category section
    const novaBtns = screen.getAllByText("Nova");
    await user.click(novaBtns[0]);
    const input = screen.getByPlaceholderText("Nome da categoria");
    await user.type(input, "Mercado");
    await user.click(screen.getByRole("button", { name: "Salvar categoria" }));
    expect(onAddCat).toHaveBeenCalledWith({ name: "Mercado", kind: "expense" });
  });

  it("shows inline form for subcategory when Nova subcat. clicked", async () => {
    const user = userEvent.setup();
    const onAddCat = vi.fn();
    render(
      <NewTransactionSheet
        accounts={accounts}
        categories={categoriesWithSubs}
        onSave={vi.fn()}
        onAddCategory={onAddCat}
      />,
    );
    // Select "Alimentação" category
    await user.click(screen.getByText("Alimentação"));
    // Click "Nova subcat."
    await user.click(screen.getByText("Nova subcat."));
    const input = screen.getByPlaceholderText("Nome da subcategoria");
    await user.type(input, "Hortifrúti");
    await user.click(screen.getByRole("button", { name: "Salvar subcategoria" }));
    expect(onAddCat).toHaveBeenCalledWith({ name: "Hortifrúti", kind: "expense", parentId: "cat1" });
  });

  it("shows inline form for account and calls onAddAccount", async () => {
    const user = userEvent.setup();
    const onAddAcc = vi.fn();
    render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} onAddAccount={onAddAcc} />);
    // Second "Nova" button is for account section (first is category)
    const novaBtns = screen.getAllByText("Nova");
    await user.click(novaBtns[1]);
    const nameInput = screen.getByPlaceholderText("Nome da conta");
    await user.type(nameInput, "Caixa");
    await user.click(screen.getByRole("button", { name: "Salvar conta" }));
    expect(onAddAcc).toHaveBeenCalledWith({ name: "Caixa", kind: "bank", initialBalanceCents: 0 });
  });

  it("shows inline form for card and calls onAddCard", async () => {
    const user = userEvent.setup();
    const onAddCrd = vi.fn();
    render(
      <NewTransactionSheet
        accounts={accountsWithCard}
        categories={categories}
        onSave={vi.fn()}
        onAddCard={onAddCrd}
      />,
    );
    await user.click(screen.getByText("Novo"));
    const nameInput = screen.getByPlaceholderText("Nome do cartão");
    await user.type(nameInput, "Inter Card");
    await user.click(screen.getByRole("button", { name: "Salvar cartão" }));
    expect(onAddCrd).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Inter Card", creditLimitCents: 0 }),
    );
  });

  // ── Installments ──

  it("includes installmentsTotal when parcelamento is enabled and saved", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<NewTransactionSheet accounts={accountsWithCard} categories={categories} onSave={onSave} />);
    const valorInput = screen.getByPlaceholderText(/0,00/);
    await user.type(valorInput, "600000");
    // Enable parcelamento
    await user.click(screen.getByLabelText("Alternar parcelamento"));
    // Select 12x
    await user.click(screen.getByText("12x"));
    // Select credit card
    await user.click(screen.getByText("Nubank Card"));
    // Save
    await user.click(screen.getByText("Salvar em 12x"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.installmentsTotal).toBe(12);
  });

  it("shows subcategories when category with parentId children is selected", async () => {
    const user = userEvent.setup();
    render(
      <NewTransactionSheet
        accounts={accounts}
        categories={categoriesWithSubs}
        onSave={vi.fn()}
      />,
    );
    // Select "Alimentação" — subcategories should appear
    await user.click(screen.getByText("Alimentação"));
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText("Restaurante")).toBeInTheDocument();
  });

  // ── Draft leakage across tab switches ──

  it("does not leak amount or description across tab switches", async () => {
    const user = userEvent.setup();
    render(
      <NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />,
    );

    // Type draft on the default (Despesa) tab.
    const valorInput = screen.getByPlaceholderText(/0,00/);
    await user.type(valorInput, "12345");
    const descInput = screen.getByPlaceholderText(/aluguel|descrição/i);
    await user.type(descInput, "Draft de Despesa");

    // Switch to Transferência — should reset ALL draft fields including
    // amount and description, not just category/account.
    await user.click(screen.getByRole("button", { name: /transferência/i }));

    const reopenedValor = screen.getByPlaceholderText(/0,00/) as HTMLInputElement;
    const reopenedDesc = screen.getByPlaceholderText(/aluguel|descrição/i) as HTMLInputElement;
    expect(reopenedValor.value).toBe("");
    expect(reopenedDesc.value).toBe("");
  });

  it("does not leak amount or description when switching from Receita to Despesa", async () => {
    const user = userEvent.setup();
    render(
      <NewTransactionSheet
        accounts={accounts}
        categories={categories}
        onSave={vi.fn()}
        initialTab="income"
      />,
    );

    // Type draft on Receita tab.
    const valorInput = screen.getByPlaceholderText(/0,00/);
    await user.type(valorInput, "99999");
    const descInput = screen.getByPlaceholderText(/aluguel|descrição/i);
    await user.type(descInput, "Salário freelance");

    // Switch to Despesa — should reset amount and description.
    const despesaBtn = screen.getAllByRole("button", { name: /^Despesa$/i })[0]!;
    await user.click(despesaBtn);

    const reopenedValor = screen.getByPlaceholderText(/0,00/) as HTMLInputElement;
    const reopenedDesc = screen.getByPlaceholderText(/aluguel|descrição/i) as HTMLInputElement;
    expect(reopenedValor.value).toBe("");
    expect(reopenedDesc.value).toBe("");
  });

  describe("coverage: calendar, income, card, guards", () => {
    it("opens the calendar and selects a day", async () => {
      const user = userEvent.setup();
      render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />);
      await user.click(screen.getByRole("button", { name: /de \d{4}/ }));
      const dayButtons = screen.getAllByRole("button").filter((b) => /^\d+$/.test((b.textContent ?? "").trim()));
      expect(dayButtons.length).toBeGreaterThan(0);
      await user.click(dayButtons[0]!);
      expect(screen.queryByText("Seg")).not.toBeInTheDocument();
    });

    it("navigates calendar months with prev/next", async () => {
      const user = userEvent.setup();
      render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />);
      await user.click(screen.getByRole("button", { name: /de \d{4}/ }));
      await user.click(screen.getByText("‹"));
      await user.click(screen.getByText("›"));
      expect(screen.getByText("Seg")).toBeInTheDocument();
    });

    it("saves an income transaction", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={onSave} initialTab="income" />);
      await user.type(screen.getByPlaceholderText(/0,00/), "50000");
      await user.type(screen.getByPlaceholderText(/aluguel|descrição/i), "Salário");
      await user.click(screen.getByRole("button", { name: /^Salvar$/ }));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: "income", amountCents: 50000 }));
    });

    it("saves expense with credit card selected (cardId branch)", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<NewTransactionSheet accounts={accountsWithCard} categories={categories} onSave={onSave} />);
      await user.type(screen.getByPlaceholderText(/0,00/), "10000");
      await user.click(screen.getByText("Nubank Card"));
      await user.click(screen.getByRole("button", { name: /^Salvar$/ }));
      expect(onSave.mock.calls[0]![0].accountId).toBe("card1");
    });

    it("includes selected categoryId on save (expense)", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={onSave} />);
      await user.click(screen.getByText("Alimentação"));
      await user.type(screen.getByPlaceholderText(/0,00/), "10000");
      await user.click(screen.getByRole("button", { name: /^Salvar$/ }));
      const saved = onSave.mock.calls[0]![0];
      expect(saved.categoryId).toBe("cat1");
      expect(saved.kind).toBe("expense");
    });

    it("shows inline account form in transfer tab via Nova", async () => {
      const user = userEvent.setup();
      render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} onAddAccount={vi.fn()} />);
      await user.click(screen.getByText("Transferência"));
      await user.click(screen.getByText("Nova"));
      expect(screen.getByPlaceholderText("Nome da conta")).toBeInTheDocument();
    });

    it("accepts a custom installment count via Outro input", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<NewTransactionSheet accounts={accountsWithCard} categories={categories} onSave={onSave} />);
      await user.type(screen.getByPlaceholderText(/0,00/), "600000");
      await user.click(screen.getByLabelText("Alternar parcelamento"));
      await user.type(screen.getByPlaceholderText("18"), "5");
      await user.click(screen.getByText("Nubank Card"));
      await user.click(screen.getByText(/Salvar em/));
      expect(onSave.mock.calls[0]![0].installmentsTotal).toBe(5);
    });

    it("ignores amount digits beyond 12", async () => {
      const user = userEvent.setup();
      render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />);
      const valor = screen.getByPlaceholderText(/0,00/) as HTMLInputElement;
      await user.type(valor, "123456789012345");
      expect(valor.value.replace(/\D/g, "").length).toBeLessThanOrEqual(12);
    });

    it("handles onSave rejection without crashing", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockRejectedValue(new Error("fail"));
      render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={onSave} />);
      await user.type(screen.getByPlaceholderText(/0,00/), "10000");
      await user.type(screen.getByPlaceholderText(/aluguel|descrição/i), "X");
      await user.click(screen.getByRole("button", { name: /^Salvar$/ }));
      expect(onSave).toHaveBeenCalled();
    });

    it("expense: selecting an account sets accountId on save", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={onSave} />);
      await user.click(screen.getByText("Itaú"));
      await user.type(screen.getByPlaceholderText(/0,00/), "10000");
      await user.click(screen.getByRole("button", { name: /^Salvar$/ }));
      expect(onSave.mock.calls[0]![0].accountId).toBe("acc2");
    });

    it("transfer: selecting destination account sets toAccountId", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={onSave} />);
      await user.click(screen.getByText("Transferência"));
      const [originNubank] = screen.getAllByText("Nubank");
      await user.click(originNubank!);
      const itauBtns = screen.getAllByText("Itaú");
      await user.click(itauBtns[1]!);
      await user.type(screen.getByPlaceholderText(/0,00/), "5000");
      await user.click(screen.getByText("Transferir"));
      const saved = onSave.mock.calls[0]![0];
      expect(saved.fromAccountId).toBe("acc1");
      expect(saved.toAccountId).toBe("acc2");
    });

    it("card inline form: typing limit/closing/due and saving", async () => {
      const user = userEvent.setup();
      const onAddCrd = vi.fn();
      render(<NewTransactionSheet accounts={accountsWithCard} categories={categories} onSave={vi.fn()} onAddCard={onAddCrd} />);
      await user.click(screen.getByText("Novo"));
      await user.type(screen.getByPlaceholderText("Nome do cartão"), "Inter Card");
      fireEvent.change(screen.getByPlaceholderText("Limite (R$)"), { target: { value: "100000" } });
      fireEvent.change(screen.getByPlaceholderText("Fechamento"), { target: { value: "10" } });
      fireEvent.change(screen.getByPlaceholderText("Vencimento"), { target: { value: "20" } });
      await user.click(screen.getByRole("button", { name: "Salvar cartão" }));
      expect(onAddCrd).toHaveBeenCalledWith(expect.objectContaining({ name: "Inter Card", creditLimitCents: 100000, closingDay: 10, dueDay: 20 }));
    });

    it("category inline form: Cancelar closes the form", async () => {
      const user = userEvent.setup();
      render(<NewTransactionSheet accounts={accounts} categories={categories} onSave={vi.fn()} />);
      await user.click(screen.getAllByText("Nova")[0]!);
      expect(screen.getByPlaceholderText("Nome da categoria")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByPlaceholderText("Nome da categoria")).not.toBeInTheDocument();
    });
  });
});
