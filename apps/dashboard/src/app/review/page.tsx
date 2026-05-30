// ─────────────────────────────────────────────────────────────────────────────
// Review Page
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { ReviewEntry } from '@/lib/api-client';

const client = createApiClient();

const reasonLabels: Record<string, string> = {
  high_value: '💰 Valor Alto',
  duplicate: '🔄 Duplicata',
  account_not_found: '❓ Conta Não Encontrada',
  category_conflict: '🏷️ Conflito de Categoria',
  manual_review: '👤 Revisão Manual',
};

const reasonColors: Record<string, string> = {
  high_value: 'var(--accent-amber)',
  duplicate: 'var(--accent-amber)',
  account_not_found: 'var(--info)',
  category_conflict: 'var(--accent-amber)',
  manual_review: 'var(--text-muted)',
};

export default function ReviewPage() {
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    entryId: string;
    action: 'approve' | 'reject';
    cancelRecord?: boolean;
    onConfirm: () => void;
  }>({ open: false, entryId: '', action: 'approve', onConfirm: () => {} });

  useEffect(() => {
    const stored = localStorage.getItem('householdId');
    const userId = localStorage.getItem('userId');
    if (stored) {
      setHouseholdId(stored);
    }
  }, []);

  useEffect(() => {
    if (!householdId) return;
    loadEntries();
  }, [householdId]);

  async function loadEntries() {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.listReviewItems(householdId!, 'pending');
      if (result.success && result.data) {
        setEntries(result.data.entries);
        setPendingCount(result.data.pendingCount);
      } else {
        setError(result.reason || 'Erro ao carregar entradas');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(entry: ReviewEntry) {
    setActionLoading(entry.id);
    try {
      const userId = localStorage.getItem('userId') || '';
      const result = await client.approveReview(entry.id, userId);
      if (result.success) {
        loadEntries();
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(entry: ReviewEntry, cancelRecord: boolean = false) {
    setConfirmDialog({
      open: true,
      entryId: entry.id,
      action: 'reject',
      cancelRecord,
      onConfirm: async () => {
        setActionLoading(entry.id);
        try {
          const userId = localStorage.getItem('userId') || '';
          const result = await client.rejectReview(entry.id, userId, cancelRecord);
          if (result.success) {
            loadEntries();
          }
        } finally {
          setActionLoading(null);
          setConfirmDialog(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver as entradas de revisão.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">⚠️ Revisão</h1>
            <p className="page-subtitle">
              {pendingCount > 0 ? (
                <span className="text-amber">{pendingCount} entradas pendentes</span>
              ) : (
                <span className="text-green">Nenhuma entrada pendente</span>
              )}
            </p>
          </div>
          <button className="btn btn-secondary" onClick={loadEntries}>
            🔄 Atualizar
          </button>
        </div>
      </div>

      {/* Entries List */}
      <div className="section">
        {loading ? (
          <div className="card"><p className="text-muted">Carregando...</p></div>
        ) : error ? (
          <div className="card">
            <p className="text-red">{error}</p>
            <button className="btn btn-secondary mt-md" onClick={loadEntries}>Tentar novamente</button>
          </div>
        ) : entries.length === 0 ? (
          <div className="card">
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
              <span style={{ fontSize: '3rem' }}>✅</span>
              <p className="text-muted mt-md">Nenhuma entrada pendente de revisão.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {entries.map((entry) => (
              <div key={entry.id} className="card">
                {/* Entry Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                      <span 
                        className="badge"
                        style={{ 
                          background: reasonColors[entry.reason] || 'var(--text-muted)',
                          color: 'var(--bg-primary)',
                          fontSize: '0.875rem',
                          padding: 'var(--space-xs) var(--space-sm)'
                        }}
                      >
                        {reasonLabels[entry.reason] || entry.reason}
                      </span>
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                    
                    {entry.recordId && (
                      <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                        Registro: <span className="font-mono">{entry.recordId.slice(0, 8)}...</span>
                      </p>
                    )}
                    
                    {/* Payload Preview */}
                    {entry.originalPayload && Object.keys(entry.originalPayload).length > 0 && (
                      <div style={{ 
                        marginTop: 'var(--space-sm)', 
                        padding: 'var(--space-sm)', 
                        background: 'var(--bg-secondary)', 
                        borderRadius: 'var(--radius)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem'
                      }}>
                        {JSON.stringify(entry.originalPayload, null, 2).slice(0, 200)}
                        {JSON.stringify(entry.originalPayload).length > 200 && '...'}
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 'var(--space-xs)', marginLeft: 'var(--space-md)' }}>
                    <button
                      className="btn btn-sm"
                      style={{ background: 'var(--accent-green)', color: 'var(--bg-primary)' }}
                      onClick={() => handleApprove(entry)}
                      disabled={actionLoading === entry.id}
                      title="Aprovar"
                    >
                      {actionLoading === entry.id ? '⏳' : '✅'} Aprovar
                    </button>
                    
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleReject(entry, false)}
                      disabled={actionLoading === entry.id}
                      title="Rejeitar (manter registro)"
                    >
                      ❌ Rejeitar
                    </button>
                    
                    {(entry.reason === 'high_value' || entry.reason === 'duplicate') && (
                      <button
                        className="btn btn-sm"
                        style={{ background: 'var(--error)', color: 'white' }}
                        onClick={() => handleReject(entry, true)}
                        disabled={actionLoading === entry.id}
                        title="Rejeitar e Cancelar Registro"
                      >
                        🗑️ Rejeitar + Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      {confirmDialog.open && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div className="card" style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>
              {confirmDialog.action === 'approve' ? 'Aprovar Entrada?' : 'Rejeitar Entrada?'}
            </h3>
            {confirmDialog.cancelRecord && (
              <p className="text-amber" style={{ marginBottom: 'var(--space-md)' }}>
                ⚠️ O registro associado será CANCELADO.
              </p>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
              >
                Cancelar
              </button>
              <button 
                className={confirmDialog.action === 'approve' ? 'btn btn-primary' : 'btn btn-danger'}
                onClick={confirmDialog.onConfirm}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}