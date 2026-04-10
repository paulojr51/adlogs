'use client';

import { useEffect, useState, useCallback } from 'react';
import { FolderOpen, Search, RefreshCw } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface FileEvent {
  id: string;
  windowsEventId: number;
  username: string;
  domain?: string;
  filePath: string;
  monitoredFolder?: string;
  action: string;
  processName?: string;
  timestamp: string;
}

interface FileEventsResponse {
  data: FileEvent[];
  total: number;
  limit: number;
  offset: number;
}

const actionColors: Record<string, string> = {
  READ: 'text-blue-400 bg-blue-400/10',
  WRITE: 'text-yellow-400 bg-yellow-400/10',
  DELETE: 'text-red-400 bg-red-400/10',
  RENAME: 'text-purple-400 bg-purple-400/10',
  PERMISSION_CHANGE: 'text-orange-400 bg-orange-400/10',
};

const actionLabels: Record<string, string> = {
  READ: 'Leitura',
  WRITE: 'Escrita',
  DELETE: 'Exclusão',
  RENAME: 'Renomeação',
  PERMISSION_CHANGE: 'Permissão',
};

export default function ArquivosPage() {
  const [events, setEvents] = useState<FileEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [filePath, setFilePath] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (username) params.set('username', username);
      if (filePath) params.set('filePath', filePath);
      if (action) params.set('action', action);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      const res = await api.get<FileEventsResponse>(`/events/files?${params.toString()}`);
      setEvents(res.data);
      setTotal(res.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [username, filePath, action, from, to, page]);

  useEffect(() => { void load(); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    void load();
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Acessos a Arquivos" />

      <main className="flex-1 p-6 space-y-4">
        {/* Filtros */}
        <form onSubmit={handleSearch} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <input
              placeholder="Usuário..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Caminho do arquivo..."
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas as ações</option>
              {Object.entries(actionLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition">
              <Search className="h-4 w-4" /> Buscar
            </button>
            <button type="button" onClick={() => void load()} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition">
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
          </div>
        </form>

        {/* Tabela */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <p className="text-sm text-slate-400">
              {loading ? 'Carregando...' : `${total.toLocaleString('pt-BR')} eventos encontrados`}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Ação</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Usuário</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Arquivo</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Pasta Monitorada</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Processo</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[e.action] ?? 'text-slate-400'}`}>
                        {actionLabels[e.action] ?? e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      {e.domain ? `${e.domain}\\` : ''}{e.username}
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs max-w-xs truncate" title={e.filePath}>
                      <FolderOpen className="h-3.5 w-3.5 inline mr-1.5 text-slate-600" />
                      {e.filePath}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{e.monitoredFolder ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{e.processName ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(e.timestamp)}</td>
                  </tr>
                ))}
                {!loading && events.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Nenhum evento encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {total > limit && (
            <div className="p-4 border-t border-slate-800 flex items-center justify-between">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg transition">
                Anterior
              </button>
              <span className="text-sm text-slate-500">Página {page + 1} de {Math.ceil(total / limit)}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}
                className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg transition">
                Próxima
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
