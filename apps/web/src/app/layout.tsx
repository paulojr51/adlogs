export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'ADLogs — Auditoria de Acessos',
  description: 'Sistema de auditoria de login e acesso a arquivos para Windows Server',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
