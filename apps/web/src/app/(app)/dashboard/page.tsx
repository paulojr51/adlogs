'use client';

import { useEffect, useState } from 'react';
import {
  LogIn,
  AlertTriangle,
  FolderOpen,
  Activity,
  CheckCircle2,
  XCircle,
  Server,
  Terminal,
  UserCog,
  Database,
  Bell,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface CollectorInfo {
  id: string;
  serverId: string;
  isRunning: boolean;
  lastSeenAt: string;
  version?: string;
  hostname?: string;
  eventsToday: number;
  server: { id: string; name: string; hostname?: string };
}

interface RecentAlert {
  id: string;
  triggeredAt: string;
  detail?: string;
  eventCount: number;
  notified: boolean;
  rule: { id: string; name: string; category: string };
  server: { id: string; name: string };
}

interface DashboardSummary {
  today: {
    logins: number;
    failedLogins: number;
    fileEvents: number;
    processEvents: number;
    accountEvents: number;
    sqlEvents: number;
  };
  collectors: CollectorInfo[];
  recentAlerts: RecentAlert[];
  recentLoginEvents: Array<{
    id: string; username: string; domain?: string; sourceIp?: string;
    success: boolean; logonTypeName?: string; timestamp: string;
  }>;
  recentFileEvents: Array<{
    id: string; username: string; filePath: string; action: string; timestamp: string;
  }>;
}

interface ChartPoint {
  date: string;
  success: number;
  failed: number;
}

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: number | string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-400 text-sm">{label}</p>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

const ALERT_CATEGORY_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  FILE: 'Arquivo',
  ACCOUNT: 'Conta',
  SQL: 'SQL',
};

const ALERT_CATEGORY_COLORS: Record<string, string> = {
  LOGIN: 'text-blue-400 bg-blue-400/10',
  FILE: 'text-purple-400 bg-purple-400/10',
  ACCOUNT: 'text-yellow-400 bg-yellow-400/10',
  SQL: 'text-orange-400 bg-orange-400/10',
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api.get<DashboardSummary>('/dashboard/summary'),
      api.get<ChartPoint[]>('/dashboard/chart/logins?days=7'),
    ]).then(([sum, ch]) => {
      setSummary(sum);
      setChart(ch);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-400">Carregando...</div>
      </div>
    );
  }

  const hasCollectors = (summary?.collectors.length ?? 0) > 0;

  return (
    <div className="flex flex-col flex-1">
      <Header title="Painel de Controle" />

      <main className="flex-1 p-6 space-y-6">
        {/* Status dos Coletores */}
        {hasCollectors ? (
          <div className="space-y-2">
            {summary!.collectors.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
                  c.isRunning
                    ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-400'
                    : 'bg-red-950/30 border-red-800/50 text-red-400'
                }`}
              >
                <Activity className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium flex-1">
                  <span className="font-semibold">{c.server.name}</span>
                  {' — '}
                  {c.isRunning ? 'Coletor online' : 'Coletor offline'}
                  {c.hostname && ` (${c.hostname})`}
                </span>
                <span className="text-xs opacity-60">
                  {c.eventsToday.toLocaleString('pt-BR')} eventos hoje
                </span>
                <span className="text-xs opacity-60">
                  Última atividade: {formatDate(c.lastSeenAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-slate-900 border-slate-800 text-slate-500">
            <Server className="h-4 w-4" />
            <span className="text-sm">Nenhum coletor cadastrado. Acesse Servidores para adicionar.</span>
          </div>
        )}

        {/* Stats Cards — 6 tipos de evento */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Logins hoje"
            value={summary?.today.logins ?? 0}
            icon={LogIn}
            color="bg-blue-600/20 text-blue-400"
          />
          <StatCard
            label="Falhas de login"
            value={summary?.today.failedLogins ?? 0}
            icon={AlertTriangle}
            color="bg-red-600/20 text-red-400"
          />
          <StatCard
            label="Arquivos"
            value={summary?.today.fileEvents ?? 0}
            icon={FolderOpen}
            color="bg-purple-600/20 text-purple-400"
          />
          <StatCard
            label="Processos"
            value={summary?.today.processEvents ?? 0}
            icon={Terminal}
            color="bg-cyan-600/20 text-cyan-400"
          />
          <StatCard
            label="Contas"
            value={summary?.today.accountEvents ?? 0}
            icon={UserCog}
            color="bg-yellow-600/20 text-yellow-400"
          />
          <StatCard
            label="SQL Server"
            value={summary?.today.sqlEvents ?? 0}
            icon={Database}
            color="bg-orange-600/20 text-orange-400"
          />
        </div>

        {/* Chart + Alertas Recentes */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Logins — últimos 7 dias</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                <Line type="monotone" dataKey="success" stroke="#3b82f6" name="Sucesso" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="failed" stroke="#ef4444" name="Falha" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Alertas Recentes */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-4 w-4 text-yellow-400" />
              <h2 className="text-sm font-semibold text-white">Alertas recentes</h2>
            </div>
            {(summary?.recentAlerts.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-600 text-center py-8">Nenhum alerta disparado</p>
            ) : (
              <div className="space-y-3">
                {summary!.recentAlerts.map((alert) => (
                  <div key={alert.id} className="border border-slate-800 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm text-white font-medium leading-snug">{alert.rule.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ALERT_CATEGORY_COLORS[alert.rule.category] ?? ''}`}>
                        {ALERT_CATEGORY_LABELS[alert.rule.category] ?? alert.rule.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{alert.server.name} — {alert.eventCount} evento{alert.eventCount !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-slate-600 mt-1">{formatDate(alert.triggeredAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Logins */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Últimos logins</h2>
            <div className="space-y-2">
              {(summary?.recentLoginEvents.length ?? 0) === 0 ? (
                <p className="text-xs text-slate-600 text-center py-4">Nenhum evento</p>
              ) : (
                summary!.recentLoginEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                    {e.success
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">
                        {e.domain ? `${e.domain}\\` : ''}{e.username}
                      </p>
                      <p className="text-xs text-slate-500">{e.sourceIp ?? 'local'}</p>
                    </div>
                    <span className="text-xs text-slate-600 flex-shrink-0">{formatDate(e.timestamp)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent File Events */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Últimos acessos a arquivos</h2>
            <div className="space-y-2">
              {(summary?.recentFileEvents.length ?? 0) === 0 ? (
                <p className="text-xs text-slate-600 text-center py-4">Nenhum evento</p>
              ) : (
                summary!.recentFileEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                    <FolderOpen className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{e.username}</p>
                      <p className="text-xs text-slate-500 truncate">{e.filePath}</p>
                    </div>
                    <span className="text-xs text-slate-600 flex-shrink-0">{formatDate(e.timestamp)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
