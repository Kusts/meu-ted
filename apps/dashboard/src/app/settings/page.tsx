// ─────────────────────────────────────────────────────────────────────────────
// Settings Page (Placeholder)
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '@/lib/api-client';

const client = createApiClient();

export default function SettingsPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userPhone, setUserPhone] = useState<string>('');

  useEffect(() => {
    const stored = localStorage.getItem('householdId');
    const storedName = localStorage.getItem('userName');
    const storedPhone = localStorage.getItem('userPhone');
    if (stored) setHouseholdId(stored);
    if (storedName) setUserName(storedName);
    if (storedPhone) setUserPhone(storedPhone);
  }, []);

  if (!householdId) {
    return (
      <div className="page">
        <div className="card">
          <p className="text-muted">Faça login para ver as configurações.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">⚙️ Configurações</h1>
        <p className="page-subtitle">Gerencie sua conta e preferências</p>
      </div>

      {/* Household Info */}
      <div className="section">
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-md)' }}>🏠 Household</h3>
          <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
              <span className="text-muted">ID do Household</span>
              <span className="font-mono" style={{ fontSize: '0.875rem' }}>{householdId.slice(0, 8)}...</span>
            </div>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="section">
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-md)' }}>👤 Usuário</h3>
          <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
              <span className="text-muted">Nome</span>
              <span>{userName || 'Não informado'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
              <span className="text-muted">Telefone</span>
              <span className="font-mono">{userPhone || 'Não informado'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
              <span className="text-muted">Role</span>
              <span className="badge badge-success">owner</span>
            </div>
          </div>
        </div>
      </div>

      {/* High Value Threshold */}
      <div className="section">
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-md)' }}>💰 Valor Alto</h3>
          <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
              <span className="text-muted">Limite para Revisão</span>
              <span className="font-mono">R$ 500,00</span>
            </div>
            <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: 'var(--space-sm)' }}>
              Transações acima deste valor são automaticamente enviadas para revisão antes de serem confirmadas.
            </p>
          </div>
        </div>
      </div>

      {/* Advanced Settings Placeholder */}
      <div className="section">
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-md)' }}>🔧 Configurações Avançadas</h3>
          <div style={{ 
            padding: 'var(--space-xl)', 
            background: 'var(--bg-secondary)', 
            borderRadius: 'var(--radius)', 
            textAlign: 'center',
            border: '2px dashed var(--border)'
          }}>
            <span style={{ fontSize: '2rem' }}>🚧</span>
            <p className="text-muted mt-sm">
              Configurações avançadas estão em desenvolvimento.
            </p>
            <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: 'var(--space-xs)' }}>
              Em breve: limites customizados, notificações, preferências de thème, e mais.
            </p>
          </div>
        </div>
      </div>

      {/* App Info */}
      <div className="section">
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-md)' }}>ℹ️ Sobre</h3>
          <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
              <span className="text-muted">Versão</span>
              <span>1.0.0</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)' }}>
              <span className="text-muted">Modo</span>
              <span className="badge badge-muted">API Connected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}