'use client';

import { useEffect, useState } from 'react';
import { FolderPlus, Trash2, CheckCircle2, XCircle, Activity } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

interface MonitoredFolder {
  id: string;
  path: string;
  description?: string;
  active: boolean;
  createdAt: string;
}

interface CollectorStatus {
  isRunning: boolean;
  lastSeenAt?: string | null;
  version?: string;
  hostname?: string;
  eventsToday?: number;
  loginToday?: number;
  fileToday?: number;
}

export default function ConfiguracoesPage() {
  const [folders, setFolders] = useState<MonitoredFolder[]>([]);
  const [collectorStatus, setCollectorStatus] = useState<CollectorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ path: '', description: '' });

  async function load() {
    setLoading(true);
    try {
      const [f, s] = await Promise.all([
        api.get<MonitoredFolder[]>('/monitored-folders'),
        api.get<CollectorStatus>('/collector/status'),
      ]);
      setFolders(f);
      setCollectorStatus(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/monitored-folders', form);
      toast.success('Pasta adicionada. O coletor buscará a nova configuração em breve.');
      setShowAdd(false);
      setForm({ path: '', description: '' });
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao adicionar pasta');
    }
  }

  async function handleToggle(folder: MonitoredFolder) {
    try {
      await api.patch(`/monitored-folders/${folder.id}`, { active: !folder.active });
      toast.success(folder.active ? 'Pasta desativada' : 'Pasta ativada');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar pasta');
    }
  }

  async function handleDelete(folder: MonitoredFolder) {
    if (!confirm(`Remover monitoramento de "${folder.path}"?`)) return;
    try {
      await api.delete(`/monitored-folders/${folder.id}`);
      toast.success('Pasta removida');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover pasta');
    }
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Configurações" />

      <main className="flex-1 p-6 space-y-6">
        {/* Status do Coletor */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-400" /> Status do Coletor Windows
          </h2>
          {collectorStatus ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Status</p>
                <p className={`text-sm font-medium ${collectorStatus.isRunning ? 'text-emerald-400' : 'text-red-400'}`}>
                  {collectorStatus.isRunning ? 'Online' : 'Offline'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Hostname</p>
                <p className="text-sm text-white">{collectorStatus.hostname ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Versão</p>
                <p className="text-sm text-white">{collectorStatus.version ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Última atividade</p>
                <p className="text-sm text-white">
                  {collectorStatus.lastSeenAt ? formatDate(collectorStatus.lastSeenAt) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Eventos hoje</p>
                <p className="text-sm text-white">{(collectorStatus.eventsToday ?? 0).toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Logins hoje</p>
                <p className="text-sm text-white">{(collectorStatus.loginToday ?? 0).toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Acessos a arquivos hoje</p>
                <p className="text-sm text-white">{(collectorStatus.fileToday ?? 0).toLocaleString('pt-BR')}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{loading ? 'Carregando...' : 'Coletor nunca conectado'}</p>
          )}
        </div>

        {/* Pastas Monitoradas */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Pastas Monitoradas</h2>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition"
            >
              <FolderPlus className="h-4 w-4" /> Adicionar
            </button>
          </div>

          {showAdd && (
            <form onSubmit={handleAdd} className="mb-4 p-4 bg-slate-800 rounded-lg space-y-3">
              <input
                placeholder="Caminho completo (ex: C:\Documentos\Projetos)"
                required
                value={form.path}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                placeholder="Descrição (opcional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition">Salvar</button>
                <button type="button" onClick={() => setShowAdd(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition">Cancelar</button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {folders.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-mono truncate">{f.path}</p>
                  {f.description && <p className="text-xs text-slate-500 mt-0.5">{f.description}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleToggle(f)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition ${
                      f.active
                        ? 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
                        : 'text-red-400 bg-red-400/10 hover:bg-red-400/20'
                    }`}>
                    {f.active ? <><CheckCircle2 className="h-3 w-3" /> Ativo</> : <><XCircle className="h-3 w-3" /> Inativo</>}
                  </button>
                  <button onClick={() => handleDelete(f)}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {!loading && folders.length === 0 && (
              <p className="text-sm text-slate-500 py-4 text-center">Nenhuma pasta monitorada cadastrada.</p>
            )}
          </div>

          <div className="mt-4 p-3 bg-blue-950/30 border border-blue-800/30 rounded-lg">
            <p className="text-xs text-blue-400">
              <strong>Atenção:</strong> Para monitorar acessos a arquivos, é necessário habilitar a política
              de auditoria &quot;Acesso a Objetos&quot; no servidor e configurar as SACLs nas pastas desejadas.
              Ver <code className="bg-blue-900/30 px-1 rounded">docs/windows-audit-setup.md</code>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
