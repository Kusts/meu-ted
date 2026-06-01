// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Layout - Next.js App Router
// ─────────────────────────────────────────────────────────────────────────────

import './globals.css';
import { ClientLayout } from './client-layout';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
