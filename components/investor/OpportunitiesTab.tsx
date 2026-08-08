import React from 'react';
import { Plus, LayoutDashboard, Table2, Pencil, Trash2, Eye, EyeOff, MapPin, Building2, TrendingUp, Users, BarChart3 } from 'lucide-react';
import {
    InvestorOpportunity, OpportunityStatus,
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUS_COLORS,
    OPPORTUNITY_TYPE_LABELS,
    OpportunityCompetitor,
    investorPortalService,
} from '../../services/investorPortalService';
import { Investor } from '../../services/investorService';
import OpportunityForm from './OpportunityForm';
import OpportunityDetail from './OpportunityDetail';
import InterestsPanel from './InterestsPanel';
import Button from '../ui/Button';
import { useOrgWriteTarget } from '../../hooks/useOrgContext';

interface Props {
    opportunities: InvestorOpportunity[];
    isAdmin: boolean;
    viewMode: 'grid' | 'list';
    organizationId?: string;
    investorProfile?: Investor | null;
    portalToken?: string;
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
    opportunities, isAdmin, viewMode, organizationId, investorProfile, portalToken,
    onViewModeChange, onDelete, onUpdate, openConfirm,
}) => {
    const [detail, setDetail] = React.useState<InvestorOpportunity | null>(null);
    const [editing, setEditing] = React.useState<InvestorOpportunity | null | 'new'>(null);
    const [saving, setSaving] = React.useState(false);
    const [adminTab, setAdminTab] = React.useState<AdminTab>('opportunities');
    const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
    const [createOrgId, setCreateOrgId] = React.useState<string | undefined>(undefined);


    // Em "Todas as organizações" não há org selecionada: editar usa a org da própria
    // oportunidade; criar do zero resolve via effectiveOrganizationId/handleNew.
    const editingOrganizationId =
        organizationId || (editing && editing !== 'new' ? editing.organization_id : createOrgId);

    const handleNew = async () => {
        const target = await resolveWriteOrg('single');
        if (!target || target.kind !== 'org') return;
        const orgId = target.orgId;
        setCreateOrgId(orgId);
        setEditing('new');
    };

    const handleSave = async (
        data: Omit<InvestorOpportunity, 'id' | 'created_at'>,
        competitors: Omit<OpportunityCompetitor, 'id' | 'created_at' | 'opportunity_id'>[]
    ) => {
        if (!editingOrganizationId) return;
        setSaving(true);
        try {
            let saved: InvestorOpportunity;
            if (editing === 'new') {
                saved = await investorPortalService.addOpportunity(data);
                onUpdate(saved);
            } else if (editing && editing.id) {
                saved = await investorPortalService.updateOpportunity(editing.id, data);
                onUpdate(saved);
                if (detail && detail.id === editing.id) {
                    setDetail(saved);
                }
            }

            // Salvar concorrentes
            if (saved! && saved.id) {
                // Remove concorrentes existentes para evitar duplicados ou conflitos
                const existing = await investorPortalService.listCompetitors(saved.id);
                for (const item of existing) {
                    if (item.id) await investorPortalService.deleteCompetitor(item.id);
                }
                // Insere a nova lista de concorrentes
                for (const item of competitors) {
                    await investorPortalService.saveCompetitor({
                        ...item,
                        opportunity_id: saved.id,
                        organization_id: editingOrganizationId,
                    });
                }
            }

            setEditing(null);
            setCreateOrgId(undefined);
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
            if (detail && detail.id === op.id) {
                setDetail(saved);
            }
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
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-button font-bold transition-all ${adminTab === 'opportunities' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                            >
                                <Building2 className="w-3.5 h-3.5" />
                                Oportunidades
                            </button>
                            <button
                                onClick={() => setAdminTab('interests')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-button font-bold transition-all ${adminTab === 'interests' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
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

                {isAdmin && adminTab === 'opportunities' && (
                    <Button
                        variant="primary"
                        onClick={handleNew}
                    >
                        <Plus className="w-4 h-4" />
                        Nova Oportunidade
                    </Button>
                )}
            </div>

            {/* Pipeline executivo */}
            {adminTab === 'opportunities' && opportunities.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#0B1727] rounded-2xl p-5 text-white col-span-2 md:col-span-1">
                        <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-xs font-black text-blue-300 uppercase tracking-widest">VGV Pipeline</span>
                        </div>
                        <p className="text-2xl font-black">{fmtVgv(totalVgv)}</p>
                        <p className="text-xs text-white/40 mt-1">{activeOpps.length} oportunidade{activeOpps.length !== 1 ? 's' : ''} ativas</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-2">
                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Total</span>
                        </div>
                        <p className="text-2xl font-black text-gray-900">{opportunities.length}</p>
                        <p className="text-xs text-gray-400 mt-1">{opportunities.filter(o => o.is_published).length} publicadas</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 col-span-2">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Por status</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {statusCounts.length > 0 ? statusCounts.map(({ status, count }) => (
                                <span key={status} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-bold ${OPPORTUNITY_STATUS_COLORS[status]}`}>
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
            {isAdmin && adminTab === 'interests' && (
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
                            {isAdmin && (
                                <Button
                                    variant="primary"
                                    className="mt-4"
                                    onClick={handleNew}
                                >
                                    Criar primeira oportunidade
                                </Button>
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
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                                    {OPPORTUNITY_STATUS_LABELS[op.status]}
                                                </span>
                                            )}
                                            {op.opportunity_type && (
                                                <span className="px-2.5 py-1 bg-white/10 text-white/60 rounded-full text-xs font-bold">
                                                    {OPPORTUNITY_TYPE_LABELS[op.opportunity_type]}
                                                </span>
                                            )}
                                            {isAdmin && !op.is_published && (
                                                <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-xs font-bold">
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
                                                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-button font-bold rounded-xl transition-all border border-white/10"
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
                        <>
                            <div className="md:hidden space-y-4">
                                {visibleOpportunities.map(op => (
                                    <div key={op.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-black text-gray-900 leading-tight">{op.title}</p>
                                                {op.subtitle && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{op.subtitle}</p>}
                                                {isAdmin && !op.is_published && (
                                                    <span className="inline-flex mt-2 text-xs text-yellow-600 font-bold">Rascunho</span>
                                                )}
                                            </div>
                                            {op.status && (
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                                    {OPPORTUNITY_STATUS_LABELS[op.status]}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">VGV</p>
                                                <p className="font-black text-gray-900">{fmtBRL(op.vgv) ?? '—'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">ROI / TIR</p>
                                                <p className="font-black">
                                                    {op.roi_pct != null && <span className="text-emerald-600">{op.roi_pct.toFixed(1)}%</span>}
                                                    {op.roi_pct != null && op.tir_pct != null && <span className="text-gray-300 mx-1">/</span>}
                                                    {op.tir_pct != null && <span className="text-blue-600">{op.tir_pct.toFixed(1)}%</span>}
                                                    {op.roi_pct == null && op.tir_pct == null && <span className="text-gray-400">—</span>}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-50">
                                            <span className="text-xs font-bold text-gray-400 truncate">
                                                {[op.location_city, op.location_state].filter(Boolean).join(', ') || 'Local não informado'}
                                            </span>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="bg-blue-50 text-blue-600 hover:bg-blue-100"
                                                    onClick={() => setDetail(op)}
                                                >
                                                    Ver
                                                </Button>
                                                {isAdmin && (
                                                    <>
                                                        <button onClick={() => handleTogglePublish(op)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                                                            {op.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                        </button>
                                                        <button onClick={() => setEditing(op)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr className="text-xs font-black text-gray-400 uppercase tracking-widest">
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
                                                        <span className="text-xs text-yellow-600 font-bold mt-0.5">Rascunho</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {op.status && (
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
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
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                        onClick={() => setDetail(op)}
                                                    >
                                                        Ver
                                                    </Button>
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
                        </>
                    )}
                </>
            )}

            {/* Modais */}
            {detail && (
                <OpportunityDetail
                    opportunity={detail}
                    organizationId={organizationId || detail.organization_id}
                    isAdmin={isAdmin}
                    investorProfile={investorProfile}
                    portalToken={portalToken}
                    onClose={() => setDetail(null)}
                />
            )}

            {editing !== null && editingOrganizationId && (
                <OpportunityForm
                    initial={editing === 'new' ? undefined : editing}
                    organizationId={editingOrganizationId}
                    onSave={handleSave}
                    onClose={() => { if (!saving) { setEditing(null); setCreateOrgId(undefined); } }}
                />
            )}

            {orgTargetModal}
        </div>
    );
};

export default OpportunitiesTab;
