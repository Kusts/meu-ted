// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Layout - Next.js App Router
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
