// ─────────────────────────────────────────────────────────────────────────────
// Accounts Page - List and Create
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { Account } from '@/lib/api-client';

const client = createApiClient();

const typeLabels: Record<string, string> = {
  checking: 'Conta Corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  investment: 'Investimento',
};

const scopeLabels: Record<string, string> = {
  shared: 'Compartilhada',
  personal: 'Pessoal',
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Household ID
  const [householdId, setHouseholdId] = useState<string | null>(null);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'checking' as Account['type'],
    scope: 'shared' as Account['scope'],
    initialBalanceCents: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('householdId');
    if (stored) {
      setHouseholdId(stored);
    }
  }, []);

  useEffect(() => {
    if (!householdId) return;
    loadAccounts();
  }, [householdId]);

  async function loadAccounts() {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.listAccounts(householdId!);
      if (result.success && result.data) {
        setAccounts(result.data);
      } else {
        setError(result.reason || 'Erro ao carregar contas');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    
    try {
      const result = await client.createAccount({
        householdId: householdId!,
        name: formData.name,
        type: formData.type,
        scope: formData.scope,
        initialBalanceCents: formData.initialBalanceCents ? parseInt(formData.initialBalanceCents) * 100 : 0,
      });
      
      if (result.success) {
        setFormData({ name: '', type: 'checking', scope: 'shared', initialBalanceCents: '' });
        setShowForm(false);
        loadAccounts();
      } else {
        setFormError(result.reason || 'Erro ao criar conta');
      }
    } catch {
      setFormError('Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  }

  function formatBalance(account: Account): string {
    const balance = account.initialBalanceCents ?? 0;
    const isPositive = balance >= 0;
    return `${isPositive ? '' : '-'}${(Math.abs(balance) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }

  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver as contas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">🏦 Contas</h1>
            <p className="page-subtitle">{accounts.length} contas encontradas</p>
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancelar' : '+ Nova Conta'}
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="section">
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Nova Conta</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Nome</label>
                  <input 
                    type="text" 
                    className="form-input"
                    placeholder="Ex: Conta Corrente Nubank"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select 
                    className="form-select"
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as Account['type'] }))}
                  >
                    <option value="checking">Conta Corrente</option>
                    <option value="savings">Poupança</option>
                    <option value="cash">Dinheiro</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="investment">Investimento</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Escopo</label>
                  <select 
                    className="form-select"
                    value={formData.scope}
                    onChange={(e) => setFormData(prev => ({ ...prev, scope: e.target.value as Account['scope'] }))}
                  >
                    <option value="shared">Compartilhada</option>
                    <option value="personal">Pessoal</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Saldo Inicial (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input"
                    placeholder="0,00"
                    value={formData.initialBalanceCents}
                    onChange={(e) => setFormData(prev => ({ ...prev, initialBalanceCents: e.target.value }))}
                  />
                </div>
              </div>
              
              {formError && <p className="form-error mt-md">{formError}</p>}
              
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Criando...' : 'Criar Conta'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Accounts List */}
      <div className="section">
        {loading ? (
          <div className="card">
            <p className="text-muted">Carregando...</p>
          </div>
        ) : error ? (
          <div className="card">
            <p className="text-red">{error}</p>
            <button className="btn btn-secondary mt-md" onClick={loadAccounts}>
              Tentar novamente
            </button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="card">
            <p className="text-muted">Nenhuma conta encontrada. Crie sua primeira conta!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
            {accounts.map((account) => (
              <div key={account.id} className="card" style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                  <span style={{ fontSize: '1.5rem' }}>
                    {account.type === 'checking' ? '🏦' : account.type === 'savings' ? '🏰' : account.type === 'cash' ? '💵' : account.type === 'credit_card' ? '💳' : '📈'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{account.name}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {typeLabels[account.type]} • {scopeLabels[account.scope]}
                    </div>
                  </div>
                </div>
                
                <div className="card-value font-mono" style={{ fontSize: '1.25rem' }}>
                  <span className={account.initialBalanceCents && account.initialBalanceCents >= 0 ? 'text-green' : 'text-red'}>
                    R$ {formatBalance(account)}
                  </span>
                </div>
                
                <div style={{ display: 'flex', gap: 'var(--space-xs)', marginTop: 'var(--space-md)' }}>
                  <span className={`badge ${account.active ? 'badge-success' : 'badge-muted'}`}>
                    {account.active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}