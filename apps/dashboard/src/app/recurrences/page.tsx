// ─────────────────────────────────────────────────────────────────────────────
// Recurrences Page
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { Recurrence, RecurrenceOccurrence, Account } from '@/lib/api-client';

const client = createApiClient();

const periodLabels: Record<string, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

const periodEmoji: Record<string, string> = {
  daily: '📅',
  weekly: '📆',
  biweekly: '🔄',
  monthly: '🗓️',
  yearly: '📆',
};

const targetTypeLabels: Record<string, string> = {
  payable_bill: 'Conta a Pagar',
  account_debit: 'Débito Automático',
  card_charge: 'Compra Cartão',
};

export default function RecurrencesPage() {
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [occurrences, setOccurrences] = useState<Record<string, RecurrenceOccurrence[]>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    amountCents: '',
    period: 'monthly' as Recurrence['period'],
    targetType: 'account_debit' as Recurrence['targetType'],
    firstDate: new Date().toISOString().split('T')[0],
    accountId: '',
    cardId: '',
    categoryId: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('householdId');
    if (stored) setHouseholdId(stored);
  }, []);

  useEffect(() => {
    if (!householdId) return;
    loadData();
  }, [householdId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    
    try {
      const [accountsResult] = await Promise.all([
        client.listAccounts(householdId!),
      ]);
      
      if (accountsResult.success && accountsResult.data) {
        setAccounts(accountsResult.data);
      }
      
      // Note: We don't have a list recurrences endpoint yet, so we show placeholder
      setRecurrences([]);
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
      const result = await client.createRecurrence({
        householdId: householdId!,
        description: formData.description,
        amountCents: parseInt(formData.amountCents) * 100,
        period: formData.period,
        targetType: formData.targetType,
        firstDate: formData.firstDate,
        accountId: formData.accountId || undefined,
        cardId: formData.cardId || undefined,
        categoryId: formData.categoryId || undefined,
      });
      
      if (result.success) {
        setFormData({
          description: '',
          amountCents: '',
          period: 'monthly',
          targetType: 'account_debit',
          firstDate: new Date().toISOString().split('T')[0],
          accountId: '',
          cardId: '',
          categoryId: '',
        });
        setShowForm(false);
        // Refresh list
        if (result.data?.recurrence) {
          setRecurrences(prev => [...prev, result.data!.recurrence]);
        }
      } else {
        setFormError(result.reason || 'Erro ao criar recorrência');
      }
    } catch {
      setFormError('Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMaintainHorizon(recurrenceId: string) {
    const result = await client.maintainRecurrenceHorizon(recurrenceId);
    if (result.success) {
      // Refresh occurrences for this recurrence
      // Note: would need an endpoint to get occurrences
    }
  }

  function formatCurrency(cents: number): string {
    return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }

  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver as recorrências.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">🔄 Recorrências</h1>
            <p className="page-subtitle">{recurrences.length} recorrências</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : '+ Nova Recorrência'}
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="section">
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Nova Recorrência</h3>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Descrição</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Internet, Aluguel, Netflix"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="99.90"
                    value={formData.amountCents}
                    onChange={(e) => setFormData(prev => ({ ...prev, amountCents: e.target.value }))}
                    required
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Período</label>
                  <select
                    className="form-select"
                    value={formData.period}
                    onChange={(e) => setFormData(prev => ({ ...prev, period: e.target.value as Recurrence['period'] }))}
                  >
                    <option value="daily">Diário</option>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quinzenal</option>
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select
                    className="form-select"
                    value={formData.targetType}
                    onChange={(e) => setFormData(prev => ({ ...prev, targetType: e.target.value as Recurrence['targetType'] }))}
                  >
                    <option value="account_debit">Débito Automático</option>
                    <option value="payable_bill">Conta a Pagar</option>
                    <option value="card_charge">Compra Cartão</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Primeira Data</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.firstDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstDate: e.target.value }))}
                    required
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Conta (opcional)</label>
                  <select
                    className="form-select"
                    value={formData.accountId}
                    onChange={(e) => setFormData(prev => ({ ...prev, accountId: e.target.value }))}
                  >
                    <option value="">Nenhuma</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {formError && <p className="form-error mt-md">{formError}</p>}
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Criando...' : 'Criar Recorrência'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recurrences List */}
      <div className="section">
        {loading ? (
          <div className="card"><p className="text-muted">Carregando...</p></div>
        ) : error ? (
          <div className="card">
            <p className="text-red">{error}</p>
            <button className="btn btn-secondary mt-md" onClick={loadData}>Tentar novamente</button>
          </div>
        ) : recurrences.length === 0 ? (
          <div className="card">
            <p className="text-muted">Nenhuma recorrência encontrada. Crie sua primeira!</p>
            <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: 'var(--space-sm)' }}>
              As recorrências criadas aparecerão aqui.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {recurrences.map((rec) => {
              const isExpanded = expandedRec === rec.id;
              
              return (
                <div key={rec.id} className="card">
                  <div
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                      <span style={{ fontSize: '1.5rem' }}>{periodEmoji[rec.period] || '🔄'}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{rec.description}</div>
                        <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                          {periodLabels[rec.period]} • {targetTypeLabels[rec.targetType]}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <span className="font-mono font-bold text-amber" style={{ fontSize: '1.125rem' }}>
                        {formatCurrency(rec.amountCents)}
                      </span>
                      <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                        ▼
                      </span>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div style={{ marginTop: 'var(--space-lg)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-lg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                        <h4 style={{ fontWeight: 600 }}>Ocorrências</h4>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={(e) => { e.stopPropagation(); handleMaintainHorizon(rec.id); }}
                        >
                          🔄 Manter Horizonte
                        </button>
                      </div>
                      <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                        {occurrences[rec.id]?.length || 0} ocorrências geradas
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