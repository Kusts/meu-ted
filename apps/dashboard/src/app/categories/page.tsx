// ─────────────────────────────────────────────────────────────────────────────
// Categories Page
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { Category } from '@/lib/api-client';

const client = createApiClient();

const kindLabels: Record<string, string> = {
  expense: 'Despesa',
  income: 'Receita',
};

const kindEmoji: Record<string, string> = {
  expense: '📉',
  income: '📈',
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    kind: 'expense' as Category['kind'],
    parentId: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('householdId');
    if (stored) setHouseholdId(stored);
  }, []);

  useEffect(() => {
    if (!householdId) return;
    loadCategories();
  }, [householdId]);

  async function loadCategories() {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.listCategories(householdId!);
      if (result.success && result.data) {
        setCategories(result.data);
      } else {
        setError(result.reason || 'Erro ao carregar categorias');
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
      const result = await client.findOrCreateCategory({
        householdId: householdId!,
        name: formData.name,
        kind: formData.kind,
        parentId: formData.parentId || undefined,
      });
      
      if (result.success) {
        setFormData({ name: '', kind: 'expense', parentId: '' });
        setShowForm(false);
        loadCategories();
      } else {
        setFormError(result.reason || 'Erro ao criar categoria');
      }
    } catch {
      setFormError('Erro de conexão');
    } finally {
      setSubmitting(false);
    }
  }

  // Build tree structure
  function buildTree(cats: Category[]): { parent: Category; children: Category[] }[] {
    const parents = cats.filter(c => !c.parentId);
    return parents.map(parent => ({
      parent,
      children: cats.filter(c => c.parentId === parent.id),
    }));
  }

  const tree = buildTree(categories);

  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver as categorias.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">🏷️ Categorias</h1>
            <p className="page-subtitle">{categories.length} categorias</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancelar' : '+ Nova Categoria'}
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="section">
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Nova Categoria</h3>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Nome</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ex: Alimentação, Transporte"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select
                    className="form-select"
                    value={formData.kind}
                    onChange={(e) => setFormData(prev => ({ ...prev, kind: e.target.value as Category['kind'] }))}
                  >
                    <option value="expense">Despesa</option>
                    <option value="income">Receita</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Categoria Pai (opcional)</label>
                  <select
                    className="form-select"
                    value={formData.parentId}
                    onChange={(e) => setFormData(prev => ({ ...prev, parentId: e.target.value }))}
                  >
                    <option value="">Nenhuma</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({kindLabels[cat.kind]})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {formError && <p className="form-error mt-md">{formError}</p>}
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Criando...' : 'Criar Categoria'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Categories Tree */}
      <div className="section">
        {loading ? (
          <div className="card"><p className="text-muted">Carregando...</p></div>
        ) : error ? (
          <div className="card">
            <p className="text-red">{error}</p>
            <button className="btn btn-secondary mt-md" onClick={loadCategories}>Tentar novamente</button>
          </div>
        ) : tree.length === 0 ? (
          <div className="card"><p className="text-muted">Nenhuma categoria encontrada. Crie sua primeira!</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-lg)' }}>
            {/* Expense Categories */}
            <div className="card">
              <h3 style={{ marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                📉 Despesas
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {tree.filter(t => t.parent.kind === 'expense').map(({ parent, children }) => (
                  <div key={parent.id}>
                    <div style={{ 
                      padding: 'var(--space-sm)', 
                      background: 'var(--bg-secondary)', 
                      borderRadius: 'var(--radius)',
                      fontWeight: 500
                    }}>
                      {parent.name}
                    </div>
                    {children.length > 0 && (
                      <div style={{ marginLeft: 'var(--space-lg)', marginTop: 'var(--space-xs)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                        {children.map(child => (
                          <div key={child.id} style={{ 
                            padding: 'var(--space-xs) var(--space-sm)', 
                            background: 'var(--bg-tertiary)', 
                            borderRadius: 'var(--radius)',
                            fontSize: '0.875rem',
                            color: 'var(--text-secondary)'
                          }}>
                            ↳ {child.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Income Categories */}
            <div className="card">
              <h3 style={{ marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                📈 Receitas
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {tree.filter(t => t.parent.kind === 'income').map(({ parent, children }) => (
                  <div key={parent.id}>
                    <div style={{ 
                      padding: 'var(--space-sm)', 
                      background: 'var(--bg-secondary)', 
                      borderRadius: 'var(--radius)',
                      fontWeight: 500
                    }}>
                      {parent.name}
                    </div>
                    {children.length > 0 && (
                      <div style={{ marginLeft: 'var(--space-lg)', marginTop: 'var(--space-xs)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                        {children.map(child => (
                          <div key={child.id} style={{ 
                            padding: 'var(--space-xs) var(--space-sm)', 
                            background: 'var(--bg-tertiary)', 
                            borderRadius: 'var(--radius)',
                            fontSize: '0.875rem',
                            color: 'var(--text-secondary)'
                          }}>
                            ↳ {child.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}