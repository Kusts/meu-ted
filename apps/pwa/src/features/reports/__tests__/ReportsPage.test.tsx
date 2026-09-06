import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import ReportsPage from "../ReportsPage";

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-26T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it("renders the page header", () => {
    render(<ReportsPage />);
    expect(screen.getByText("Relatórios")).toBeInTheDocument();
  });

  it("renders Resultado do período hero", () => {
    render(<ReportsPage />);
    expect(screen.getByText(/Resultado do período/)).toBeInTheDocument();
    expect(screen.getAllByText(/Receitas/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Despesas/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Poupado/)).toBeInTheDocument();
  });

  it("shows income KPI value", () => {
    render(<ReportsPage />);
    expect(screen.getByText(/6\.850,\d{2}/)).toBeInTheDocument();
  });

  it("shows savings rate", () => {
    render(<ReportsPage />);
    expect(screen.getAllByText(/58\.8%/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders period selector chips with explicit labels", () => {
    render(<ReportsPage />);
    expect(screen.getByText("Mês")).toBeInTheDocument();
    expect(screen.getByText("Mês passado")).toBeInTheDocument();
    expect(screen.getByText("Trim.")).toBeInTheDocument();
    expect(screen.getByText("Ano")).toBeInTheDocument();
  });

  it("shows period subtitle with actual date range for Mês", () => {
    render(<ReportsPage />);
    // Default period is "month" → shows June 2026
    expect(screen.getByText(/junho de 2026/i)).toBeInTheDocument();
  });

  it("A8: capitalizes only the month name (Junho de 2026, not Junho De 2026)", () => {
    render(<ReportsPage />);
    expect(screen.getByText("Junho de 2026")).toBeInTheDocument();
    expect(screen.queryByText("Junho De 2026")).not.toBeInTheDocument();
  });

  it("shows period subtitle for Mês passado", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await user.click(screen.getByText("Mês passado"));
    expect(screen.getByText(/maio de 2026/i)).toBeInTheDocument();
  });

  it("shows period subtitle for Trim.", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await user.click(screen.getByText("Trim."));
    expect(screen.getByText(/2º trimestre de 2026/i)).toBeInTheDocument();
  });

  it("shows period subtitle for Ano", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await user.click(screen.getByText("Ano"));
    expect(screen.getByText(/2026/i)).toBeInTheDocument();
  });

  it("renders 2-card KPI grid", () => {
    render(<ReportsPage />);
    expect(screen.getByText(/Ticket médio/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Taxa de poupança/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders Fluxo mensal chart", () => {
    render(<ReportsPage />);
    expect(screen.getByText(/Fluxo mensal/)).toBeInTheDocument();
  });

  it("renders donut chart container", () => {
    render(<ReportsPage />);
    expect(screen.getByText(/Distribuição/)).toBeInTheDocument();
  });

  it("renders top categories list", () => {
    render(<ReportsPage />);
    expect(screen.getByText(/Top categorias/i)).toBeInTheDocument();
  });

  it("renders Evolução patrimonial SVG", () => {
    render(<ReportsPage />);
    expect(screen.getByText(/Evolução patrimonial/)).toBeInTheDocument();
  });

  it("shows donut legend with category names", () => {
    render(<ReportsPage />);
    const ali = screen.getAllByText("Alimentação");
    expect(ali.length).toBeGreaterThanOrEqual(1);
  });

  it("switches period to Ano and keeps showing data", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await user.click(screen.getByText("Ano"));
    expect(screen.getByText(/6\.850,\d{2}/)).toBeInTheDocument();
  });

  it("shows period-filtered spending in Orçamentos vs Real", () => {
    render(<ReportsPage />);
    // Budget section should render
    expect(screen.getByText("Orçamentos vs Real")).toBeInTheDocument();
    // Alimentação (cat1) spent from filtered transactions (tx1 = 28750)
    // The value appears in multiple places (budget + donut/top categories)
    expect(screen.getAllByText(/287,50/).length).toBeGreaterThanOrEqual(1);
    // Transporte (cat2) spent from filtered transactions (tx2 = 1890)
    expect(screen.getAllByText(/18,90/).length).toBeGreaterThanOrEqual(1);
  });

  it("Trim. period covers the full current quarter, not just up to today", async () => {
    // Pin to early Q2 (Apr 2) so the difference between buggy and fixed is
    // observable: buggy Trim. would be Apr 1 – Apr 2 (no mock data); fixed
    // Trim. should be Apr 1 – Jun 30 (the full current quarter, which
    // contains the June mock transactions).
    vi.setSystemTime(new Date("2026-04-02T12:00:00Z"));
    const user = userEvent.setup();
    render(<ReportsPage />);
    await user.click(screen.getByText("Trim."));
    // tx3 + tx6 + tx12 = 5700 + 850 + 300 = R$ 6.850,00 income for the quarter.
    expect(screen.getByText(/6\.850,\d{2}/)).toBeInTheDocument();
  });
});