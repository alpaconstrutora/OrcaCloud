import React from 'react';
import { Shield, Plus, AlertTriangle, CheckCircle, Clock, XCircle, Wrench, Star } from 'lucide-react';
import { warrantyService } from '../services/warrantyService';
import { useToast } from '../hooks/useToast';
import type { WarrantyClaim, ClaimState, WarrantyKPIs, ClaimFilters } from '../types/warranty';

// ── Sub-componentes inline ────────────────────────────────────────────────────

const STATE_LABELS: Record<ClaimState, string> = {
    ABERTO:          'Aberto',
    TRIAGEM:         'Em Triagem',
    EM_GARANTIA:     'Em Garantia',
    FORA_GARANTIA:   'Fora de Garantia',
    VISITA_AGENDADA: 'Visita Agendada',
    EM_REPARO:       'Em Reparo',
    CONCLUIDO:       'Concluído',
    CONTESTADO:      'Contestado',
    REABERTO:        'Reaberto',
    ENCERRADO:       'Encerrado',
};

const STATE_COLORS: Record<ClaimState, string> = {
    ABERTO:          'bg-blue-100 text-blue-700',
    TRIAGEM:         'bg-yellow-100 text-yellow-700',
    EM_GARANTIA:     'bg-green-100 text-green-700',
    FORA_GARANTIA:   'bg-red-100 text-red-700',
    VISITA_AGENDADA: 'bg-purple-100 text-purple-700',
    EM_REPARO:       'bg-orange-100 text-orange-700',
    CONCLUIDO:       'bg-teal-100 text-teal-700',
    CONTESTADO:      'bg-pink-100 text-pink-700',
    REABERTO:        'bg-amber-100 text-amber-700',
    ENCERRADO:       'bg-gray-100 text-gray-500',
};

const SEVERITY_COLORS: Record<string, string> = {
    baixa:   'bg-green-50 text-green-600',
    media:   'bg-yellow-50 text-yellow-600',
    alta:    'bg-orange-50 text-orange-600',
    critica: 'bg-red-50 text-red-700',
};

