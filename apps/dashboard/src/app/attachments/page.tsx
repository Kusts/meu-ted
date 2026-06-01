'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Attachments Page (REQ-027/040)
// Uses useAuth from auth-context
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { Attachment } from '@/lib/api-client';

export default function AttachmentsPage() {
  const { householdId, apiClient } = useAuth();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [entityType, setEntityType] = useState('financial_record');
  const [entityId, setEntityId] = useState('');

  const fetchAttachments = async () => {
    if (!entityId || !householdId) return;
    setLoading(true);
    try {
      const res = await apiClient.getAttachments(householdId, entityType, entityId);
      if (res.success && res.data) setAttachments(res.data);
    } catch (e) {
      console.error('Failed to fetch attachments:', e);
    } finally {
      setLoading(false);
    }
  };

  const deleteAttachment = async (id: string) => {
    if (!confirm('Excluir este anexo?') || !householdId) return;
    try {
      await apiClient.deleteAttachment(id, householdId);
      fetchAttachments();
    } catch (e) {
      console.error('Failed to delete attachment:', e);
    }
  };

  // Show login prompt if not authenticated
  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver os anexos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>📎 Anexos</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Fechar' : '+ Novo Anexo'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p style={{ color: '#666', marginBottom: '0.5rem' }}>
            Anexos são gerenciados automaticamente ao criar/editrar registros.
            O upload real de arquivos requer integração com storage (S3, GCS, etc).
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Buscar Anexos</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Tipo de Entidade</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="input"
              style={{ width: '200px' }}
            >
              <option value="financial_record">Registro</option>
              <option value="account">Conta</option>
              <option value="card">Cartão</option>
              <option value="invoice">Fatura</option>
              <option value="recurrence">Recorrência</option>
              <option value="category">Categoria</option>
              <option value="budget">Orçamento</option>
              <option value="loan">Empréstimo</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>ID da Entidade</label>
            <input
              type="text"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="uuid da entidade"
              className="input"
              style={{ width: '300px' }}
            />
          </div>
          <button className="btn-secondary" onClick={fetchAttachments} disabled={loading || !entityId}>
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '1rem' }}>Anexos ({attachments.length})</h2>
        {attachments.length === 0 ? (
          <p style={{ color: '#666' }}>Nenhum anexo encontrado. Busque por uma entidade.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo MIME</th>
                <th>Tamanho</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((a) => (
                <tr key={a.id}>
                  <td>{a.originalName || a.filePath.split('/').pop()}</td>
                  <td><code>{a.mimeType}</code></td>
                  <td>{a.fileSizeBytes ? `${(a.fileSizeBytes / 1024).toFixed(1)} KB` : '-'}</td>
                  <td>{new Date(a.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <button className="btn-small btn-danger" onClick={() => deleteAttachment(a.id)}>
                      Excluir
                    </button>
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