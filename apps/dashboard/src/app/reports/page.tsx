// ─────────────────────────────────────────────────────────────────────────────
// Reports Page (REQ-023)
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { MonthSummary, CategoryBreakdown, AccountBalance, BudgetComparison, InvoiceDue } from '@/lib/api-client';

const client = createApiClient();

type TabId = 'summary' | 'categories' | 'accounts' | 'budgets' | 'invoices';

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'summary', label: '📊 Resumo do Mês', icon: '📊' },
  { id: 'categories', label: '🏷️ Por Categoria', icon: '🏷️' },
  { id: 'accounts', label: '🏦 Saldos', icon: '🏦' },
  { id: 'budgets', label: '🎯 Orçamento vs Real', icon: '🎯' },
  { id: 'invoices', label: '💳 Faturas', icon: '💳' },
];

function formatCurrency(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'under_budget': return 'var(--accent-green)';
    case 'warning': return 'var(--accent-amber)';
    case 'over_budget': return 'var(--error)';
    default: return 'var(--text-muted)';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'under_budget': return 'Dentro do limite';
    case 'warning': return 'Atenção';
    case 'over_budget': return 'Excedido';
    default: return status;
  }
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([]);
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [budgetComparison, setBudgetComparison] = useState<BudgetComparison[]>([]);
  const [invoicesDue, setInvoicesDue] = useState<InvoiceDue[]>([]);

  // Date filter for categories
  const [categoryDateFrom, setCategoryDateFrom] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [categoryDateTo, setCategoryDateTo] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
  });
  const [categoryType, setCategoryType] = useState<'income' | 'expense'>('expense');

  useEffect(() => {
    const stored = localStorage.getItem('householdId');
    if (stored) setHouseholdId(stored);
  }, []);

  useEffect(() => {
    if (!householdId) return;
    loadAllData();
  }, [householdId]);

  async function loadAllData() {
    setLoading(true);
    setError(null);

    try {
      const [summaryResult, balancesResult, budgetsResult, invoicesResult] = await Promise.all([
        client.getCurrentMonthSummary(householdId!),
        client.getAccountBalances(householdId!),
        client.getBudgetVsActual(householdId!),
        client.getInvoicesDue(householdId!),
      ]);

      if (summaryResult.success) setMonthSummary(summaryResult.data!);
      if (balancesResult.success) setAccountBalances(balancesResult.data!);
      if (budgetsResult.success) setBudgetComparison(budgetsResult.data!);
      if (invoicesResult.success) setInvoicesDue(invoicesResult.data!);

      // Also load category breakdown with current month
      await loadCategoryBreakdown();
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  async function loadCategoryBreakdown() {
    if (!householdId) return;
    const result = await client.getCategoryBreakdown(
      householdId,
      `${categoryDateFrom}T00:00:00.000Z`,
      `${categoryDateTo}T23:59:59.999Z`,
      categoryType
    );
    if (result.success) setCategoryBreakdown(result.data!);
  }

  function handleTabClick(tabId: TabId) {
    setActiveTab(tabId);
  }

  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver os relatórios.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">📊 Relatórios</h1>
        <p className="page-subtitle">Visão geral das suas finanças</p>
      </div>

      {/* Tabs */}
      <div className="section">
        <div style={{ display: 'flex', gap: 'var(--space-sm)', overflowX: 'auto', paddingBottom: 'var(--space-sm)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleTabClick(tab.id)}
              style={{ whiteSpace: 'nowrap' }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="section">
        {loading && <div className="card"><p className="text-muted">Carregando...</p></div>}
        {error && <div className="card"><p className="text-red">{error}</p></div>}

        {/* Summary Tab */}
        {activeTab === 'summary' && monthSummary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)' }}>
            <div className="card" style={{ borderLeft: '4px solid var(--accent-green)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>Receita</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                {formatCurrency(monthSummary.incomeCents)}
              </div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--error)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>Despesa</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--error)' }}>
                {formatCurrency(monthSummary.expenseCents)}
              </div>
            </div>
            <div className="card" style={{ borderLeft: `4px solid ${monthSummary.netCents >= 0 ? 'var(--accent-green)' : 'var(--error)'}` }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>Saldo Líquido</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: monthSummary.netCents >= 0 ? 'var(--accent-green)' : 'var(--error)' }}>
                {formatCurrency(monthSummary.netCents)}
              </div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--text-muted)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>Registros</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{monthSummary.recordCount}</div>
            </div>
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div className="card">
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
              <div className="form-group">
                <label className="form-label">De</label>
                <input
                  type="date"
                  className="form-input"
                  value={categoryDateFrom}
                  onChange={(e) => setCategoryDateFrom(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Até</label>
                <input
                  type="date"
                  className="form-input"
                  value={categoryDateTo}
                  onChange={(e) => setCategoryDateTo(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select
                  className="form-select"
                  value={categoryType}
                  onChange={(e) => setCategoryType(e.target.value as 'income' | 'expense')}
                >
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </div>
              <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                <button className="btn btn-primary" onClick={loadCategoryBreakdown}>
                  🔄 Atualizar
                </button>
              </div>
            </div>

            {categoryBreakdown.length === 0 ? (
              <p className="text-muted">Nenhum registro neste período.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {categoryBreakdown.map(cat => (
                  <div key={cat.categoryId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
                      <span style={{ fontWeight: 500 }}>{cat.categoryName}</span>
                      <span className="font-mono">{formatCurrency(cat.amountCents)} ({cat.percentage.toFixed(1)}%)</span>
                    </div>
                    <div style={{ 
                      height: '24px', 
                      background: 'var(--bg-secondary)', 
                      borderRadius: 'var(--radius)',
                      overflow: 'hidden'
                    }}>
                      <div style={{ 
                        width: `${cat.percentage}%`, 
                        height: '100%', 
                        background: categoryType === 'expense' ? 'var(--error)' : 'var(--accent-green)',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {cat.recordCount} registros
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {accountBalances.length === 0 ? (
              <div className="card"><p className="text-muted">Nenhuma conta encontrada.</p></div>
            ) : (
              accountBalances.map(acc => (
                <div key={acc.accountId} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontWeight: 600 }}>{acc.accountName}</h3>
                      <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                        Saldo inicial: {formatCurrency(acc.initialBalanceCents)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className={`font-mono font-bold ${acc.currentBalanceCents >= 0 ? 'text-green' : 'text-red'}`} style={{ fontSize: '1.5rem' }}>
                        {formatCurrency(acc.currentBalanceCents)}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        +{formatCurrency(acc.creditCents)} / -{formatCurrency(acc.debitCents)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Budgets Tab */}
        {activeTab === 'budgets' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
            {budgetComparison.length === 0 ? (
              <div className="card"><p className="text-muted">Nenhum orçamento ativo.</p></div>
            ) : (
              budgetComparison.map(budget => (
                <div key={budget.budgetId} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
                    <h3 style={{ fontWeight: 600 }}>{budget.budgetName}</h3>
                    <span 
                      className="badge"
                      style={{ background: getStatusColor(budget.status), color: 'var(--bg-primary)' }}
                    >
                      {getStatusLabel(budget.status)}
                    </span>
                  </div>
                  <div style={{ marginBottom: 'var(--space-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span className="text-muted">Gasto</span>
                      <span className="font-mono">{formatCurrency(budget.spentCents)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span className="text-muted">Limite</span>
                      <span className="font-mono">{formatCurrency(budget.limitCents)}</span>
                    </div>
                  </div>
                  <div style={{ 
                    height: '12px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    marginBottom: 'var(--space-xs)'
                  }}>
                    <div style={{ 
                      width: `${Math.min(budget.percentage, 100)}%`, 
                      height: '100%', 
                      background: getStatusColor(budget.status),
                      transition: 'width 0.3s'
                    }} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    {budget.percentage}% • {formatCurrency(budget.remainingCents)} restante(s)
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {invoicesDue.length === 0 ? (
              <div className="card"><p className="text-muted">Nenhuma fatura pendente.</p></div>
            ) : (
              invoicesDue.map(invoice => (
                <div key={invoice.invoiceId} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontWeight: 600 }}>{invoice.cardName} - {invoice.periodMonth}/{invoice.periodYear}</h3>
                      <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                        Vencimento: {formatDate(invoice.dueAt)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="font-mono font-bold text-amber" style={{ fontSize: '1.25rem' }}>
                        {formatCurrency(invoice.totalCents)}
                      </div>
                      <div className={`badge ${invoice.daysUntilDue <= 3 ? 'badge-warning' : 'badge-muted'}`}>
                        {invoice.daysUntilDue} dia(s)
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}