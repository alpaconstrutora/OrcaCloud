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
    onClose: () => void;
}


const ROLES: InterestRole[] = ['investidor', 'arquiteto', 'engenheiro', 'projetista', 'consultor', 'outro'];

type PitchTab = 'pitch' | 'cenarios' | 'obra' | 'fotos' | 'documentos' | 'interesses';
type FormStep = 'view' | 'form' | 'success';

const OpportunityDetail: React.FC<Props> = ({ opportunity: op, organizationId, isAdmin = false, uploadedBy, onClose }) => {
    const [formStep, setFormStep] = React.useState<FormStep>('view');
    const [pitchTab, setPitchTab] = React.useState<PitchTab>('pitch');
    const [saving, setSaving] = React.useState(false);
    const [interests, setInterests] = React.useState<OpportunityInterest[]>([]);
    const [loadingInterests, setLoadingInterests] = React.useState(false);
    const [interest, setInterest] = React.useState({
        contact_name: '',
        contact_email: '',
        contact_phone: '',
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
        <div className="fixed inset-0 z-[60] bg-white overflow-y-auto">
            {/* ── Navbar sticky ── */}
            <nav className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 shadow-sm">
                <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        <X className="w-4 h-4" />
                        Voltar
                    </button>
                    <span className="text-sm font-black text-gray-800 truncate flex-1">{op.title}</span>
                    {op.status && (
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex-shrink-0 ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                            {OPPORTUNITY_STATUS_LABELS[op.status]}
                        </span>
                    )}
                </div>
            </nav>

            {/* ── Hero ── */}
            {op.thumbnail_url ? (
                <div className="relative h-64 sm:h-80 overflow-hidden">
                    <img src={op.thumbnail_url} alt={op.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    {op.status && (
                        <span className={`absolute bottom-4 left-6 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                {OPPORTUNITY_STATUS_LABELS[op.status]}
                            </span>
                        )}
                    </div>
            ) : null}

            <div className="max-w-4xl mx-auto px-6 sm:px-8 py-8">
                {formStep === 'view' && (
                    <div className="flex flex-col">
                        {/* Header executivo */}
                        <div className="pb-6">
                            <h2 className="text-3xl font-black text-gray-900 leading-tight">{op.title}</h2>
                            {op.subtitle && <p className="text-gray-500 mt-2 text-base leading-relaxed">{op.subtitle}</p>}
                            <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-400">
                                {(op.location_city || op.location_state) && (
                                    <span className="flex items-center gap-1.5">
                                        <MapPin className="w-3.5 h-3.5" />
                                        {[op.location_city, op.location_state].filter(Boolean).join(', ')}
                                    </span>
                                )}
                                {op.opportunity_type && (
                                    <span className="flex items-center gap-1.5">
                                        <Building2 className="w-3.5 h-3.5" />
                                        {OPPORTUNITY_TYPE_LABELS[op.opportunity_type]}
                                    </span>
                                )}
                                {op.expected_start && (
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5" />
                                        Início: {new Date(op.expected_start + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                    </span>
                                )}
                                {op.duration_months && (
                                    <span className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        {op.duration_months} meses
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        {tabs.length > 1 && (
                            <div className="flex gap-1 border-b border-gray-200 mb-6">
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setPitchTab(tab.id)}
                                        className={`px-5 py-3 text-sm font-bold transition-all border-b-2 -mb-px ${pitchTab === tab.id
                                            ? 'text-blue-600 border-blue-600'
                                            : 'text-gray-400 border-transparent hover:text-gray-600'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* ── ABA: Detalhes ─────────────────────────────── */}
                        {pitchTab === 'pitch' && (
                            <div className="space-y-6">
                                {/* KPIs financeiros */}
                                {hasFinancials && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <BarChart3 className="w-4 h-4 text-blue-600" />
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Indicadores</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            {op.vgv != null && (
                                                <div className="bg-blue-50 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">VGV</p>
                                                    <p className="text-xl font-black text-blue-900">{fmtBRL(op.vgv)}</p>
                                                </div>
                                            )}
                                            {op.roi_pct != null && (
                                                <div className="bg-emerald-50 rounded-2xl p-4">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <TrendingUp className="w-3 h-3 text-emerald-600" />
                                                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">ROI estimado</p>
                                                    </div>
                                                    <p className="text-xl font-black text-emerald-800">{fmtPct(op.roi_pct)}</p>
                                                </div>
                                            )}
                                            {op.tir_pct != null && (
                                                <div className="bg-indigo-50 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider mb-1">TIR estimada</p>
                                                    <p className="text-xl font-black text-indigo-900">{fmtPct(op.tir_pct)}</p>
                                                </div>
                                            )}
                                            {op.cost_estimate != null && (
                                                <div className="bg-amber-50 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Custo estimado</p>
                                                    <p className="text-xl font-black text-amber-900">{fmtBRL(op.cost_estimate)}</p>
                                                </div>
                                            )}
                                            {op.cost_per_m2 != null && (
                                                <div className="bg-gray-50 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Custo / m²</p>
                                                    <p className="text-xl font-black text-gray-800">{fmtBRL(op.cost_per_m2)}</p>
                                                </div>
                                            )}
                                            {op.ticket_min != null && (
                                                <div className="bg-gray-50 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Ticket mínimo</p>
                                                    <p className="text-xl font-black text-gray-800">{fmtBRL(op.ticket_min)}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Dados técnicos */}
                                {(op.land_area_m2 || op.built_area_m2 || op.floors) && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <Ruler className="w-4 h-4 text-blue-600" />
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Dados técnicos</span>
                                        </div>
                                        <div className="flex flex-wrap gap-6 text-sm">
                                            {op.land_area_m2 && (
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Terreno</p>
                                                    <p className="font-bold text-gray-800 mt-0.5">{fmtM2(op.land_area_m2)}</p>
                                                </div>
                                            )}
                                            {op.built_area_m2 && (
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Área construída</p>
                                                    <p className="font-bold text-gray-800 mt-0.5">{fmtM2(op.built_area_m2)}</p>
                                                </div>
                                            )}
                                            {op.floors && (
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Pavimentos</p>
                                                    <p className="font-bold text-gray-800 mt-0.5">{op.floors}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* CTA */}
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

                        {/* ── ABA: Cenários ─────────────────────────────── */}
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

                        {/* ── ABA: Obra ao Vivo ────────────────────────── */}
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

                        {/* ── ABA: Fotos ───────────────────────────────── */}
                        {pitchTab === 'fotos' && (
                            <OpportunityPhotosPanel
                                opportunityId={op.id!}
                                organizationId={organizationId}
                                isAdmin={isAdmin}
                                uploadedBy={uploadedBy}
                            />
                        )}

                        {/* ── ABA: Documentos ──────────────────────────── */}
                        {pitchTab === 'documentos' && (
                            <DataRoomPanel
                                opportunityId={op.id!}
                                organizationId={organizationId}
                                isAdmin={isAdmin}
                                uploadedBy={uploadedBy}
                            />
                        )}

                        {/* ── ABA: Interesses (admin) ───────────────────── */}
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
                                        {/* Funil por estágio */}
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

                                        {/* Distribuição por perfil */}
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

                                        {/* Lista recente */}
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
                )}

                {/* ── Formulário de interesse ───────────────────────────── */}
                {formStep === 'form' && (
                    <div className="max-w-lg">
                        <div className="mb-6">
                            <button onClick={() => setFormStep('view')} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-3">
                                ← Voltar
                            </button>
                            <h3 className="text-2xl font-black text-gray-900">Manifestar Interesse</h3>
                            <p className="text-sm text-gray-500 mt-1">{op.title}</p>
                        </div>
                        <form onSubmit={handleInterestSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Nome completo *</label>
                                <input
                                    type="text"
                                    required
                                    value={interest.contact_name}
                                    onChange={e => setInterest(p => ({ ...p, contact_name: e.target.value }))}
                                    placeholder="Seu nome"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
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
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Telefone / WhatsApp</label>
                                    <input
                                        type="tel"
                                        value={interest.contact_phone}
                                        onChange={e => setInterest(p => ({ ...p, contact_phone: e.target.value }))}
                                        placeholder="(00) 00000-0000"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Perfil</label>
                                <div className="flex flex-wrap gap-2">
                                    {ROLES.map(r => (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={() => setInterest(p => ({ ...p, role: r }))}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${interest.role === r
                                                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            {INTEREST_ROLE_LABELS[r]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Mensagem (opcional)</label>
                                <textarea
                                    rows={3}
                                    value={interest.message}
                                    onChange={e => setInterest(p => ({ ...p, message: e.target.value }))}
                                    placeholder="Conte um pouco sobre seu interesse ou proposta..."
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-blue-600/20"
                            >
                                {saving ? 'Enviando...' : 'Enviar manifestação'}
                            </button>
                        </form>
                    </div>
                )}

                {/* ── Sucesso ──────────────────────────────────────────── */}
                {formStep === 'success' && (
                    <div className="max-w-md mx-auto text-center py-16">
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h3 className="text-3xl font-black text-gray-900 mb-3">Interesse registrado!</h3>
                        <p className="text-gray-500 mb-8">
                            Sua manifestação de interesse em <strong>{op.title}</strong> foi recebida.
                            Nossa equipe entrará em contato em breve.
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
