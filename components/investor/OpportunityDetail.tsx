import React from 'react';
import {
    X, MapPin, TrendingUp, BarChart3, Ruler, Calendar,
    Building2, CheckCircle2, ChevronRight, Handshake, Users, Clock,
} from 'lucide-react';
import {
    InvestorOpportunity, InterestRole, OpportunityInterest,
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUS_COLORS,
    OPPORTUNITY_TYPE_LABELS, INTEREST_ROLE_LABELS, INTEREST_STAGE_LABELS,
    investorPortalService,
} from '../../services/investorPortalService';
import { Investor } from '../../services/investorService';
import ScenarioComparison from './ScenarioComparison';
import LinkedProjectPanel from './LinkedProjectPanel';
import DataRoomPanel from './DataRoomPanel';
import OpportunityPhotosPanel from './OpportunityPhotosPanel';
import { fmtBRL, fmtPct, fmtM2 } from '../../utils/format';

interface Props {
    opportunity: InvestorOpportunity;
    organizationId: string;
    isAdmin?: boolean;
    uploadedBy?: string;
    investorProfile?: Investor | null;
    onClose: () => void;
}


const ROLES: InterestRole[] = ['investidor', 'arquiteto', 'engenheiro', 'projetista', 'consultor', 'outro'];

type PitchTab = 'pitch' | 'cenarios' | 'obra' | 'fotos' | 'documentos' | 'interesses';
type FormStep = 'view' | 'form' | 'success';

