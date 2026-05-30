// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Page - TED Finance Cockpit
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useEffect } from 'react';
import { createApiClient } from '../lib/api-client';
import { formatCentsToBRL, formatDate, formatAccountType, formatRecordType, formatSource } from '../lib/formatters';
import { LoginForm, useAuth } from '../components/login-form';
import type { Account, Category, FinancialRecord } from '../lib/api-client';

const DEFAULT_HOUSEHOLD = 'demo-household';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────
// Header Component
// ─────────────────────────────────────────────────────────────────────────────

function Header({ onLogout }: { onLogout?: () => void }) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <div className="logo-icon">T</div>
          <span className="logo-text">TED Finance</span>
        </div>
        <div className="header-actions">
          <div className="ted-badge">
            <span>🤖</span>
            <span>TED Online</span>
          </div>
          {onLogout && (
            <button className="logout-button" onClick={onLogout}>
              Sair
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary Cards Component
// ─────────────────────────────────────────────────────────────────────────────

interface SummaryData {
  totalBalance: number;
  monthExpenses: number;
  monthIncome: number;
  pendingBills: number;
}

function SummaryCards({ data, loading }: { data: SummaryData; loading: boolean }) {
  if (loading) {
    return (
      <div className="summary-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="summary-card">
            <div className="spinner" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="summary-grid">
      <div className="summary-card">
        <div className="summary-card-icon green">💰</div>
        <div className="card-value green">{formatCentsToBRL(data.totalBalance)}</div>
        <div className="card-label">Saldo Total</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-icon amber">📉</div>
        <div className="card-value red">{formatCentsToBRL(data.monthExpenses)}</div>
        <div className="card-label">Despesas do Mês</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-icon green">📈</div>
        <div className="card-value">{formatCentsToBRL(data.monthIncome)}</div>
        <div className="card-label">Receitas do Mês</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-icon info">📋</div>
        <div className="card-value amber">{data.pendingBills}</div>
        <div className="card-label">Contas Pendentes</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Form Component
// ─────────────────────────────────────────────────────────────────────────────

interface AccountFormProps {
  onSuccess: (account: Account) => void;
  onError: (error: string) => void;
}

function AccountForm({ onSuccess, onError }: AccountFormProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'checking' as const,
    scope: 'shared' as const,
    initialBalanceCents: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const client = createApiClient(API_URL);
      const balanceCents = Math.round(parseFloat(form.initialBalanceCents || '0') * 100);
      
      const result = await client.createAccount({
        householdId: DEFAULT_HOUSEHOLD,
        name: form.name,
        type: form.type,
        scope: form.scope,
        initialBalanceCents: balanceCents,
      });

      if (result.success && result.data) {
        onSuccess(result.data);
        setForm({ name: '', type: 'checking', scope: 'shared', initialBalanceCents: '' });
      } else {
        onError(result.reason || 'Erro ao criar conta');
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card">
      <div className="card-header">
        <h3 className="card-title">Nova Conta</h3>
      </div>
      <div className="form-group">
        <label className="form-label">Nome</label>
        <input
          type="text"
          className="form-input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Ex: Conta Corrente Inter"
          required
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <select
            className="form-select"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as any })}
          >
            <option value="checking">Conta Corrente</option>
            <option value="savings">Poupança</option>
            <option value="cash">Dinheiro</option>
            <option value="investment">Investimento</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Escopo</label>
          <select
            className="form-select"
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value as any })}
          >
            <option value="shared">Compartilhada</option>
            <option value="personal">Pessoal</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Saldo Inicial (R$)</label>
        <input
          type="number"
          step="0.01"
          className="form-input"
          value={form.initialBalanceCents}
          onChange={(e) => setForm({ ...form, initialBalanceCents: e.target.value })}
          placeholder="0,00"
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? <span className="spinner" /> : 'Criar Conta'}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Record Form Component
// ─────────────────────────────────────────────────────────────────────────────

interface RecordFormProps {
  accounts: Account[];
  onSuccess: () => void;
  onError: (error: string) => void;
}

