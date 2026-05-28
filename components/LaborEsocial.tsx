import React, { useState, useMemo } from 'react';
import {
    FileText, CheckCircle, AlertTriangle, Clock, XCircle,
    Plus, X, Check, Loader2, Settings, Send, RefreshCw,
    ChevronRight, Shield, Layers, Bell, Search, Filter,
    Building2, Calendar, AlertCircle, Zap, Lock, Info,
    ChevronDown, Trash2, Eye
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    esocialService,
    EsocialConfig, EsocialEvent, EsocialBatch, EsocialPendingAlert,
    EsocialStatus, EsocialGrupo, BatchStatus, CertStatus,
    ESOCIAL_EVENTOS_CATALOG
} from '../services/esocialService';
import { STALE } from '../lib/queryClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<EsocialStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    GERADO:     { label: 'Gerado',      color: 'text-slate-600',   bg: 'bg-slate-100',   icon: FileText },
    ASSINADO:   { label: 'Assinado',    color: 'text-blue-700',    bg: 'bg-blue-100',    icon: Shield },
    AGUARDANDO: { label: 'Aguardando',  color: 'text-amber-700',   bg: 'bg-amber-100',   icon: Clock },
    PROCESSADO: { label: 'Processado',  color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle },
    ERRO:       { label: 'Erro',        color: 'text-red-700',     bg: 'bg-red-100',     icon: XCircle },
    CANCELADO:  { label: 'Cancelado',   color: 'text-slate-400',   bg: 'bg-slate-100',   icon: XCircle },
    EXCLUIDO:   { label: 'Excluído',    color: 'text-slate-300',   bg: 'bg-slate-50',    icon: XCircle },
};

const GRUPO_CFG: Record<EsocialGrupo, { label: string; color: string; bg: string }> = {
    TABELAS:        { label: 'Tabelas',         color: 'text-violet-700', bg: 'bg-violet-100' },
    NAO_PERIODICOS: { label: 'Não periódicos',  color: 'text-blue-700',   bg: 'bg-blue-100' },
    PERIODICOS:     { label: 'Periódicos',      color: 'text-emerald-700',bg: 'bg-emerald-100' },
    FECHAMENTO:     { label: 'Fechamento',      color: 'text-amber-700',  bg: 'bg-amber-100' },
};

const BATCH_STATUS_CFG: Record<BatchStatus, { label: string; color: string; bg: string }> = {
    ABERTO:       { label: 'Aberto',       color: 'text-slate-600',   bg: 'bg-slate-100' },
    TRANSMITINDO: { label: 'Transmitindo', color: 'text-blue-700',    bg: 'bg-blue-100' },
    AGUARDANDO:   { label: 'Aguardando',   color: 'text-amber-700',   bg: 'bg-amber-100' },
    PROCESSADO:   { label: 'Processado',   color: 'text-emerald-700', bg: 'bg-emerald-100' },
    ERRO:         { label: 'Erro',         color: 'text-red-700',     bg: 'bg-red-100' },
};

