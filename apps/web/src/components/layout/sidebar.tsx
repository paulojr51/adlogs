'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  LogIn,
  FolderOpen,
  FileBarChart2,
  Settings,
  Users,
  Shield,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { href: '/dashboard/logins', label: 'Logins', icon: LogIn },
  { href: '/dashboard/arquivos', label: 'Arquivos', icon: FolderOpen },
  { href: '/dashboard/relatorios', label: 'Relatórios', icon: FileBarChart2 },
  { href: '/dashboard/usuarios', label: 'Usuários', icon: Users },
  { href: '/dashboard/configuracoes', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 rounded-lg p-2">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">ADLogs</p>
            <p className="text-slate-500 text-xs">Auditoria de Acessos</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                active
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800',
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="h-3 w-3 opacity-50" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <p className="text-xs text-slate-600 text-center">ADLogs v1.0</p>
      </div>
    </aside>
  );
}
