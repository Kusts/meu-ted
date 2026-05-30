// ─────────────────────────────────────────────────────────────────────────────
// Cards & Invoices Page
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { CreditCard, Invoice } from '@/lib/api-client';

const client = createApiClient();

const statusLabels: Record<string, string> = {
  open: 'Aberta',
  closed: 'Fechada',
  paid: 'Paga',
  overdue: 'Vencida',
};

export default function CardsPage() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    scope: 'shared' as CreditCard['scope'],
    closingDay: '20',
    dueDay: '27',
    limitCents: '',
    paymentAccountId: '',
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
      const [cardsResult, invoicesResult] = await Promise.all([
        client.listCards(householdId!),
        client.listInvoices(householdId!),
      ]);
      
      if (cardsResult.success && cardsResult.data) {
        setCards(cardsResult.data);
      }
      if (invoicesResult.success && invoicesResult.data) {
        setInvoices(invoicesResult.data);
      }
      
      if (!cardsResult.success && !invoicesResult.success) {
        setError('Erro ao carregar dados');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCard(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    
    try {
      const result = await client.createCard({
        householdId: householdId!,
        name: formData.name,
        scope: formData.scope,
        closingDay: parseInt(formData.closingDay),
        dueDay: parseInt(formData.dueDay),
        limitCents: formData.limitCents ? parseInt(formData.limitCents) * 100 : undefined,
        paymentAccountId: formData.paymentAccountId || undefined,
      });
      
      if (result.success) {
        setFormData({ name: '', scope: 'shared', closingDay: '20', dueDay: '27', limitCents: '', paymentAccountId: '' });
        setShowForm(false);
        loadData();
      } else {
        setFormError(result.reason || 'Erro ao criar cartão');
      }
    } catch {
      setFormError('Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCloseInvoice(invoice: Invoice) {
    const result = await client.closeInvoice({ householdId: householdId!, invoiceId: invoice.id });
    if (result.success) {
      loadData();
    }
  }

  async function handlePayInvoice(invoice: Invoice) {
    const result = await client.payInvoice({
      householdId: householdId!,
      invoiceId: invoice.id,
      amountCents: invoice.totalCents,
      paymentDate: new Date().toISOString(),
      source: 'dashboard',
    });
    if (result.success) {
      loadData();
    }
  }

  function getCardInvoices(cardId: string): Invoice[] {
    return invoices.filter(inv => inv.cardId === cardId);
  }

  function formatCurrency(cents: number): string {
    return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  }

  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver os cartões.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">💳 Cartões & Faturas</h1>
            <p className="page-subtitle">{cards.length} cartões • {invoices.length} faturas</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : '+ Novo Cartão'}
          </button>
        </div>
      </div>

      {/* Create Card Form */}
      {showForm && (
        <div className="section">
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Novo Cartão</h3>
            <form onSubmit={handleCreateCard}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Nome do Cartão</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Nubank"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Escopo</label>
                  <select
                    className="form-select"
                    value={formData.scope}
                    onChange={(e) => setFormData(prev => ({ ...prev, scope: e.target.value as CreditCard['scope'] }))}
                  >
                    <option value="shared">Compartilhado</option>
                    <option value="personal">Pessoal</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Dia de Fechamento</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="form-input"
                    value={formData.closingDay}
                    onChange={(e) => setFormData(prev => ({ ...prev, closingDay: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Dia de Vencimento</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="form-input"
                    value={formData.dueDay}
                    onChange={(e) => setFormData(prev => ({ ...prev, dueDay: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Limite (R$)</label>
                  <input
                    type="number"
                    step="100"
                    className="form-input"
                    placeholder="5000"
                    value={formData.limitCents}
                    onChange={(e) => setFormData(prev => ({ ...prev, limitCents: e.target.value }))}
                  />
                </div>
              </div>
              {formError && <p className="form-error mt-md">{formError}</p>}
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Criando...' : 'Criar Cartão'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cards List */}
      <div className="section">
        {loading ? (
          <div className="card"><p className="text-muted">Carregando...</p></div>
        ) : error ? (
          <div className="card">
            <p className="text-red">{error}</p>
            <button className="btn btn-secondary mt-md" onClick={loadData}>Tentar novamente</button>
          </div>
        ) : cards.length === 0 ? (
          <div className="card"><p className="text-muted">Nenhum cartão encontrado.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {cards.map((card) => {
              const cardInvoices = getCardInvoices(card.id);
              const isExpanded = expandedCard === card.id;
              
              return (
                <div key={card.id} className="card">
                  {/* Card Header */}
                  <div
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    onClick={() => setExpandedCard(isExpanded ? null : card.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                      <span style={{ fontSize: '2rem' }}>💳</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{card.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                          Fechamento dia {card.closingDay} • Vencimento dia {card.dueDay}
                          {card.limitCents && ` • Limite ${formatCurrency(card.limitCents)}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <span className="badge badge-muted">{card.scope === 'shared' ? 'Compartilhado' : 'Pessoal'}</span>
                      <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                        ▼
                      </span>
                    </div>
                  </div>

                  {/* Invoices Section */}
                  {isExpanded && (
                    <div style={{ marginTop: 'var(--space-lg)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-lg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                        <h4 style={{ fontWeight: 600 }}>Faturas</h4>
                      </div>
                      
                      {cardInvoices.length === 0 ? (
                        <p className="text-muted">Nenhuma fatura encontrada.</p>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={{ padding: 'var(--space-sm)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Período</th>
                              <th style={{ padding: 'var(--space-sm)', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Total</th>
                              <th style={{ padding: 'var(--space-sm)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Vencimento</th>
                              <th style={{ padding: 'var(--space-sm)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Status</th>
                              <th style={{ padding: 'var(--space-sm)', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cardInvoices.map((invoice) => (
                              <tr key={invoice.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: 'var(--space-sm)', fontFamily: 'var(--font-mono)' }}>
                                  {invoice.periodMonth}/{invoice.periodYear}
                                </td>
                                <td style={{ padding: 'var(--space-sm)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                  {formatCurrency(invoice.totalCents)}
                                </td>
                                <td style={{ padding: 'var(--space-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                                  {new Date(invoice.dueAt).toLocaleDateString('pt-BR')}
                                </td>
                                <td style={{ padding: 'var(--space-sm)' }}>
                                  <span className={`badge ${invoice.status === 'open' ? 'badge-warning' : invoice.status === 'paid' ? 'badge-success' : 'badge-muted'}`}>
                                    {statusLabels[invoice.status] || invoice.status}
                                  </span>
                                </td>
                                <td style={{ padding: 'var(--space-sm)', textAlign: 'right' }}>
                                  {invoice.status === 'open' && (
                                    <div style={{ display: 'flex', gap: 'var(--space-xs)', justifyContent: 'flex-end' }}>
                                      <button
                                        className="btn btn-sm btn-secondary"
                                        onClick={(e) => { e.stopPropagation(); handleCloseInvoice(invoice); }}
                                      >
                                        📌 Fechar
                                      </button>
                                      <button
                                        className="btn btn-sm btn-primary"
                                        onClick={(e) => { e.stopPropagation(); handlePayInvoice(invoice); }}
                                      >
                                        💰 Pagar
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
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