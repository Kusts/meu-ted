// ─────────────────────────────────────────────────────────────────────────────
// Client Layout - Auth Provider + Navigation Wrapper
// This file is a 'use client' boundary since AuthProvider requires client context
// ─────────────────────────────────────────────────────────────────────────────
'use client';

import { AuthProvider } from '@/lib/auth-context';
import { Navigation } from './navigation';

function LayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <Navigation />
      <main className="app-main">
        {children}
      </main>
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LayoutContent>{children}</LayoutContent>
    </AuthProvider>
  );
}