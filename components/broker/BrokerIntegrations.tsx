import React, { useState } from 'react';
import {
    Link2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Settings,
    Zap, Database, FileSignature, CreditCard, Plug, Plus, X, Check,
    Loader2, Trash2, Eye, EyeOff
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BrokerIntegration } from '../../types';
import { supabase } from '../../lib/supabase';
import { STALE } from '../../lib/queryClient';

interface BrokerIntegrationsProps {
    organizationId: string;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type WebhookEventType =
    | 'LEAD_CRIADO' | 'PROPOSTA_ENVIADA' | 'VENDA_FECHADA'
    | 'RESERVA_CRIADA' | 'RESERVA_EXPIRADA' | 'PROPOSTA_APROVADA' | 'PROPOSTA_REJEITADA';

interface WebhookConfig {
    id: string;
    organization_id: string;
    name: string;
    event_type: WebhookEventType;
    endpoint_url: string;
    secret_hint?: string;
    status: 'ATIVO' | 'INATIVO';
    last_triggered?: string;
    events_count: number;
    created_at?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<BrokerIntegration['type'], { icon: React.ElementType; color: string; bg: string; label: string }> = {
    CRM:       { icon: Database,      color: 'text-indigo-600',  bg: 'bg-indigo-50',  label: 'CRM' },
    ERP:       { icon: Settings,      color: 'text-blue-600',    bg: 'bg-blue-50',    label: 'ERP' },
    ASSINATURA:{ icon: FileSignature, color: 'text-purple-600',  bg: 'bg-purple-50',  label: 'Assinatura Digital' },
    PAGAMENTO: { icon: CreditCard,    color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Pagamento' },
    OUTRO:     { icon: Plug,          color: 'text-gray-600',    bg: 'bg-gray-50',    label: 'Outro' },
};

const STATUS_CONFIG: Record<BrokerIntegration['status'], { icon: React.ElementType; color: string; bg: string; label: string }> = {
    ATIVO:       { icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Ativo' },
    INATIVO:     { icon: XCircle,       color: 'text-gray-400',    bg: 'bg-gray-50',    label: 'Inativo' },
    CONFIGURANDO:{ icon: Settings,      color: 'text-amber-600',   bg: 'bg-amber-50',   label: 'Configurando' },
    ERRO:        { icon: AlertTriangle, color: 'text-red-600',     bg: 'bg-red-50',     label: 'Erro' },
};

const EVENT_LABELS: Record<WebhookEventType, string> = {
    LEAD_CRIADO:       'Lead Criado',
    PROPOSTA_ENVIADA:  'Proposta Enviada',
    VENDA_FECHADA:     'Venda Fechada',
    RESERVA_CRIADA:    'Reserva Criada',
    RESERVA_EXPIRADA:  'Reserva Expirada',
    PROPOSTA_APROVADA: 'Proposta Aprovada',
    PROPOSTA_REJEITADA:'Proposta Rejeitada',
};

// Catálogo de integrações de mercado (informacional — cada uma requer backend)
const CATALOG_INTEGRATIONS: BrokerIntegration[] = [
    { id: 'int-1', name: 'Hypnobox CRM',      type: 'CRM',        provider: 'Hypnobox',            status: 'CONFIGURANDO', description: 'Sincronização bidirecional de leads e propostas.' },
    { id: 'int-2', name: 'Sienge ERP',        type: 'ERP',        provider: 'Softplan',            status: 'CONFIGURANDO', description: 'Integração com módulo de vendas e financeiro.' },
    { id: 'int-3', name: 'Clicksign',         type: 'ASSINATURA', provider: 'Clicksign',           status: 'CONFIGURANDO', description: 'Assinatura digital de contratos e propostas.' },
    { id: 'int-4', name: 'D4Sign',            type: 'ASSINATURA', provider: 'D4Sign',              status: 'INATIVO',      description: 'Alternativa de assinatura digital.' },
    { id: 'int-5', name: 'CV CRM',            type: 'CRM',        provider: 'Construtor de Vendas',status: 'CONFIGURANDO', description: 'CRM imobiliário especializado em vendas.' },
    { id: 'int-6', name: 'Plug Imóveis',      type: 'CRM',        provider: 'Plug',                status: 'INATIVO',      description: 'Gestão de leads e portfólio de imóveis.' },
];

const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Nunca';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.floor(hours / 24)}d atrás`;
};

// ── Webhook service ───────────────────────────────────────────────────────────

const webhookService = {
    async list(orgId: string): Promise<WebhookConfig[]> {
        const { data, error } = await supabase
            .from('broker_webhook_configs')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },
    async create(payload: Omit<WebhookConfig, 'id' | 'events_count' | 'created_at'>): Promise<void> {
        const { error } = await supabase.from('broker_webhook_configs').insert(payload);
        if (error) throw error;
    },
    async toggle(id: string, status: 'ATIVO' | 'INATIVO'): Promise<void> {
        const { error } = await supabase.from('broker_webhook_configs')
            .update({ status, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
    },
    async remove(id: string): Promise<void> {
        const { error } = await supabase.from('broker_webhook_configs').delete().eq('id', id);
        if (error) throw error;
    },
};

// ── Webhook Form Modal ────────────────────────────────────────────────────────

const WebhookForm: React.FC<{ orgId: string; onClose: () => void; onSaved: () => void }> = ({ orgId, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [showSecret, setShowSecret] = useState(false);
    const [form, setForm] = useState({ name: '', event_type: 'LEAD_CRIADO' as WebhookEventType, endpoint_url: '', secret: '' });
    const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        if (!form.name || !form.endpoint_url) { alert('Nome e URL do endpoint são obrigatórios.'); return; }
        if (!form.endpoint_url.startsWith('http')) { alert('URL deve começar com http:// ou https://'); return; }
        setSaving(true);
        try {
            await webhookService.create({
                organization_id: orgId,
                name: form.name,
                event_type: form.event_type,
                endpoint_url: form.endpoint_url,
                secret_hint: form.secret ? `****${form.secret.slice(-4)}` : undefined,
                status: 'ATIVO',
            });
            onSaved();
        } catch (e: any) {
            alert(e.message || 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-900">Novo Webhook</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nome</label>
                        <input className={inputCls} placeholder="Ex: Notificar CRM no lead" value={form.name} onChange={e => set('name', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Evento</label>
                        <select className={inputCls} value={form.event_type} onChange={e => set('event_type', e.target.value as WebhookEventType)}>
                            {(Object.entries(EVENT_LABELS) as [WebhookEventType, string][]).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">URL do Endpoint</label>
                        <input className={inputCls} placeholder="https://meu-sistema.com/webhook" value={form.endpoint_url} onChange={e => set('endpoint_url', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Secret (opcional)</label>
                        <div className="relative">
                            <input className={`${inputCls} pr-10`} type={showSecret ? 'text' : 'password'}
                                placeholder="Chave para validar a assinatura HMAC"
                                value={form.secret} onChange={e => set('secret', e.target.value)} />
                            <button type="button" onClick={() => setShowSecret(s => !s)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400">Apenas os últimos 4 caracteres são armazenados como referência.</p>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-900/20">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Criar webhook
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const BrokerIntegrations: React.FC<BrokerIntegrationsProps> = ({ organizationId }) => {
    const qc = useQueryClient();
    const [showWebhookForm, setShowWebhookForm] = useState(false);

    const { data: webhooks = [], isLoading: loadWh } = useQuery({
        queryKey: ['broker-webhooks', organizationId],
        queryFn: () => webhookService.list(organizationId),
        enabled: !!organizationId && organizationId !== 'demo',
        staleTime: STALE.normal,
    });

    const toggleMut = useMutation({
        mutationFn: ({ id, status }: { id: string; status: 'ATIVO' | 'INATIVO' }) => webhookService.toggle(id, status),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['broker-webhooks', organizationId] }),
        onError: (e: any) => alert(e.message || 'Erro.'),
    });

    const removeMut = useMutation({
        mutationFn: (id: string) => webhookService.remove(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['broker-webhooks', organizationId] }),
        onError: (e: any) => alert(e.message || 'Erro.'),
    });

    const activeWebhooks = webhooks.filter(w => w.status === 'ATIVO').length;

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Integrações no catálogo</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">{CATALOG_INTEGRATIONS.length}</p>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-xl"><Link2 className="w-5 h-5 text-indigo-600" /></div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Webhooks Ativos</p>
                            <p className="text-3xl font-black text-emerald-600 mt-1">{activeWebhooks}</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl"><Zap className="w-5 h-5 text-emerald-600" /></div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Eventos disparados</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">
                                {webhooks.reduce((s, w) => s + (w.events_count || 0), 0)}
                            </p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-xl"><RefreshCw className="w-5 h-5 text-amber-600" /></div>
                    </div>
                </div>
            </div>

            {/* Catálogo de integrações */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black text-gray-900">Integrações Disponíveis</h3>
                    <span className="text-[10px] text-gray-400 font-bold">Requer configuração de backend</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {CATALOG_INTEGRATIONS.map(integration => {
                        const typeCfg = TYPE_CONFIG[integration.type];
                        const statusCfg = STATUS_CONFIG[integration.status];
                        const TypeIcon = typeCfg.icon;
                        const StatusIcon = statusCfg.icon;
                        return (
                            <div key={integration.id}
                                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 opacity-75 hover:opacity-100 transition-opacity">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-3 rounded-xl ${typeCfg.bg}`}>
                                            <TypeIcon className={`w-5 h-5 ${typeCfg.color}`} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-gray-900">{integration.name}</h4>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${typeCfg.bg} ${typeCfg.color}`}>
                                                {typeCfg.label}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black ${statusCfg.bg} ${statusCfg.color}`}>
                                        <StatusIcon className="w-3.5 h-3.5" />
                                        {statusCfg.label}
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500">{integration.description}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Webhooks CRUD */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="text-sm font-black text-gray-900">Webhooks</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Notificações HTTP automáticas para sistemas externos a cada evento.</p>
                    </div>
                    <button onClick={() => setShowWebhookForm(true)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-lg shadow-indigo-900/20">
                        <Plus className="w-3.5 h-3.5" /> Novo webhook
                    </button>
                </div>

                {loadWh ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                    </div>
                ) : webhooks.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
                        <Zap className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-sm font-bold text-gray-400">Nenhum webhook configurado.</p>
                        <p className="text-xs text-gray-300 mt-1">Adicione um endpoint para receber eventos em tempo real.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    {['Nome', 'Evento', 'Endpoint', 'Último disparo', 'Disparos', 'Status', ''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {webhooks.map(wh => (
                                    <tr key={wh.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-gray-800">{wh.name}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-1 bg-amber-50 text-amber-700 text-[10px] font-black rounded-lg">
                                                {EVENT_LABELS[wh.event_type]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 text-xs font-mono max-w-[200px] truncate" title={wh.endpoint_url}>
                                            {wh.endpoint_url}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400 text-xs">{formatTimeAgo(wh.last_triggered)}</td>
                                        <td className="px-4 py-3 font-bold text-gray-600">{wh.events_count}</td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => toggleMut.mutate({ id: wh.id, status: wh.status === 'ATIVO' ? 'INATIVO' : 'ATIVO' })}
                                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors cursor-pointer ${wh.status === 'ATIVO' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                                {wh.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => { if (confirm('Excluir webhook?')) removeMut.mutate(wh.id); }}
                                                className="p-1.5 hover:bg-red-100 rounded-lg transition-colors">
                                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showWebhookForm && (
                <WebhookForm
                    orgId={organizationId}
                    onClose={() => setShowWebhookForm(false)}
                    onSaved={() => {
                        setShowWebhookForm(false);
                        qc.invalidateQueries({ queryKey: ['broker-webhooks', organizationId] });
                    }}
                />
            )}
        </div>
    );
};

export default BrokerIntegrations;
