'use client';

import { useEffect, useState } from 'react';
import { Bell, Plus, Trash2, CheckCircle2, XCircle, ToggleLeft, ToggleRight, ChevronUp } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AlertRule {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  serverId?: string | null;
  category: string;
  eventTypes: string[];
  condition: string;
  threshold?: number | null;
  windowMinutes: number;
  emailTo: string[];
  webhookUrl?: string | null;
  _count?: { alerts: number };
}

interface AlertRecord {
  id: string;
  ruleId: string;
  serverId: string;
  triggeredAt: string;
  detail?: string | null;
  eventCount: number;
  notified: boolean;
  rule?: { id: string; name: string; category: string };
  server?: { id: string; name: string };
}

interface ServerRecord { id: string; name: string; }

// ─── Constantes ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  LOGIN:   { label: 'Login',   color: 'text-blue-400 bg-blue-900/30' },
  FILE:    { label: 'Arquivo', color: 'text-yellow-400 bg-yellow-900/30' },
  ACCOUNT: { label: 'Conta',   color: 'text-green-400 bg-green-900/30' },
  SQL:     { label: 'SQL',     color: 'text-purple-400 bg-purple-900/30' },
};

const EVENT_TYPES_BY_CATEGORY: Record<string, { value: string; label: string }[]> = {
  LOGIN:   [{ value: 'FAILED', label: 'Login falhado' }, { value: 'SUCCESS', label: 'Login sucesso' }],
  FILE:    [{ value: 'READ', label: 'Leitura' }, { value: 'WRITE', label: 'Escrita' }, { value: 'DELETE', label: 'Exclusão' }, { value: 'RENAME', label: 'Renomeação' }],
  ACCOUNT: [
    { value: 'USER_LOCKED', label: 'Conta bloqueada' },
    { value: 'USER_CREATED', label: 'Conta criada' },
    { value: 'USER_DELETED', label: 'Conta removida' },
    { value: 'USER_DISABLED', label: 'Conta desabilitada' },
    { value: 'PASSWORD_CHANGED', label: 'Senha alterada' },
    { value: 'PASSWORD_RESET', label: 'Senha redefinida' },
    { value: 'GROUP_MEMBER_ADDED', label: 'Adicionado ao grupo' },
    { value: 'GROUP_MEMBER_REMOVED', label: 'Removido do grupo' },
  ],
  SQL: [
    { value: 'LOGIN_FAILED', label: 'Login SQL falhou' },
    { value: 'AUTH_FAILURE', label: 'Falha de autenticação' },
    { value: 'SERVICE_STOPPED', label: 'Serviço parado' },
    { value: 'SERVICE_STARTED', label: 'Serviço iniciado' },
  ],
};

const EMPTY_FORM = {
  name: '',
  description: '',
  category: 'ACCOUNT',
  eventTypes: [] as string[],
  condition: 'ANY',
  threshold: '',
  windowMinutes: '5',
  emailTo: '',
  webhookUrl: '',
  serverId: '',
};

// ─── Componente ──────────────────────────────────────────────────────────────

