import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import ReportsPage from "../ReportsPage";

describe("ReportsPage", () => {
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

  it("renders period selector chips", () => {
    render(<ReportsPage />);
    expect(screen.getByText("Mês")).toBeInTheDocument();
    expect(screen.getByText("Anterior")).toBeInTheDocument();
    expect(screen.getByText("Trim.")).toBeInTheDocument();
    expect(screen.getByText("Ano")).toBeInTheDocument();
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
});