function RecordForm({ accounts, onSuccess, onError }: RecordFormProps) {
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [form, setForm] = useState({
    accountId: '',
    toAccountId: '',
    amountCents: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const client = createApiClient(API_URL);
      const amountCents = Math.round(parseFloat(form.amountCents || '0') * 100);
      
      const input = {
        householdId: DEFAULT_HOUSEHOLD,
        accountId: form.accountId,
        amountCents,
        description: form.description,
        date: form.date,
        source: 'dashboard' as const,
      };

      let result;
      if (type === 'expense') {
        result = await client.createExpense(input);
      } else if (type === 'income') {
        result = await client.createIncome(input);
      } else {
        result = await client.createTransfer({
          ...input,
          fromAccountId: form.accountId,
          toAccountId: form.toAccountId,
        });
      }

      if (result.success) {
        onSuccess();
        setForm({ accountId: form.accountId, toAccountId: '', amountCents: '', description: '', date: new Date().toISOString().split('T')[0] });
      } else {
        onError(result.reason || 'Erro ao registrar');
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card">
      <div className="card-header">
        <h3 className="card-title">Registrar Transação</h3>
      </div>
      
      <div className="tabs">
        <button
          type="button"
          className={`tab ${type === 'expense' ? 'active' : ''}`}
          onClick={() => setType('expense')}
        >
          Despesa
        </button>
        <button
          type="button"
          className={`tab ${type === 'income' ? 'active' : ''}`}
          onClick={() => setType('income')}
        >
          Receita
        </button>
        <button
          type="button"
          className={`tab ${type === 'transfer' ? 'active' : ''}`}
          onClick={() => setType('transfer')}
        >
          Transferência
        </button>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Conta</label>
          <select
            className="form-select"
            value={form.accountId}
            onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            required
          >
            <option value="">Selecione...</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>
        {type === 'transfer' && (
          <div className="form-group">
            <label className="form-label">Para Conta</label>
            <select
              className="form-select"
              value={form.toAccountId}
              onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}
              required
            >
              <option value="">Selecione...</option>
              {accounts.filter((a) => a.id !== form.accountId).map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Valor (R$)</label>
          <input
            type="number"
            step="0.01"
            className="form-input"
            value={form.amountCents}
            onChange={(e) => setForm({ ...form, amountCents: e.target.value })}
            placeholder="0,00"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Data</label>
          <input
            type="date"
            className="form-input"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Descrição</label>
        <input
          type="text"
          className="form-input"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Ex: Mercado, Salário, Pix..."
          required
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading || !form.accountId}>
        {loading ? <span className="spinner" /> : type === 'expense' ? 'Registrar Despesa' : type === 'income' ? 'Registrar Receita' : 'Transferir'}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account List Component
// ─────────────────────────────────────────────────────────────────────────────

function AccountList({ accounts }: { accounts: Account[] }) {
  if (accounts.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Contas</h3>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">🏦</div>
          <div className="empty-state-title">Nenhuma conta</div>
          <div className="empty-state-text">Crie sua primeira conta para começar</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Contas</h3>
        <span className="text-muted">{accounts.length}</span>
      </div>
      <ul className="list">
        {accounts.map((account) => (
          <li key={account.id} className="list-item">
            <div className="list-item-content">
              <div className="list-item-title">{account.name}</div>
              <div className="list-item-subtitle">{formatAccountType(account.type)} • {account.scope === 'shared' ? 'Compartilhada' : 'Pessoal'}</div>
            </div>
            <div className="list-item-value text-green">
              {formatCentsToBRL(account.initialBalanceCents || 0)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent Records Component
// ─────────────────────────────────────────────────────────────────────────────

function RecentRecords({ records }: { records: FinancialRecord[] }) {
  if (records.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Registros Recentes</h3>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <div className="empty-state-title">Nenhum registro</div>
          <div className="empty-state-text">Suas transações aparecerão aqui</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Registros Recentes</h3>
        <span className="text-muted">{records.length}</span>
      </div>
      <ul className="list">
        {records.slice(0, 10).map((record) => (
          <li key={record.id} className="list-item">
            <div className="list-item-content">
              <div className="list-item-title">{record.description}</div>
              <div className="list-item-subtitle">
                {formatDate(record.date)} • {formatRecordType(record.type)} • {formatSource(record.source)}
              </div>
            </div>
            <div className={`list-item-value ${record.type === 'expense' || record.type === 'interest' ? 'text-red' : 'text-green'}`}>
              {record.type === 'expense' || record.type === 'interest' ? '-' : '+'}{formatCentsToBRL(record.amountCents)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Component
// ─────────────────────────────────────────────────────────────────────────────

function Message({ type, children, onClose }: { type: 'success' | 'error' | 'warning'; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className={`alert alert-${type}`}>
      <span>{children}</span>
      <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
        ✕
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard Page
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [apiConnected, setApiConnected] = useState(false);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const client = createApiClient(API_URL);
        
        // Check health
        const health = await client.health();
        if (!health.ok) {
          throw new Error('API não está respondendo');
        }
        setApiConnected(true);

        // Load accounts
        const accountsResult = await client.listAccounts(DEFAULT_HOUSEHOLD);
        if (accountsResult.success && accountsResult.data) {
          setAccounts(accountsResult.data);
        }

        // Records would need a list endpoint - for now empty
        setRecords([]);
      } catch (err) {
        console.error('Failed to load data:', err);
        setApiConnected(false);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const showMessage = (type: 'success' | 'error' | 'warning', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Auth Check
  // ─────────────────────────────────────────────────────────────────────────

  const { isLoggedIn, logout, getUser } = useAuth();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    setAuthChecked(true);
  }, []);

  const handleLogout = () => {
    logout();
    window.location.reload();
  };

  const user = getUser();

  // Show login if not authenticated (skip for demo data when no API)
  if (authChecked && !isLoggedIn() && apiConnected) {
    return (
      <LoginForm
        apiUrl={API_URL}
        onSuccess={() => {
          // Force refresh to reload data with new auth
          window.location.reload();
        }}
      />
    );
  }

  const handleAccountCreated = (account: Account) => {
    setAccounts([...accounts, account]);
    showMessage('success', `Conta "${account.name}" criada com sucesso!`);
  };

  const handleRecordSuccess = () => {
    showMessage('success', 'Transação registrada com sucesso!');
    // Reload accounts to get updated balances
    async function reload() {
      const client = createApiClient(API_URL);
      const result = await client.listAccounts(DEFAULT_HOUSEHOLD);
      if (result.success && result.data) {
        setAccounts(result.data);
      }
    }
    reload();
  };

  // Calculate summary data
  const summaryData: SummaryData = {
    totalBalance: accounts.reduce((sum, acc) => sum + (acc.initialBalanceCents || 0), 0),
    monthExpenses: records.filter(r => r.type === 'expense' && r.date.startsWith(new Date().toISOString().slice(0, 7))).reduce((sum, r) => sum + r.amountCents, 0),
    monthIncome: records.filter(r => r.type === 'income' && r.date.startsWith(new Date().toISOString().slice(0, 7))).reduce((sum, r) => sum + r.amountCents, 0),
    pendingBills: 0, // Would come from bills endpoint
  };

  return (
    <>
      <Header onLogout={handleLogout} />
      
      <main className="container page">
        <div className="page-header">
          <h1 className="page-title">Dashboard Financeiro</h1>
          <p className="page-subtitle">Visão geral das suas finanças • {apiConnected ? '🟢 Conectado' : '🔴 Desconectado'}</p>
        </div>

        {message && (
          <Message type={message.type} onClose={() => setMessage(null)}>
            {message.text}
          </Message>
        )}

        {!apiConnected && (
          <div className="alert alert-warning">
            ⚠️ Não foi possível conectar à API. Verifique se o servidor está rodando em {API_URL}
          </div>
        )}

        <SummaryCards data={summaryData} loading={loading} />

        <div className="grid grid-2">
          <div className="section">
            <AccountForm
              onSuccess={handleAccountCreated}
              onError={(err) => showMessage('error', err)}
            />
          </div>
          <div className="section">
            <RecordForm
              accounts={accounts}
              onSuccess={handleRecordSuccess}
              onError={(err) => showMessage('error', err)}
            />
          </div>
        </div>

        <div className="grid grid-2 mt-lg">
          <AccountList accounts={accounts} />
          <RecentRecords records={records} />
        </div>

        <footer className="mt-lg text-center text-muted" style={{ fontSize: '0.75rem' }}>
          <p>TED Finance • Dashboard Local • Dados em memória</p>
        </footer>
      </main>
    </>
  );
}
