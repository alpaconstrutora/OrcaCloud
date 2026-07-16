import React from 'react';
import {
    X, MapPin, TrendingUp, BarChart3, Ruler, Calendar,
    Building2, CheckCircle2, ChevronRight, Handshake, Users, Clock, Shield, Award, Landmark, AlertTriangle, SlidersHorizontal
} from 'lucide-react';
import {
    InvestorOpportunity, InterestRole, OpportunityInterest,
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUS_COLORS,
    OPPORTUNITY_TYPE_LABELS, INTEREST_ROLE_LABELS, INTEREST_STAGE_LABELS,
    OpportunityCompetitor,
    investorPortalService,
} from '../../services/investorPortalService';
import { Investor } from '../../services/investorService';
import { investorPortalTokenService } from '../../services/investorPortalTokenService';
import ScenarioComparison from './ScenarioComparison';
import LinkedProjectPanel from './LinkedProjectPanel';
import DataRoomPanel from './DataRoomPanel';
import OpportunityPhotosPanel from './OpportunityPhotosPanel';
import DueDiligencePanel from './DueDiligencePanel';
import RiskMatrixPanel from './RiskMatrixPanel';
import LandDealComparatorPanel from './LandDealComparatorPanel';
import CommitteeGatePanel from './CommitteeGatePanel';
import { fmtBRL, fmtPct, fmtM2 } from '../../utils/format';
import { imovibService } from '../../services/imovibService';
import { useImovibMath } from '../../hooks/useImovibMath';
import { ImovibStudy } from '../../types';
import { InvestmentSimulator } from './InvestmentSimulator';
import Button from '../ui/Button';
import {
    ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar
} from 'recharts';

interface Props {
    opportunity: InvestorOpportunity;
    organizationId: string;
    isAdmin?: boolean;
    uploadedBy?: string;
    investorProfile?: Investor | null;
    portalToken?: string;
    onClose: () => void;
}


const ROLES: InterestRole[] = ['investidor', 'arquiteto', 'engenheiro', 'projetista', 'consultor', 'outro'];

type PitchTab = 'pitch' | 'cenarios' | 'obra' | 'documentos' | 'interesses' | 'due-diligence' | 'riscos' | 'aquisicao' | 'comite';
type FormStep = 'view' | 'form' | 'success';

