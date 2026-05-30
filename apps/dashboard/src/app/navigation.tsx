// ─────────────────────────────────────────────────────────────────────────────
// Navigation Component - Sidebar + Header
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const navItems = [
  { href: '/', icon: '📊', label: 'Dashboard' },
  { href: '/records', icon: '📝', label: 'Registros' },
  { href: '/accounts', icon: '🏦', label: 'Contas' },
  { href: '/cards', icon: '💳', label: 'Cartões & Faturas' },
  { href: '/loans', icon: '💰', label: 'Empréstimos' },
  { href: '/budgets', icon: '🎯', label: 'Orçamentos' },
  { href: '/recurrences', icon: '🔄', label: 'Recorrências' },
  { href: '/categories', icon: '🏷️', label: 'Categorias' },
  { href: '/review', icon: '⚠️', label: 'Revisão' },
  { href: '/settings', icon: '⚙️', label: 'Configurações' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">💰</span>
          <span className="sidebar-logo-text">TED Finance</span>
        </div>
        <span className="ted-badge">TED Online</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = item.href === '/' 
            ? pathname === '/' 
            : pathname.startsWith(item.href);
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="nav-link-icon">{item.icon}</span>
              <span className="nav-link-text">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">U</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">Usuário</div>
            <div className="sidebar-user-phone">Logado</div>
          </div>
          <button className="btn-logout" title="Sair">
            🚪
          </button>
        </div>
      </div>
    </aside>
  );
}