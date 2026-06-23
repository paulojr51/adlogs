'use client';

import { useCallback, useEffect, useState } from 'react';
import { Server, Plus, RefreshCw, Trash2, Copy, CheckCircle2, Clock, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface ServerRecord {
  id: string;
  name: string;
  hostname: string | null;
  ipAddress: string | null;
  description: string | null;
  active: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

interface ServerConfig {
  collectLogins: boolean;
  collectFiles: boolean;
  collectProcesses: boolean;
  collectAccountChanges: boolean;
  collectSqlServer: boolean;
}

interface CreateServerResponse {
  server: ServerRecord;
  apiKey: string;
}

interface RotateKeyResponse {
  apiKey: string;
}

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 15 * 60 * 1000;
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

const CONFIG_LABELS: Record<keyof ServerConfig, { label: string; hint: string }> = {
  collectLogins:         { label: 'Logins / Logoffs',     hint: '4624, 4625, 4634, 4647' },
  collectFiles:          { label: 'Acesso a arquivos',     hint: '4663, 4656, 4670' },
  collectProcesses:      { label: 'Processos (4688)',      hint: 'Requer GPO Audit Process Creation' },
  collectAccountChanges: { label: 'Eventos de conta',      hint: '4720, 4726, 4740, 4728…' },
  collectSqlServer:      { label: 'SQL Server',            hint: 'Application Log: 18456, 7036' },
};

export default function ServidoresPage() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState('');
  const [formHostname, setFormHostname] = useState('');
  const [formIp, setFormIp] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ serverId: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [configPanelId, setConfigPanelId] = useState<string | null>(null);
  const [configData, setConfigData] = useState<ServerConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<ServerRecord[]>('/servers');
      setServers(data);
    } catch {
      toast.error('Erro ao carregar servidores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post<CreateServerResponse>('/servers', {
        name: formName.trim(),
        hostname: formHostname.trim() || undefined,
        ipAddress: formIp.trim() || undefined,
        description: formDescription.trim() || undefined,
      });
      setRevealedKey({ serverId: res.server.id, key: res.apiKey });
      setShowAdd(false);
      setFormName(''); setFormHostname(''); setFormIp(''); setFormDescription('');
      void load();
    } catch {
      toast.error('Erro ao criar servidor');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRotateKey(id: string) {
    if (!confirm('Gerar nova chave? A chave anterior será invalidada imediatamente.')) return;
    try {
      const res = await api.post<RotateKeyResponse>(`/servers/${id}/rotate-key`, {});
      setRevealedKey({ serverId: id, key: res.apiKey });
      toast.success('Nova chave gerada');
    } catch {
      toast.error('Erro ao rotacionar chave');
    }
  }

  async function handleToggle(server: ServerRecord) {
    try {
      await api.patch(`/servers/${server.id}`, { active: !server.active });
      toast.success(server.active ? 'Servidor desativado' : 'Servidor ativado');
      void load();
    } catch {
      toast.error('Erro ao atualizar servidor');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Desativar servidor "${name}"? O coletor perderá acesso imediatamente.`)) return;
    try {
      await api.delete(`/servers/${id}`);
      toast.success('Servidor desativado');
      void load();
    } catch {
      toast.error('Erro ao desativar servidor');
    }
  }

  async function handleOpenConfig(id: string) {
    if (configPanelId === id) { setConfigPanelId(null); setConfigData(null); return; }
    try {
      const cfg = await api.get<ServerConfig>(`/servers/${id}/config`);
      setConfigData(cfg);
      setConfigPanelId(id);
    } catch {
      toast.error('Erro ao carregar configuração');
    }
  }

  async function handleSaveConfig(id: string) {
    if (!configData) return;
    setSavingConfig(true);
    try {
      await api.patch(`/servers/${id}/config`, configData);
      toast.success('Configuração salva — o coletor aplicará na próxima busca');
      setConfigPanelId(null);
      setConfigData(null);
    } catch {
      toast.error('Erro ao salvar configuração');
    } finally {
      setSavingConfig(false);
    }
  }

  function copyKey() {
    if (!revealedKey) return;
    void navigator.clipboard.writeText(revealedKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Servidores Monitorados</h1>
          <p className="text-slate-400 text-sm mt-1">
            Gerencie os servidores Windows e o que cada um coleta.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="h-4 w-4" /> Novo Servidor
        </button>
      </div>

      {/* Alerta de API Key revelada */}
      {revealedKey && (
        <div className="bg-amber-950 border border-amber-600 rounded-xl p-4 space-y-3">
          <p className="text-amber-300 font-semibold text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Chave de API gerada — copie agora, ela não será exibida novamente
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-slate-900 rounded px-3 py-2 text-green-400 text-sm font-mono break-all">
              {revealedKey.key}
            </code>
            <button onClick={copyKey} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition" title="Copiar">
              {copied ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
            </button>
          </div>
          <p className="text-amber-400 text-xs">
            Configure como <code className="bg-slate-900 px-1 rounded">SERVER_API_KEY</code> no{' '}
            <code className="bg-slate-900 px-1 rounded">.env</code> do coletor.
          </p>
          <button onClick={() => setRevealedKey(null)} className="text-xs text-slate-500 hover:text-slate-400 underline">
            Fechar (já copiei a chave)
          </button>
        </div>
      )}

      {/* Formulário de criação */}
      {showAdd && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <h2 className="text-white font-medium mb-4">Cadastrar Servidor</h2>
          <form onSubmit={(e) => void handleCreate(e)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Nome *', value: formName, set: setFormName, placeholder: 'ex: Servidor de Arquivos', required: true },
              { label: 'Hostname', value: formHostname, set: setFormHostname, placeholder: 'ex: WIN-SRV-FILES' },
              { label: 'IP', value: formIp, set: setFormIp, placeholder: 'ex: 192.168.1.100' },
              { label: 'Descrição', value: formDescription, set: setFormDescription, placeholder: 'ex: Filial SP' },
            ].map(({ label, value, set, placeholder, required }) => (
              <div key={label}>
                <label className="block text-slate-400 text-xs mb-1">{label}</label>
                <input
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={placeholder}
                  required={required}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            ))}
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition">
                {submitting ? 'Criando...' : 'Criar Servidor'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de servidores */}
      <div className="space-y-2">
        {loading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-sm">
            Carregando...
          </div>
        ) : servers.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-sm">
            Nenhum servidor cadastrado. Clique em &quot;Novo Servidor&quot; para começar.
          </div>
        ) : (
          servers.map((srv) => {
            const online = isOnline(srv.lastSeenAt);
            const configOpen = configPanelId === srv.id;

            return (
              <div key={srv.id} className={`bg-slate-900 border rounded-xl overflow-hidden transition ${
                configOpen ? 'border-blue-700' : 'border-slate-800'
              } ${!srv.active ? 'opacity-60' : ''}`}>
                {/* Linha principal */}
                <div className="flex items-center gap-4 px-4 py-3">
                  <span className={`flex-shrink-0 h-2.5 w-2.5 rounded-full ${
                    !srv.active ? 'bg-slate-600' : online ? 'bg-green-400' : 'bg-red-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{srv.name}</p>
                    <p className="text-slate-500 text-xs">
                      {[srv.hostname, srv.ipAddress].filter(Boolean).join(' · ') || '—'}
                      {srv.description && ` · ${srv.description}`}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    !srv.active ? 'bg-slate-700 text-slate-400' :
                    online ? 'bg-green-900/40 text-green-400' : 'bg-red-900/30 text-red-400'
                  }`}>
                    {!srv.active ? 'Inativo' : online ? 'Online' : 'Offline'}
                  </span>
                  <span className="text-slate-500 text-xs flex items-center gap-1">
                    <Clock className="h-3 w-3" />{formatRelative(srv.lastSeenAt)}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => void handleOpenConfig(srv.id)}
                      className={`p-1.5 rounded transition text-xs flex items-center gap-1 ${
                        configOpen ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                      }`}
                      title="Configurar coleta"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => void handleRotateKey(srv.id)}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded transition" title="Rotacionar chave">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => void handleToggle(srv)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded transition">
                      {srv.active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button onClick={() => void handleDelete(srv.id, srv.name)}
                      className="p-1.5 hover:bg-red-900/30 text-red-500 rounded transition" title="Remover">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Painel de configuração de coleta */}
                {configOpen && configData && (
                  <div className="border-t border-slate-700 px-4 py-4 bg-slate-800/50">
                    <p className="text-xs text-slate-400 mb-3 font-medium">O que coletar deste servidor:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                      {(Object.keys(CONFIG_LABELS) as Array<keyof ServerConfig>).map((key) => {
                        const { label, hint } = CONFIG_LABELS[key];
                        return (
                          <label key={key} className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={configData[key]}
                              onChange={(e) => setConfigData({ ...configData, [key]: e.target.checked })}
                              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                            />
                            <div>
                              <p className="text-white text-sm group-hover:text-blue-300 transition">{label}</p>
                              <p className="text-slate-500 text-xs">{hint}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleSaveConfig(srv.id)}
                        disabled={savingConfig}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition"
                      >
                        {savingConfig ? 'Salvando...' : 'Salvar configuração'}
                      </button>
                      <button
                        onClick={() => { setConfigPanelId(null); setConfigData(null); }}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        {!loading && servers.length > 0 && (
          <button onClick={() => void load()} className="text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1 mt-1">
            <RefreshCw className="h-3 w-3" /> Atualizar lista
          </button>
        )}
      </div>

      <div className="bg-blue-950 border border-blue-800 rounded-xl p-4 text-sm text-blue-300">
        <p className="font-medium mb-1 flex items-center gap-2">
          <Server className="h-4 w-4" /> Como configurar um servidor remoto
        </p>
        <ol className="list-decimal list-inside space-y-1 text-blue-400 text-xs">
          <li>Crie o servidor aqui e copie a API Key gerada</li>
          <li>No servidor Windows remoto, instale o coletor: <code className="bg-blue-900 px-1 rounded">.\install.ps1</code></li>
          <li>Configure <code className="bg-blue-900 px-1 rounded">API_URL</code> e <code className="bg-blue-900 px-1 rounded">SERVER_API_KEY</code> no <code className="bg-blue-900 px-1 rounded">.env</code> do coletor</li>
          <li>Clique em <Settings className="h-3 w-3 inline" /> <strong>Configurar</strong> para escolher o que coletar deste servidor</li>
        </ol>
      </div>
    </div>
  );
}