const OpportunityDetail: React.FC<Props> = ({ opportunity: op, organizationId, isAdmin = false, uploadedBy, investorProfile, portalToken, onClose }) => {
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

    const [study, setStudy] = React.useState<ImovibStudy | null>(null);
    const [loadingStudy, setLoadingStudy] = React.useState(false);

    React.useEffect(() => {
        if (op.imovib_study_id) {
            setLoadingStudy(true);
            const loadPromise = portalToken
                ? investorPortalTokenService.getStudyByToken(portalToken, op.imovib_study_id)
                : imovibService.getStudyById(op.imovib_study_id, true);

            loadPromise
                .then(setStudy)
                .catch(err => console.error('Erro ao carregar estudo do IMOVIB para o prospecto', err))
                .finally(() => setLoadingStudy(false));
        }
    }, [op.imovib_study_id, portalToken]);

    const [sliderCostPct, setSliderCostPct] = React.useState(0);
    const [sliderVgvPct, setSliderVgvPct] = React.useState(0);
    const [sliderDurationDelta, setSliderDurationDelta] = React.useState(0);

    const modifiedStudy = React.useMemo(() => {
        if (!study) return null;
        const copy = { ...study };
        
        if (copy.construction_duration_months != null) {
            copy.construction_duration_months = Math.max(1, copy.construction_duration_months + sliderDurationDelta);
        }
        if (copy.sales_duration_months != null) {
            copy.sales_duration_months = Math.max(1, copy.sales_duration_months + sliderDurationDelta);
        }
        
        return copy;
    }, [study, sliderDurationDelta]);

    const studyMath = useImovibMath(modifiedStudy, { vgvDelta: sliderVgvPct, costDelta: sliderCostPct });

    const [competitors, setCompetitors] = React.useState<OpportunityCompetitor[]>([]);

    React.useEffect(() => {
        if (op.id) {
            investorPortalService.listCompetitors(op.id)
                .then(setCompetitors)
                .catch(err => console.error('Erro ao carregar concorrentes no detalhe', err));
        }
    }, [op.id]);

    const comparisonData = React.useMemo(() => {
        if (competitors.length === 0) return [];
        return [
            {
                name: op.title,
                'Preço/m²': op.cost_per_m2 || 0,
                'Vendas Mensais %': 5,
                'Valorização Anual %': 12,
            },
            ...competitors.map(c => ({
                name: c.name,
                'Preço/m²': Number(c.price_per_m2),
                'Vendas Mensais %': c.sales_velocity_pct || 0,
                'Valorização Anual %': c.appreciation_pct || 0,
            }))
        ];
    }, [competitors, op]);

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
            if (portalToken) {
                await investorPortalTokenService.submitInterestByToken(portalToken, {
                    opportunityId: op.id!,
                    name: interest.contact_name,
                    email: interest.contact_email,
                    phone: interest.contact_phone,
                    role: interest.role,
                    message: interest.message,
                });
            } else {
                await investorPortalService.addInterest({
                    organization_id: organizationId,
                    opportunity_id: op.id!,
                    ...interest,
                });
            }
            setFormStep('success');
        } catch (err) {
            console.error('Erro ao registrar interesse', err);
            alert('Erro ao registrar interesse. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const hasFinancials = op.vgv || op.roi_pct != null || op.tir_pct != null || op.cost_estimate;
    const hasScenarios = (op.vgv && op.cost_estimate) || op.imovib_study_id;

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

    const locationLabel = [op.location_city, op.location_state].filter(Boolean).join(', ');
    const opportunityPresentation = [
        `${op.title} está em fase de ${op.status ? OPPORTUNITY_STATUS_LABELS[op.status].toLowerCase() : 'avaliação'}${op.opportunity_type ? ` no formato ${OPPORTUNITY_TYPE_LABELS[op.opportunity_type].toLowerCase()}` : ''}.`,
        locationLabel ? `Localização: ${locationLabel}.` : null,
        op.vgv != null ? `VGV estimado de ${fmtBRL(op.vgv)}.` : null,
        op.cost_estimate != null ? `Custo estimado de ${fmtBRL(op.cost_estimate)}.` : null,
        op.ticket_min != null ? `Ticket mínimo de ${fmtBRL(op.ticket_min)}.` : null,
        (op.duration_months || studyMath?.duration) ? `Prazo previsto de ${op.duration_months || studyMath?.duration} meses.` : null,
        op.roi_pct != null || op.tir_pct != null
            ? `Indicadores projetados: ${op.roi_pct != null ? `ROI de ${fmtPct(op.roi_pct)}` : ''}${op.roi_pct != null && op.tir_pct != null ? ' e ' : ''}${op.tir_pct != null ? `TIR de ${fmtPct(op.tir_pct)}` : ''}.`
            : null,
    ].filter(Boolean).join(' ');
    const ADMIN_TABS: { id: PitchTab; label: string }[] = [
        { id: 'pitch', label: 'Detalhes' },
        { id: 'cenarios', label: 'Viabilidade & Investimento' },
        ...(hasLinkedProject ? [{ id: 'obra' as PitchTab, label: 'Obra' }] : []),
        { id: 'documentos', label: 'Data Room' },
        { id: 'interesses', label: interests.length > 0 ? `Interesses (${interests.length})` : 'Interesses' },
        { id: 'due-diligence', label: 'Due Diligence' },
        { id: 'riscos', label: 'Riscos' },
        { id: 'aquisicao', label: 'Modelos de Aquisição' },
        { id: 'comite', label: 'Comitê & Gates' },
    ];
    const PUBLIC_TABS: { id: PitchTab; label: string }[] = [
        { id: 'pitch', label: 'Detalhes' },
        { id: 'cenarios', label: 'Viabilidade & Investimento' },
        ...(hasLinkedProject ? [{ id: 'obra' as PitchTab, label: 'Obra ao Vivo' }] : []),
        { id: 'documentos', label: 'Data Room' },
    ];
    const tabs = isAdmin ? ADMIN_TABS : PUBLIC_TABS;

    return (
        <div className="fixed inset-0 z-[60] bg-gray-50 overflow-y-auto">

            {/* ── Header escuro: navbar + hero + título e captação ── */}
            <div className="bg-[#0B1727] text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

                {/* navbar */}
                <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3 relative z-10">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="gap-2 text-sm font-bold text-white/60 hover:text-white hover:bg-transparent transition-colors"
                    >
                        <X className="w-4 h-4" />
                        Voltar
                    </Button>
                    <span className="text-sm text-white/40 truncate flex-1 hidden sm:block">{op.title}</span>
                </div>

                {/* hero image (se existir) */}
                {op.thumbnail_url && (
                    <div className="relative h-56 sm:h-72 overflow-hidden">
                        <img src={op.thumbnail_url} alt={op.title} className="w-full h-full object-cover opacity-40" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1727] via-[#0B1727]/60 to-transparent" />
                    </div>
                )}

                {/* título + metadata e Destaque de Captação ao lado */}
                <div className="max-w-5xl mx-auto px-6 pb-10 pt-6 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                        {/* Info Empreendimento */}
                        <div className="md:col-span-2 space-y-4">
                            <div className="flex flex-wrap items-start gap-3">
                                {op.status && (
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                        {OPPORTUNITY_STATUS_LABELS[op.status]}
                                    </span>
                                )}
                                {op.opportunity_type && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-white/10 text-white/70">
                                        {OPPORTUNITY_TYPE_LABELS[op.opportunity_type]}
                                    </span>
                                )}
                            </div>
                            <h1 className="text-3xl sm:text-5xl font-black leading-tight tracking-tight">{op.title}</h1>
                            {op.subtitle && <p className="text-white/70 text-lg font-medium leading-relaxed">{op.subtitle}</p>}
                            <div className="flex flex-wrap gap-5 text-sm text-white/50 pt-2">
                                {(op.location_city || op.location_state) && (
                                    <span className="flex items-center gap-1.5 font-semibold">
                                        <MapPin className="w-4 h-4 text-blue-500" />
                                        {[op.location_city, op.location_state].filter(Boolean).join(', ')}
                                    </span>
                                )}
                                {op.expected_start && (
                                    <span className="flex items-center gap-1.5 font-semibold">
                                        <Calendar className="w-4 h-4 text-amber-500" />
                                        Início: {new Date(op.expected_start + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                    </span>
                                )}
                                {((op.duration_months || 0) > 0 || (studyMath?.duration || 0) > 0) && (
                                    <span className="flex items-center gap-1.5 font-semibold">
                                        <Clock className="w-4 h-4 text-emerald-500" />
                                        {op.duration_months || studyMath?.duration} meses
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Card Destaque de Captação */}
                        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/10 space-y-4">
                            <span className="text-[10px] font-black text-blue-300 uppercase tracking-widest block">
                                Destaque de Captação
                            </span>
                            <div>
                                <span className="text-xs text-white/60 block">Meta Pretendida</span>
                                <span className="text-2xl font-black font-mono">
                                    {op.target_funding_value ? fmtBRL(Number(op.target_funding_value)) : '—'}
                                </span>
                            </div>
                            
                            {/* Barra de progresso */}
                            {op.target_funding_value && (
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-bold text-white/80">
                                        <span>Meta alcançada:</span>
                                        <span className="font-mono">{((Number(op.current_funding_value) || 0) / Number(op.target_funding_value) * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                                            style={{ width: `${Math.min(100, ((Number(op.current_funding_value) || 0) / Number(op.target_funding_value) * 100))}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
                                <div>
                                    <span className="text-white/50 block">Prazo</span>
                                    <span className="font-bold text-white">{(op.duration_months || studyMath?.duration) ? `${op.duration_months || studyMath?.duration} meses` : '—'}</span>
                                </div>
                                <div>
                                    <span className="text-white/50 block">TIR Projetada</span>
                                    <span className="font-bold text-emerald-400 font-mono">
                                        {studyMath?.annualIrr ? fmtPct(studyMath.annualIrr) : op.tir_pct != null ? fmtPct(op.tir_pct) : '—'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Corpo (fundo cinza) ── */}
            <div className="max-w-5xl mx-auto px-6 py-8 pb-28 sm:pb-8">
                {formStep === 'view' && (
                    <div className="hidden sm:flex sticky top-4 z-30 mb-6 items-center justify-between gap-4 bg-white/95 backdrop-blur border border-gray-100 shadow-lg rounded-2xl p-4">
                        <div className="min-w-0">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Oportunidade</p>
                            <p className="font-black text-gray-900 truncate">{op.title}</p>
                        </div>
                        <div className="flex items-center gap-6 text-sm flex-shrink-0">
                            <div>
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Ticket mín.</p>
                                <p className="font-black text-gray-900">{op.ticket_min != null ? fmtBRL(op.ticket_min) : '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">TIR</p>
                                <p className="font-black text-emerald-600">{studyMath?.annualIrr ? fmtPct(studyMath.annualIrr) : op.tir_pct != null ? fmtPct(op.tir_pct) : '—'}</p>
                            </div>
                            <Button
                                variant="primary"
                                size="md"
                                onClick={() => setFormStep('form')}
                                className="gap-2 px-5 py-3 text-button font-black uppercase tracking-widest rounded-xl transition-colors"
                            >
                                <Handshake className="w-4 h-4" />
                                Manifestar Interesse
                            </Button>
                        </div>
                    </div>
                )}

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
                                    <div className="sm:hidden bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
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
                                    <div className="sm:hidden bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
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
                                        {/* Resumo Executivo / Descrição */}
                                        <div className="bg-gray-50/50 rounded-3xl p-6 border border-gray-100 space-y-3">
                                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Apresentação do Empreendimento</h4>
                                            <p className="text-sm text-gray-600 leading-relaxed font-medium">{opportunityPresentation}</p>
                                        </div>

                                        {/* Ficha Técnica & Dados Técnicos */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <Ruler className="w-4 h-4 text-blue-600" />
                                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Ficha Técnica</span>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                {op.land_area_m2 && (
                                                    <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase block mb-1">Terreno</span>
                                                        <span className="text-base font-black text-gray-800 font-mono">{fmtM2(op.land_area_m2)}</span>
                                                    </div>
                                                )}
                                                {op.built_area_m2 && (
                                                    <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase block mb-1">Área Construída</span>
                                                        <span className="text-base font-black text-gray-800 font-mono">{fmtM2(op.built_area_m2)}</span>
                                                    </div>
                                                )}
                                                {op.floors && (
                                                    <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase block mb-1">Pavimentos</span>
                                                        <span className="text-base font-black text-gray-800 font-mono">{op.floors}</span>
                                                    </div>
                                                )}
                                                {((op.duration_months || 0) > 0 || (studyMath?.duration || 0) > 0) && (
                                                    <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase block mb-1">Prazo de Execução</span>
                                                        <span className="text-base font-black text-gray-800 font-mono">{op.duration_months || studyMath?.duration} meses</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Galeria Premium */}
                                        {op.gallery_urls && op.gallery_urls.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <Building2 className="w-4 h-4 text-blue-600" />
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Galeria de Renders & Fotos</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {op.gallery_urls.map((url, idx) => (
                                                        <div key={idx} className="relative h-48 rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-all group">
                                                            <img src={url} alt={`Render ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-4">
                                                                <span className="text-xs font-bold text-white uppercase tracking-wider">Apresentação {idx + 1}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Localização Inteligente e Distâncias */}
                                        {op.distances_json && op.distances_json.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <MapPin className="w-4 h-4 text-blue-600" />
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Conveniências e Distâncias</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {op.distances_json.map((item: any, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-3.5 bg-gray-50/50 border border-gray-100 rounded-2xl">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                                                                    <MapPin className="w-4 h-4 text-blue-600" />
                                                                </div>
                                                                <span className="text-sm font-bold text-gray-800">{item.place}</span>
                                                            </div>
                                                            <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-xl font-mono">{item.distance}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Equipe / Parceiros */}
                                        {op.team_json && op.team_json.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <Users className="w-4 h-4 text-blue-600" />
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Equipe de Desenvolvimento & RI</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {op.team_json.map((member: any, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-4 bg-gray-50/50 border border-gray-100 rounded-3xl">
                                                            <div>
                                                                <p className="text-sm font-black text-gray-800">{member.name}</p>
                                                                <p className="text-xs font-bold text-gray-400 mt-0.5 uppercase tracking-wide">{member.role}</p>
                                                            </div>
                                                            {member.experience && (
                                                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg uppercase">
                                                                    {member.experience}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Comparativo de Mercado */}
                                        {comparisonData.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <BarChart3 className="w-4 h-4 text-blue-600" />
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Comparativo de Mercado</span>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                                                    <div>
                                                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider block mb-4">
                                                            Benchmark de Preço Médio por m² (R$)
                                                        </span>
                                                        <div className="h-56">
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <BarChart data={comparisonData}>
                                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                                                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} />
                                                                    <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} />
                                                                    <Tooltip formatter={(v: any) => `R$ ${v.toLocaleString('pt-BR')}`} />
                                                                    <Bar dataKey="Preço/m²" fill="#2563eb" radius={[4, 4, 0, 0]} />
                                                                </BarChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider block mb-4">
                                                            Valorização Anual Esperada (%)
                                                        </span>
                                                        <div className="h-56">
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <BarChart data={comparisonData}>
                                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                                                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} />
                                                                    <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} />
                                                                    <Tooltip formatter={(v: any) => `${v}%`} />
                                                                    <Bar dataKey="Valorização Anual %" fill="#10b981" radius={[4, 4, 0, 0]} />
                                                                </BarChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* CTA Manifestar Interesse */}
                                        <div className="pt-4">
                                            <Button
                                                variant="primary"
                                                size="lg"
                                                onClick={() => setFormStep('form')}
                                                className="w-full sm:w-auto justify-center gap-2 px-8 py-4 font-black rounded-2xl transition-all shadow-xl text-sm uppercase tracking-wider"
                                            >
                                                <Handshake className="w-4 h-4" />
                                                Manifestar Interesse
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* ── ABA: Cenários ── */}
                                {pitchTab === 'cenarios' && (
                                    <div className="space-y-8">
                                        {/* Dashboard Financeiro */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <BarChart3 className="w-4 h-4 text-blue-600" />
                                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Dashboard de Viabilidade</span>
                                            </div>

                                            {/* Painel do Simulador Interativo */}
                                            {study ? (
                                                <div className="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border border-blue-100 rounded-3xl p-6 mb-6 space-y-4">
                                                    <div className="flex items-between justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <SlidersHorizontal className="w-5 h-5 text-blue-650" />
                                                            <h4 className="text-sm font-black text-blue-900 uppercase tracking-wider">Simulador de Cenários Interativo</h4>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                setSliderCostPct(0);
                                                                setSliderVgvPct(0);
                                                                setSliderDurationDelta(0);
                                                            }}
                                                            className="text-xs text-blue-650 hover:text-blue-750 hover:bg-transparent font-bold"
                                                        >
                                                            Resetar Valores
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        {/* Slider 1: Custo de Obra */}
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between text-xs font-bold">
                                                                <span className="text-gray-600">Custo de Obra</span>
                                                                <span className={`font-mono ${sliderCostPct > 0 ? 'text-red-650 font-bold' : sliderCostPct < 0 ? 'text-emerald-650 font-bold' : 'text-gray-500'}`}>
                                                                    {sliderCostPct > 0 ? `+${sliderCostPct}%` : `${sliderCostPct}%`}
                                                                </span>
                                                            </div>
                                                            <input 
                                                                type="range" 
                                                                min="-20" 
                                                                max="20" 
                                                                step="1"
                                                                value={sliderCostPct} 
                                                                onChange={e => setSliderCostPct(Number(e.target.value))}
                                                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                            />
                                                            <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                                                                <span>-20% (Otimista)</span>
                                                                <span>+20% (Pessimista)</span>
                                                            </div>
                                                        </div>

                                                        {/* Slider 2: VGV (Receitas) */}
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between text-xs font-bold">
                                                                <span className="text-gray-600">VGV (Receita)</span>
                                                                <span className={`font-mono ${sliderVgvPct > 0 ? 'text-emerald-650 font-bold' : sliderVgvPct < 0 ? 'text-red-650 font-bold' : 'text-gray-500'}`}>
                                                                    {sliderVgvPct > 0 ? `+${sliderVgvPct}%` : `${sliderVgvPct}%`}
                                                                </span>
                                                            </div>
                                                            <input 
                                                                type="range" 
                                                                min="-20" 
                                                                max="20" 
                                                                step="1"
                                                                value={sliderVgvPct} 
                                                                onChange={e => setSliderVgvPct(Number(e.target.value))}
                                                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                            />
                                                            <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                                                                <span>-20% (Pessimista)</span>
                                                                <span>+20% (Otimista)</span>
                                                            </div>
                                                        </div>

                                                        {/* Slider 3: Prazo de Obra */}
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between text-xs font-bold">
                                                                <span className="text-gray-600">Prazo de Obra</span>
                                                                <span className={`font-mono ${sliderDurationDelta > 0 ? 'text-red-650 font-bold' : sliderDurationDelta < 0 ? 'text-emerald-650 font-bold' : 'text-gray-500'}`}>
                                                                    {sliderDurationDelta > 0 ? `+${sliderDurationDelta} meses` : `${sliderDurationDelta} meses`}
                                                                </span>
                                                            </div>
                                                            <input 
                                                                type="range" 
                                                                min="-12" 
                                                                max="12" 
                                                                step="1"
                                                                value={sliderDurationDelta} 
                                                                onChange={e => setSliderDurationDelta(Number(e.target.value))}
                                                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                            />
                                                            <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                                                                <span>Acelerar (-12m)</span>
                                                                <span>Atrasar (+12m)</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-gray-50 border border-gray-150 rounded-3xl p-5 mb-6 text-center text-xs text-gray-400 font-medium">
                                                    Vincule um estudo do IMOVIB para habilitar os sliders do Simulador de Cenários Interativo do Empreendimento.
                                                </div>
                                            )}

                                            {/* KPIs Financeiros Detalhados */}
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                                <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase block mb-1">VGV Líquido</span>
                                                    <span className="text-lg font-black text-blue-900 font-mono">
                                                        {studyMath ? fmtBRL(studyMath.netVgvTotal) : op.vgv ? fmtBRL(op.vgv) : '—'}
                                                    </span>
                                                </div>
                                                <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase block mb-1">Custo Estimado</span>
                                                    <span className="text-lg font-black text-amber-800 font-mono">
                                                        {studyMath ? fmtBRL(studyMath.constCostTotal + studyMath.landCost) : op.cost_estimate ? fmtBRL(op.cost_estimate) : '—'}
                                                    </span>
                                                </div>
                                                <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase block mb-1">TIR Projetada (a.a.)</span>
                                                    <span className="text-lg font-black text-indigo-700 font-mono">
                                                        {studyMath ? fmtPct(studyMath.annualIrr) : op.tir_pct ? fmtPct(op.tir_pct) : '—'}
                                                    </span>
                                                </div>
                                                <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase block mb-1">Retorno Esperado (ROI)</span>
                                                    <span className="text-lg font-black text-emerald-700 font-mono">
                                                        {studyMath && studyMath.constCostTotal > 0 
                                                            ? fmtPct(((studyMath.netVgvTotal - (studyMath.constCostTotal + studyMath.landCost)) / (studyMath.constCostTotal + studyMath.landCost)) * 100)
                                                            : op.roi_pct ? fmtPct(op.roi_pct) : '—'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Gráficos Recharts */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {/* Gráfico 1: Fluxo de Caixa Acumulado (Curva S) */}
                                                <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm space-y-4">
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest block">
                                                        Fluxo de Caixa Acumulado (Curva S)
                                                    </span>
                                                    <div className="h-64">
                                                        {studyMath && studyMath.monthlyFlows?.length > 0 ? (
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <LineChart data={studyMath.monthlyFlows}>
                                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                                                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} />
                                                                    <YAxis stroke="#9ca3af" fontSize={10} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                                                                    <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                                                                    <Line type="monotone" dataKey="acc" stroke="#4f46e5" strokeWidth={3} dot={false} />
                                                                </LineChart>
                                                            </ResponsiveContainer>
                                                        ) : (
                                                            <div className="h-full flex items-center justify-center text-xs text-gray-400 font-medium bg-gray-50 rounded-2xl">
                                                                Fluxo de caixa acumulado disponível vinculando estudos do IMOVIB.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Gráfico 2: Fontes de Financiamento */}
                                                <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm space-y-4">
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest block">
                                                        Estrutura de Capital (Fontes de Recursos)
                                                    </span>
                                                    <div className="h-64 flex flex-col justify-center items-center">
                                                        {study ? (
                                                            <ResponsiveContainer width="100%" height="90%">
                                                                <PieChart>
                                                                    <Pie
                                                                        data={[
                                                                            { name: 'Capital Próprio (Equity)', value: study.funding_equity_percent || 0 },
                                                                            { name: 'Financiamento Bancário (Dívida)', value: study.funding_debt_percent || 0 }
                                                                        ]}
                                                                        cx="50%"
                                                                        cy="50%"
                                                                        innerRadius={60}
                                                                        outerRadius={80}
                                                                        paddingAngle={5}
                                                                        dataKey="value"
                                                                    >
                                                                        <Cell fill="#4f46e5" />
                                                                        <Cell fill="#06b6d4" />
                                                                    </Pie>
                                                                    <Tooltip formatter={(v: any) => `${v}%`} />
                                                                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                                                                </PieChart>
                                                            </ResponsiveContainer>
                                                        ) : (
                                                            <div className="h-full w-full flex items-center justify-center text-xs text-gray-400 font-medium bg-gray-50 rounded-2xl">
                                                                Detalhamento de fontes de capital disponível vinculando estudos do IMOVIB.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Simulador de Investimento */}
                                        <InvestmentSimulator
                                            baseVgv={studyMath?.vgvTotal || op.vgv || 0}
                                            baseTir={studyMath?.annualIrr || op.tir_pct || 0}
                                            baseRoi={studyMath && studyMath.constCostTotal > 0 ? ((studyMath.netVgvTotal - (studyMath.constCostTotal + studyMath.landCost)) / (studyMath.constCostTotal + studyMath.landCost)) * 100 : op.roi_pct || 0}
                                            baseCost={studyMath ? (studyMath.constCostTotal + studyMath.landCost) : op.cost_estimate || 0}
                                            durationMonths={op.duration_months || studyMath?.duration || 36}
                                            scenarioTirCons={op.scenario_cost_cons_pct ? (op.tir_pct || 0) * (1 - op.scenario_cost_cons_pct / 100) : undefined}
                                            scenarioTirOpt={op.scenario_cost_opt_pct ? (op.tir_pct || 0) * (1 + op.scenario_cost_opt_pct / 100) : undefined}
                                        />

                                        {/* Matriz de Riscos */}
                                        {op.risks_json && op.risks_json.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Matriz de Riscos e Mitigações</span>
                                                </div>
                                                <div className="border border-gray-100 rounded-3xl overflow-x-auto bg-white shadow-sm">
                                                    <table className="min-w-[640px] w-full text-left text-xs sm:text-sm">
                                                        <thead className="bg-gray-50/80 text-gray-500 font-black uppercase tracking-wider border-b border-gray-100">
                                                            <tr>
                                                                <th className="p-4">Risco Identificado</th>
                                                                <th className="p-4">Probabilidade / Impacto</th>
                                                                <th className="p-4">Mitigação & Segurança</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100 font-semibold">
                                                            {op.risks_json.map((r: any, idx: number) => (
                                                                <tr key={idx} className="hover:bg-gray-50/30">
                                                                    <td className="p-4 font-bold text-gray-800">{r.title}</td>
                                                                    <td className="p-4">
                                                                        <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 font-bold mr-1.5 text-xs">{r.probability}</span>
                                                                        <span className={`px-2.5 py-1 rounded-lg font-bold text-xs ${r.impact === 'Alto' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{r.impact}</span>
                                                                    </td>
                                                                    <td className="p-4 text-gray-600 font-medium">{r.mitigation}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* ESG e Sustentabilidade */}
                                        {(study?.esg_environmental_score || study?.esg_social_score || study?.esg_governance_score) && (
                                            <div className="bg-emerald-50/30 rounded-3xl border border-emerald-100 p-6 space-y-4">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                                    <h4 className="text-base font-black text-emerald-900">Iniciativas ESG e Sustentabilidade</h4>
                                                </div>
                                                <p className="text-sm text-emerald-800 leading-relaxed font-medium">
                                                    Este empreendimento possui um compromisso com diretrizes ambientais, sociais e de governança.
                                                    O estudo de viabilidade contempla premissas sustentáveis que geram desconto no funding e garantem maior atratividade de mercado.
                                                </p>
                                            </div>
                                        )}

                                        {/* Sensibilidade Fallback */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <TrendingUp className="w-4 h-4 text-blue-600" />
                                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Análise de Sensibilidade de Cenários</span>
                                            </div>
                                            <ScenarioComparison opportunity={op} />
                                        </div>

                                        {/* CTA Manifestar Interesse */}
                                        <div className="pt-4">
                                            <Button
                                                variant="primary"
                                                size="lg"
                                                onClick={() => setFormStep('form')}
                                                className="w-full sm:w-auto justify-center gap-2 px-8 py-4 font-black rounded-2xl transition-all shadow-xl text-sm uppercase tracking-wider"
                                            >
                                                <Handshake className="w-4 h-4" />
                                                Manifestar Interesse
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
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
                                        <Button
                                            variant="primary"
                                            size="lg"
                                            onClick={() => setFormStep('form')}
                                            className="gap-2 px-8 py-4 bg-[#0B1727] hover:bg-blue-900 font-bold rounded-2xl transition-all shadow-xl text-sm"
                                        >
                                            <Handshake className="w-4 h-4" />
                                            Manifestar Interesse
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
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
                                                                <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">
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

                                {/* ── ABA: Due Diligence (admin) ── */}
                                {pitchTab === 'due-diligence' && isAdmin && op.id && (
                                    <DueDiligencePanel opportunityId={op.id} organizationId={organizationId} userEmail={uploadedBy} />
                                )}

                                {/* ── ABA: Riscos (admin) ── */}
                                {pitchTab === 'riscos' && isAdmin && op.id && (
                                    <RiskMatrixPanel opportunityId={op.id} organizationId={organizationId} />
                                )}

                                {/* ── ABA: Modelos de Aquisição (admin) ── */}
                                {pitchTab === 'aquisicao' && isAdmin && op.id && (
                                    <LandDealComparatorPanel
                                        opportunityId={op.id}
                                        organizationId={organizationId}
                                        vgv={studyMath?.vgvTotal ?? op.vgv}
                                        baseLandCost={studyMath?.landCost}
                                        baseMonthlyFlows={studyMath?.monthlyFlows?.map(f => f.net)}
                                    />
                                )}

                                {/* ── ABA: Comitê & Gates (admin) ── */}
                                {pitchTab === 'comite' && isAdmin && op.id && (
                                    <CommitteeGatePanel opportunity={op} opportunityId={op.id} organizationId={organizationId} userEmail={uploadedBy} />
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* ── Formulário de interesse ── */}
                {formStep === 'form' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 max-w-lg">
                        <Button variant="ghost" size="sm" onClick={() => setFormStep('view')} className="text-button font-bold text-blue-600 hover:text-blue-700 hover:bg-transparent gap-1 mb-5">
                            ← Voltar
                        </Button>
                        <h3 className="text-2xl font-black text-gray-900 mb-1">Manifestar Interesse</h3>
                        <p className="text-sm text-gray-500 mb-6">{op.title}</p>
                        <form onSubmit={handleInterestSubmit} className="space-y-4">
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Nome completo *</label>
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
                                    <label className="block text-form-label font-bold text-gray-600 mb-1.5">E-mail</label>
                                    <input
                                        type="email"
                                        value={interest.contact_email}
                                        onChange={e => setInterest(p => ({ ...p, contact_email: e.target.value }))}
                                        placeholder="seu@email.com"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1.5">Telefone / WhatsApp</label>
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
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Perfil</label>
                                <div className="flex flex-wrap gap-2">
                                    {ROLES.map(r => (
                                        <button key={r} type="button"
                                            onClick={() => setInterest(p => ({ ...p, role: r }))}
                                            className={`px-3 py-1.5 rounded-xl text-button font-bold transition-all ${interest.role === r ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >
                                            {INTEREST_ROLE_LABELS[r]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-button font-bold text-gray-600 mb-1.5">Mensagem (opcional)</label>
                                <textarea rows={3}
                                    value={interest.message}
                                    onChange={e => setInterest(p => ({ ...p, message: e.target.value }))}
                                    placeholder="Conte um pouco sobre seu interesse ou proposta..."
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                                />
                            </div>
                            <Button type="submit" variant="primary" size="lg" disabled={saving}
                                className="w-full px-6 py-4 font-bold rounded-2xl transition-colors shadow-lg shadow-blue-600/20"
                            >
                                {saving ? 'Enviando...' : 'Enviar manifestação'}
                            </Button>
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
                        <Button variant="primary" size="lg" onClick={onClose} className="px-8 py-3 bg-gray-900 hover:bg-gray-700 font-bold rounded-2xl transition-colors">
                            Voltar às oportunidades
                        </Button>
                    </div>
                )}
            </div>
            {formStep === 'view' && (
                <div className="sm:hidden fixed inset-x-0 bottom-0 z-[80] bg-white border-t border-gray-200 shadow-2xl p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Ticket mín.</p>
                            <p className="font-black text-gray-900 truncate">{op.ticket_min != null ? fmtBRL(op.ticket_min) : op.target_funding_value ? fmtBRL(Number(op.target_funding_value)) : 'Consultar'}</p>
                        </div>
                        <button
                            onClick={() => setFormStep('form')}
                            className="flex-shrink-0 flex items-center gap-2 px-5 py-3 bg-blue-600 text-white text-button font-black uppercase tracking-widest rounded-xl shadow-lg"
                        >
                            <Handshake className="w-4 h-4" />
                            Interesse
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OpportunityDetail;
