import React from 'react';
import { Plus, LayoutDashboard, Table2, Pencil, Trash2, Eye, EyeOff, MapPin, Building2, TrendingUp, Users, BarChart3 } from 'lucide-react';
import {
    InvestorOpportunity, OpportunityStatus,
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUS_COLORS,
    OPPORTUNITY_TYPE_LABELS,
    investorPortalService,
} from '../../services/investorPortalService';
import { Investor } from '../../services/investorService';
import OpportunityForm from './OpportunityForm';
import OpportunityDetail from './OpportunityDetail';
import InterestsPanel from './InterestsPanel';

interface Props {
    opportunities: InvestorOpportunity[];
    isAdmin: boolean;
    viewMode: 'grid' | 'list';
    organizationId?: string;
    investorProfile?: Investor | null;
    onViewModeChange: (mode: 'grid' | 'list') => void;
    onDelete: (id: string) => void;
    onUpdate: (updated: InvestorOpportunity) => void;
    openConfirm: (msg: string, onConfirm: () => void) => void;
}

const fmtBRL = (v: number | null | undefined) => {
    if (v == null) return null;
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
};

type AdminTab = 'opportunities' | 'interests';

const OpportunitiesTab: React.FC<Props> = ({
    opportunities, isAdmin, viewMode, organizationId, investorProfile,
    onViewModeChange, onDelete, onUpdate, openConfirm,
}) => {
    const [detail, setDetail] = React.useState<InvestorOpportunity | null>(null);
    const [editing, setEditing] = React.useState<InvestorOpportunity | null | 'new'>(null);
    const [saving, setSaving] = React.useState(false);
    const [adminTab, setAdminTab] = React.useState<AdminTab>('opportunities');

    const handleSave = async (data: Omit<InvestorOpportunity, 'id' | 'created_at'>) => {
        if (!organizationId) return;
        setSaving(true);
        try {
            if (editing === 'new') {
                const saved = await investorPortalService.addOpportunity(data);
                onUpdate(saved);
            } else if (editing && editing.id) {
                const saved = await investorPortalService.updateOpportunity(editing.id, data);
                onUpdate(saved);
            }
            setEditing(null);
        } catch (err) {
            console.error('Erro ao salvar oportunidade', err);
            alert('Erro ao salvar. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const handleTogglePublish = async (op: InvestorOpportunity) => {
        if (!op.id) return;
        try {
            const saved = await investorPortalService.updateOpportunity(op.id, { is_published: !op.is_published });
            onUpdate(saved);
        } catch (err) {
            console.error('Erro ao publicar', err);
        }
    };

    const visibleOpportunities = isAdmin ? opportunities : opportunities.filter(o => o.is_published);

    // ── Pipeline executivo ────────────────────────────────────────────────────
    const activeOpps = opportunities.filter(o => o.status !== 'encerrada' && o.is_published);
    const totalVgv = activeOpps.reduce((sum, o) => sum + (o.vgv ?? 0), 0);
    const statusCounts = (['estudo','viabilidade','lancamento','captacao'] as OpportunityStatus[])
        .map(s => ({ status: s, count: opportunities.filter(o => o.status === s).length }))
        .filter(x => x.count > 0);
    const fmtVgv = (v: number) => {
        if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
        if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
        return v === 0 ? '—' : `R$ ${v}`;
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-6">
                    <h3 className="text-xl font-bold text-gray-900">Oportunidades</h3>

                    {isAdmin && (
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setAdminTab('opportunities')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${adminTab === 'opportunities' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <Building2 className="w-3.5 h-3.5" />
                                Oportunidades
                            </button>
                            <button
                                onClick={() => setAdminTab('interests')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${adminTab === 'interests' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <Users className="w-3.5 h-3.5" />
                                Interesses
                            </button>
                        </div>
                    )}

                    {adminTab === 'opportunities' && (
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => onViewModeChange('grid')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Grade"
                            >
                                <LayoutDashboard className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => onViewModeChange('list')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Lista"
                            >
                                <Table2 className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>

                {isAdmin && adminTab === 'opportunities' && organizationId && (
                    <button
                        onClick={() => setEditing('new')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Nova Oportunidade
                    </button>
                )}
            </div>

            {/* Pipeline executivo */}
            {adminTab === 'opportunities' && opportunities.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#0B1727] rounded-2xl p-5 text-white col-span-2 md:col-span-1">
                        <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest">VGV Pipeline</span>
                        </div>
                        <p className="text-2xl font-black">{fmtVgv(totalVgv)}</p>
                        <p className="text-xs text-white/40 mt-1">{activeOpps.length} oportunidade{activeOpps.length !== 1 ? 's' : ''} ativas</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-2">
                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total</span>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{opportunities.length}</p>
                        <p className="text-xs text-gray-400 mt-1">{opportunities.filter(o => o.is_published).length} publicadas</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 col-span-2">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Por status</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {statusCounts.length > 0 ? statusCounts.map(({ status, count }) => (
                                <span key={status} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${OPPORTUNITY_STATUS_COLORS[status]}`}>
                                    {OPPORTUNITY_STATUS_LABELS[status]}
                                    <span className="font-black">{count}</span>
                                </span>
                            )) : (
                                <span className="text-xs text-gray-400">Nenhuma ativa</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Painel de interesses (admin) */}
            {isAdmin && adminTab === 'interests' && organizationId && (
                <InterestsPanel
                    organizationId={organizationId}
                    opportunities={opportunities}
                />
            )}

            {/* Lista de oportunidades */}
            {adminTab === 'opportunities' && (
                <>
                    {visibleOpportunities.length === 0 ? (
                        <div className="text-center py-16 bg-gray-50 rounded-2xl">
                            <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                            <p className="text-sm font-bold text-gray-400">
                                {isAdmin ? 'Nenhuma oportunidade cadastrada' : 'Nenhuma oportunidade disponível no momento'}
                            </p>
                            {isAdmin && organizationId && (
                                <button
                                    onClick={() => setEditing('new')}
                                    className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors"
                                >
                                    Criar primeira oportunidade
                                </button>
                            )}
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {visibleOpportunities.map(op => (
                                <div
                                    key={op.id}
                                    className="group bg-[#0B1727] rounded-3xl overflow-hidden relative cursor-pointer hover:scale-[1.01] transition-transform duration-200"
                                    onClick={() => setDetail(op)}
                                >
                                    {/* Thumbnail ou gradiente */}
                                    {op.thumbnail_url ? (
                                        <div className="h-40 overflow-hidden relative">
                                            <img src={op.thumbnail_url} alt={op.title} className="w-full h-full object-cover opacity-60" />
                                            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0B1727]" />
                                        </div>
                                    ) : (
                                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none" />
                                    )}

                                    <div className="relative z-10 p-6 pt-4">
                                        {/* Badges */}
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {op.status && (
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                                    {OPPORTUNITY_STATUS_LABELS[op.status]}
                                                </span>
                                            )}
                                            {op.opportunity_type && (
                                                <span className="px-2.5 py-1 bg-white/10 text-white/60 rounded-full text-[10px] font-bold">
                                                    {OPPORTUNITY_TYPE_LABELS[op.opportunity_type]}
                                                </span>
                                            )}
                                            {isAdmin && !op.is_published && (
                                                <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-[10px] font-bold">
                                                    Rascunho
                                                </span>
                                            )}
                                        </div>

                                        <h4 className="text-xl font-black text-white mb-1 leading-tight">{op.title}</h4>
                                        {op.subtitle && <p className="text-sm text-white/50 mb-4 line-clamp-2">{op.subtitle}</p>}

                                        {/* KPIs inline */}
                                        <div className="flex flex-wrap gap-4 text-xs mb-4">
                                            {op.vgv != null && (
                                                <div>
                                                    <p className="text-white/30 font-bold uppercase tracking-wider text-[9px]">VGV</p>
                                                    <p className="text-white font-black">{fmtBRL(op.vgv)}</p>
                                                </div>
                                            )}
                                            {op.roi_pct != null && (
                                                <div>
                                                    <p className="text-white/30 font-bold uppercase tracking-wider text-[9px]">ROI</p>
                                                    <p className="text-emerald-400 font-black flex items-center gap-1">
                                                        <TrendingUp className="w-3 h-3" />{op.roi_pct.toFixed(1)}%
                                                    </p>
                                                </div>
                                            )}
                                            {op.tir_pct != null && (
                                                <div>
                                                    <p className="text-white/30 font-bold uppercase tracking-wider text-[9px]">TIR</p>
                                                    <p className="text-blue-300 font-black">{op.tir_pct.toFixed(1)}%</p>
                                                </div>
                                            )}
                                            {(op.location_city || op.location_state) && (
                                                <div>
                                                    <p className="text-white/30 font-bold uppercase tracking-wider text-[9px]">Local</p>
                                                    <p className="text-white/70 font-bold flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" />
                                                        {[op.location_city, op.location_state].filter(Boolean).join(', ')}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <button
                                                onClick={e => { e.stopPropagation(); setDetail(op); }}
                                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all border border-white/10"
                                            >
                                                Ver detalhes
                                            </button>

                                            {isAdmin && (
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => handleTogglePublish(op)}
                                                        title={op.is_published ? 'Despublicar' : 'Publicar'}
                                                        className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
                                                    >
                                                        {op.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                    </button>
                                                    <button
                                                        onClick={() => setEditing(op)}
                                                        className="p-2 bg-white/10 hover:bg-blue-600 text-white rounded-lg transition-all"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => openConfirm('Remover esta oportunidade?', () => onDelete(op.id!))}
                                                        className="p-2 bg-white/10 hover:bg-red-600 text-white rounded-lg transition-all"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* Modo lista */
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                        <th className="px-6 py-4">Oportunidade</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">VGV</th>
                                        <th className="px-6 py-4">ROI / TIR</th>
                                        <th className="px-6 py-4">Local</th>
                                        <th className="px-6 py-4 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {visibleOpportunities.map(op => (
                                        <tr key={op.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-gray-900">{op.title}</span>
                                                    {op.subtitle && <span className="text-xs text-gray-500 line-clamp-1">{op.subtitle}</span>}
                                                    {isAdmin && !op.is_published && (
                                                        <span className="text-[10px] text-yellow-600 font-bold mt-0.5">Rascunho</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {op.status && (
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                                        {OPPORTUNITY_STATUS_LABELS[op.status]}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-bold text-gray-800 text-sm">
                                                {fmtBRL(op.vgv) ?? '—'}
                                            </td>
                                            <td className="px-6 py-4 text-sm">
                                                {op.roi_pct != null && (
                                                    <span className="text-emerald-600 font-bold">{op.roi_pct.toFixed(1)}%</span>
                                                )}
                                                {op.roi_pct != null && op.tir_pct != null && <span className="text-gray-300 mx-1">/</span>}
                                                {op.tir_pct != null && (
                                                    <span className="text-blue-600 font-bold">{op.tir_pct.toFixed(1)}%</span>
                                                )}
                                                {op.roi_pct == null && op.tir_pct == null && <span className="text-gray-400">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {[op.location_city, op.location_state].filter(Boolean).join(', ') || '—'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={() => setDetail(op)}
                                                        className="text-xs font-bold text-blue-600 hover:text-blue-700 px-3 py-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                                                    >
                                                        Ver
                                                    </button>
                                                    {isAdmin && (
                                                        <>
                                                            <button
                                                                onClick={() => handleTogglePublish(op)}
                                                                title={op.is_published ? 'Despublicar' : 'Publicar'}
                                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            >
                                                                {op.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                            </button>
                                                            <button
                                                                onClick={() => setEditing(op)}
                                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => openConfirm('Remover esta oportunidade?', () => onDelete(op.id!))}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* Modais */}
            {detail && organizationId && (
                <OpportunityDetail
                    opportunity={detail}
                    organizationId={organizationId}
                    isAdmin={isAdmin}
                    investorProfile={investorProfile}
                    onClose={() => setDetail(null)}
                />
            )}

            {editing !== null && organizationId && (
                <OpportunityForm
                    initial={editing === 'new' ? undefined : editing}
                    organizationId={organizationId}
                    onSave={handleSave}
                    onClose={() => { if (!saving) setEditing(null); }}
                />
            )}
        </div>
    );
};

export default OpportunitiesTab;