function KPICard({ label, value, sub, icon: Icon, color }: {
    label: string; value: string | number; sub?: string;
    icon: React.ElementType; color: string;
}) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-2xl font-black text-gray-900 mt-0.5">{value}</p>
                {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

function ClaimRow({ claim, onSelect, projects }: { claim: WarrantyClaim; onSelect: (c: WarrantyClaim) => void; projects: ProjectOption[] }) {
    const obraName = claim.project_id ? projects.find(p => p.id === claim.project_id)?.name : null;
    const today = new Date().toISOString().slice(0, 10);
    const slaVencido = claim.sla_deadline && claim.sla_deadline < today && !['ENCERRADO', 'FORA_GARANTIA'].includes(claim.state);

    return (
        <tr
            className="hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={() => onSelect(claim)}
        >
            <td className="px-4 py-3">
                <p className="font-semibold text-sm text-gray-900 truncate max-w-[220px]">{claim.sistema_descricao}</p>
                <p className="text-xs text-gray-400 truncate max-w-[220px]">
                    {obraName && <span className="text-blue-500 font-semibold">{obraName} · </span>}
                    {claim.client_name || '—'} · {claim.unidade_ref || '—'}
                </p>
            </td>
            <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATE_COLORS[claim.state]}`}>
                    {STATE_LABELS[claim.state]}
                </span>
            </td>
            <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${SEVERITY_COLORS[claim.severity]}`}>
                    {claim.severity}
                </span>
            </td>
            <td className="px-4 py-3 text-xs text-gray-500">
                {claim.sla_deadline ? (
                    <span className={slaVencido ? 'text-red-600 font-semibold' : ''}>
                        {new Date(claim.sla_deadline + 'T00:00:00').toLocaleDateString('pt-BR')}
                        {slaVencido && ' ⚠'}
                    </span>
                ) : '—'}
            </td>
            <td className="px-4 py-3 text-xs text-gray-400">
                {new Date(claim.created_at).toLocaleDateString('pt-BR')}
            </td>
        </tr>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface ProjectOption { id: string; name: string; }

interface WarrantyModuleProps {
    activeOrganizationId?: string;
    projects?: ProjectOption[];
    onOpenClaim?: () => void;
}

const WarrantyModule: React.FC<WarrantyModuleProps> = ({ activeOrganizationId, projects = [], onOpenClaim }) => {
    const { showToast } = useToast();

    const [claims, setClaims]     = React.useState<WarrantyClaim[]>([]);
    const [kpis, setKpis]         = React.useState<WarrantyKPIs | null>(null);
    const [loading, setLoading]   = React.useState(true);
    const [selected, setSelected] = React.useState<WarrantyClaim | null>(null);
    const [showModal, setShowModal] = React.useState(false);
    const [filterState, setFilterState] = React.useState<ClaimState | ''>('');

    const load = React.useCallback(async () => {
        if (!activeOrganizationId) return;
        setLoading(true);
        try {
            const filters: ClaimFilters = { organization_id: activeOrganizationId };
            if (filterState) filters.state = [filterState as ClaimState];
            const [cls, kpiData] = await Promise.all([
                warrantyService.list(filters),
                warrantyService.getKPIs(activeOrganizationId),
            ]);
            setClaims(cls);
            setKpis(kpiData);
        } catch (e: unknown) {
            showToast('Erro ao carregar chamados de garantia', 'error');
            console.error('[WarrantyModule]', e);
        } finally {
            setLoading(false);
        }
    }, [activeOrganizationId, filterState, showToast]);

    React.useEffect(() => { load(); }, [load]);

    if (!activeOrganizationId) {
        return (
            <div className="flex items-center justify-center h-64 text-sm text-gray-400">
                Selecione uma organização para acessar o módulo de Pós-Obra.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pós-Obra & Garantia</h1>
                    <p className="text-gray-400 text-sm mt-1 font-medium">
                        Gestão de chamados de assistência técnica e controle de prazos NBR 17170.
                    </p>
                </div>
                <button
                    onClick={() => { setShowModal(true); onOpenClaim?.(); }}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    Abrir Chamado
                </button>
            </div>

            {/* KPIs */}
            {kpis && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    <KPICard label="Em Aberto"      value={kpis.total_abertos}   icon={AlertTriangle} color="bg-blue-50 text-blue-600" />
                    <KPICard label="Em Garantia"    value={kpis.em_garantia}     icon={CheckCircle}   color="bg-green-50 text-green-600" />
                    <KPICard label="Fora Garantia"  value={kpis.fora_garantia}   icon={XCircle}       color="bg-red-50 text-red-600" />
                    <KPICard label="Enc. no Mês"    value={kpis.encerrados_mes}  icon={Wrench}        color="bg-teal-50 text-teal-600" />
                    <KPICard label="NPS Médio"      value={kpis.nps_medio !== null ? kpis.nps_medio.toFixed(1) : '—'} icon={Star} color="bg-yellow-50 text-yellow-600" />
                    <KPICard label="SLA Vencidos"   value={kpis.sla_vencidos}    icon={Clock}         color={kpis.sla_vencidos > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'} />
                    <KPICard label="Custo/Mês"      value={`R$ ${kpis.custo_total_mes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} icon={Shield} color="bg-orange-50 text-orange-600" />
                </div>
            )}

            {/* Filtros */}
            <div className="flex gap-2 flex-wrap">
                {(['', 'ABERTO', 'TRIAGEM', 'EM_GARANTIA', 'VISITA_AGENDADA', 'EM_REPARO', 'ENCERRADO'] as const).map(s => (
                    <button
                        key={s}
                        onClick={() => setFilterState(s)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                            filterState === s
                                ? 'bg-blue-600 text-white shadow'
                                : 'bg-white border border-gray-200 text-gray-500 hover:border-blue-300'
                        }`}
                    >
                        {s === '' ? 'Todos' : STATE_LABELS[s as ClaimState]}
                    </button>
                ))}
            </div>

            {/* Tabela */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-32 text-sm text-gray-400">Carregando...</div>
                ) : claims.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-2">
                        <Shield className="w-10 h-10 text-gray-200" />
                        <p className="text-sm text-gray-400 font-medium">Nenhum chamado de garantia encontrado.</p>
                        <button onClick={() => setShowModal(true)} className="text-xs text-blue-600 font-semibold hover:underline">
                            Abrir primeiro chamado
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/50">
                                    <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Chamado</th>
                                    <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Estado</th>
                                    <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Severidade</th>
                                    <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">SLA</th>
                                    <th className="px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-wider">Abertura</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {claims.map(c => (
                                    <ClaimRow key={c.id} claim={c} onSelect={setSelected} projects={projects} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal novo chamado */}
            {showModal && (
                <WarrantyClaimModal
                    organizationId={activeOrganizationId}
                    projects={projects}
                    onClose={() => setShowModal(false)}
                    onSaved={() => { setShowModal(false); load(); }}
                />
            )}

            {/* Detalhe do chamado */}
            {selected && (
                <WarrantyClaimDetail
                    claim={selected}
                    organizationId={activeOrganizationId}
                    projects={projects}
                    onClose={() => setSelected(null)}
                    onRefresh={() => { load(); setSelected(null); }}
                />
            )}
        </div>
    );
};

// ── Modal: Abrir Chamado ──────────────────────────────────────────────────────

interface WarrantyClaimModalProps {
    organizationId: string;
    projects?: ProjectOption[];
    initialClaimId?: string;
    onClose: () => void;
    onSaved: () => void;
}

export function WarrantyClaimModal({
    organizationId, projects = [], onClose, onSaved,
}: WarrantyClaimModalProps) {
    const { showToast } = useToast();
    const [terms, setTerms] = React.useState<import('../types/warranty').WarrantyTerm[]>([]);
    const [submitting, setSubmitting] = React.useState(false);
    const [form, setForm] = React.useState({
        project_id: '',
        sistema_descricao: '',
        local_afetado: '',
        descricao: '',
        severity: 'media' as const,
        warranty_term_code: '',
        client_name: '',
        unidade_ref: '',
    });

    React.useEffect(() => {
        warrantyService.getTerms().then(setTerms).catch(console.error);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        if (!form.sistema_descricao || !form.descricao) {
            showToast('Preencha o sistema afetado e a descrição', 'error');
            return;
        }
        setSubmitting(true);
        try {
            await warrantyService.open({
                organization_id:    organizationId,
                project_id:         form.project_id || undefined,
                sistema_descricao:  form.sistema_descricao,
                local_afetado:      form.local_afetado || undefined,
                descricao:          form.descricao,
                severity:           form.severity,
                warranty_term_code: form.warranty_term_code || undefined,
                client_name:        form.client_name || undefined,
                unidade_ref:        form.unidade_ref || undefined,
                opened_by:          { actorId: 'system', actorType: 'user', name: 'Usuário' },
            });
            showToast('Chamado aberto com sucesso', 'success');
            onSaved();
        } catch (e: unknown) {
            showToast('Erro ao abrir chamado', 'error');
            console.error('[WarrantyModal]', e);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-black text-gray-900">Abrir Chamado de Garantia</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1">Obra</label>
                            <select
                                value={form.project_id}
                                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                            >
                                <option value="">Selecionar obra...</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1">Sistema afetado *</label>
                            <input
                                value={form.sistema_descricao}
                                onChange={e => setForm(f => ({ ...f, sistema_descricao: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                placeholder="Ex: Impermeabilização da laje de cobertura"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Prazo de garantia</label>
                            <select
                                value={form.warranty_term_code}
                                onChange={e => setForm(f => ({ ...f, warranty_term_code: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                            >
                                <option value="">Selecionar...</option>
                                {terms.map(t => (
                                    <option key={t.code} value={t.code}>{t.descricao} ({t.prazo_meses} m)</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Severidade</label>
                            <select
                                value={form.severity}
                                onChange={e => setForm(f => ({ ...f, severity: e.target.value as typeof f.severity }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                            >
                                <option value="baixa">Baixa</option>
                                <option value="media">Média</option>
                                <option value="alta">Alta</option>
                                <option value="critica">Crítica</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Local / Cômodo</label>
                            <input
                                value={form.local_afetado}
                                onChange={e => setForm(f => ({ ...f, local_afetado: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                placeholder="Ex: Banheiro suíte"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Unidade / Apt</label>
                            <input
                                value={form.unidade_ref}
                                onChange={e => setForm(f => ({ ...f, unidade_ref: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                placeholder="Ex: Apt 302 Torre A"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1">Nome do cliente</label>
                            <input
                                value={form.client_name}
                                onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                                placeholder="Nome do proprietário/cliente"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1">Descrição do problema *</label>
                            <textarea
                                value={form.descricao}
                                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                                rows={4}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
                                placeholder="Descreva detalhadamente o problema relatado..."
                                required
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all disabled:opacity-60"
                        >
                            {submitting ? 'Abrindo...' : 'Abrir Chamado'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ── Detalhe do Chamado ────────────────────────────────────────────────────────

interface WarrantyClaimDetailProps {
    claim: WarrantyClaim;
    organizationId: string;
    projects?: ProjectOption[];
    onClose: () => void;
    onRefresh: () => void;
}

export const WarrantyClaimDetail: React.FC<WarrantyClaimDetailProps> = ({
    claim, organizationId, projects = [], onClose, onRefresh,
}) => {
    const obraName = claim.project_id ? projects.find(p => p.id === claim.project_id)?.name : null;
    const { showToast } = useToast();
    const [events, setEvents] = React.useState<import('../types/warranty').WarrantyClaimEvent[]>([]);
    const [visits, setVisits] = React.useState<import('../types/warranty').WarrantyClaimVisit[]>([]);
    const [tab, setTab] = React.useState<'info' | 'visitas' | 'historico'>('info');
    const [triaging, setTriaging] = React.useState(false);
    const [closing, setClosing] = React.useState(false);
    const [npsNota, setNpsNota] = React.useState<number | ''>('');

    React.useEffect(() => {
        warrantyService.getEvents(claim.id).then(setEvents).catch(console.error);
        if (claim.visits) setVisits(claim.visits);
    }, [claim]);

    const handleTriage = async (inWarranty: boolean) => {
        if (triaging) return;
        setTriaging(true);
        try {
            const today = new Date();
            const term = claim.warranty_term;
            let expires: string | undefined;
            if (inWarranty && term) {
                const exp = new Date(today);
                exp.setMonth(exp.getMonth() + term.prazo_meses);
                expires = exp.toISOString().slice(0, 10);
            }
            const sla = new Date(today);
            sla.setDate(sla.getDate() + (claim.severity === 'critica' ? 2 : claim.severity === 'alta' ? 5 : 15));

            await warrantyService.triage({
                claim_id: claim.id,
                organization_id: organizationId,
                expected_version: claim.version,
                in_warranty: inWarranty,
                warranty_expires_at: expires,
                sla_deadline: sla.toISOString().slice(0, 10),
                fora_garantia_motivo: inWarranty ? undefined : 'Prazo de garantia expirado',
                triaged_by: { actorId: 'system', actorType: 'user', name: 'Usuário' },
            });
            showToast(inWarranty ? 'Chamado em garantia' : 'Chamado fora de garantia', 'success');
            onRefresh();
        } catch (e: unknown) {
            showToast('Erro na triagem', 'error');
            console.error('[Triage]', e);
        } finally {
            setTriaging(false);
        }
    };

    const handleClose = async () => {
        if (closing || npsNota === '') return;
        setClosing(true);
        try {
            await warrantyService.close({
                claim_id: claim.id,
                organization_id: organizationId,
                expected_version: claim.version,
                nps_nota: Number(npsNota),
                closed_by: { actorId: 'system', actorType: 'user', name: 'Usuário' },
            });
            showToast('Chamado encerrado', 'success');
            onRefresh();
        } catch (e: unknown) {
            showToast('Erro ao encerrar chamado', 'error');
            console.error('[CloseWarranty]', e);
        } finally {
            setClosing(false);
        }
    };

    const EVENT_LABELS: Record<string, string> = {
        ClaimOpened:   'Chamado aberto',
        ClaimTriaged:  'Triagem realizada',
        VisitScheduled:'Visita agendada',
        ClaimClosed:   'Chamado encerrado',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white w-full md:max-w-2xl md:rounded-2xl shadow-2xl max-h-[95vh] flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATE_COLORS[claim.state]}`}>
                                {STATE_LABELS[claim.state]}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${SEVERITY_COLORS[claim.severity]}`}>
                                {claim.severity}
                            </span>
                        </div>
                        <h2 className="text-base font-black text-gray-900 mt-1 truncate">{claim.sistema_descricao}</h2>
                        <p className="text-xs text-gray-400">{claim.client_name || 'Cliente não informado'} · {claim.unidade_ref || '—'}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex-shrink-0 transition-colors">✕</button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-6 pt-3 border-b border-gray-100">
                    {(['info', 'visitas', 'historico'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-colors capitalize ${
                                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            {t === 'historico' ? 'Histórico' : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {tab === 'info' && (
                        <>
                            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                                {obraName && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 font-medium">Obra</span>
                                        <span className="text-blue-600 font-semibold">{obraName}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">Local afetado</span>
                                    <span className="text-gray-900 font-semibold">{claim.local_afetado || '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">Garantia expira</span>
                                    <span className="text-gray-900 font-semibold">
                                        {claim.warranty_expires_at
                                            ? new Date(claim.warranty_expires_at + 'T00:00:00').toLocaleDateString('pt-BR')
                                            : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500 font-medium">SLA</span>
                                    <span className="text-gray-900 font-semibold">
                                        {claim.sla_deadline
                                            ? new Date(claim.sla_deadline + 'T00:00:00').toLocaleDateString('pt-BR')
                                            : '—'}
                                    </span>
                                </div>
                                {claim.responsible_party && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 font-medium">Responsabilidade</span>
                                        <span className="text-gray-900 font-semibold capitalize">{claim.responsible_party.replace('_', ' ')}</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descrição do problema</p>
                                <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 whitespace-pre-wrap">{claim.descricao}</p>
                            </div>

                            {/* Ações contextuais */}
                            {claim.state === 'ABERTO' && (
                                <div className="border border-blue-100 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Triagem</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleTriage(true)}
                                            disabled={triaging}
                                            className="flex-1 py-2 bg-green-600 text-white rounded-xl text-xs font-black hover:bg-green-700 transition-all disabled:opacity-60"
                                        >
                                            ✓ Em Garantia
                                        </button>
                                        <button
                                            onClick={() => handleTriage(false)}
                                            disabled={triaging}
                                            className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-black hover:bg-red-700 transition-all disabled:opacity-60"
                                        >
                                            ✗ Fora de Garantia
                                        </button>
                                    </div>
                                </div>
                            )}

                            {['EM_REPARO', 'CONCLUIDO'].includes(claim.state) && (
                                <div className="border border-teal-100 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-bold text-teal-700 uppercase tracking-wider">Encerrar Chamado</p>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 block mb-1">Nota NPS do cliente (0-10)</label>
                                        <input
                                            type="number" min={0} max={10}
                                            value={npsNota}
                                            onChange={e => setNpsNota(e.target.value === '' ? '' : Number(e.target.value))}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                                        />
                                    </div>
                                    <button
                                        onClick={handleClose}
                                        disabled={closing || npsNota === ''}
                                        className="w-full py-2 bg-teal-600 text-white rounded-xl text-xs font-black hover:bg-teal-700 transition-all disabled:opacity-60"
                                    >
                                        {closing ? 'Encerrando...' : 'Encerrar Chamado'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {tab === 'visitas' && (
                        <div className="space-y-3">
                            {visits.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">Nenhuma visita registrada.</p>
                            ) : visits.map(v => (
                                <div key={v.id} className="bg-gray-50 rounded-xl p-4 text-sm">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-bold text-gray-900">{v.technician_name}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                            v.status === 'REALIZADA' ? 'bg-green-100 text-green-700' :
                                            v.status === 'CANCELADA' ? 'bg-red-100 text-red-700' :
                                            'bg-blue-100 text-blue-700'
                                        }`}>{v.status}</span>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {new Date(v.scheduled_at).toLocaleString('pt-BR')}
                                    </p>
                                    {v.diagnostico && (
                                        <p className="text-xs text-gray-700 mt-2 bg-white rounded-lg p-2">{v.diagnostico}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'historico' && (
                        <div className="space-y-2">
                            {events.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">Sem eventos.</p>
                            ) : events.map(ev => (
                                <div key={ev.event_id} className="flex items-start gap-3 text-sm">
                                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                                    <div>
                                        <span className="font-semibold text-gray-900">
                                            {EVENT_LABELS[ev.event_type] || ev.event_type}
                                        </span>
                                        <span className="text-gray-400 text-xs ml-2">
                                            {new Date(ev.occurred_at).toLocaleString('pt-BR')}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WarrantyModule;
