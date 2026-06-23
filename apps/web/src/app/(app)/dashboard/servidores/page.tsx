'use client';

import { useCallback, useEffect, useState } from 'react';
import { Server, Plus, RefreshCw, Trash2, Copy, CheckCircle2, XCircle, Clock } from 'lucide-react';
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

  useEffect(() => {
    void load();
  }, [load]);

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
      setFormName('');
      setFormHostname('');
      setFormIp('');
      setFormDescription('');
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
            Gerencie os servidores Windows que enviam eventos para o ADLogs.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="h-4 w-4" />
          Novo Servidor
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
            <button
              onClick={copyKey}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
              title="Copiar"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                <Copy className="h-4 w-4 text-slate-400" />
              )}
            </button>
          </div>
          <p className="text-amber-400 text-xs">
            Configure esta chave como <code className="bg-slate-900 px-1 rounded">SERVER_API_KEY</code> no
            arquivo <code className="bg-slate-900 px-1 rounded">.env</code> do coletor.
          </p>
          <button
            onClick={() => setRevealedKey(null)}
            className="text-xs text-slate-500 hover:text-slate-400 underline"
          >
            Fechar (já copiei a chave)
          </button>
        </div>
      )}

      {/* Formulário de criação */}
      {showAdd && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <h2 className="text-white font-medium mb-4">Cadastrar Servidor</h2>
          <form onSubmit={(e) => void handleCreate(e)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-xs mb-1">Nome *</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="ex: Servidor de Arquivos"
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Hostname</label>
              <input
                value={formHostname}
                onChange={(e) => setFormHostname(e.target.value)}
                placeholder="ex: WIN-SRV-FILES"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">IP</label>
              <input
                value={formIp}
                onChange={(e) => setFormIp(e.target.value)}
                placeholder="ex: 192.168.1.100"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Descrição</label>
              <input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="ex: Compartilhamentos da filial SP"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition"
              >
                {submitting ? 'Criando...' : 'Criar Servidor'}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabela de servidores */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <span className="text-slate-400 text-sm">{servers.length} servidor(es) cadastrado(s)</span>
          <button onClick={() => void load()} className="p-1.5 hover:bg-slate-800 rounded transition">
            <RefreshCw className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Carregando...</div>
        ) : servers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Nenhum servidor cadastrado. Clique em &quot;Novo Servidor&quot; para começar.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Nome</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Hostname / IP</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Último heartbeat</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((srv) => {
                const online = isOnline(srv.lastSeenAt);
                return (
                  <tr key={srv.id} className={`border-b border-slate-800 last:border-0 ${!srv.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <span
                        className={`flex items-center gap-1.5 text-xs font-medium ${
                          !srv.active
                            ? 'text-slate-500'
                            : online
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {srv.active ? (
                          online ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {!srv.active ? 'Inativo' : online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{srv.name}</p>
                      {srv.description && (
                        <p className="text-slate-500 text-xs">{srv.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {srv.hostname && <p>{srv.hostname}</p>}
                      {srv.ipAddress && <p className="text-slate-500 text-xs">{srv.ipAddress}</p>}
                      {!srv.hostname && !srv.ipAddress && (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelative(srv.lastSeenAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void handleRotateKey(srv.id)}
                          className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
                          title="Rotacionar chave de API"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => void handleToggle(srv)}
                          className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
                        >
                          {srv.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          onClick={() => void handleDelete(srv.id, srv.name)}
                          className="p-1 hover:bg-red-900/30 text-red-500 rounded transition"
                          title="Desativar servidor"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-blue-950 border border-blue-800 rounded-xl p-4 text-sm text-blue-300">
        <p className="font-medium mb-1 flex items-center gap-2">
          <Server className="h-4 w-4" />
          Como configurar um servidor remoto
        </p>
        <ol className="list-decimal list-inside space-y-1 text-blue-400 text-xs">
          <li>Crie o servidor aqui e copie a API Key gerada</li>
          <li>No servidor Windows remoto, instale o coletor: <code className="bg-blue-900 px-1 rounded">.\install.ps1</code></li>
          <li>No arquivo <code className="bg-blue-900 px-1 rounded">.env</code> do coletor, configure <code className="bg-blue-900 px-1 rounded">API_URL</code> e <code className="bg-blue-900 px-1 rounded">SERVER_API_KEY</code></li>
          <li>Inicie o serviço: <code className="bg-blue-900 px-1 rounded">Start-Service ADLogsCollector</code></li>
        </ol>
      </div>
    </div>
  );
}