const PRIORIDADE_CFG = {
    CRITICA: { label: 'Crítica', color: 'text-red-700',    bg: 'bg-red-100',    border: 'border-red-200' },
    ALTA:    { label: 'Alta',    color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-200' },
    NORMAL:  { label: 'Normal',  color: 'text-slate-600',  bg: 'bg-slate-100',  border: 'border-slate-200' },
    BAIXA:   { label: 'Baixa',   color: 'text-slate-400',  bg: 'bg-slate-50',   border: 'border-slate-100' },
};

const CERT_STATUS_CFG: Record<CertStatus, { label: string; color: string; icon: React.ElementType }> = {
    NAO_CONFIGURADO: { label: 'Não configurado', color: 'text-slate-400', icon: Lock },
    VALIDO:          { label: 'Válido',           color: 'text-emerald-600', icon: CheckCircle },
    EXPIRADO:        { label: 'Expirado',         color: 'text-red-600',    icon: AlertTriangle },
    INVALIDO:        { label: 'Inválido',         color: 'text-red-600',    icon: XCircle },
};

const fmt = {
    date: (iso?: string) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '–',
    dateTime: (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR') : '–',
};

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all';
const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
        {children}
        {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
);

const StatusBadge: React.FC<{ status: EsocialStatus }> = ({ status }) => {
    const cfg = STATUS_CFG[status];
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black ${cfg.color} ${cfg.bg}`}>
            <Icon className="w-3 h-3" />
            {cfg.label}
        </span>
    );
};

// Linha do ciclo de vida do evento
const LifecycleBar: React.FC<{ status: EsocialStatus }> = ({ status }) => {
    const steps: EsocialStatus[] = ['GERADO', 'ASSINADO', 'AGUARDANDO', 'PROCESSADO'];
    const idx = steps.indexOf(status);
    const isError = status === 'ERRO';
    return (
        <div className="flex items-center gap-1">
            {steps.map((s, i) => {
                const done = idx >= i && !isError;
                const current = idx === i && !isError;
                const cfg = STATUS_CFG[s];
                return (
                    <React.Fragment key={s}>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all
                            ${done ? `${cfg.bg} ${cfg.color}` : 'bg-slate-50 text-slate-300'}
                            ${current ? 'ring-1 ring-current' : ''}`}>
                            {cfg.label}
                        </div>
                        {i < steps.length - 1 && (
                            <div className={`h-px w-4 ${done && idx > i ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                        )}
                    </React.Fragment>
                );
            })}
            {isError && (
                <span className="ml-2 px-2 py-1 rounded-lg text-[10px] font-bold bg-red-100 text-red-700">Erro</span>
            )}
        </div>
    );
};

// ── Config Panel ──────────────────────────────────────────────────────────────

const ConfigPanel: React.FC<{ orgId: string }> = ({ orgId }) => {
    const qc = useQueryClient();
    const [saving, setSaving] = useState(false);
    const { data: existing, isLoading } = useQuery({
        queryKey: ['esocial-config', orgId],
        queryFn: () => esocialService.getConfig(orgId),
        staleTime: STALE.slow,
    });

    const [form, setForm] = useState<Partial<EsocialConfig>>({});
    const merged: EsocialConfig = {
        org_id: orgId,
        ambiente: 'PRODUCAO_RESTRITA',
        versao_schema: 'S-1.2',
        tipo_inscricao: 1,
        nr_inscricao: '',
        cert_status: 'NAO_CONFIGURADO',
        transmissao_automatica: false,
        ativo: false,
        ...existing,
        ...form,
    };
    const set = (k: keyof EsocialConfig, v: unknown) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = async () => {
        if (!merged.nr_inscricao) { alert('Informe o CNPJ/CPF do empregador.'); return; }
        setSaving(true);
        try {
            await esocialService.upsertConfig(merged);
            qc.invalidateQueries({ queryKey: ['esocial-config', orgId] });
            setForm({});
            alert('Configuração salva.');
        } catch (e: any) {
            alert(e.message || 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-orange-600 animate-spin" /></div>;

    const certCfg = CERT_STATUS_CFG[merged.cert_status];
    const CertIcon = certCfg.icon;

    return (
        <div className="max-w-lg space-y-5">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 font-medium flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>O eSocial exige certificado digital A1/A3 para assinar e transmitir eventos. A assinatura e transmissão ao webservice do Governo Federal requerem uma integração de backend (Edge Function ou servidor). Este módulo gerencia os eventos e lotes — a transmissão real é configurada externamente.</span>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-orange-600" /> Dados do Empregador
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Tipo de inscrição">
                        <select className={inputCls} value={merged.tipo_inscricao}
                            onChange={e => set('tipo_inscricao', Number(e.target.value) as 1 | 2)}>
                            <option value={1}>1 — CNPJ</option>
                            <option value={2}>2 — CPF</option>
                        </select>
                    </Field>
                    <Field label="CNPJ / CPF" hint="Apenas números">
                        <input className={inputCls} maxLength={14}
                            placeholder={merged.tipo_inscricao === 1 ? '00000000000000' : '00000000000'}
                            value={merged.nr_inscricao}
                            onChange={e => set('nr_inscricao', e.target.value.replace(/\D/g, ''))} />
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Ambiente">
                        <select className={inputCls} value={merged.ambiente}
                            onChange={e => set('ambiente', e.target.value as any)}>
                            <option value="PRODUCAO_RESTRITA">Produção restrita (testes)</option>
                            <option value="PRODUCAO">Produção (obrigatório)</option>
                        </select>
                    </Field>
                    <Field label="Versão do schema">
                        <input className={inputCls} value={merged.versao_schema}
                            onChange={e => set('versao_schema', e.target.value)} />
                    </Field>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Shield className="w-4 h-4 text-orange-600" /> Certificado Digital
                </h3>
                <div className={`flex items-center gap-3 p-3 rounded-xl ${merged.cert_status === 'VALIDO' ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                    <CertIcon className={`w-5 h-5 ${certCfg.color}`} />
                    <div>
                        <p className={`text-sm font-black ${certCfg.color}`}>{certCfg.label}</p>
                        {merged.cert_validade && <p className="text-xs text-slate-400">Validade: {fmt.date(merged.cert_validade)}</p>}
                        {merged.cert_serial && <p className="text-xs text-slate-400 font-mono">Serial: {merged.cert_serial}</p>}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Serial do certificado">
                        <input className={inputCls} placeholder="Ex: 12AB34CD56EF..."
                            value={merged.cert_serial || ''}
                            onChange={e => set('cert_serial', e.target.value)} />
                    </Field>
                    <Field label="Validade">
                        <input type="date" className={inputCls}
                            value={merged.cert_validade || ''}
                            onChange={e => set('cert_validade', e.target.value)} />
                    </Field>
                </div>
                <Field label="Status do certificado">
                    <select className={inputCls} value={merged.cert_status}
                        onChange={e => set('cert_status', e.target.value as CertStatus)}>
                        {(Object.entries(CERT_STATUS_CFG) as [CertStatus, typeof CERT_STATUS_CFG[CertStatus]][]).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                        ))}
                    </select>
                </Field>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Zap className="w-4 h-4 text-orange-600" /> Transmissão
                </h3>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-orange-600 w-4 h-4"
                        checked={merged.transmissao_automatica}
                        onChange={e => set('transmissao_automatica', e.target.checked)} />
                    <span className="text-sm font-bold text-slate-700">Transmissão automática de lotes</span>
                </label>
                {merged.transmissao_automatica && (
                    <Field label="Horário de transmissão">
                        <input type="time" className={inputCls}
                            value={merged.horario_transmissao || ''}
                            onChange={e => set('horario_transmissao', e.target.value)} />
                    </Field>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-orange-600 w-4 h-4"
                        checked={merged.ativo}
                        onChange={e => set('ativo', e.target.checked)} />
                    <span className="text-sm font-bold text-slate-700">Módulo eSocial ativo</span>
                </label>
            </div>

            <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 shadow-lg shadow-orange-900/20 w-full justify-center">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar configuração
            </button>
        </div>
    );
};

// ── Gerar evento manual ───────────────────────────────────────────────────────

interface CreateEventModalProps {
    orgId: string;
    employees: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const CreateEventModal: React.FC<CreateEventModalProps> = ({ orgId, employees, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [tipoEvento, setTipoEvento] = useState('S-2200');
    const [employeeId, setEmployeeId] = useState('');
    const [perApur, setPerApur] = useState('');

    const catalog = ESOCIAL_EVENTOS_CATALOG[tipoEvento];
    const needsEmployee = ['S-2200', 'S-2205', 'S-2206', 'S-2210', 'S-2220', 'S-2230', 'S-2240', 'S-2299', 'S-2300'].includes(tipoEvento);
    const needsPerApur  = catalog?.grupo === 'PERIODICOS' || catalog?.grupo === 'FECHAMENTO';

    const handleSave = async () => {
        setSaving(true);
        try {
            if (tipoEvento === 'S-2200' && employeeId) {
                await esocialService.generateS2200(employeeId);
            } else {
                await esocialService.createEvent(orgId, tipoEvento, {
                    entidade: employeeId ? 'employee' : undefined,
                    entidade_id: employeeId || undefined,
                    per_apur: perApur || undefined,
                });
            }
            onSaved();
        } catch (e: any) {
            alert(e.message || 'Erro ao gerar evento.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-900">Gerar Evento eSocial</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <Field label="Tipo de evento">
                        <select className={inputCls} value={tipoEvento}
                            onChange={e => setTipoEvento(e.target.value)}>
                            {Object.entries(ESOCIAL_EVENTOS_CATALOG).map(([k, v]) => (
                                <option key={k} value={k}>{k} — {v.desc}</option>
                            ))}
                        </select>
                    </Field>
                    {catalog && (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${GRUPO_CFG[catalog.grupo].bg} ${GRUPO_CFG[catalog.grupo].color}`}>
                            <Layers className="w-3.5 h-3.5" />
                            Grupo: {GRUPO_CFG[catalog.grupo].label} — {catalog.desc}
                        </div>
                    )}
                    {needsEmployee && (
                        <Field label="Colaborador">
                            <select className={inputCls} value={employeeId}
                                onChange={e => setEmployeeId(e.target.value)}>
                                <option value="">Selecionar...</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </Field>
                    )}
                    {needsPerApur && (
                        <Field label="Período de apuração (YYYY-MM)">
                            <input className={inputCls} placeholder="2026-05"
                                value={perApur} onChange={e => setPerApur(e.target.value)} />
                        </Field>
                    )}
                </div>
                <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 px-5 py-2 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 shadow-lg shadow-orange-900/20">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Gerar evento
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Modal criar lote ──────────────────────────────────────────────────────────

interface CreateBatchModalProps {
    orgId: string;
    onClose: () => void;
    onSaved: (msg: string) => void;
}

const CreateBatchModal: React.FC<CreateBatchModalProps> = ({ orgId, onClose, onSaved }) => {
    const [saving, setSaving] = useState(false);
    const [grupo, setGrupo] = useState<EsocialGrupo>('NAO_PERIODICOS');
    const [perApur, setPerApur] = useState('');

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await esocialService.createBatch(orgId, grupo, perApur || undefined);
            onSaved(`Lote criado com ${res.total_eventos} eventos.`);
        } catch (e: any) {
            alert(e.message || 'Erro ao criar lote.');
        } finally {
            setSaving(false);
        }
    };

    const needsPerApur = grupo === 'PERIODICOS' || grupo === 'FECHAMENTO';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-900">Criar Lote de Transmissão</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 font-medium">
                        O lote agrupa até 50 eventos com status GERADO do grupo selecionado. Limite conforme leiaute eSocial.
                    </div>
                    <Field label="Grupo de eventos">
                        <select className={inputCls} value={grupo} onChange={e => setGrupo(e.target.value as EsocialGrupo)}>
                            {(Object.entries(GRUPO_CFG) as [EsocialGrupo, typeof GRUPO_CFG[EsocialGrupo]][]).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </Field>
                    {needsPerApur && (
                        <Field label="Período de apuração (YYYY-MM)">
                            <input className={inputCls} placeholder="2026-05"
                                value={perApur} onChange={e => setPerApur(e.target.value)} />
                        </Field>
                    )}
                </div>
                <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 px-5 py-2 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 shadow-lg shadow-orange-900/20">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                        Criar lote
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface LaborEsocialProps {
    orgId: string;
    employees: { id: string; name: string; status?: string }[];
}

type MainTab = 'painel' | 'eventos' | 'lotes' | 'configuracao';

const LaborEsocial: React.FC<LaborEsocialProps> = ({ orgId, employees }) => {
    const qc = useQueryClient();
    const [mainTab, setMainTab] = useState<MainTab>('painel');
    const [showCreateEvent, setShowCreateEvent] = useState(false);
    const [showCreateBatch, setShowCreateBatch] = useState(false);
    const [filterStatus, setFilterStatus] = useState<EsocialStatus | ''>('');
    const [filterGrupo, setFilterGrupo] = useState<EsocialGrupo | ''>('');
    const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

    const allEmployees = employees;

    const { data: dashboard, isLoading: loadDash, refetch: refetchDash } = useQuery({
        queryKey: ['esocial-dashboard', orgId],
        queryFn: () => esocialService.getDashboard(orgId),
        enabled: !!orgId,
        staleTime: STALE.fast,
    });

    const { data: alerts = [], refetch: refetchAlerts } = useQuery({
        queryKey: ['esocial-alerts', orgId],
        queryFn: () => esocialService.getAlerts(orgId),
        enabled: !!orgId,
        staleTime: STALE.fast,
    });

    const { data: events = [], isLoading: loadEvents, refetch: refetchEvents } = useQuery({
        queryKey: ['esocial-events', orgId, filterStatus, filterGrupo],
        queryFn: () => esocialService.getEvents(orgId, {
            status: filterStatus || undefined,
            grupo: filterGrupo || undefined,
        }),
        enabled: !!orgId && mainTab === 'eventos',
        staleTime: STALE.fast,
    });

    const { data: batches = [], isLoading: loadBatches, refetch: refetchBatches } = useQuery({
        queryKey: ['esocial-batches', orgId],
        queryFn: () => esocialService.getBatches(orgId),
        enabled: !!orgId && mainTab === 'lotes',
        staleTime: STALE.fast,
    });

    const { data: statusPanel = [] } = useQuery({
        queryKey: ['esocial-panel', orgId],
        queryFn: () => esocialService.getStatusPanel(orgId),
        enabled: !!orgId && mainTab === 'painel',
        staleTime: STALE.normal,
    });

    const resolveAlertMut = useMutation({
        mutationFn: (id: string) => esocialService.resolveAlert(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['esocial-alerts', orgId] });
            qc.invalidateQueries({ queryKey: ['esocial-dashboard', orgId] });
        },
    });

    const cancelEventMut = useMutation({
        mutationFn: (id: string) => esocialService.cancelEvent(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['esocial-events', orgId] });
            qc.invalidateQueries({ queryKey: ['esocial-dashboard', orgId] });
        },
    });

    const advanceStatusMut = useMutation({
        mutationFn: ({ id, status }: { id: string; status: EsocialStatus }) =>
            esocialService.updateEventStatus(id, status),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['esocial-events', orgId] });
            qc.invalidateQueries({ queryKey: ['esocial-dashboard', orgId] });
        },
    });

    // Agrupamento do painel por tipo_evento
    const panelByType = useMemo(() => {
        const map: Record<string, typeof statusPanel> = {};
        statusPanel.forEach(row => {
            if (!map[row.tipo_evento]) map[row.tipo_evento] = [];
            map[row.tipo_evento].push(row);
        });
        return map;
    }, [statusPanel]);

    const refetchAll = () => {
        refetchDash(); refetchAlerts();
        if (mainTab === 'eventos') refetchEvents();
        if (mainTab === 'lotes') refetchBatches();
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-orange-600" />
                        eSocial
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Gerador de eventos S-1xxx/S-2xxx • Lotes • Transmissão</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={refetchAll}
                        className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors" title="Atualizar">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    {mainTab === 'eventos' && (
                        <button onClick={() => setShowCreateEvent(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 transition-colors shadow-lg shadow-orange-900/20">
                            <Plus className="w-4 h-4" /> Gerar evento
                        </button>
                    )}
                    {mainTab === 'lotes' && (
                        <button onClick={() => setShowCreateBatch(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 transition-colors shadow-lg shadow-orange-900/20">
                            <Layers className="w-4 h-4" /> Criar lote
                        </button>
                    )}
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-5 gap-3">
                {[
                    { label: 'Pendentes', value: dashboard?.pendentes ?? '–', icon: Clock, color: 'amber' },
                    { label: 'Erros', value: dashboard?.erros ?? '–', icon: XCircle, color: 'red' },
                    { label: 'Aguardando', value: dashboard?.aguardando ?? '–', icon: Send, color: 'blue' },
                    { label: 'Processados (mês)', value: dashboard?.processados_mes ?? '–', icon: CheckCircle, color: 'emerald' },
                    { label: 'Alertas abertos', value: dashboard?.alertas_abertos ?? '–', icon: Bell, color: 'orange' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                        <div className="flex items-center justify-between mt-2">
                            <span className={`text-2xl font-black ${Number(value) > 0 && (color === 'red' || color === 'orange' || color === 'amber') ? `text-${color}-600` : 'text-slate-900'}`}>{value}</span>
                            <div className={`p-2 bg-${color}-50 rounded-xl`}>
                                <Icon className={`w-4 h-4 text-${color}-600`} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Alertas críticos sempre visíveis */}
            {alerts.filter(a => a.prioridade === 'CRITICA' || a.prioridade === 'ALTA').length > 0 && (
                <div className="space-y-2">
                    {alerts.filter(a => a.prioridade === 'CRITICA' || a.prioridade === 'ALTA').map(alert => {
                        const p = PRIORIDADE_CFG[alert.prioridade];
                        return (
                            <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-2xl border ${p.bg} ${p.border}`}>
                                <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${p.color}`} />
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-black ${p.color}`}>{alert.titulo}</p>
                                    {alert.descricao && <p className="text-xs text-slate-500 mt-0.5">{alert.descricao}</p>}
                                    {alert.prazo && <p className="text-[10px] text-slate-400 mt-0.5">Prazo: {fmt.date(alert.prazo)}</p>}
                                </div>
                                <button onClick={() => resolveAlertMut.mutate(alert.id)}
                                    className="shrink-0 px-3 py-1.5 text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
                                    Resolver
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
                {([
                    ['painel', 'Painel'],
                    ['eventos', 'Eventos'],
                    ['lotes', 'Lotes'],
                    ['configuracao', 'Configuração'],
                ] as [MainTab, string][]).map(([v, label]) => (
                    <button key={v} onClick={() => setMainTab(v)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mainTab === v ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Tab: Painel ── */}
            {mainTab === 'painel' && (
                <div className="space-y-4">
                    {/* Todos os alertas */}
                    {alerts.length > 0 && (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Bell className="w-4 h-4 text-orange-600" /> Pendências ({alerts.length})
                                </h3>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {alerts.map(a => {
                                    const p = PRIORIDADE_CFG[a.prioridade];
                                    return (
                                        <div key={a.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${p.color} ${p.bg}`}>{p.label}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-slate-800">{a.titulo}</p>
                                                <p className="text-xs text-orange-600 font-bold">{a.tipo_evento}</p>
                                            </div>
                                            {a.prazo && <span className="text-xs text-slate-400 shrink-0">{fmt.date(a.prazo)}</span>}
                                            <button onClick={() => resolveAlertMut.mutate(a.id)}
                                                className="shrink-0 p-1.5 hover:bg-emerald-100 rounded-lg transition-colors text-emerald-600" title="Marcar resolvida">
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Painel por tipo de evento */}
                    {Object.keys(panelByType).length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhum evento gerado ainda.</p>
                            <p className="text-xs text-slate-300 mt-1">Gere o primeiro evento na aba Eventos.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Status por Tipo de Evento</h3>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-50">
                                        {['Evento', 'Descrição', 'Grupo', 'Total', 'OK', 'Erros'].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(panelByType).map(([tipo, rows]) => {
                                        const total = rows.reduce((s, r) => s + r.total, 0);
                                        const ok    = rows.reduce((s, r) => s + r.total_ok, 0);
                                        const erros = rows.reduce((s, r) => s + r.total_erros, 0);
                                        const grupo = rows[0]?.grupo;
                                        const catalog = ESOCIAL_EVENTOS_CATALOG[tipo];
                                        const g = grupo ? GRUPO_CFG[grupo] : null;
                                        return (
                                            <tr key={tipo} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3 font-black text-orange-700">{tipo}</td>
                                                <td className="px-4 py-3 text-slate-500 text-xs">{catalog?.desc ?? '–'}</td>
                                                <td className="px-4 py-3">
                                                    {g && <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${g.color} ${g.bg}`}>{g.label}</span>}
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-700">{total}</td>
                                                <td className="px-4 py-3 font-bold text-emerald-600">{ok}</td>
                                                <td className="px-4 py-3">
                                                    {erros > 0
                                                        ? <span className="font-black text-red-600">{erros}</span>
                                                        : <span className="text-slate-300">0</span>}
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

            {/* ── Tab: Eventos ── */}
            {mainTab === 'eventos' && (
                <div className="space-y-4">
                    {/* Filtros */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <select className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-orange-100 transition-all"
                            value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
                            <option value="">Todos os status</option>
                            {(Object.keys(STATUS_CFG) as EsocialStatus[]).map(k => (
                                <option key={k} value={k}>{STATUS_CFG[k].label}</option>
                            ))}
                        </select>
                        <select className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-orange-100 transition-all"
                            value={filterGrupo} onChange={e => setFilterGrupo(e.target.value as any)}>
                            <option value="">Todos os grupos</option>
                            {(Object.keys(GRUPO_CFG) as EsocialGrupo[]).map(k => (
                                <option key={k} value={k}>{GRUPO_CFG[k].label}</option>
                            ))}
                        </select>
                        {(filterStatus || filterGrupo) && (
                            <button onClick={() => { setFilterStatus(''); setFilterGrupo(''); }}
                                className="text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1">
                                <X className="w-3.5 h-3.5" /> Limpar filtros
                            </button>
                        )}
                    </div>

                    {loadEvents ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-orange-600 animate-spin" /></div>
                    ) : events.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhum evento encontrado.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {['Evento', 'Grupo', 'Referência', 'Status', 'Gerado em', 'Ações'].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map(ev => {
                                        const g = GRUPO_CFG[ev.grupo];
                                        const catalog = ESOCIAL_EVENTOS_CATALOG[ev.tipo_evento];
                                        const isExpanded = expandedEvent === ev.id;
                                        const nextStatus: EsocialStatus | null =
                                            ev.status === 'GERADO'     ? 'ASSINADO' :
                                            ev.status === 'ASSINADO'   ? 'AGUARDANDO' :
                                            ev.status === 'AGUARDANDO' ? 'PROCESSADO' : null;

                                        return (
                                            <React.Fragment key={ev.id}>
                                                <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <p className="font-black text-orange-700">{ev.tipo_evento}</p>
                                                        <p className="text-[10px] text-slate-400">{catalog?.desc ?? ''}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${g.color} ${g.bg}`}>{g.label}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                                                        {ev.per_apur || ev.entidade || '–'}
                                                    </td>
                                                    <td className="px-4 py-3"><StatusBadge status={ev.status} /></td>
                                                    <td className="px-4 py-3 text-slate-400 text-xs">{fmt.date(ev.gerado_em)}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            <button onClick={() => setExpandedEvent(isExpanded ? null : ev.id)}
                                                                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="Detalhes">
                                                                <Eye className="w-3.5 h-3.5 text-slate-400" />
                                                            </button>
                                                            {nextStatus && (
                                                                <button
                                                                    onClick={() => advanceStatusMut.mutate({ id: ev.id, status: nextStatus })}
                                                                    disabled={advanceStatusMut.isPending}
                                                                    className="px-2 py-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                                                    title={`Avançar para ${STATUS_CFG[nextStatus].label}`}>
                                                                    → {STATUS_CFG[nextStatus].label}
                                                                </button>
                                                            )}
                                                            {(ev.status === 'GERADO' || ev.status === 'ERRO') && (
                                                                <button onClick={() => { if (confirm('Cancelar evento?')) cancelEventMut.mutate(ev.id); }}
                                                                    className="p-1.5 hover:bg-red-100 rounded-lg transition-colors">
                                                                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* Expand row */}
                                                {isExpanded && (
                                                    <tr className="border-b border-slate-50 bg-slate-50/50">
                                                        <td colSpan={6} className="px-6 py-4">
                                                            <div className="space-y-3">
                                                                <LifecycleBar status={ev.status} />
                                                                <div className="grid grid-cols-3 gap-4 text-xs">
                                                                    {[
                                                                        { label: 'Protocolo', value: ev.protocolo },
                                                                        { label: 'Recibo', value: ev.recibo },
                                                                        { label: 'Transmitido em', value: fmt.dateTime(ev.transmitido_em) },
                                                                        { label: 'Processado em', value: fmt.dateTime(ev.processado_em) },
                                                                        { label: 'Retorno', value: ev.retorno_codigo ? `${ev.retorno_codigo} — ${ev.retorno_descricao}` : undefined },
                                                                        { label: 'Hash XML', value: ev.xml_hash },
                                                                    ].filter(r => r.value).map(({ label, value }) => (
                                                                        <div key={label}>
                                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                                                                            <p className="font-mono text-slate-600 truncate">{value}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                {ev.status === 'ERRO' && ev.retorno_descricao && (
                                                                    <div className="p-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                                                                        {ev.retorno_codigo} — {ev.retorno_descricao}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab: Lotes ── */}
            {mainTab === 'lotes' && (
                <div className="space-y-4">
                    {loadBatches ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-orange-600 animate-spin" /></div>
                    ) : batches.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                            <Layers className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-bold text-slate-400">Nenhum lote criado.</p>
                            <p className="text-xs text-slate-300 mt-1">Crie um lote para agrupar os eventos pendentes e prepará-los para transmissão.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {['Grupo', 'Período', 'Eventos', 'OK', 'Erros', 'Status', 'Protocolo', 'Criado em'].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {batches.map(b => {
                                        const g = GRUPO_CFG[b.grupo];
                                        const sc = BATCH_STATUS_CFG[b.status];
                                        return (
                                            <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${g.color} ${g.bg}`}>{g.label}</span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 text-xs">{b.per_apur || '–'}</td>
                                                <td className="px-4 py-3 font-bold text-slate-700">{b.total_eventos}</td>
                                                <td className="px-4 py-3 font-bold text-emerald-600">{b.eventos_ok}</td>
                                                <td className="px-4 py-3">
                                                    {b.eventos_erro > 0
                                                        ? <span className="font-black text-red-600">{b.eventos_erro}</span>
                                                        : <span className="text-slate-300">0</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${sc.color} ${sc.bg}`}>{sc.label}</span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-xs font-mono">{b.protocolo_envio || '–'}</td>
                                                <td className="px-4 py-3 text-slate-400 text-xs">{fmt.date(b.created_at)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab: Configuração ── */}
            {mainTab === 'configuracao' && <ConfigPanel orgId={orgId} />}

            {/* Modals */}
            {showCreateEvent && (
                <CreateEventModal orgId={orgId} employees={allEmployees}
                    onClose={() => setShowCreateEvent(false)}
                    onSaved={() => {
                        setShowCreateEvent(false);
                        refetchEvents();
                        refetchDash();
                    }} />
            )}
            {showCreateBatch && (
                <CreateBatchModal orgId={orgId}
                    onClose={() => setShowCreateBatch(false)}
                    onSaved={(msg) => {
                        setShowCreateBatch(false);
                        alert(msg);
                        refetchBatches();
                        refetchDash();
                    }} />
            )}
        </div>
    );
};

export default LaborEsocial;
