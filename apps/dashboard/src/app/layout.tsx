// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Layout - Next.js App Router
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import type { Metadata } from 'next';
import './globals.css';
import { Navigation } from './navigation';

export const metadata: Metadata = {
  title: 'TED Finance - Dashboard',
  description: 'Assistente financeiro pessoal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="app-layout">
          <Navigation />
          <main className="app-main">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
