// ─────────────────────────────────────────────────────────────────────────────
// Loans Page
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { Loan } from '@/lib/api-client';

const client = createApiClient();

const modeLabels: Record<string, string> = {
  fixed: 'Fixo',
  price: 'Price',
  sac: 'SAC',
  custom: 'Custom',
};

const statusLabels: Record<string, string> = {
  pending: '⏳ Pendente',
  paid: '✅ Paga',
  overdue: '⚠️ Vencida',
};

export default function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [installments, setInstallments] = useState<Record<string, any[]>>({});
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    principalCents: '',
    mode: 'fixed' as Loan['mode'],
    interestRate: '',
    startDate: new Date().toISOString().split('T')[0],
    installmentsCount: '12',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('householdId');
    if (stored) setHouseholdId(stored);
  }, []);

  useEffect(() => {
    if (!householdId) return;
    loadLoans();
  }, [householdId]);

  async function loadLoans() {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.listLoans(householdId!);
      if (result.success && result.data) {
        setLoans(result.data);
        // Load installments for each loan
        for (const loan of result.data) {
          await loadInstallments(loan.id);
        }
      } else {
        setError(result.reason || 'Erro ao carregar empréstimos');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  async function loadInstallments(loanId: string) {
    // Note: We'd need an endpoint to get installments by loanId
    // For now, we just track pending installments per loan
    setInstallments(prev => ({ ...prev, [loanId]: [] }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    
    try {
      const result = await client.createLoan({
        householdId: householdId!,
        name: formData.name,
        principalCents: parseInt(formData.principalCents) * 100,
        mode: formData.mode,
        interestRate: formData.interestRate ? parseInt(formData.interestRate) : null,
        startDate: formData.startDate,
        installmentsCount: parseInt(formData.installmentsCount),
      });
      
      if (result.success) {
        setFormData({ name: '', principalCents: '', mode: 'fixed', interestRate: '', startDate: new Date().toISOString().split('T')[0], installmentsCount: '12' });
        setShowForm(false);
        loadLoans();
      } else {
        setFormError(result.reason || 'Erro ao criar empréstimo');
      }
    } catch {
      setFormError('Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayInstallment(loanId: string) {
    const result = await client.payLoanInstallment(loanId, householdId!);
    if (result.success) {
      loadLoans();
    }
  }

  function formatCurrency(cents: number): string {
    return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  }

  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver os empréstimos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">💰 Empréstimos</h1>
            <p className="page-subtitle">{loans.length} empréstimos</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : '+ Novo Empréstimo'}
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="section">
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Novo Empréstimo</h3>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Nome</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Empréstimo BB, Financiamento carro"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Valor (R$)</label>
                  <input
                    type="number"
                    step="100"
                    className="form-input"
                    placeholder="10000"
                    value={formData.principalCents}
                    onChange={(e) => setFormData(prev => ({ ...prev, principalCents: e.target.value }))}
                    required
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select
                    className="form-select"
                    value={formData.mode}
                    onChange={(e) => setFormData(prev => ({ ...prev, mode: e.target.value as Loan['mode'] }))}
                  >
                    <option value="fixed">Fixo (sem juros)</option>
                    <option value="price">Price (parcelas iguais)</option>
                    <option value="sac">SAC (principal fixo)</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Taxa (% ao mês)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input"
                    placeholder="1.0"
                    value={formData.interestRate}
                    onChange={(e) => setFormData(prev => ({ ...prev, interestRate: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Parcelas</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={formData.installmentsCount}
                    onChange={(e) => setFormData(prev => ({ ...prev, installmentsCount: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Data de Início</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.startDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                    required
                  />
                </div>
              </div>
              
              {formError && <p className="form-error mt-md">{formError}</p>}
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Criando...' : 'Criar Empréstimo'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loans List */}
      <div className="section">
        {loading ? (
          <div className="card"><p className="text-muted">Carregando...</p></div>
        ) : error ? (
          <div className="card">
            <p className="text-red">{error}</p>
            <button className="btn btn-secondary mt-md" onClick={loadLoans}>Tentar novamente</button>
          </div>
        ) : loans.length === 0 ? (
          <div className="card">
            <p className="text-muted">Nenhum empréstimo encontrado.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {loans.map((loan) => {
              const isExpanded = expandedLoan === loan.id;
              const loanInstallments = installments[loan.id] || [];
              
              return (
                <div key={loan.id} className="card">
                  <div
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                      <span style={{ fontSize: '1.5rem' }}>💰</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{loan.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                          {loan.installmentsCount} parcelas • {modeLabels[loan.mode]}
                          {loan.interestRate && ` • ${loan.interestRate / 100}% a.m.`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <span className="font-mono font-bold text-amber" style={{ fontSize: '1.125rem' }}>
                        {formatCurrency(loan.principalCents)}
                      </span>
                      <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                        ▼
                      </span>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div style={{ marginTop: 'var(--space-lg)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-lg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                        <h4 style={{ fontWeight: 600 }}>Parcelas</h4>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={(e) => { e.stopPropagation(); handlePayInstallment(loan.id); }}
                        >
                          💵 Pagar Próxima
                        </button>
                      </div>
                      <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                        Clique em "Pagar Próxima" para quitar a próxima parcela pendente.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}