export default function AlertasPage() {
  const [tab, setTab] = useState<'historico' | 'regras'>('historico');
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [alertTotal, setAlertTotal] = useState(0);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [savingRule, setSavingRule] = useState(false);
  const [filterRuleId, setFilterRuleId] = useState('');
  const [filterServerId, setFilterServerId] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [alertRes, rulesRes, serversRes] = await Promise.all([
        api.get<{ data: AlertRecord[]; total: number }>('/alerts'),
        api.get<AlertRule[]>('/alert-rules'),
        api.get<ServerRecord[]>('/servers'),
      ]);
      setAlerts(alertRes.data);
      setAlertTotal(alertRes.total);
      setRules(rulesRes);
      setServers(serversRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleToggleRule(rule: AlertRule) {
    try {
      await api.patch(`/alert-rules/${rule.id}`, { enabled: !rule.enabled });
      toast.success(rule.enabled ? 'Regra desativada' : 'Regra ativada');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar regra');
    }
  }

  async function handleDeleteRule(rule: AlertRule) {
    if (!confirm(`Remover regra "${rule.name}"?`)) return;
    try {
      await api.delete(`/alert-rules/${rule.id}`);
      toast.success('Regra removida');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover regra');
    }
  }

  async function handleSaveRule(e: React.FormEvent) {
    e.preventDefault();
    setSavingRule(true);
    try {
      await api.post('/alert-rules', {
        name: form.name,
        description: form.description || null,
        category: form.category,
        eventTypes: form.eventTypes,
        condition: form.condition,
        threshold: form.condition === 'THRESHOLD' ? Number(form.threshold) : undefined,
        windowMinutes: Number(form.windowMinutes),
        emailTo: form.emailTo ? form.emailTo.split(',').map((e) => e.trim()).filter(Boolean) : [],
        webhookUrl: form.webhookUrl || null,
        serverId: form.serverId || null,
      });
      toast.success('Regra criada com sucesso');
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar regra');
    } finally {
      setSavingRule(false);
    }
  }

  function toggleEventType(value: string) {
    setForm((f) => ({
      ...f,
      eventTypes: f.eventTypes.includes(value)
        ? f.eventTypes.filter((t) => t !== value)
        : [...f.eventTypes, value],
    }));
  }

  const filteredAlerts = alerts.filter((a) => {
    if (filterRuleId && a.ruleId !== filterRuleId) return false;
    if (filterServerId && a.serverId !== filterServerId) return false;
    return true;
  });

  return (
    <div className="flex flex-col flex-1">
      <Header title="Alertas" />
      <main className="flex-1 p-6 space-y-4">

        {/* Abas */}
        <div className="flex gap-2 border-b border-slate-800 pb-0">
          {(['historico', 'regras'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
                tab === t
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {t === 'historico' ? 'Histórico' : 'Regras'}
            </button>
          ))}
        </div>

        {/* ── ABA HISTÓRICO ── */}
        {tab === 'historico' && (
          <div className="space-y-4">
            {/* Filtros */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-3">
              <select
                value={filterRuleId}
                onChange={(e) => setFilterRuleId(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas as regras</option>
                {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select
                value={filterServerId}
                onChange={(e) => setFilterServerId(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os servidores</option>
                {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Tabela */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 text-slate-400 text-sm">
                {alertTotal} alerta(s) no total
              </div>
              {loading ? (
                <p className="p-6 text-sm text-slate-500">Carregando...</p>
              ) : filteredAlerts.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">Nenhum alerta disparado.</p>
                  <p className="text-slate-600 text-xs mt-1">Crie regras na aba Regras para começar a monitorar.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-left">
                        {['Timestamp', 'Servidor', 'Regra', 'Categoria', 'Eventos', 'Notificado'].map((h) => (
                          <th key={h} className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAlerts.map((a) => {
                        const cat = CATEGORY_LABELS[a.rule?.category ?? ''];
                        return (
                          <tr key={a.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                            <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{formatDate(a.triggeredAt)}</td>
                            <td className="px-4 py-3 text-slate-300 text-xs">{a.server?.name ?? a.serverId}</td>
                            <td className="px-4 py-3 text-white text-xs font-medium">{a.rule?.name ?? a.ruleId}</td>
                            <td className="px-4 py-3">
                              {cat ? (
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${cat.color}`}>{cat.label}</span>
                              ) : (
                                <span className="text-xs text-slate-500">{a.rule?.category}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-300 text-xs">{a.eventCount}</td>
                            <td className="px-4 py-3">
                              {a.notified
                                ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                : <XCircle className="h-4 w-4 text-slate-600" />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ABA REGRAS ── */}
        {tab === 'regras' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={() => setShowForm((v) => !v)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition"
              >
                {showForm ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {showForm ? 'Cancelar' : 'Nova Regra'}
              </button>
            </div>

            {/* Formulário de nova regra */}
            {showForm && (
              <form onSubmit={(e) => void handleSaveRule(e)} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">Nova Regra de Alerta</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="Nome da regra"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    placeholder="Descrição (opcional)"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Categoria</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value, eventTypes: [] })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Condição</label>
                    <select
                      value={form.condition}
                      onChange={(e) => setForm({ ...form, condition: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ANY">Qualquer ocorrência</option>
                      <option value="THRESHOLD">Mínimo de ocorrências</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Servidor (opcional)</label>
                    <select
                      value={form.serverId}
                      onChange={(e) => setForm({ ...form, serverId: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Todos os servidores</option>
                      {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Tipos de evento — checkboxes dinâmicos */}
                <div>
                  <label className="text-xs text-slate-400 mb-2 block">Tipos de Evento (vazio = todos)</label>
                  <div className="flex flex-wrap gap-2">
                    {(EVENT_TYPES_BY_CATEGORY[form.category] ?? []).map((t) => (
                      <label key={t.value} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.eventTypes.includes(t.value)}
                          onChange={() => toggleEventType(t.value)}
                          className="accent-blue-500"
                        />
                        <span className="text-xs text-slate-300">{t.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {form.condition === 'THRESHOLD' && (
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Número mínimo de eventos</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={form.threshold}
                        onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Janela de tempo (minutos)</label>
                    <input
                      type="number"
                      min={1}
                      value={form.windowMinutes}
                      onChange={(e) => setForm({ ...form, windowMinutes: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">E-mails (separados por vírgula)</label>
                  <input
                    type="text"
                    placeholder="admin@empresa.com, seguranca@empresa.com"
                    value={form.emailTo}
                    onChange={(e) => setForm({ ...form, emailTo: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Webhook URL (opcional)</label>
                  <input
                    type="url"
                    placeholder="https://hooks.slack.com/..."
                    value={form.webhookUrl}
                    onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={savingRule}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition"
                  >
                    {savingRule ? 'Salvando...' : 'Criar Regra'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); }}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {/* Lista de regras */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              {loading ? (
                <p className="p-6 text-sm text-slate-500">Carregando...</p>
              ) : rules.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">Nenhuma regra cadastrada.</p>
                  <p className="text-slate-600 text-xs mt-1">Clique em &quot;Nova Regra&quot; para começar.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {rules.map((rule) => {
                    const cat = CATEGORY_LABELS[rule.category];
                    return (
                      <div key={rule.id} className="p-4 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-white">{rule.name}</p>
                            {cat && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${cat.color}`}>{cat.label}</span>
                            )}
                            <span className="text-xs text-slate-500">
                              {rule.condition === 'THRESHOLD' ? `≥ ${rule.threshold ?? '?'} em` : 'Qualquer em'} {rule.windowMinutes}min
                            </span>
                          </div>
                          {rule.description && <p className="text-xs text-slate-500">{rule.description}</p>}
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {rule.eventTypes.length > 0 && rule.eventTypes.map((t) => (
                              <span key={t} className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{t}</span>
                            ))}
                            {rule.emailTo.length > 0 && (
                              <span className="text-xs text-slate-500">📧 {rule.emailTo.join(', ')}</span>
                            )}
                            {rule.webhookUrl && (
                              <span className="text-xs text-slate-500">🔗 webhook</span>
                            )}
                            <span className="text-xs text-slate-600">{rule._count?.alerts ?? 0} disparo(s)</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => void handleToggleRule(rule)}
                            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition ${
                              rule.enabled
                                ? 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
                                : 'text-slate-400 bg-slate-800 hover:bg-slate-700'
                            }`}
                          >
                            {rule.enabled
                              ? <><ToggleRight className="h-3.5 w-3.5" /> Ativo</>
                              : <><ToggleLeft className="h-3.5 w-3.5" /> Inativo</>}
                          </button>
                          <button
                            onClick={() => void handleDeleteRule(rule)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
