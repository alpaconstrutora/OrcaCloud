import React, { useState, useMemo } from 'react';
import {
    MessageSquare, Plus, X, Send, Bell, Shield, BookOpen,
    AlertTriangle, Gift, Users, Building2, User, Check,
    Loader2, Eye, Trash2, Edit3, ChevronRight, Phone,
    Wifi, Settings, BarChart3, Clock, Calendar, CheckCheck,
    Megaphone, FileText, Search
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    communicationService,
    Communication, CommTipo, CommScope, CommStatus, WhatsappConfig, WppProvider
} from '../services/communicationService';
import { STALE } from '../lib/queryClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<CommTipo, { label: string; icon: React.ElementType; color: string; bg: string; dot: string }> = {
    AVISO:       { label: 'Aviso',       icon: Bell,          color: 'text-blue-700',    bg: 'bg-blue-50',    dot: 'bg-blue-500' },
    DDS:         { label: 'DDS',         icon: Shield,        color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
    TREINAMENTO: { label: 'Treinamento', icon: BookOpen,      color: 'text-violet-700',  bg: 'bg-violet-50',  dot: 'bg-violet-500' },
    URGENTE:     { label: 'Urgente',     icon: AlertTriangle, color: 'text-red-700',     bg: 'bg-red-50',     dot: 'bg-red-500' },
    ANIVERSARIO: { label: 'Aniversário', icon: Gift,          color: 'text-amber-700',   bg: 'bg-amber-50',   dot: 'bg-amber-500' },
};

const STATUS_CONFIG: Record<CommStatus, { label: string; color: string; bg: string }> = {
    RASCUNHO:  { label: 'Rascunho',  color: 'text-slate-600',   bg: 'bg-slate-100' },
    AGENDADO:  { label: 'Agendado',  color: 'text-amber-700',   bg: 'bg-amber-100' },
    ENVIADO:   { label: 'Enviado',   color: 'text-emerald-700', bg: 'bg-emerald-100' },
    CANCELADO: { label: 'Cancelado', color: 'text-red-600',     bg: 'bg-red-100' },
};

const SCOPE_CONFIG: Record<CommScope, { label: string; icon: React.ElementType }> = {
    TODOS:        { label: 'Todos os colaboradores', icon: Users },
    OBRA:         { label: 'Por obra',               icon: Building2 },
    DEPARTAMENTO: { label: 'Por departamento',       icon: Building2 },
    INDIVIDUAL:   { label: 'Colaboradores específicos', icon: User },
};

const WPP_PROVIDERS: Record<WppProvider, string> = {
    EVOLUTION:  'Evolution API',
    TWILIO:     'Twilio',
    DIALOG360:  'Dialog 360',
    WPPCONNECT: 'WPPConnect',
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-300 transition-all';
const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
        {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
);

const ReadBar: React.FC<{ pct: number; label?: string }> = ({ pct, label }) => (
    <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] font-black text-slate-500 w-10 text-right">{label ?? `${pct}%`}</span>
    </div>
);

// ── Formulário de Comunicado ──────────────────────────────────────────────────

