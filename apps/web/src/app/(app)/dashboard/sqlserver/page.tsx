'use client';

import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface SqlEvent {
  id: string;
  serverId: string;
  windowsEventId: number;
  eventType: string;
  username: string | null;
  clientIp: string | null;
  database: string | null;
  detail: string | null;
  success: boolean;
  timestamp: string;
}

interface ServerRecord { id: string; name: string; }

const SQL_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  LOGIN_FAILED:    { label: 'Login falhou',       color: 'text-red-400 bg-red-900/30' },
  AUTH_FAILURE:    { label: 'Falha de autenticação', color: 'text-orange-400 bg-orange-900/30' },
  SERVICE_STARTED: { label: 'Serviço iniciado',   color: 'text-green-400 bg-green-900/30' },
  SERVICE_STOPPED: { label: 'Serviço parado',     color: 'text-yellow-400 bg-yellow-900/30' },
};

export default function SqlServerPage() {
  const [events, setEvents] = useState<SqlEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [form, setForm] = useState({ username: '', eventType: '', serverId: '', from: '', to: '' });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api.get<ServerRecord[]>('/servers').then(setServers).catch(() => null);
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSubmitted(true);
    try {
      const params = new URLSearchParams();
      if (form.username)  params.set('username', form.username);
      if (form.eventType) params.set('eventType', form.eventType);
      if (form.serverId)  params.set('serverId', form.serverId);
      if (form.from) params.set('from', new Date(form.from).toISOString());
      if (form.to)   params.set('to',   new Date(form.to).toISOString());

      const res = await api.get<{ data: SqlEvent[]; total: number }>(
        `/events/sql?${params.toString()}`
      );
      setEvents(res.data);
      setTotal(res.total);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  const serverName = (id: string) => servers.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="flex flex-col flex-1">
      <Header title="SQL Server" />
      <main className="flex-1 p-6 space-y-4">

        {/* Filtros */}
        <form onSubmit={(e) => void handleSearch(e)}
          className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
            <input placeholder="Usuário SQL"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos os tipos</option>
              {Object.entries(SQL_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select value={form.serverId} onChange={(e) => setForm({ ...form, serverId: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos os servidores</option>
              {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="datetime-local" value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="datetime-local" value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition">
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </form>

        {/* Resultados */}
        {submitted && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 text-slate-400 text-sm">
              {total} evento(s) encontrado(s)
            </div>
            {events.length === 0 ? (
              <div className="p-8 text-center">
                <Database className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">Nenhum evento encontrado.</p>
                <p className="text-slate-600 text-xs mt-1">
                  Habilite &quot;SQL Server&quot; em Servidores → Configurar. <br />
                  Requer <code className="bg-slate-800 px-1 rounded">SQL Server Audit</code> configurado no servidor.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left">
                      {['Timestamp', 'Servidor', 'Tipo', 'Usuário', 'IP Cliente', 'Banco', 'Detalhe'].map((h) => (
                        <th key={h} className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => {
                      const typeInfo = SQL_TYPE_LABELS[ev.eventType];
                      return (
                        <tr key={ev.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                          <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{formatDate(ev.timestamp)}</td>
                          <td className="px-4 py-3 text-slate-300 text-xs">{serverName(ev.serverId)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeInfo?.color ?? 'text-slate-400 bg-slate-700'}`}>
                              {typeInfo?.label ?? ev.eventType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white text-xs">{ev.username ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{ev.clientIp ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{ev.database ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate" title={ev.detail ?? ''}>
                            {ev.detail ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
