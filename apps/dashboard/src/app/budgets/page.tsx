// ─────────────────────────────────────────────────────────────────────────────
// Budgets Page
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { Budget } from '@/lib/api-client';

const client = createApiClient();

const typeLabels: Record<string, string> = {
  category_monthly: '📅 Categoria Mensal',
  account_goal: '🎯 Meta de Conta',
  custom: '⚙️ Custom',
};

const statusColors: Record<string, string> = {
  under_budget: 'var(--accent-green)',
  warning: 'var(--accent-amber)',
  over_budget: 'var(--error)',
};

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    budgetType: 'category_monthly' as Budget['budgetType'],
    amountCents: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('householdId');
    if (stored) setHouseholdId(stored);
  }, []);

  useEffect(() => {
    if (!householdId) return;
    loadBudgets();
  }, [householdId]);

  async function loadBudgets() {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.listBudgets(householdId!);
      if (result.success && result.data) {
        setBudgets(result.data);
      } else {
        setError(result.reason || 'Erro ao carregar orçamentos');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    
    try {
      const result = await client.createBudget({
        householdId: householdId!,
        name: formData.name,
        budgetType: formData.budgetType,
        amountCents: parseInt(formData.amountCents) * 100,
      });
      
      if (result.success) {
        setFormData({ name: '', budgetType: 'category_monthly', amountCents: '' });
        setShowForm(false);
        loadBudgets();
      } else {
        setFormError(result.reason || 'Erro ao criar orçamento');
      }
    } catch {
      setFormError('Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  }

  function formatCurrency(cents: number): string {
    return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }

  // Calculate mock status based on budget
  function getBudgetStatusInfo(budget: Budget): { status: string; percentage: number; color: string } {
    // Placeholder: In real app, we'd get spentCents from API
    // For now, show as "active" with percentage 0
    return {
      status: budget.active ? 'Ativo' : 'Inativo',
      percentage: 0,
      color: budget.active ? statusColors.under_budget : 'var(--text-muted)',
    };
  }

  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver os orçamentos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">🎯 Orçamentos</h1>
            <p className="page-subtitle">{budgets.length} orçamentos</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : '+ Novo Orçamento'}
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="section">
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Novo Orçamento</h3>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Nome</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Alimentação Janeiro, Transporte"
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
                    placeholder="2000"
                    value={formData.amountCents}
                    onChange={(e) => setFormData(prev => ({ ...prev, amountCents: e.target.value }))}
                    required
                  />
                </div>
              </div>
              
              <div className="form-group" style={{ maxWidth: 300 }}>
                <label className="form-label">Tipo</label>
                <select
                  className="form-select"
                  value={formData.budgetType}
                  onChange={(e) => setFormData(prev => ({ ...prev, budgetType: e.target.value as Budget['budgetType'] }))}
                >
                  <option value="category_monthly">📅 Categoria Mensal</option>
                  <option value="account_goal">🎯 Meta de Conta</option>
                  <option value="custom">⚙️ Custom</option>
                </select>
              </div>
              
              {formError && <p className="form-error mt-md">{formError}</p>}
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Criando...' : 'Criar Orçamento'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Budgets List */}
      <div className="section">
        {loading ? (
          <div className="card"><p className="text-muted">Carregando...</p></div>
        ) : error ? (
          <div className="card">
            <p className="text-red">{error}</p>
            <button className="btn btn-secondary mt-md" onClick={loadBudgets}>Tentar novamente</button>
          </div>
        ) : budgets.length === 0 ? (
          <div className="card">
            <p className="text-muted">Nenhum orçamento encontrado.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-md)' }}>
            {budgets.map((budget) => {
              const statusInfo = getBudgetStatusInfo(budget);
              
              return (
                <div key={budget.id} className="card">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
                    <div>
                      <h3 style={{ fontWeight: 600, marginBottom: 'var(--space-xs)' }}>{budget.name}</h3>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        {typeLabels[budget.budgetType] || budget.budgetType}
                      </span>
                    </div>
                    <span 
                      className="badge"
                      style={{ background: statusInfo.color, color: 'var(--bg-primary)' }}
                    >
                      {statusInfo.status}
                    </span>
                  </div>
                  
                  <div style={{ marginBottom: 'var(--space-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>Valor limite</span>
                      <span className="font-mono font-bold" style={{ fontSize: '1.125rem' }}>
                        {formatCurrency(budget.amountCents)}
                      </span>
                    </div>
                    
                    {/* Progress bar placeholder */}
                    <div style={{ 
                      height: '8px', 
                      background: 'var(--bg-secondary)', 
                      borderRadius: 'var(--radius)',
                      marginTop: 'var(--space-sm)',
                      overflow: 'hidden'
                    }}>
                      <div style={{ 
                        width: `${Math.min(statusInfo.percentage, 100)}%`, 
                        height: '100%', 
                        background: statusInfo.color,
                        transition: 'width 0.3s'
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-xs)' }}>
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>0%</span>
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>100%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}