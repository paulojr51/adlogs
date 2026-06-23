'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Terminal } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface ProcessEvent {
  id: string;
  serverId: string;
  windowsEventId: number;
  username: string;
  domain: string | null;
  processName: string;
  processPath: string | null;
  commandLine: string | null;
  parentProcessName: string | null;
  parentProcessId: number | null;
  processId: number | null;
  timestamp: string;
}

interface ProcessEventsResponse {
  data: ProcessEvent[];
  total: number;
  limit: number;
  offset: number;
}

interface ServerRecord {
  id: string;
  name: string;
}

function formatTs(ts: string) {
  return new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function ProcessosPage() {
  const [events, setEvents] = useState<ProcessEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 50;

  const [username, setUsername] = useState('');
  const [processName, setProcessName] = useState('');
  const [serverId, setServerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [servers, setServers] = useState<ServerRecord[]>([]);

  useEffect(() => {
    api.get<ServerRecord[]>('/servers').then(setServers).catch(() => null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (username) params.set('username', username);
      if (processName) params.set('processName', processName);
      if (serverId) params.set('serverId', serverId);
      if (from) params.set('from', new Date(from).toISOString());
      if (to) params.set('to', new Date(to).toISOString());
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      const res = await api.get<ProcessEventsResponse>(`/events/processes?${params.toString()}`);
      setEvents(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Erro ao carregar eventos de processo');
    } finally {
      setLoading(false);
    }
  }, [username, processName, serverId, from, to, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    void load();
  }

  const serverName = (id: string) => servers.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Processos Executados</h1>
          <p className="text-slate-400 text-sm mt-1">Event ID 4688 — Criação de processos nos servidores monitorados</p>
        </div>
        <span className="text-slate-500 text-sm">{total.toLocaleString('pt-BR')} registros</span>
      </div>

      {/* Filtros */}
      <form
        onSubmit={handleSearch}
        className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4"
      >
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Usuário"
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <input
          value={processName}
          onChange={(e) => setProcessName(e.target.value)}
          placeholder="Processo (ex: powershell)"
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <select
          value={serverId}
          onChange={(e) => setServerId(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">Todos os servidores</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </form>

      {/* Tabela */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
              <tr className="text-left">
                <th className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">Timestamp</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Servidor</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Usuário</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Processo</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Linha de Comando</th>
                <th className="px-4 py-3 text-slate-400 font-medium">PID</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    <Terminal className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>Nenhum evento de processo encontrado.</p>
                    <p className="text-xs mt-1">
                      Verifique se o Event ID 4688 está habilitado nos servidores monitorados.
                    </p>
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                      {formatTs(ev.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">
                      {serverName(ev.serverId)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{ev.username}</p>
                      {ev.domain && <p className="text-slate-500 text-xs">{ev.domain}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-blue-400 font-medium">{ev.processName}</p>
                      {ev.processPath && (
                        <p className="text-slate-600 text-xs truncate max-w-48" title={ev.processPath}>
                          {ev.processPath}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {ev.commandLine ? (
                        <code
                          className="text-slate-300 text-xs bg-slate-800 px-2 py-0.5 rounded block truncate"
                          title={ev.commandLine}
                        >
                          {ev.commandLine}
                        </code>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {ev.processId ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between">
        <p className="text-slate-500 text-sm">
          Exibindo {page * limit + 1}–{Math.min((page + 1) * limit, total)} de {total.toLocaleString('pt-BR')}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg transition"
          >
            Anterior
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * limit >= total}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg transition"
          >
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
