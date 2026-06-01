'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Reimbursements Page (REQ-029)
// Uses useAuth from auth-context
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { Reimbursement, Account } from '@/lib/api-client';

export default function ReimbursementsPage() {
  const { householdId, apiClient } = useAuth();
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Fetch reimbursements when householdId is available
  useEffect(() => {
    if (!householdId) return;
    fetchReimbursements();
  }, [householdId]);

  async function fetchReimbursements() {
    if (!householdId) return;
    setLoading(true);
    try {
      const res = await apiClient.getReimbursements(householdId);
      if (res.success && res.data) setReimbursements(res.data);
    } catch (e) {
      console.error('Failed to fetch reimbursements:', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAccounts() {
    if (!householdId) return [];
    const res = await apiClient.listAccounts(householdId);
    if (res.success && res.data) {
      setAccounts(res.data);
      return res.data;
    }
    return [];
  }

  async function completeReimbursement(id: string, accountId: string) {
    try {
      const res = await apiClient.completeReimbursement(
        id,
        householdId!,
        accountId,
        new Date().toISOString()
      );
      if (res.success) {
        fetchReimbursements();
      }
    } catch (e) {
      console.error('Failed to complete reimbursement:', e);
    }
  }

  // Show login prompt if not authenticated
  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver os reembolsos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>🔁 Reembolsos</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Fechar' : '+ Novo Reembolso'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p style={{ color: '#666' }}>Crie reembolsos via registro de despesa original.</p>
        </div>
      )}

      <button className="btn-secondary" onClick={fetchReimbursements} style={{ marginBottom: '1rem' }}>
        {loading ? 'Carregando...' : 'Atualizar Lista'}
      </button>

      <div className="card">
        <h2 style={{ marginBottom: '1rem' }}>Lista de Reembolsos</h2>
        {reimbursements.length === 0 ? (
          <p style={{ color: '#666' }}>Nenhum reembolso encontrado.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {reimbursements.map((r) => (
                <tr key={r.id}>
                  <td>{r.description || 'Sem descrição'}</td>
                  <td>R$ {(r.amountCents / 100).toFixed(2)}</td>
                  <td>
                    <span className={`badge badge-${
                      r.status === 'completed' ? 'success' :
                      r.status === 'partial' ? 'warning' : 'pending'
                    }`}>
                      {r.status === 'completed' ? '✅ Completo' :
                       r.status === 'partial' ? '⚠️ Parcial' : '⏳ Pendente'}
                    </span>
                  </td>
                  <td>
                    {r.status !== 'completed' && (
                      <CompleteButton
                        accounts={accounts}
                        onLoadAccounts={fetchAccounts}
                        onComplete={(accountId) => completeReimbursement(r.id, accountId)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Complete Button with Account Selection
// ─────────────────────────────────────────────────────────────────────────────

function CompleteButton({
  accounts,
  onLoadAccounts,
  onComplete,
}: {
  accounts: Account[];
  onLoadAccounts: () => Promise<Account[]>;
  onComplete: (accountId: string) => void;
}) {
  const [showSelect, setShowSelect] = useState(false);
  const [localAccounts, setLocalAccounts] = useState<Account[]>(accounts);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (localAccounts.length === 0) {
      setLoading(true);
      const accs = await onLoadAccounts();
      setLocalAccounts(accs);
      setLoading(false);
    }
    setShowSelect(!showSelect);
  }

  return (
    <div style={{ display: 'inline-block', position: 'relative' }}>
      <button
        className="btn-small"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? '...' : 'Completar'}
      </button>
      {showSelect && localAccounts.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 10,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '0.5rem',
          minWidth: '200px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          <select
            className="form-select"
            style={{ width: '100%' }}
            onChange={(e) => {
              if (e.target.value) {
                onComplete(e.target.value);
                setShowSelect(false);
              }
            }}
            defaultValue=""
          >
            <option value="">Selecione a conta...</option>
            {localAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}