const OpportunityDetail: React.FC<Props> = ({ opportunity: op, organizationId, isAdmin = false, uploadedBy, investorProfile, onClose }) => {
    const [formStep, setFormStep] = React.useState<FormStep>('view');
    const [pitchTab, setPitchTab] = React.useState<PitchTab>('pitch');
    const [saving, setSaving] = React.useState(false);
    const [interests, setInterests] = React.useState<OpportunityInterest[]>([]);
    const [loadingInterests, setLoadingInterests] = React.useState(false);
    const [interest, setInterest] = React.useState({
        contact_name: investorProfile?.name ?? '',
        contact_email: investorProfile?.email ?? '',
        contact_phone: investorProfile?.phone ?? '',
        role: 'investidor' as InterestRole,
        message: '',
    });

    const loadInterests = React.useCallback(() => {
        if (!op.id) return;
        setLoadingInterests(true);
        investorPortalService.listInterests(organizationId, op.id)
            .then(setInterests)
            .catch(err => console.error('Erro ao carregar interesses', err))
            .finally(() => setLoadingInterests(false));
    }, [organizationId, op.id]);

    React.useEffect(() => {
        if (pitchTab === 'interesses' && isAdmin) loadInterests();
    }, [pitchTab, isAdmin, loadInterests]);

    const handleInterestSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!interest.contact_name.trim()) return;
        setSaving(true);
        try {
            await investorPortalService.addInterest({
                organization_id: organizationId,
                opportunity_id: op.id!,
                ...interest,
            });
            setFormStep('success');
        } catch (err) {
            console.error('Erro ao registrar interesse', err);
            alert('Erro ao registrar interesse. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const hasFinancials = op.vgv || op.roi_pct != null || op.tir_pct != null || op.cost_estimate;
    const hasScenarios = (op.vgv && op.cost_estimate);

    // ── Analytics de interesses ──────────────────────────────────
    const interestsByRole = ROLES.reduce<Record<string, number>>((acc, r) => {
        acc[r] = interests.filter(i => i.role === r).length;
        return acc;
    }, {});
    const interestsByStage = (['lead','interesse','reuniao','proposta','negociacao','fechado'] as const)
        .reduce<Record<string, number>>((acc, s) => {
            acc[s] = interests.filter(i => (i.stage ?? 'lead') === s).length;
            return acc;
        }, {});

    const hasLinkedProject = !!op.project_id;

    const ADMIN_TABS: { id: PitchTab; label: string }[] = [
        { id: 'pitch', label: 'Detalhes' },
        { id: 'cenarios', label: 'Cenários' },
        ...(hasLinkedProject ? [{ id: 'obra' as PitchTab, label: 'Obra' }] : []),
        { id: 'fotos', label: 'Fotos' },
        { id: 'documentos', label: 'Documentos' },
        { id: 'interesses', label: `Interesses (${interests.length || '…'})` },
    ];
    const PUBLIC_TABS: { id: PitchTab; label: string }[] = [
        { id: 'pitch', label: 'Detalhes' },
        ...(hasScenarios ? [{ id: 'cenarios' as PitchTab, label: 'Viabilidade' }] : []),
        ...(hasLinkedProject ? [{ id: 'obra' as PitchTab, label: 'Obra ao Vivo' }] : []),
        { id: 'fotos', label: 'Fotos' },
        { id: 'documentos', label: 'Documentos' },
    ];
    const tabs = isAdmin ? ADMIN_TABS : PUBLIC_TABS;

    return (
        <div className="fixed inset-0 z-[60] bg-gray-50 overflow-y-auto">

            {/* ── Header escuro: navbar + hero + título ── */}
            <div className="bg-[#0B1727] text-white">
                {/* navbar */}
                <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 text-sm font-bold text-white/60 hover:text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                        Voltar
                    </button>
                    <span className="text-sm text-white/40 truncate flex-1 hidden sm:block">{op.title}</span>
                </div>

                {/* hero image (se existir) */}
                {op.thumbnail_url && (
                    <div className="relative h-56 sm:h-72 overflow-hidden">
                        <img src={op.thumbnail_url} alt={op.title} className="w-full h-full object-cover opacity-60" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1727] via-[#0B1727]/40 to-transparent" />
                    </div>
                )}

                {/* título + metadata */}
                <div className="max-w-5xl mx-auto px-6 pb-8 pt-6">
                    <div className="flex flex-wrap items-start gap-3 mb-3">
                        {op.status && (
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                {OPPORTUNITY_STATUS_LABELS[op.status]}
                            </span>
                        )}
                        {op.opportunity_type && (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/10 text-white/70">
                                {OPPORTUNITY_TYPE_LABELS[op.opportunity_type]}
                            </span>
                        )}
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black leading-tight">{op.title}</h1>
                    {op.subtitle && <p className="text-white/60 mt-2 text-base">{op.subtitle}</p>}
                    <div className="flex flex-wrap gap-5 mt-4 text-sm text-white/50">
                        {(op.location_city || op.location_state) && (
                            <span className="flex items-center gap-1.5">
                                <MapPin className="w-4 h-4" />
                                {[op.location_city, op.location_state].filter(Boolean).join(', ')}
                            </span>
                        )}
                        {op.expected_start && (
                            <span className="flex items-center gap-1.5">
                                <Calendar className="w-4 h-4" />
                                Início: {new Date(op.expected_start + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                            </span>
                        )}
                        {op.duration_months && (
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-4 h-4" />
                                {op.duration_months} meses
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Corpo (fundo cinza) ── */}
            <div className="max-w-5xl mx-auto px-6 py-8">

                {formStep === 'view' && (
                    <>
                        {/* KPIs — 3 colunas compactas */}
                        {hasFinancials && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
                                {op.vgv != null && (
                                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 col-span-2 sm:col-span-1">
                                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider mb-1">VGV</p>
                                        <p className="text-lg font-black text-blue-900 leading-none">{fmtBRL(op.vgv)}</p>
                                    </div>
                                )}
                                {op.roi_pct != null && (
                                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3"/>ROI</p>
                                        <p className="text-lg font-black text-emerald-700 leading-none">{fmtPct(op.roi_pct)}</p>
                                    </div>
                                )}
                                {op.tir_pct != null && (
                                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                                        <p className="text-[9px] font-black text-indigo-600 uppercase tracking-wider mb-1">TIR</p>
                                        <p className="text-lg font-black text-indigo-700 leading-none">{fmtPct(op.tir_pct)}</p>
                                    </div>
                                )}
                                {op.cost_estimate != null && (
                                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                                        <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider mb-1">Custo</p>
                                        <p className="text-lg font-black text-amber-800 leading-none">{fmtBRL(op.cost_estimate)}</p>
                                    </div>
                                )}
                                {op.cost_per_m2 != null && (
                                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Custo/m²</p>
                                        <p className="text-lg font-black text-gray-700 leading-none">{fmtBRL(op.cost_per_m2)}</p>
                                    </div>
                                )}
                                {op.ticket_min != null && (
                                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Ticket mín.</p>
                                        <p className="text-lg font-black text-gray-700 leading-none">{fmtBRL(op.ticket_min)}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Card principal com tabs */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                            {/* Tabs */}
                            {tabs.length > 1 && (
                                <div className="flex gap-0 border-b border-gray-100 px-2">
                                    {tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setPitchTab(tab.id)}
                                            className={`px-5 py-4 text-sm font-bold transition-all border-b-2 -mb-px ${pitchTab === tab.id
                                                ? 'text-blue-600 border-blue-600'
                                                : 'text-gray-400 border-transparent hover:text-gray-600'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="p-6 sm:p-8">
                                {/* ── ABA: Detalhes ── */}
                                {pitchTab === 'pitch' && (
                                    <div className="space-y-8">
                                        {(op.land_area_m2 || op.built_area_m2 || op.floors) && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <Ruler className="w-4 h-4 text-blue-600" />
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Dados técnicos</span>
                                                </div>
                                                <div className="flex flex-wrap gap-8">
                                                    {op.land_area_m2 && (
                                                        <div>
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Terreno</p>
                                                            <p className="text-xl font-black text-gray-800 mt-0.5">{fmtM2(op.land_area_m2)}</p>
                                                        </div>
                                                    )}
                                                    {op.built_area_m2 && (
                                                        <div>
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Área construída</p>
                                                            <p className="text-xl font-black text-gray-800 mt-0.5">{fmtM2(op.built_area_m2)}</p>
                                                        </div>
                                                    )}
                                                    {op.floors && (
                                                        <div>
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Pavimentos</p>
                                                            <p className="text-xl font-black text-gray-800 mt-0.5">{op.floors}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setFormStep('form')}
                                            className="flex items-center gap-2 px-8 py-4 bg-[#0B1727] hover:bg-blue-900 text-white font-bold rounded-2xl transition-all shadow-xl text-sm"
                                        >
                                            <Handshake className="w-4 h-4" />
                                            Manifestar Interesse
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}

                                {/* ── ABA: Cenários ── */}
                                {pitchTab === 'cenarios' && (
                                    <div className="space-y-6">
                                        <ScenarioComparison opportunity={op} />
                                        <button
                                            onClick={() => setFormStep('form')}
                                            className="flex items-center gap-2 px-8 py-4 bg-[#0B1727] hover:bg-blue-900 text-white font-bold rounded-2xl transition-all shadow-xl text-sm"
                                        >
                                            <Handshake className="w-4 h-4" />
                                            Manifestar Interesse
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}

                                {/* ── ABA: Obra ao Vivo ── */}
                                {pitchTab === 'obra' && hasLinkedProject && (
                                    <div className="space-y-6">
                                        <LinkedProjectPanel
                                            projectId={op.project_id!}
                                            organizationId={organizationId}
                                            costEstimate={op.cost_estimate}
                                        />
                                        <button
                                            onClick={() => setFormStep('form')}
                                            className="flex items-center gap-2 px-8 py-4 bg-[#0B1727] hover:bg-blue-900 text-white font-bold rounded-2xl transition-all shadow-xl text-sm"
                                        >
                                            <Handshake className="w-4 h-4" />
                                            Manifestar Interesse
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}

                                {/* ── ABA: Fotos ── */}
                                {pitchTab === 'fotos' && (
                                    <OpportunityPhotosPanel
                                        opportunityId={op.id!}
                                        organizationId={organizationId}
                                        isAdmin={isAdmin}
                                        uploadedBy={uploadedBy}
                                    />
                                )}

                                {/* ── ABA: Documentos ── */}
                                {pitchTab === 'documentos' && (
                                    <DataRoomPanel
                                        opportunityId={op.id!}
                                        organizationId={organizationId}
                                        isAdmin={isAdmin}
                                        uploadedBy={uploadedBy}
                                    />
                                )}

                                {/* ── ABA: Interesses (admin) ── */}
                                {pitchTab === 'interesses' && isAdmin && (
                                    <div className="space-y-6">
                                        {loadingInterests ? (
                                            <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
                                        ) : interests.length === 0 ? (
                                            <div className="text-center py-12 bg-gray-50 rounded-2xl">
                                                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                                <p className="text-sm font-bold text-gray-400">Nenhum interesse recebido ainda</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Funil de conversão</p>
                                                    <div className="space-y-2">
                                                        {(['lead','interesse','reuniao','proposta','negociacao','fechado'] as const).map(s => {
                                                            const count = interestsByStage[s] ?? 0;
                                                            const pct = interests.length > 0 ? (count / interests.length) * 100 : 0;
                                                            return (
                                                                <div key={s} className="flex items-center gap-3">
                                                                    <span className="text-xs text-gray-500 w-24 font-medium">{INTEREST_STAGE_LABELS[s]}</span>
                                                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                                                                    </div>
                                                                    <span className="text-xs font-bold text-gray-700 w-6 text-right">{count}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Perfil dos interessados</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {ROLES.filter(r => (interestsByRole[r] ?? 0) > 0).map(r => (
                                                            <div key={r} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-xl">
                                                                <span className="text-xs font-bold text-gray-700">{INTEREST_ROLE_LABELS[r]}</span>
                                                                <span className="text-xs font-black text-blue-600">{interestsByRole[r]}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Mais recentes</p>
                                                    <div className="space-y-2">
                                                        {interests.slice(0, 6).map(i => (
                                                            <div key={i.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                                                <div>
                                                                    <span className="text-sm font-bold text-gray-800">{i.contact_name}</span>
                                                                    <span className="ml-2 text-xs text-gray-400">{INTEREST_ROLE_LABELS[i.role]}</span>
                                                                </div>
                                                                <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">
                                                                    {INTEREST_STAGE_LABELS[i.stage ?? 'lead']}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* ── Formulário de interesse ── */}
                {formStep === 'form' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 max-w-lg">
                        <button onClick={() => setFormStep('view')} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-5">
                            ← Voltar
                        </button>
                        <h3 className="text-2xl font-black text-gray-900 mb-1">Manifestar Interesse</h3>
                        <p className="text-sm text-gray-500 mb-6">{op.title}</p>
                        <form onSubmit={handleInterestSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Nome completo *</label>
                                <input
                                    type="text" required
                                    value={interest.contact_name}
                                    onChange={e => setInterest(p => ({ ...p, contact_name: e.target.value }))}
                                    placeholder="Seu nome"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">E-mail</label>
                                    <input
                                        type="email"
                                        value={interest.contact_email}
                                        onChange={e => setInterest(p => ({ ...p, contact_email: e.target.value }))}
                                        placeholder="seu@email.com"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Telefone / WhatsApp</label>
                                    <input
                                        type="tel"
                                        value={interest.contact_phone}
                                        onChange={e => setInterest(p => ({ ...p, contact_phone: e.target.value }))}
                                        placeholder="(00) 00000-0000"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Perfil</label>
                                <div className="flex flex-wrap gap-2">
                                    {ROLES.map(r => (
                                        <button key={r} type="button"
                                            onClick={() => setInterest(p => ({ ...p, role: r }))}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${interest.role === r ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >
                                            {INTEREST_ROLE_LABELS[r]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Mensagem (opcional)</label>
                                <textarea rows={3}
                                    value={interest.message}
                                    onChange={e => setInterest(p => ({ ...p, message: e.target.value }))}
                                    placeholder="Conte um pouco sobre seu interesse ou proposta..."
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                                />
                            </div>
                            <button type="submit" disabled={saving}
                                className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-blue-600/20"
                            >
                                {saving ? 'Enviando...' : 'Enviar manifestação'}
                            </button>
                        </form>
                    </div>
                )}

                {/* ── Sucesso ── */}
                {formStep === 'success' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-12 max-w-md mx-auto text-center">
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 mb-3">Interesse registrado!</h3>
                        <p className="text-gray-500 mb-8 text-sm">
                            Sua manifestação de interesse em <strong>{op.title}</strong> foi recebida. Nossa equipe entrará em contato em breve.
                        </p>
                        <button onClick={onClose} className="px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-700 transition-colors">
                            Voltar às oportunidades
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OpportunityDetail;
