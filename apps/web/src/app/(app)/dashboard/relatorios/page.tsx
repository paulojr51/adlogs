'use client';

import { useState } from 'react';
import {
  User,
  FolderOpen,
  Trash2,
  LogIn,
  LogOut,
  XCircle,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'usuario' | 'pasta' | 'acao';

interface TimelineItem {
  type: 'LOGIN' | 'LOGOFF' | 'LOGIN_FAILED' | 'FILE';
  timestamp: string;
  detail: string;
  extra: Record<string, unknown>;
}

interface UserActivityResult {
  username: string;
  from: string;
  to: string;
  totalLogins: number;
  totalFailedLogins: number;
  totalFileEvents: number;
  timeline: TimelineItem[];
}

interface FileEventItem {
  id: string;
  username: string;
  domain?: string;
  filePath: string;
  monitoredFolder?: string;
  action: string;
  processName?: string;
  timestamp: string;
}

interface UserSummaryItem {
  username: string;
  count: number;
  actions: Record<string, number>;
  lastSeen: string;
}

interface FolderActivityResult {
  folderPath: string;
  from: string;
  to: string;
  totalEvents: number;
  uniqueUsers: number;
  userSummary: UserSummaryItem[];
  events: FileEventItem[];
}

interface FolderActionResult {
  folderPath: string;
  action: string;
  from: string;
  to: string;
  total: number;
  events: FileEventItem[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const actionLabels: Record<string, string> = {
  READ: 'Leitura',
  WRITE: 'Escrita',
  DELETE: 'Exclusão',
  RENAME: 'Renomeação',
  PERMISSION_CHANGE: 'Permissão',
};

const actionColors: Record<string, string> = {
  READ: 'text-blue-400 bg-blue-400/10',
  WRITE: 'text-yellow-400 bg-yellow-400/10',
  DELETE: 'text-red-400 bg-red-400/10',
  RENAME: 'text-purple-400 bg-purple-400/10',
  PERMISSION_CHANGE: 'text-orange-400 bg-orange-400/10',
};

function timelineIcon(type: TimelineItem['type']) {
  switch (type) {
    case 'LOGIN':
      return <LogIn className="h-4 w-4 text-emerald-400" />;
    case 'LOGOFF':
      return <LogOut className="h-4 w-4 text-slate-400" />;
    case 'LOGIN_FAILED':
      return <XCircle className="h-4 w-4 text-red-400" />;
    case 'FILE':
      return <FileText className="h-4 w-4 text-purple-400" />;
  }
}

function timelineBorder(type: TimelineItem['type']) {
  switch (type) {
    case 'LOGIN':        return 'border-emerald-800/50';
    case 'LOGOFF':       return 'border-slate-700';
    case 'LOGIN_FAILED': return 'border-red-800/50';
    case 'FILE':         return 'border-purple-800/50';
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InputField({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function SearchButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="self-end px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
    >
      {loading ? 'Buscando...' : 'Gerar relatório'}
    </button>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`rounded-lg px-4 py-3 border ${color}`}>
      <p className="text-xs opacity-70 mb-0.5">{label}</p>
      <p className="text-xl font-bold">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
    </div>
  );
}

// ─── Tab: Relatório por Usuário ───────────────────────────────────────────────

function TabUsuario() {
  const [username, setUsername] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UserActivityResult | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  async function handleSearch() {
    if (!username.trim() || !from || !to) {
      toast.warning('Preencha o usuário e o período');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ username: username.trim(), from, to });
      const data = await api.get<UserActivityResult>(`/reports/user-activity?${params}`);
      setResult(data);
      if (data.timeline.length === 0) toast.info('Nenhum evento encontrado para este usuário no período.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  }

  // Agrupa timeline por dia
  function groupByDay(items: TimelineItem[]) {
    const map = new Map<string, TimelineItem[]>();
    for (const item of items) {
      const day = new Date(item.timestamp).toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const arr = map.get(day) ?? [];
      arr.push(item);
      map.set(day, arr);
    }
    return map;
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-white">Atividade do Usuário</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Exibe linha do tempo completa: logins, logoffs e arquivos acessados/modificados/excluídos.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <InputField label="Usuário (nome ou parte)" value={username} onChange={setUsername} placeholder="ex: paulo.jr" />
          <InputField label="Data/hora início" value={from} onChange={setFrom} type="datetime-local" />
          <InputField label="Data/hora fim" value={to} onChange={setTo} type="datetime-local" />
          <SearchButton loading={loading} onClick={handleSearch} />
        </div>
      </div>

      {/* Resultado */}
      {result && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Total de eventos" value={result.timeline.length} color="border-slate-700 text-slate-300" />
            <SummaryCard label="Logins bem-sucedidos" value={result.totalLogins} color="border-emerald-800/50 text-emerald-400" />
            <SummaryCard label="Falhas de login" value={result.totalFailedLogins} color="border-red-800/50 text-red-400" />
            <SummaryCard label="Eventos de arquivo" value={result.totalFileEvents} color="border-purple-800/50 text-purple-400" />
          </div>

          {/* Timeline agrupada por dia */}
          {result.timeline.length > 0 && Array.from(groupByDay(result.timeline)).map(([day, items]) => (
            <div key={day} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => {
                  const next = new Set(collapsed);
                  next.has(day) ? next.delete(day) : next.add(day);
                  setCollapsed(next);
                }}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-800/50 transition"
              >
                <span className="text-sm font-semibold text-white capitalize">{day}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{items.length} evento{items.length !== 1 ? 's' : ''}</span>
                  {collapsed.has(day)
                    ? <ChevronDown className="h-4 w-4 text-slate-500" />
                    : <ChevronUp className="h-4 w-4 text-slate-500" />}
                </div>
              </button>

              {!collapsed.has(day) && (
                <div className="px-5 pb-4 space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className={`flex gap-3 p-3 rounded-lg border ${timelineBorder(item.type)} bg-slate-800/30`}>
                      <div className="flex-shrink-0 mt-0.5">{timelineIcon(item.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">{item.detail}</p>
                        {item.type === 'FILE' && (
                          <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
                            {item.extra.filePath as string}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-slate-600 flex-shrink-0 tabular-nums">
                        {new Date(item.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Tab: Relatório por Pasta ─────────────────────────────────────────────────

function TabPasta() {
  const [folderPath, setFolderPath] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FolderActivityResult | null>(null);
  const [showEvents, setShowEvents] = useState(false);

  async function handleSearch() {
    if (!folderPath.trim() || !from || !to) {
      toast.warning('Preencha a pasta e o período');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ folderPath: folderPath.trim(), from, to });
      const data = await api.get<FolderActivityResult>(`/reports/folder-activity?${params}`);
      setResult(data);
      setShowEvents(false);
      if (data.totalEvents === 0) toast.info('Nenhum evento encontrado para esta pasta no período.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="h-4 w-4 text-yellow-400" />
          <h2 className="text-sm font-semibold text-white">Atividade por Pasta</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Quem acessou ou modificou uma pasta específica num período. Use parte do caminho (ex: <code className="bg-slate-800 px-1 rounded">setores\rh</code>).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <InputField label="Pasta (ou parte do caminho)" value={folderPath} onChange={setFolderPath} placeholder="ex: financeiro ou C:\Dados\RH" />
          </div>
          <InputField label="Data/hora início" value={from} onChange={setFrom} type="datetime-local" />
          <InputField label="Data/hora fim" value={to} onChange={setTo} type="datetime-local" />
        </div>
        <div className="mt-3">
          <SearchButton loading={loading} onClick={handleSearch} />
        </div>
      </div>

      {result && result.totalEvents > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard label="Total de eventos" value={result.totalEvents} color="border-slate-700 text-slate-300" />
            <SummaryCard label="Usuários distintos" value={result.uniqueUsers} color="border-yellow-800/50 text-yellow-400" />
          </div>

          {/* Tabela de usuários */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <p className="text-sm font-semibold text-white">Resumo por usuário</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Usuário</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Total</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Ações</th>
                  <th className="px-4 py-3 text-left text-slate-500 font-medium">Último acesso</th>
                </tr>
              </thead>
              <tbody>
                {result.userSummary.map((u) => (
                  <tr key={u.username} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-white font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-slate-300">{u.count.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(u.actions).map(([action, count]) => (
                          <span key={action} className={`px-1.5 py-0.5 rounded text-xs font-medium ${actionColors[action] ?? ''}`}>
                            {actionLabels[action] ?? action}: {count}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(u.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Toggle eventos detalhados */}
          <button
            onClick={() => setShowEvents((v) => !v)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
          >
            {showEvents ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showEvents ? 'Ocultar' : 'Ver'} todos os {result.totalEvents.toLocaleString('pt-BR')} eventos detalhados
          </button>

          {showEvents && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900">
                    <tr className="border-b border-slate-800">
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Ação</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Usuário</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Arquivo</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.events.map((e) => (
                      <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[e.action] ?? ''}`}>
                            {actionLabels[e.action] ?? e.action}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-white">{e.username}</td>
                        <td className="px-4 py-2 text-slate-400 font-mono text-xs truncate max-w-xs" title={e.filePath}>{e.filePath}</td>
                        <td className="px-4 py-2 text-slate-500 text-xs">{formatDate(e.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab: Relatório por Ação ──────────────────────────────────────────────────

function TabAcao() {
  const [folderPath, setFolderPath] = useState('');
  const [action, setAction] = useState('DELETE');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FolderActionResult | null>(null);

  async function handleSearch() {
    if (!folderPath.trim() || !from || !to) {
      toast.warning('Preencha a pasta e o período');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ folderPath: folderPath.trim(), action, from, to });
      const data = await api.get<FolderActionResult>(`/reports/folder-action?${params}`);
      setResult(data);
      if (data.total === 0) toast.info('Nenhum evento encontrado com esses critérios.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trash2 className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Ação Específica em Pasta</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Quem realizou uma ação específica (ex: quem apagou arquivos na pasta Financeiro).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <InputField label="Pasta (ou parte do caminho)" value={folderPath} onChange={setFolderPath} placeholder="ex: financeiro ou C:\Dados\Financeiro" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Ação</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(actionLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <InputField label="Data/hora início" value={from} onChange={setFrom} type="datetime-local" />
          <InputField label="Data/hora fim" value={to} onChange={setTo} type="datetime-local" />
        </div>
        <div className="mt-3">
          <SearchButton loading={loading} onClick={handleSearch} />
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-1 gap-3">
            <SummaryCard
              label={`Total de eventos de ${actionLabels[result.action] ?? result.action} em "${result.folderPath}"`}
              value={result.total}
              color={result.total > 0 ? 'border-red-800/50 text-red-400' : 'border-slate-700 text-slate-400'}
            />
          </div>

          {result.events.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900">
                    <tr className="border-b border-slate-800">
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Usuário</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Arquivo afetado</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Processo</th>
                      <th className="px-4 py-3 text-left text-slate-500 font-medium">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.events.map((e) => (
                      <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-white font-medium">
                          {e.domain ? `${e.domain}\\` : ''}{e.username}
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-xs max-w-sm truncate" title={e.filePath}>
                          {e.filePath}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{e.processName ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(e.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const [tab, setTab] = useState<Tab>('usuario');

  const tabs: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'usuario', label: 'Por Usuário', icon: User, desc: 'Tudo que um usuário fez (logins + arquivos)' },
    { id: 'pasta', label: 'Por Pasta', icon: FolderOpen, desc: 'Quem acessou uma pasta específica' },
    { id: 'acao', label: 'Por Ação', icon: Trash2, desc: 'Quem apagou, escreveu ou modificou em uma pasta' },
  ];

  return (
    <div className="flex flex-col flex-1">
      <Header title="Relatórios" />

      <main className="flex-1 p-6 space-y-5">
        {/* Tabs */}
        <div className="grid grid-cols-3 gap-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-start gap-3 p-4 rounded-xl border text-left transition ${
                tab === t.id
                  ? 'border-blue-600/50 bg-blue-600/10'
                  : 'border-slate-800 bg-slate-900 hover:bg-slate-800/50'
              }`}
            >
              <t.icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${tab === t.id ? 'text-blue-400' : 'text-slate-500'}`} />
              <div>
                <p className={`text-sm font-semibold ${tab === t.id ? 'text-white' : 'text-slate-300'}`}>{t.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Conteúdo da tab ativa */}
        {tab === 'usuario' && <TabUsuario />}
        {tab === 'pasta'   && <TabPasta />}
        {tab === 'acao'    && <TabAcao />}
      </main>
    </div>
  );
}
