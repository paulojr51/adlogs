'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface UserInfo {
  name: string;
  email: string;
  role: string;
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  ANALYST: 'Analista',
  VIEWER: 'Visualizador',
};

export function Header({ title }: { title: string }) {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('adlogs_user');
    if (stored) {
      setUser(JSON.parse(stored) as UserInfo);
    }
  }, []);

  async function handleLogout() {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // ignora erro de rede no logout
    }
    localStorage.removeItem('adlogs_token');
    localStorage.removeItem('adlogs_user');
    toast.success('Sessão encerrada');
    router.push('/login');
  }

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
      <h1 className="text-lg font-semibold text-white">{title}</h1>

      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-2">
            <div className="bg-slate-700 rounded-full p-1.5">
              <User className="h-4 w-4 text-slate-300" />
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-slate-500">{roleLabels[user.role] ?? user.role}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          title="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
