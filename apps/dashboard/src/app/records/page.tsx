// ─────────────────────────────────────────────────────────────────────────────
// Records Page - List, Filter, Edit, Delete, Undo
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { FinancialRecord } from '@/lib/api-client';

const client = createApiClient();

// Status badge colors
const statusColors: Record<string, string> = {
  posted: 'text-green',
  scheduled: 'text-amber',
  paid: 'text-green',
  overdue: 'text-red',
  cancelled: 'text-muted',
  review: 'text-amber',
};

// Type badge colors
const typeColors: Record<string, string> = {
  expense: 'text-red',
  income: 'text-green',
  transfer: 'text-amber',
};

export default function RecordsPage() {
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Pagination
  const [page, setPage] = useState(0);
  const limit = 20;
  
  // Household ID (from localStorage or context)
  const [householdId, setHouseholdId] = useState<string | null>(null);
  
  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    // Get household ID from localStorage (set during login)
    const stored = localStorage.getItem('householdId');
    if (stored) {
      setHouseholdId(stored);
    }
  }, []);

  useEffect(() => {
    if (!householdId) return;
    loadRecords();
  }, [householdId, page, typeFilter, sourceFilter, dateFrom, dateTo]);

  async function loadRecords() {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.getRecords({
        householdId: householdId!,
        type: typeFilter || undefined,
        source: sourceFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
        offset: page * limit,
      });
      
      if (result.success && result.data) {
        setRecords(result.data.records);
        setTotal(result.data.total);
      } else {
        setError(result.reason || 'Erro ao carregar registros');
      }
    } catch (err) {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(record: FinancialRecord) {
    setConfirmDialog({
      open: true,
      title: 'Excluir Registro',
      message: `Tem certeza que deseja excluir "${record.description}"?`,
      onConfirm: async () => {
        const result = await client.deleteRecord(record.id, { householdId: householdId! });
        if (result.success) {
          loadRecords();
        }
        setConfirmDialog(prev => ({ ...prev, open: false }));
      },
    });
  }

  async function handleUndo(record: FinancialRecord) {
    setConfirmDialog({
      open: true,
      title: 'Desfazer Registro',
      message: `Isso irá reverter "${record.description}" criando um registro oposto. Continuar?`,
      onConfirm: async () => {
        const result = await client.undoRecord(record.id, { householdId: householdId! });
        if (result.success) {
          loadRecords();
        }
        setConfirmDialog(prev => ({ ...prev, open: false }));
      },
    });
  }

  async function handleUpdateStatus(record: FinancialRecord, status: string) {
    const result = await client.updateRecord(record.id, {
      householdId: householdId!,
      status,
    });
    if (result.success) {
      loadRecords();
    }
  }

  const totalPages = Math.ceil(total / limit);
  const startItem = page * limit + 1;
  const endItem = Math.min((page + 1) * limit, total);

  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver os registros.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">📝 Registros</h1>
        <p className="page-subtitle">{total} registros encontrados</p>
      </div>

      {/* Filters */}
      <div className="section">
        <div className="card">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select 
                className="form-select" 
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
              >
                <option value="">Todos</option>
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
                <option value="transfer">Transferência</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Fonte</label>
              <select 
                className="form-select"
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
              >
                <option value="">Todas</option>
                <option value="dashboard">Dashboard</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="cron">Cron</option>
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">De</label>
              <input 
                type="date" 
                className="form-input"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Até</label>
              <input 
                type="date"
                className="form-input"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              />
            </div>
            
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => {
                setTypeFilter('');
                setSourceFilter('');
                setDateFrom('');
                setDateTo('');
                setPage(0);
              }}>
                Limpar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Records Table */}
      <div className="section">
        {loading ? (
          <div className="card">
            <p className="text-muted">Carregando...</p>
          </div>
        ) : error ? (
          <div className="card">
            <p className="text-red">{error}</p>
            <button className="btn btn-secondary mt-md" onClick={loadRecords}>
              Tentar novamente
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="card">
            <p className="text-muted">Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: 'var(--space-sm) var(--space-md)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Data</th>
                  <th style={{ padding: 'var(--space-sm) var(--space-md)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Descrição</th>
                  <th style={{ padding: 'var(--space-sm) var(--space-md)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Tipo</th>
                  <th style={{ padding: 'var(--space-sm) var(--space-md)', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Valor</th>
                  <th style={{ padding: 'var(--space-sm) var(--space-md)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Fonte</th>
                  <th style={{ padding: 'var(--space-sm) var(--space-md)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Status</th>
                  <th style={{ padding: 'var(--space-sm) var(--space-md)', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                      {new Date(record.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                      <div style={{ fontWeight: 500 }}>{record.description}</div>
                    </td>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                      <span className={typeColors[record.type] || ''}>
                        {record.type === 'expense' ? '💸' : record.type === 'income' ? '💰' : '↔️'}
                        {' '}
                        {record.type === 'expense' ? 'Despesa' : record.type === 'income' ? 'Receita' : 'Transferência'}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                        className={record.type === 'expense' ? 'text-red' : record.type === 'income' ? 'text-green' : 'text-amber'}>
                      {record.type === 'expense' ? '-' : record.type === 'income' ? '+' : ''}
                      R$ {(record.amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      {record.source === 'dashboard' ? '📊' : record.source === 'whatsapp' ? '📱' : '⏰'} {record.source}
                    </td>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                      <span className={`${statusColors[record.status] || ''} font-bold`} style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        {record.status}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 'var(--space-xs)', justifyContent: 'flex-end' }}>
                        {record.status !== 'cancelled' && record.status !== 'review' && (
                          <button 
                            className="btn-icon" 
                            title="Desfazer"
                            onClick={() => handleUndo(record)}
                            style={{ background: 'var(--accent-amber-dim)', color: 'var(--accent-amber)' }}
                          >
                            ↩️
                          </button>
                        )}
                        {record.status !== 'cancelled' && (
                          <button 
                            className="btn-icon" 
                            title="Excluir"
                            onClick={() => handleDelete(record)}
                            style={{ background: 'var(--error)', opacity: 0.3 }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="text-muted">
              Mostrando {startItem}-{endItem} de {total}
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button 
                className="btn btn-secondary"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                ◀ Anterior
              </button>
              <span style={{ padding: 'var(--space-sm) var(--space-md)', color: 'var(--text-muted)' }}>
                Página {page + 1} de {totalPages}
              </span>
              <button 
                className="btn btn-secondary"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Próxima ▶
              </button>
            </div>
          </div>
        </div>
      )}

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
            <h3 style={{ marginBottom: 'var(--space-md)' }}>{confirmDialog.title}</h3>
            <p className="text-muted" style={{ marginBottom: 'var(--space-lg)' }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-danger"
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