'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Reimbursements Page (REQ-029)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { Reimbursement } from '@/lib/api-client';

const client = createApiClient();

export default function ReimbursementsPage() {
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchReimbursements = async () => {
    setLoading(true);
    try {
      const res = await client.getReimbursements('household-1');
      if (res.success && res.data) setReimbursements(res.data);
    } catch (e) {
      console.error('Failed to fetch reimbursements:', e);
    } finally {
      setLoading(false);
    }
  };

  const completeReimbursement = async (id: string) => {
    try {
      await client.completeReimbursement(id, 'household-1', 'account-1', new Date().toISOString());
      fetchReimbursements();
    } catch (e) {
      console.error('Failed to complete reimbursement:', e);
    }
  };

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
                      <button className="btn-small" onClick={() => completeReimbursement(r.id)}>
                        Completar
                      </button>
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