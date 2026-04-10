'use client';

import { useEffect, useState } from 'react';
import { UserPlus, Pencil, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  ANALYST: 'Analista',
  VIEWER: 'Visualizador',
};

const roleColors: Record<string, string> = {
  SUPER_ADMIN: 'text-yellow-400 bg-yellow-400/10',
  ADMIN: 'text-blue-400 bg-blue-400/10',
  ANALYST: 'text-purple-400 bg-purple-400/10',
  VIEWER: 'text-slate-400 bg-slate-400/10',
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'VIEWER' });

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<SystemUser[]>('/users');
      setUsers(data);
    } catch (err) {
      toast.error('Erro ao carregar usuários');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/users', form);
      toast.success('Usuário criado com sucesso');
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'VIEWER' });
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar usuário');
    }
  }

  async function handleToggleActive(user: SystemUser) {
    try {
      await api.patch(`/users/${user.id}`, { active: !user.active });
      toast.success(user.active ? 'Usuário desativado' : 'Usuário ativado');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar usuário');
    }
  }

  async function handleDelete(user: SystemUser) {
    if (!confirm(`Remover ${user.name}? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      toast.success('Usuário removido');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover usuário');
    }
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Gestão de Usuários" />

      <main className="flex-1 p-6 space-y-4">
        {/* Header actions */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition"
          >
            <UserPlus className="h-4 w-4" /> Novo Usuário
          </button>
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md">
              <h2 className="text-lg font-semibold text-white mb-4">Novo Usuário</h2>
              <form onSubmit={handleCreate} className="space-y-3">
                <input placeholder="Nome" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="E-mail" type="email" required value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input placeholder="Senha (mín. 6 caracteres)" type="password" required minLength={6} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition">Criar</button>
                  <button type="button" onClick={() => setShowCreate(false)}
                    className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition">Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Nome</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">E-mail</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Perfil</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Último login</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
                )}
                {!loading && users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3 text-white font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-slate-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleColors[u.role] ?? ''}`}>
                        {roleLabels[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.active
                        ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Ativo</span>
                        : <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle className="h-3.5 w-3.5" /> Inativo</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggleActive(u)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition" title={u.active ? 'Desativar' : 'Ativar'}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(u)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition" title="Remover">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