interface CommFormProps {
    orgId: string;
    comm?: Communication | null;
    employees: { id: string; name: string }[];
    projects: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const CommForm: React.FC<CommFormProps> = ({ orgId, comm, employees, projects, onClose, onSaved }) => {
    const isEditing = !!comm;
    const [saving, setSaving] = useState(false);
    const [dispatching, setDispatching] = useState(false);

    const [form, setForm] = useState<Partial<Communication>>({
        org_id: orgId,
        titulo: comm?.titulo || '',
        conteudo: comm?.conteudo || '',
        tipo: comm?.tipo || 'AVISO',
        scope: comm?.scope || 'TODOS',
        scope_ids: comm?.scope_ids || [],
        canal_app: comm?.canal_app ?? true,
        canal_whatsapp: comm?.canal_whatsapp ?? false,
        agendado_para: comm?.agendado_para || '',
        status: comm?.status || 'RASCUNHO',
        dds_tema: comm?.dds_tema || '',
        dds_duracao_min: comm?.dds_duracao_min,
        dds_assinaturas_required: comm?.dds_assinaturas_required ?? false,
        anexos: comm?.anexos || [],
    });

    const set = (k: keyof Communication, v: unknown) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async (andDispatch = false) => {
        if (!form.titulo || !form.conteudo) { alert('Preencha título e conteúdo.'); return; }
        setSaving(true);
        try {
            let id = comm?.id;
            if (isEditing) {
                await communicationService.updateCommunication(comm!.id, form);
            } else {
                const created = await communicationService.createCommunication(form as any);
                id = created.id;
            }
            if (andDispatch && id) {
                setDispatching(true);
                const res = await communicationService.dispatch(id);
                alert(`Enviado para ${res.destinatarios} colaboradores${res.wpp_enfileirados > 0 ? ` • ${res.wpp_enfileirados} na fila WhatsApp` : ''}.`);
            }
            onSaved();
        } catch (e: any) {
            alert(e.message || 'Erro ao salvar.');
        } finally {
            setSaving(false);
            setDispatching(false);
        }
    };

    const isDds = form.tipo === 'DDS';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-lg font-black text-slate-900">{isEditing ? 'Editar Comunicado' : 'Novo Comunicado'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Tipo */}
                    <Field label="Tipo de comunicado">
                        <div className="grid grid-cols-5 gap-2">
                            {(Object.entries(TIPO_CONFIG) as [CommTipo, typeof TIPO_CONFIG[CommTipo]][]).map(([k, v]) => {
                                const Icon = v.icon;
                                const active = form.tipo === k;
                                return (
                                    <button key={k} type="button" onClick={() => set('tipo', k)}
                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs font-bold
                                            ${active ? `${v.bg} border-current ${v.color}` : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}>
                                        <Icon className="w-4 h-4" />
                                        {v.label}
                                    </button>
                                );
                            })}
                        </div>
                    </Field>

                    <Field label="Título">
                        <input className={inputCls} placeholder="Assunto do comunicado..."
                            value={form.titulo} onChange={e => set('titulo', e.target.value)} />
                    </Field>

                    <Field label="Conteúdo">
                        <textarea className={`${inputCls} resize-none`} rows={4}
                            placeholder="Mensagem completa..."
                            value={form.conteudo} onChange={e => set('conteudo', e.target.value)} />
                    </Field>

                    {/* DDS fields */}
                    {isDds && (
                        <div className="p-4 bg-emerald-50 rounded-2xl space-y-3 border border-emerald-100">
                            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Configurações do DDS</p>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Tema do DDS">
                                    <input className={inputCls} placeholder="Ex: Trabalho em Altura"
                                        value={form.dds_tema || ''} onChange={e => set('dds_tema', e.target.value)} />
                                </Field>
                                <Field label="Duração (min)">
                                    <input type="number" min={1} className={inputCls}
                                        value={form.dds_duracao_min || ''} onChange={e => set('dds_duracao_min', Number(e.target.value))} />
                                </Field>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="accent-emerald-600 w-4 h-4"
                                    checked={form.dds_assinaturas_required}
                                    onChange={e => set('dds_assinaturas_required', e.target.checked)} />
                                <span className="text-sm font-bold text-slate-700">Exigir assinatura digital dos participantes</span>
                            </label>
                        </div>
                    )}

                    {/* Destinatários */}
                    <Field label="Destinatários">
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {(Object.entries(SCOPE_CONFIG) as [CommScope, typeof SCOPE_CONFIG[CommScope]][]).map(([k, v]) => {
                                const Icon = v.icon;
                                const active = form.scope === k;
                                return (
                                    <button key={k} type="button" onClick={() => set('scope', k)}
                                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-all text-left
                                            ${active ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}>
                                        <Icon className="w-4 h-4 shrink-0" />
                                        {v.label}
                                    </button>
                                );
                            })}
                        </div>
                        {form.scope === 'INDIVIDUAL' && (
                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selecionar colaboradores</p>
                                <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                                    {employees.map(e => (
                                        <label key={e.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                                            <input type="checkbox" className="accent-teal-600"
                                                checked={(form.scope_ids || []).includes(e.id)}
                                                onChange={ev => {
                                                    const ids = form.scope_ids || [];
                                                    set('scope_ids', ev.target.checked ? [...ids, e.id] : ids.filter(id => id !== e.id));
                                                }} />
                                            <span className="text-sm font-medium text-slate-700">{e.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Field>

                    {/* Canais */}
                    <Field label="Canais de entrega">
                        <div className="flex gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="accent-teal-600 w-4 h-4"
                                    checked={form.canal_app} onChange={e => set('canal_app', e.target.checked)} />
                                <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                    <Bell className="w-3.5 h-3.5 text-teal-600" /> App / Portal
                                </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="accent-teal-600 w-4 h-4"
                                    checked={form.canal_whatsapp} onChange={e => set('canal_whatsapp', e.target.checked)} />
                                <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                    <Phone className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp
                                </span>
                            </label>
                        </div>
                    </Field>

                    {/* Agendamento */}
                    <Field label="Agendar envio (opcional)" hint="Deixe em branco para enviar imediatamente ao clicar em Enviar.">
                        <input type="datetime-local" className={inputCls}
                            value={form.agendado_para || ''}
                            onChange={e => set('agendado_para', e.target.value)} />
                    </Field>
                </div>

                <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                        Cancelar
                    </button>
                    <button onClick={() => handleSave(false)} disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50">
                        {saving && !dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        Salvar rascunho
                    </button>
                    <button onClick={() => handleSave(true)} disabled={saving}
                        className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-lg shadow-teal-900/20">
                        {dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Enviar agora
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Detalhe de Comunicado ─────────────────────────────────────────────────────

interface CommDetailProps {
    comm: Communication;
    onBack: () => void;
    onDispatch: (id: string) => void;
    dispatching: boolean;
}

const CommDetail: React.FC<CommDetailProps> = ({ comm, onBack, onDispatch, dispatching }) => {
    const { data: receipts = [], isLoading } = useQuery({
        queryKey: ['comm-receipts', comm.id],
        queryFn: () => communicationService.getReceipts(comm.id),
        staleTime: STALE.fast,
        enabled: comm.status === 'ENVIADO',
    });

    const TIPO = TIPO_CONFIG[comm.tipo];
    const STATUS = STATUS_CONFIG[comm.status];
    const TipoIcon = TIPO.icon;

    const lidos = receipts.filter(r => r.lido_em).length;
    const assinados = receipts.filter(r => r.assinado_em).length;
    const taxa = receipts.length > 0 ? Math.round(lidos / receipts.length * 100) : 0;

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-xl transition-colors mt-1">
                    <ChevronRight className="w-5 h-5 text-slate-400 rotate-180" />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className={`p-2 ${TIPO.bg} rounded-xl`}>
                            <TipoIcon className={`w-4 h-4 ${TIPO.color}`} />
                        </div>
                        <h2 className="text-xl font-black text-slate-900">{comm.titulo}</h2>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${STATUS.color} ${STATUS.bg}`}>{STATUS.label}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 ml-10">
                        {TIPO.label}
                        {comm.enviado_em && ` • Enviado em ${new Date(comm.enviado_em).toLocaleDateString('pt-BR')}`}
                    </p>
                </div>
                {comm.status === 'RASCUNHO' && (
                    <button onClick={() => onDispatch(comm.id)} disabled={dispatching}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-lg shadow-teal-900/20">
                        {dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Enviar agora
                    </button>
                )}
            </div>

            {/* Conteúdo */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{comm.conteudo}</p>
                {comm.tipo === 'DDS' && comm.dds_tema && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
                        <span className="font-bold text-emerald-700">DDS: {comm.dds_tema}</span>
                        {comm.dds_duracao_min && <span>{comm.dds_duracao_min} min</span>}
                        {comm.dds_assinaturas_required && (
                            <span className="flex items-center gap-1 text-amber-600 font-bold">
                                <Shield className="w-3 h-3" /> Assinatura obrigatória
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* KPIs leitura */}
            {comm.status === 'ENVIADO' && (
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'Destinatários', value: receipts.length, icon: Users, color: 'teal' },
                        { label: 'Leram', value: `${lidos} (${taxa}%)`, icon: Eye, color: 'blue' },
                        { label: 'Assinaram', value: assinados, icon: CheckCheck, color: 'emerald' },
                    ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-xl font-black text-slate-900">{value}</span>
                                <div className={`p-2 bg-${color}-50 rounded-xl`}>
                                    <Icon className={`w-4 h-4 text-${color}-600`} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tabela de recibos */}
            {comm.status === 'ENVIADO' && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <Eye className="w-4 h-4 text-teal-600" /> Rastreio de Leitura
                        </h3>
                        {receipts.length > 0 && (
                            <div className="mt-2">
                                <ReadBar pct={taxa} label={`${taxa}% leram`} />
                            </div>
                        )}
                    </div>
                    {isLoading ? (
                        <div className="p-12 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
                        </div>
                    ) : receipts.length === 0 ? (
                        <div className="p-10 text-center text-sm text-slate-400">Nenhum recibo registrado.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-50">
                                    {['Colaborador', 'Lido em', 'Assinado em', 'WhatsApp'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {receipts.map(r => (
                                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-slate-800">{r.employee_nome || '–'}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">
                                            {r.lido_em ? new Date(r.lido_em).toLocaleString('pt-BR') : (
                                                <span className="text-amber-500 font-bold">Pendente</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">
                                            {r.assinado_em ? new Date(r.assinado_em).toLocaleString('pt-BR') : '–'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.whatsapp_status ? (
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                    r.whatsapp_status === 'LIDO' ? 'bg-emerald-100 text-emerald-700' :
                                                    r.whatsapp_status === 'ENTREGUE' ? 'bg-blue-100 text-blue-700' :
                                                    r.whatsapp_status === 'FALHOU' ? 'bg-red-100 text-red-700' :
                                                    'bg-slate-100 text-slate-600'
                                                }`}>{r.whatsapp_status}</span>
                                            ) : '–'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Config WhatsApp ───────────────────────────────────────────────────────────

interface WppConfigPanelProps {
    orgId: string;
}

const WppConfigPanel: React.FC<WppConfigPanelProps> = ({ orgId }) => {
    const qc = useQueryClient();
    const [saving, setSaving] = useState(false);
    const { data: existing, isLoading } = useQuery({
        queryKey: ['wpp-config', orgId],
        queryFn: () => communicationService.getWhatsappConfig(orgId),
        staleTime: STALE.slow,
    });

    const [form, setForm] = useState<Partial<WhatsappConfig>>({});
    const merged: WhatsappConfig = {
        org_id: orgId,
        provider: 'EVOLUTION',
        ativo: false,
        ...existing,
        ...form,
    };
    const set = (k: keyof WhatsappConfig, v: unknown) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        setSaving(true);
        try {
            await communicationService.upsertWhatsappConfig(merged);
            qc.invalidateQueries({ queryKey: ['wpp-config', orgId] });
            alert('Configuração salva com sucesso.');
            setForm({});
        } catch (e: any) {
            alert(e.message || 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    if (isLoading) return (
        <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
        </div>
    );

    return (
        <div className="max-w-lg space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>A chave de API é armazenada como referência segura, nunca em texto puro. O envio real de mensagens requer uma Edge Function ou worker que consuma a fila <code className="bg-amber-100 px-1 rounded">whatsapp_queue</code>.</span>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Phone className="w-4 h-4 text-teal-600" /> Integração WhatsApp
                </h3>

                <Field label="Provedor">
                    <select className={inputCls} value={merged.provider}
                        onChange={e => set('provider', e.target.value)}>
                        {(Object.entries(WPP_PROVIDERS) as [WppProvider, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </Field>

                <Field label="URL da API">
                    <input className={inputCls} placeholder="https://api.evolution-api.com"
                        value={merged.api_url || ''} onChange={e => set('api_url', e.target.value)} />
                </Field>

                <Field label="Referência da chave API" hint="Insira apenas o nome/ID da chave no seu gerenciador de secrets.">
                    <input className={inputCls} placeholder="Ex: wpp-evolution-key"
                        value={merged.api_key_ref || ''} onChange={e => set('api_key_ref', e.target.value)} />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                    <Field label="Nome da instância">
                        <input className={inputCls} placeholder="orçacloud-prod"
                            value={merged.instance_name || ''} onChange={e => set('instance_name', e.target.value)} />
                    </Field>
                    <Field label="Número remetente">
                        <input className={inputCls} placeholder="+55 11 99999-9999"
                            value={merged.numero_remetente || ''} onChange={e => set('numero_remetente', e.target.value)} />
                    </Field>
                </div>

                <Field label="Webhook URL (opcional)">
                    <input className={inputCls} placeholder="https://..."
                        value={merged.webhook_url || ''} onChange={e => set('webhook_url', e.target.value)} />
                </Field>

                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-teal-600 w-4 h-4"
                        checked={merged.ativo} onChange={e => set('ativo', e.target.checked)} />
                    <span className="text-sm font-bold text-slate-700">Integração ativa</span>
                </label>

                <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-lg shadow-teal-900/20 w-full justify-center">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Salvar configuração
                </button>
            </div>
        </div>
    );
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface LaborComunicacaoProps {
    orgId: string;
    employees: { id: string; name: string; status?: string }[];
    projects: { id: string; name: string }[];
}

type MainTab = 'comunicados' | 'config';

const LaborComunicacao: React.FC<LaborComunicacaoProps> = ({ orgId, employees, projects }) => {
    const qc = useQueryClient();
    const [mainTab, setMainTab] = useState<MainTab>('comunicados');
    const [selectedComm, setSelectedComm] = useState<Communication | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingComm, setEditingComm] = useState<Communication | null>(null);
    const [dispatching, setDispatching] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filterTipo, setFilterTipo] = useState<CommTipo | ''>('');

    const activeEmployees = useMemo(() => employees.filter(e => (e.status || 'ATIVO') === 'ATIVO'), [employees]);

    const { data: comms = [], isLoading, refetch } = useQuery({
        queryKey: ['communications', orgId],
        queryFn: () => communicationService.getCommunicationReadRates(orgId),
        enabled: !!orgId,
        staleTime: STALE.fast,
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => communicationService.deleteCommunication(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['communications', orgId] }),
        onError: (e: any) => alert(e.message || 'Erro ao excluir.'),
    });

    const handleDispatch = async (id: string) => {
        setDispatching(id);
        try {
            const res = await communicationService.dispatch(id);
            alert(`Enviado para ${res.destinatarios} colaboradores${res.wpp_enfileirados > 0 ? ` • ${res.wpp_enfileirados} na fila WhatsApp` : ''}.`);
            qc.invalidateQueries({ queryKey: ['communications', orgId] });
            if (selectedComm?.id === id) setSelectedComm(null);
        } catch (e: any) {
            alert(e.message || 'Erro ao enviar.');
        } finally {
            setDispatching(null);
        }
    };

    const filtered = useMemo(() => {
        return comms.filter(c => {
            const matchSearch = !search || c.titulo.toLowerCase().includes(search.toLowerCase()) || c.conteudo.toLowerCase().includes(search.toLowerCase());
            const matchTipo = !filterTipo || c.tipo === filterTipo;
            return matchSearch && matchTipo;
        });
    }, [comms, search, filterTipo]);

    // KPIs
    const enviados = comms.filter(c => c.status === 'ENVIADO').length;
    const rascunhos = comms.filter(c => c.status === 'RASCUNHO').length;
    const ddsCount = comms.filter(c => c.tipo === 'DDS' && c.status === 'ENVIADO').length;
    const taxaMedia = useMemo(() => {
        const withData = comms.filter(c => c.taxa_leitura_pct != null);
        if (!withData.length) return 0;
        return Math.round(withData.reduce((s, c) => s + (c.taxa_leitura_pct || 0), 0) / withData.length);
    }, [comms]);

    if (selectedComm) {
        return (
            <CommDetail
                comm={comms.find(c => c.id === selectedComm.id) || selectedComm}
                onBack={() => setSelectedComm(null)}
                onDispatch={handleDispatch}
                dispatching={dispatching === selectedComm.id}
            />
        );
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-teal-600" />
                        Comunicação Interna
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Avisos, DDS digitais, treinamentos e WhatsApp</p>
                </div>
                {mainTab === 'comunicados' && (
                    <button onClick={() => { setEditingComm(null); setShowForm(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition-colors shadow-lg shadow-teal-900/20">
                        <Plus className="w-4 h-4" /> Novo Comunicado
                    </button>
                )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: 'Enviados', value: enviados, icon: Send, color: 'teal' },
                    { label: 'Rascunhos', value: rascunhos, icon: FileText, color: 'slate' },
                    { label: 'DDS realizados', value: ddsCount, icon: Shield, color: 'emerald' },
                    { label: 'Taxa leitura média', value: `${taxaMedia}%`, icon: Eye, color: 'blue' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-2xl font-black text-slate-900">{value}</span>
                            <div className={`p-2 bg-${color}-50 rounded-xl`}>
                                <Icon className={`w-4 h-4 text-${color}-600`} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
                {([['comunicados', 'Comunicados'], ['config', 'WhatsApp']] as [MainTab, string][]).map(([v, label]) => (
                    <button key={v} onClick={() => setMainTab(v)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mainTab === v ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Comunicados Tab */}
            {mainTab === 'comunicados' && (
                <div className="space-y-4">
                    {/* Filtros */}
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-300 transition-all"
                                placeholder="Buscar por título ou conteúdo..."
                                value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <select className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-teal-100 transition-all"
                            value={filterTipo} onChange={e => setFilterTipo(e.target.value as CommTipo | '')}>
                            <option value="">Todos os tipos</option>
                            {(Object.entries(TIPO_CONFIG) as [CommTipo, typeof TIPO_CONFIG[CommTipo]][]).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                            <Megaphone className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhum comunicado encontrado.</p>
                            <p className="text-xs text-slate-300 mt-1">Crie o primeiro comunicado para sua equipe.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filtered.map(comm => {
                                const TIPO = TIPO_CONFIG[comm.tipo];
                                const STATUS = STATUS_CONFIG[comm.status];
                                const TipoIcon = TIPO.icon;
                                const taxa = comm.taxa_leitura_pct ?? 0;
                                return (
                                    <div key={comm.id}
                                        className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-4 flex items-center gap-4 cursor-pointer group"
                                        onClick={() => setSelectedComm(comm)}>
                                        <div className={`p-2.5 ${TIPO.bg} rounded-xl shrink-0 group-hover:scale-110 transition-transform`}>
                                            <TipoIcon className={`w-4 h-4 ${TIPO.color}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-black text-slate-800 truncate">{comm.titulo}</p>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${STATUS.color} ${STATUS.bg}`}>{STATUS.label}</span>
                                                <span className={`text-[10px] font-bold ${TIPO.color}`}>{TIPO.label}</span>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{comm.conteudo}</p>
                                            {comm.status === 'ENVIADO' && comm.total_destinatarios != null && (
                                                <div className="mt-1.5 flex items-center gap-3">
                                                    <span className="text-[11px] text-slate-400">{comm.total_destinatarios} destinatários</span>
                                                    <div className="flex-1 max-w-[120px]">
                                                        <ReadBar pct={taxa} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                            {comm.status === 'RASCUNHO' && (
                                                <>
                                                    <button onClick={() => { setEditingComm(comm); setShowForm(true); }}
                                                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors" title="Editar">
                                                        <Edit3 className="w-4 h-4 text-slate-400" />
                                                    </button>
                                                    <button onClick={() => handleDispatch(comm.id)}
                                                        disabled={dispatching === comm.id}
                                                        className="p-2 hover:bg-teal-100 rounded-xl transition-colors" title="Enviar">
                                                        {dispatching === comm.id
                                                            ? <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />
                                                            : <Send className="w-4 h-4 text-teal-500" />}
                                                    </button>
                                                    <button onClick={() => { if (confirm('Excluir este comunicado?')) deleteMut.mutate(comm.id); }}
                                                        className="p-2 hover:bg-red-100 rounded-xl transition-colors" title="Excluir">
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    </button>
                                                </>
                                            )}
                                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Config Tab */}
            {mainTab === 'config' && <WppConfigPanel orgId={orgId} />}

            {/* Modal */}
            {showForm && (
                <CommForm
                    orgId={orgId}
                    comm={editingComm}
                    employees={activeEmployees}
                    projects={projects}
                    onClose={() => { setShowForm(false); setEditingComm(null); }}
                    onSaved={() => { setShowForm(false); setEditingComm(null); refetch(); }}
                />
            )}
        </div>
    );
};

export default LaborComunicacao;
